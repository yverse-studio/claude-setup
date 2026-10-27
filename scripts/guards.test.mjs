// The hard guards: deny rules for the "never" lines, hook hygiene, and the lint that keeps
// never/always rules honest. Run: node --test scripts/guards.test.mjs
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'

const root = join(fileURLToPath(import.meta.url), '..', '..')
const read = (p) => JSON.parse(readFileSync(join(root, p), 'utf8'))

// Claude Code's Bash rule matching, reduced to what these rules use: "cmd:*" is a prefix, "*" is any text.
const matches = (rule, command) => {
  const body = rule.match(/^Bash\((.*)\)$/)?.[1]
  if (body === undefined) return false
  if (body.endsWith(':*')) return command.startsWith(body.slice(0, -2))
  if (body.endsWith(' *') && command === body.slice(0, -2)) return true // a trailing " *" also matches the bare command
  return new RegExp(`^${body.split('*').map((s) => s.replace(/[.+?^${}()|[\]\\]/g, '\\$&')).join('.*')}$`).test(command)
}
const denied = (command, deny) => deny.some((r) => matches(r, command))

for (const file of ['global/settings.json', '.claude/settings.json']) {
  test(`${file} denies the never lines`, () => {
    const deny = read(file).permissions.deny
    for (const c of [
      'wrangler login', 'npx wrangler login', 'npx wrangler login --browser', 'wrangler logout', 'npx wrangler logout',
      'git push --force origin main', 'git push -f origin main', 'git push origin main --force', 'git push --force-with-lease origin main',
      'git push origin +main', 'git push -u --force origin HEAD:main', 'git push origin --delete main', 'git push origin :main', 'git push --mirror',
      'git -C /repo push --force origin main', 'git -c x=y push -f origin main', 'git push -fu origin main', 'git push --force origin master',
      // main changes only through a gated merge, and deploys only through Workers Builds (docs/permissions.md)
      'git push origin main', 'git push -u origin HEAD:main', 'git -C /repo push upstream main', 'git -C /repo push origin refs/heads/main', 'git -C /repo push origin +main', 'git -C /repo push origin --delete main',
      'gh workflow run delete-project --ref claude/x -f name=yland -f confirm=yland', 'gh workflow run delete-project -r x -f name=y', 'gh workflow run delete-project -rclaude/x -f name=yland -f confirm=yland', 'gh workflow run delete-project --ref=x -f name=y', 'wrangler deploy', 'npx wrangler deploy', 'npm run deploy',
    ]) assert.ok(denied(c, deny), `${c} must be denied`)
    for (const c of [
      'git push -u origin claude/project-thread-vxq6m9', 'git push --force origin claude/feature',
      'wrangler whoami', 'npm run deploy:preview',
      'git -C /repo push -u origin fix/domain-cleanup', 'git push -u origin claude/fix-main-menu', 'git -C /repo push origin claude/fix-main-menu', 'git push -u origin fix/domain-cleanup', 'git push -u origin claude/fix-thing',
    ]) assert.ok(!denied(c, deny), `${c} must not be denied by these rules`)
  })
}

// An allow rule is decided before the autoMode classifier: no ask-first command may match one
// (gate round 1, PR 302: `gh workflow *` let delete-project run unasked).
test('no ask-first command is allowed', () => {
  const { allow, ask } = read('global/settings.json').permissions
  for (const c of [
    'gh repo delete yverse-studio/x', 'wrangler delete --name yland', 'wrangler secret put KEY', 'npx wrangler d1 delete db', 'npm publish',
  ]) {
    assert.ok(!allow.some((r) => matches(r, c)), `${c} must match no allow rule`)
    assert.ok(ask.some((r) => matches(r, c)), `${c} must match an ask rule`)
  }
  for (const t of ['mcp__github__actions_run_trigger', 'mcp__github__create_repository']) assert.ok(!allow.includes(t), `${t} must not be allowed`)
  // Test projects come and go unasked (yskills 2026-10-26); delete-project itself refuses live ones (PROTECTED).
  for (const c of ['gh workflow run new-project -f name=x', 'gh workflow run delete-project -f name=x -f confirm=x -f dry_run=false', 'gh issue delete 5', 'gh run delete 9']) {
    assert.ok(allow.some((r) => matches(r, c)), `${c} must be allowed`)
    assert.ok(!ask.some((r) => matches(r, c)), `${c} must not ask`)
  }
})

test('the two deny lists are the same', () => {
  assert.deepEqual(read('global/settings.json').permissions.deny, read('.claude/settings.json').permissions.deny)
})

// Install twice into a throwaway home: what lands in settings.json is what fires in every session.
function installedHooks() {
  const home = mkdtempSync(join(tmpdir(), 'guards-'))
  const env = { ...process.env, HOME: home, USERPROFILE: home, CLAUDE_CONFIG_DIR: join(home, '.claude') }
  try {
    for (let i = 0; i < 2; i++) {
      const r = spawnSync(process.execPath, [join(root, 'install.mjs'), '--skip-plugins', '--skip-hooks'], { env, encoding: 'utf8' })
      assert.equal(r.status, 0, r.stdout + r.stderr)
    }
    const settings = JSON.parse(readFileSync(join(home, '.claude', 'settings.json'), 'utf8'))
    return { home, env, settings }
  } catch (e) { rmSync(home, { recursive: true, force: true }); throw e }
}

test('installed hooks: narrow matchers, no double firing, fast, never blocking', () => {
  const { home, env, settings } = installedHooks()
  try {
    const entries = Object.entries(settings.hooks ?? {}).flatMap(([event, list]) => list.flatMap((h) => h.hooks.map((x) => ({ event, matcher: h.matcher, ...x }))))
    assert.ok(entries.length >= 2, 'the context guard and the live hook are installed')
    // Same command registered twice, or twice again after a second install, fires twice per event.
    const keys = entries.map((e) => `${e.event}|${e.matcher}|${e.command}`)
    assert.equal(new Set(keys).size, keys.length, `duplicate hook entries:\n${keys.join('\n')}`)
    for (const e of entries) {
      assert.ok(e.timeout > 0 && e.timeout <= 5, `${e.command}: timeout must be 1 to 5 s, is ${e.timeout}`)
      // Only the context guard has to see every tool call; anything else names the tools it wants.
      // UserPromptSubmit has no tool to match, so it carries no matcher.
      if ((e.matcher === '*' || !e.matcher) && e.event !== 'UserPromptSubmit') assert.ok(e.command.includes('context-guard.mjs'), `${e.command}: matcher must be narrow`)
    }
    // A hook that fails must not block the tool call: exit 0 and no block decision on empty, broken or odd input.
    for (const e of entries) {
      const script = e.command.match(/"([^"]+\.mjs)"/)?.[1]
      assert.ok(script, `${e.command}: not a node script of ours`)
      for (const input of ['', 'not json', '{}', '{"tool_name":"mcp__Blender__x","transcript_path":"/nope/x.jsonl","session_id":"t"}']) {
        const r = spawnSync(process.execPath, [script], { env, input, encoding: 'utf8', timeout: 5000 })
        assert.equal(r.status, 0, `${script} exit ${r.status} on ${JSON.stringify(input)}: ${r.stderr}`)
        assert.ok(!/"decision"\s*:\s*"block"/.test(r.stdout), `${script} must never block`)
      }
    }
  } finally { rmSync(home, { recursive: true, force: true }) }
})

test('check.mjs fails on an untagged never rule, a long description and an agent without maxTurns', () => {
  const copy = mkdtempSync(join(tmpdir(), 'guards-repo-'))
  try {
    cpSync(root, copy, { recursive: true, filter: (p) => !p.includes(`${join(root, '.git')}`) })
    const run = () => spawnSync(process.execPath, [join(copy, 'scripts', 'check.mjs')], { encoding: 'utf8' })
    assert.equal(run().status, 0)
    const md = join(copy, 'CLAUDE.md')
    writeFileSync(md, `${readFileSync(md, 'utf8')}\n- Always do the untagged thing.\n`)
    const skill = join(copy, '.claude/skills/watch/SKILL.md')
    writeFileSync(skill, readFileSync(skill, 'utf8').replace(/^description: [^\r\n]*/m, `description: "Use when ${'x'.repeat(220)}"`))
    const agent = join(copy, '.claude/agents/evaluator.md')
    writeFileSync(agent, readFileSync(agent, 'utf8').replace(/^maxTurns: [^\r\n]*\r?\n/m, ''))
    const r = run()
    assert.equal(r.status, 1)
    for (const want of ['never/always rule without', 'description is', 'own agents need maxTurns']) assert.ok(r.stderr.includes(want), `missing: ${want}\n${r.stderr}`)
  } finally { rmSync(copy, { recursive: true, force: true }) }
})

test('check.mjs fails when a role file drops the model-and-handoff link or the brief block loses its lines', () => {
  const copy = mkdtempSync(join(tmpdir(), 'guards-repo-'))
  try {
    cpSync(root, copy, { recursive: true, filter: (p) => !p.includes(`${join(root, '.git')}`) })
    const run = () => spawnSync(process.execPath, [join(copy, 'scripts', 'check.mjs')], { encoding: 'utf8' })
    assert.equal(run().status, 0)
    const role = join(copy, '.claude/skills/operator/roles/programmer.md')
    writeFileSync(role, readFileSync(role, 'utf8').replace(/^- \*\*Model and handoff:\*\*[^\n]*\n/m, ''))
    const briefs = join(copy, '.claude/skills/operator/briefs.md')
    writeFileSync(briefs, readFileSync(briefs, 'utf8').replace('Handoff: at <N>k', 'Handoff: later'))
    const r = run()
    assert.equal(r.status, 1)
    for (const want of ['roles/programmer.md: lacks the link', 'thread brief block lacks "Handoff: at "']) assert.ok(r.stderr.includes(want), `missing: ${want}\n${r.stderr}`)
  } finally { rmSync(copy, { recursive: true, force: true }) }
})

// Attempt guard: a round is a failed run of the same command; success resets; PROGRESS.md unblocks.
const guardFile = join(root, 'global/attempt-guard.mjs')
const runGuard = (mode, session, cwd, command) => spawnSync(process.execPath, [guardFile, mode], {
  input: JSON.stringify({ session_id: session, cwd, tool_name: 'Bash', tool_input: { command } }), encoding: 'utf8', timeout: 5000,
})

test('attempt guard: reminder at 3, block at 5 until a diagnosis, hand-off at 8, success resets', () => {
  const cwd = mkdtempSync(join(tmpdir(), 'attempt-'))
  const session = `t${Date.now()}`
  const cmd = 'npm test -- --seed 7'
  try {
    for (let i = 1; i <= 2; i++) { runGuard('fail', session, cwd, cmd); assert.equal(runGuard('pre', session, cwd, cmd).status, 0) }
    assert.match(runGuard('fail', session, cwd, cmd).stdout, /round 3/)
    runGuard('fail', session, cwd, cmd)
    assert.equal(runGuard('pre', session, cwd, cmd).status, 0, 'round 4 still runs')
    runGuard('fail', session, cwd, cmd)
    const blocked = runGuard('pre', session, cwd, cmd)
    assert.equal(blocked.status, 2)
    assert.match(blocked.stderr, /Diagnosis/)
    assert.equal(runGuard('pre', session, cwd, 'npm run other').status, 0, 'other commands are not blocked')
    writeFileSync(join(cwd, 'PROGRESS.md'), '## Diagnosis seed 7\nthe cause is X\n')
    assert.equal(runGuard('pre', session, cwd, cmd).status, 0, 'a fresh diagnosis unblocks')
    for (let i = 0; i < 3; i++) runGuard('fail', session, cwd, cmd)
    const stop = runGuard('pre', session, cwd, cmd)
    assert.equal(stop.status, 2)
    assert.match(stop.stderr, /Hand off/)
    runGuard('ok', session, cwd, cmd)
    assert.equal(runGuard('pre', session, cwd, cmd).status, 0, 'a success resets the count')
  } finally { rmSync(cwd, { recursive: true, force: true }) }
})

test('attempt guard: read-only commands are no rounds, off switch works', () => {
  const cwd = mkdtempSync(join(tmpdir(), 'attempt-'))
  try {
    for (let i = 0; i < 9; i++) runGuard('fail', 'ro', cwd, 'grep nothing file.txt')
    assert.equal(runGuard('pre', 'ro', cwd, 'grep nothing file.txt').status, 0)
    for (let i = 0; i < 9; i++) runGuard('fail', 'off', cwd, 'make build')
    const r = spawnSync(process.execPath, [guardFile, 'pre'], {
      input: JSON.stringify({ session_id: 'off', cwd, tool_name: 'Bash', tool_input: { command: 'make build' } }),
      env: { ...process.env, CLAUDE_SETUP_ATTEMPT_GUARD: 'off' }, encoding: 'utf8',
    })
    assert.equal(r.status, 0)
  } finally { rmSync(cwd, { recursive: true, force: true }) }
})

test('attempt guard: chained commands count by their non-read-only part, long commands do not collide', () => {
  const cwd = mkdtempSync(join(tmpdir(), 'attempt-'))
  try {
    for (let i = 0; i < 5; i++) runGuard('fail', 'chain', cwd, `cd app && git add . && npm test -- --run ${i}`)
    assert.equal(runGuard('pre', 'chain', cwd, 'npm test -- --run 9').status, 2, 'the chain counts as npm test')
    const long = 'node -e "' + 'x'.repeat(150)
    for (let i = 0; i < 5; i++) runGuard('fail', 'long', cwd, `${long}a"`)
    assert.equal(runGuard('pre', 'long', cwd, `${long}b"`).status, 0, 'a different long command is a different command')
  } finally { rmSync(cwd, { recursive: true, force: true }) }
})

test('check.mjs fails when a Kits row is removed or a Read-first link is dead', () => {
  const copy = mkdtempSync(join(tmpdir(), 'guards-repo-'))
  try {
    cpSync(root, copy, { recursive: true, filter: (p) => !p.includes(`${join(root, '.git')}`) })
    const run = () => spawnSync(process.execPath, [join(copy, 'scripts', 'check.mjs')], { encoding: 'utf8' })
    assert.equal(run().status, 0)
    const map = join(copy, 'docs/TEAMS.md')
    const original = readFileSync(map, 'utf8')
    writeFileSync(map, original.split('\n').filter((l) => !l.startsWith('| `video`')).join('\n'))
    const missingRow = run()
    assert.equal(missingRow.status, 1)
    assert.ok(missingRow.stderr.includes('no row for kind "video"'), missingRow.stderr)
    writeFileSync(map, original.replace('(renpy.md)', '(no-such-file.md)'))
    const deadLink = run()
    assert.equal(deadLink.status, 1)
    assert.ok(deadLink.stderr.includes('story reads no-such-file.md'), deadLink.stderr)
  } finally { rmSync(copy, { recursive: true, force: true }) }
})

test('check.mjs fails when a lessons file is not linked from docs/MAP.md or the memory template grows past 3 KB', () => {
  const copy = mkdtempSync(join(tmpdir(), 'guards-repo-'))
  try {
    cpSync(root, copy, { recursive: true, filter: (p) => !p.includes(`${join(root, '.git')}`) })
    const run = () => spawnSync(process.execPath, [join(copy, 'scripts', 'check.mjs')], { encoding: 'utf8' })
    assert.equal(run().status, 0)
    writeFileSync(join(copy, 'docs/new-lessons.md'), '# New\n\n## Lessons\n\n- 2026-10-25: a lesson nobody indexed\n')
    const memory = join(copy, '.claude/skills/operator/templates/project-memory.md')
    writeFileSync(memory, readFileSync(memory, 'utf8') + 'x'.repeat(3072))
    const r = run()
    assert.equal(r.status, 1)
    for (const want of ['docs/new-lessons.md: holds lessons but docs/MAP.md does not link it', 'project-memory.md: 3 KB or more']) assert.ok(r.stderr.includes(want), `missing: ${want}\n${r.stderr}`)
  } finally { rmSync(copy, { recursive: true, force: true }) }
})


// Team guard: an Agent call or thread start without `model` is refused; an agent file with its own
// `model:` passes; SessionStart prints the TEAMS.md pointer.
const teamFile = join(root, 'global/team-guard.mjs')
const runTeam = (mode, payload, env = {}) => spawnSync(process.execPath, [teamFile, mode], {
  input: JSON.stringify(payload), encoding: 'utf8', timeout: 5000, env: { ...process.env, ...env },
})

test('team guard: blocks Agent and thread starts without model, passes with one', () => {
  const cwd = mkdtempSync(join(tmpdir(), 'team-'))
  try {
    const agent = (input) => runTeam('pre', { cwd, tool_name: 'Agent', tool_input: input })
    assert.equal(agent({ subagent_type: 'general-purpose', prompt: 'x' }).status, 2)
    assert.match(agent({ prompt: 'x', model: ' ' }).stderr, /docs\/TEAMS\.md/)
    assert.equal(agent({ subagent_type: 'general-purpose', prompt: 'x', model: 'haiku' }).status, 0)
    const start = (tool, input) => runTeam('pre', { cwd, tool_name: tool, tool_input: input }).status
    assert.equal(start('mcp__hearthbot__start_thread_session', { brief: 'x' }), 2)
    assert.equal(start('mcp__claude-code-remote__create_session', { prompt: 'x' }), 2)
    assert.equal(start('mcp__hearthbot__start_thread_session', { brief: 'Role: Programmer · Kit: setup · Size: S', model: 'claude-x-1' }), 0)
    assert.match(runTeam('pre', { cwd, tool_name: 'mcp__hearthbot__start_thread', tool_input: { brief: 'fix the login', model: 'claude-x-1' } }).stderr, /stamp line `Role:/, 'a brief without Role, Kit and Size is blocked')
    assert.equal(start('mcp__hearthbot__start_thread', { brief: 'Role: none · Kit: setup · Size: S', model: 'claude-x-1' }), 0, 'a small task without a role passes')
    const m = (extra) => runTeam('pre', { cwd, tool_name: 'mcp__hearthbot__start_thread', tool_input: { brief: `Role: Planner · Kit: app · Size: M${extra}`, model: 'claude-x-1' } })
    assert.match(m('').stderr, /Prior art:/, 'an M brief without prior art is blocked')
    assert.equal(m('\nPrior art: <what was checked>').status, 2, 'the placeholder does not count')
    assert.equal(m('\nPrior art: BMAD and our operator roles checked; adapt ours, because hearthbot threads').status, 0)
    assert.equal(start('Bash', { command: 'ls' }), 0)
    assert.equal(start('mcp__hearthbot__post_message', { text: 'x' }), 0)
    assert.equal(runTeam('pre', { cwd, tool_name: 'Agent', tool_input: { prompt: 'x' } }, { CLAUDE_SETUP_TEAM_GUARD: 'off' }).status, 0)
  } finally { rmSync(cwd, { recursive: true, force: true }) }
})

test('team guard: a size L Programmer brief needs a Tester line first', () => {
  const cwd = mkdtempSync(join(tmpdir(), 'team-'))
  try {
    const start = (brief) => runTeam('pre', { cwd, tool_name: 'mcp__hearthbot__start_thread', tool_input: { brief: `${brief}\nPrior art: checked our app template; adapt it, because it has auth`, model: 'claude-x-1' } })
    const r = start('Role: Programmer · Kit: app · Size: L\nModel: x')
    assert.equal(r.status, 2)
    assert.match(r.stderr, /Tester/)
    assert.equal(start('Role: Programmer · Kit: app · Size: L\nTester: Tester · social app\nModel: x').status, 0)
    assert.equal(start('Role: Planner then Programmer · Kit: setup · Size: L').status, 2)
    assert.equal(start('Role: Programmer · Kit: app · Size: M').status, 0)
    assert.equal(start('Role: Tester · Kit: app · Size: L').status, 0)
    assert.equal(start('Role: Programmer · Kit: app · Size: L\nTester:   ').status, 2, 'an empty Tester line does not count')
    assert.equal(start('**Role:** Programmer · Kit: app · size: l').status, 2, 'markdown and lowercase do not hide an L Programmer')
    assert.equal(start('Size: L\nRole: Programmer · Kit: app').status, 2, 'Size before Role does not hide it')
    assert.equal(start('Role: Programmer · Kit: app · Size: L\nTester: <its thread id or title>').status, 2, 'the unfilled placeholder does not count')
    assert.equal(start('Role: Programmer · Kit: app · Size: L\nTester: none').status, 2)
  } finally { rmSync(cwd, { recursive: true, force: true }) }
})

test('team guard: an agent file with its own model passes, one without does not', () => {
  const cwd = mkdtempSync(join(tmpdir(), 'team-'))
  try {
    cpSync(join(root, '.claude/agents/code-reviewer.md'), join(cwd, '.claude/agents/code-reviewer.md'), { recursive: true })
    writeFileSync(join(cwd, '.claude/agents/plain.md'), '---\nname: plain\ndescription: x\n---\nbody model: opus\n')
    const agent = (type) => runTeam('pre', { cwd, tool_name: 'Agent', tool_input: { subagent_type: type, prompt: 'x' } }).status
    assert.equal(agent('code-reviewer'), 0)
    assert.equal(agent('plain'), 2)
    assert.equal(agent('../code-reviewer'), 2)
  } finally { rmSync(cwd, { recursive: true, force: true }) }
})

test('team guard: SessionStart prints the TEAMS.md pointer', () => {
  const out = JSON.parse(runTeam('start', { cwd: root }, { CLAUDE_SETUP_BOOT_FETCH: 'off' }).stdout)
  assert.equal(out.hookSpecificOutput.hookEventName, 'SessionStart')
  assert.match(out.hookSpecificOutput.additionalContext, /docs\/TEAMS\.md/)
  assert.doesNotMatch(out.hookSpecificOutput.additionalContext, /Boot \(claude-setup\)/, 'a checkout loads CLAUDE.md itself')
})

// Incident 2026-10-26: the project chat has no checkout, so CLAUDE.md never loaded and the
// coordinator started threads with guessed models. Without a checkout the card names the files to
// read, and a thread start waits until the transcript shows TEAMS.md and CLAUDE.md were read.
test('team guard: boot card without a checkout, thread start blocked until the rules were read', () => {
  const home = mkdtempSync(join(tmpdir(), 'team-home-'))
  const cwd = mkdtempSync(join(tmpdir(), 'team-'))
  const env = { CLAUDE_SETUP_HOME: home, CLAUDE_SETUP_BOOT_FETCH: 'off' }
  try {
    const card = JSON.parse(runTeam('start', { cwd }, env).stdout).hookSpecificOutput.additionalContext
    assert.match(card, /Boot \(claude-setup\)[\s\S]*add_repo[\s\S]*CLAUDE\.md[\s\S]*TEAMS\.md/)
    assert.ok(card.length < 10_000, 'hook output over 10,000 characters is cut to a preview')
    for (const f of ['CLAUDE.md', 'docs/TEAMS.md', 'docs/MAP.md']) cpSync(join(root, f), join(home, '.claude/claude-setup', f))
    const rules = JSON.parse(runTeam('start', { cwd, session_id: 's1' }, env).stdout).hookSpecificOutput.additionalContext
    assert.ok(rules.includes(readFileSync(join(root, 'CLAUDE.md'), 'utf8')) && rules.length < 10_000, 'CLAUDE.md itself, whole, under the cap')
    const teamsCard = JSON.parse(runTeam('card', { cwd, session_id: 's1' }, env).stdout).hookSpecificOutput.additionalContext
    assert.match(teamsCard, /Coordinator card[\s\S]*## Spawn rule[\s\S]*Models: [\s\S]*- Programmer: [^\n]*Sonnet[\s\S]*- `setup` \(claude-setup\): /)
    assert.ok(teamsCard.length < 10_000)
    assert.equal(runTeam('card', { cwd: root }, env).stdout, '', 'a checkout gets no card')
    assert.equal(runTeam('pre', { cwd, session_id: 's1', transcript_path: join(cwd, 'none.jsonl'), tool_name: 'mcp__hearthbot__start_thread', tool_input: { brief: 'Role: Programmer · Kit: setup · Size: S', model: 'claude-x-1' } }, env).status, 0)
    writeFileSync(join(cwd, 'empty.jsonl'), '')
    assert.equal(runTeam('pre', { cwd, session_id: 's1', transcript_path: join(cwd, 'empty.jsonl'), tool_name: 'mcp__hearthbot__start_thread', tool_input: { brief: 'Role: Programmer · Kit: setup · Size: S', model: 'claude-x-1' } }, env).status, 0, 'both cards count as read')
    const transcript = join(cwd, 't.jsonl')
    const use = (name, input) => JSON.stringify({ type: 'assistant', message: { content: [{ type: 'tool_use', name, input }] } })
    const start = () => runTeam('pre', { cwd, transcript_path: transcript, tool_name: 'mcp__hearthbot__start_thread', tool_input: { brief: 'Role: Programmer · Kit: setup · Size: S', model: 'claude-x-1' } }, env)
    writeFileSync(transcript, [use('Agent', { prompt: 'read docs/TEAMS.md and CLAUDE.md of claude-setup', model: 'haiku' }), 'not json'].join('\n'))
    const r = start()
    assert.equal(r.status, 2, 'an Agent prompt naming the files is not a read')
    assert.match(r.stderr, /CLAUDE\.md and TEAMS\.md/)
    writeFileSync(transcript, use('Read', { file_path: `${home}/.claude/claude-setup/docs/TEAMS.md` }))
    assert.match(start().stderr, /read the rules before starting a thread: CLAUDE\.md \(/)
    writeFileSync(transcript, [use('Read', { file_path: `${home}/.claude/claude-setup/docs/TEAMS.md` }), use('mcp__github__get_file_contents', { owner: 'yverse-studio', repo: 'claude-setup', path: 'CLAUDE.md' })].join('\n'))
    assert.equal(start().status, 0)
    writeFileSync(join(cwd, 'CLAUDE.md'), readFileSync(join(root, 'CLAUDE.md'), 'utf8'))
    writeFileSync(transcript, use('Bash', { command: 'grep -n Roster docs/TEAMS.md' }))
    assert.equal(start().status, 0, 'with a checkout only TEAMS.md is needed')
    assert.equal(runTeam('pre', { cwd: join(root, 'docs'), transcript_path: transcript, tool_name: 'mcp__hearthbot__start_thread', tool_input: { brief: 'Role: Programmer · Kit: setup · Size: S', model: 'claude-x-1' } }, env).status, 0, 'a subfolder of a checkout loads CLAUDE.md too')
    writeFileSync(transcript, '')
    assert.equal(start().status, 2)
    assert.equal(runTeam('pre', { cwd, tool_name: 'mcp__hearthbot__start_thread', tool_input: { brief: 'Role: Programmer · Kit: setup · Size: S', model: 'claude-x-1' } }, env).status, 0, 'no transcript, no read check')
  } finally { for (const d of [home, cwd]) rmSync(d, { recursive: true, force: true }) }
})

test('check.mjs fails on a dead TEAMS.md section ref or a MAP.md Kits ref', () => {
  const copy = mkdtempSync(join(tmpdir(), 'guards-repo-'))
  try {
    cpSync(root, copy, { recursive: true, filter: (p) => !p.includes(`${join(root, '.git')}`) })
    const run = () => spawnSync(process.execPath, [join(copy, 'scripts', 'check.mjs')], { encoding: 'utf8' })
    assert.equal(run().status, 0)
    const briefs = join(copy, '.claude/skills/operator/briefs.md')
    writeFileSync(briefs, readFileSync(briefs, 'utf8') + '\nSee `docs/TEAMS.md` (The teams) and `docs/MAP.md` (Kits).\n')
    const r = run()
    assert.equal(r.status, 1)
    for (const want of ['docs/TEAMS.md (The teams), which has no such section', 'points to the Kits in docs/MAP.md']) assert.ok(r.stderr.includes(want), `missing: ${want}\n${r.stderr}`)
  } finally { rmSync(copy, { recursive: true, force: true }) }
})

test('team guard: the registered matchers catch Agent and the thread-start tools only', () => {
  for (const f of ['install.mjs', 'cloud/setup.sh']) {
    const m = readFileSync(join(root, f), 'utf8').match(/\['?"?PreToolUse'?"?, ['"]([^'"]+)['"], ['"]pre['"]\]/)?.[1]
    assert.ok(m, `${f}: no team-guard PreToolUse matcher`)
    const re = new RegExp(`^(?:${m})$`)
    for (const t of ['Agent', 'Task', 'mcp__hearthbot__start_thread', 'mcp__hearthbot__start_thread_session', 'mcp__claude-code-remote__create_session']) assert.ok(re.test(t), `${f}: ${t}`)
    for (const t of ['Bash', 'mcp__hearthbot__message_thread', 'mcp__hearthbot__start_remote_control']) assert.ok(!re.test(t), `${f}: ${t}`)
  }
})

test('rule guard: blocks the rules that were text only, passes the normal calls', async () => {
  const { decide, commitSubject, promptContext, REPLY_MAX_CHARS } = await import('../global/rule-guard.mjs')
  const blocked = [
    ['mcp__github__update_pull_request', { reviewers: ['yskills'] }],
    ['mcp__github__issue_write', { method: 'update', assignees: ['YSkills'] }],
    ['mcp__github__create_pull_request', { reviewers: ['yskills'] }],
    ['Bash', { command: 'gh pr create --title x --reviewer yskills' }],
    ['Bash', { command: 'git commit -m "update stuff"' }],
    ['Bash', { command: "git commit -m \"$(cat <<'EOF'\nadded hook\n\nbody\nEOF\n)\"" }],
    ['mcp__hearthbot__post_message', { text: 'Kurz:\n\nCard: Welcher Weg?\nA ...' }],
    ['mcp__hearthbot__post_message', { text: 'x'.repeat(REPLY_MAX_CHARS + 1) }],
    ['mcp__hearthbot__post_message', { text: Array.from({ length: 16 }, (_, i) => `line ${i}`).join('\n') }],
    ['Artifact', { file_path: '/tmp/x.html' }],
    ['Artifact', { action: 'publish', type_url: 'https://claude.ai/x' }],
    ['mcp__remote-devices__create_artifact', { id: 'x' }],
  ]
  for (const [tool, input] of blocked) assert.match(decide(tool, input, {}) ?? '', /^rule-guard:/, `${tool} ${JSON.stringify(input)}`)
  assert.match(decide('WebFetch', { url: 'https://x' }, { CLAUDE_CODE_REMOTE: 'true' }), /WebSearch/)
  const passed = [
    ['mcp__github__update_pull_request', { reviewers: ['someone'] }],
    ['mcp__github__create_pull_request', { title: 'x' }],
    ['Bash', { command: 'git commit -m "feat: rules enforce themselves"' }],
    ['Bash', { command: "git commit -m \"$(cat <<'EOF'\nfix(guard): short reply\n\nbody\nEOF\n)\"" }],
    ['Bash', { command: 'git commit --amend --no-edit' }],
    ['Bash', { command: 'git status && npm test' }],
    ['mcp__hearthbot__post_message', { text: 'Fertig: PR #320 ist drin. Live: https://x.yverse.workers.dev' }],
    ['Artifact', { url: 'https://claude.ai/artifact/TmQ7UpL6EPjXKkpR9S4kJT', file_path: '/tmp/hq.html' }],
    ['Artifact', { action: 'read', url: 'https://claude.ai/artifact/x' }],
    ['WebFetch', { url: 'https://x' }],
  ]
  for (const [tool, input] of passed) assert.equal(decide(tool, input, {}), null, `${tool} ${JSON.stringify(input)}`)
  assert.equal(decide('Artifact', { file_path: '/tmp/x.html' }, { CLAUDE_SETUP_NEW_ARTIFACT: 'yes' }), null)
  assert.equal(commitSubject('git log --oneline'), null)
  assert.match(promptContext('schau mal https://www.tiktok.com/@a/video/1'), /watch\.py/)
  assert.match(promptContext('<wake><message trigger="true" from="human">Stopp!</message></wake>'), /said stop/)
  assert.equal(promptContext('stop the server on port 8787 please'), '')
})

test('rule guard: hook entry blocks with exit 2, notes a video, and the off switch works', () => {
  const script = join(root, 'global/rule-guard.mjs')
  const run = (mode, input, env = {}) => spawnSync(process.execPath, [script, mode], { input: JSON.stringify(input), encoding: 'utf8', env: { ...process.env, ...env } })
  const pr = { tool_name: 'mcp__github__update_pull_request', tool_input: { reviewers: ['yskills'] } }
  assert.equal(run('pre', pr).status, 2)
  assert.equal(run('pre', pr, { CLAUDE_SETUP_RULE_GUARD: 'off' }).status, 0)
  const r = run('prompt', { prompt: 'https://youtu.be/abc' })
  assert.equal(r.status, 0)
  assert.equal(JSON.parse(r.stdout).hookSpecificOutput.hookEventName, 'UserPromptSubmit')
})

// yskills 2026-10-27: every thread always knows exactly which role it has.
test('rule guard: the spawn brief names a role, the thread gets its Roster row and playbook once', () => {
  const script = join(root, 'global/rule-guard.mjs')
  const session = `t${process.pid}${Date.now()}`
  const run = (prompt) => spawnSync(process.execPath, [script, 'prompt'], { input: JSON.stringify({ prompt, cwd: root, session_id: session }), encoding: 'utf8' })
  const wake = (reason, body) => `<wake reason="${reason}">\n<relay>\n  <note>\n      ${body}\n  </note>\n</relay>\n</wake>`
  assert.equal(run(wake('mention', 'Role: Tester · Kit: app · Size: L')).stdout, '', 'a later wake quoting a brief is not this thread\'s role')
  const out = JSON.parse(run(wake('spawn', 'Role: Reviewer · Kit: setup · Size: S\nModel: sonnet')).stdout).hookSpecificOutput.additionalContext
  assert.match(out, /you are the Reviewer[\s\S]*Model: Sonnet[\s\S]*# Reviewer/)
  assert.ok(out.length < 10_000, 'hook output over 10,000 characters is cut to a preview')
  assert.equal(run(wake('spawn', 'Role: Reviewer · Kit: setup · Size: S')).stdout, '', 'once per session')
  assert.equal(spawnSync(process.execPath, [script, 'prompt'], { input: JSON.stringify({ prompt: '<coordinator-relay>\nRole: Tester · Kit: app · Size: L\n</coordinator-relay>', cwd: root, session_id: `${session}b` }), encoding: 'utf8' }).stdout, '', 'a relay that is not the spawn one')
})
