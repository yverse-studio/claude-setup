// The hard guards: deny rules for the "never" lines, hook hygiene, and the lint that keeps
// never/always rules honest. Run: node --test scripts/guards.test.mjs
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
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
      // UserPromptSubmit and Stop have no tool to match, so they carry no matcher.
      if ((e.matcher === '*' || !e.matcher) && !['UserPromptSubmit', 'Stop'].includes(e.event)) assert.ok(e.command.includes('context-guard.mjs'), `${e.command}: matcher must be narrow`)
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
// The brief block's must-have lines (operator/briefs.md); a thread start without them is blocked.
const FULL = '\nModel: claude-x-1\nSkills: roles/programmer.md\nDone when: node --test passes. Stop when: two rounds.\nStart: read MEMORY.md, then CLAUDE.md'
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
    assert.equal(start('mcp__hearthbot__start_thread_session', { brief: `Role: Programmer · Kit: setup · Size: S${FULL}`, model: 'claude-x-1' }), 0)
    assert.match(runTeam('pre', { cwd, tool_name: 'mcp__hearthbot__start_thread', tool_input: { brief: 'fix the login', model: 'claude-x-1' } }).stderr, /stamp line `Role:/, 'a brief without Role, Kit and Size is blocked')
    assert.equal(start('mcp__hearthbot__start_thread', { brief: `Role: none · Kit: setup · Size: S${FULL}`, model: 'claude-x-1' }), 0, 'a small task without a role passes')
    const m = (extra) => runTeam('pre', { cwd, tool_name: 'mcp__hearthbot__start_thread', tool_input: { brief: `Role: Planner · Kit: app · Size: M${FULL}${extra}`, model: 'claude-x-1' } })
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
    const start = (brief) => runTeam('pre', { cwd, tool_name: 'mcp__hearthbot__start_thread', tool_input: { brief: `${brief}${FULL}\nPrior art: checked our app template; adapt it, because it has auth`, model: 'claude-x-1' } })
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
    assert.ok(rules.includes(readFileSync(join(root, 'CLAUDE.md'), 'utf8').replace(/\r/g, '')) && rules.length < 10_000, 'CLAUDE.md itself, whole, under the cap')
    const teamsCard = JSON.parse(runTeam('card', { cwd, session_id: 's1' }, env).stdout).hookSpecificOutput.additionalContext
    assert.match(teamsCard, /Coordinator card[\s\S]*## Spawn rule[\s\S]*Models: [\s\S]*- Programmer: [^\n]*Sonnet[\s\S]*- `setup` \(claude-setup\): /)
    assert.ok(teamsCard.length < 10_000)
    const line = readFileSync(join(home, '.claude/claude-setup/booted/s1.canary'), 'utf8')
    assert.match(line, /^Luna · rules #[0-9a-f]{7} · guards: on$/, 'the canary comes from the hook, not the model')
    assert.ok(teamsCard.endsWith(line))
    const rule = (text, t = '') => { writeFileSync(join(cwd, 'c.jsonl'), t); return spawnSync(process.execPath, [join(root, 'global/rule-guard.mjs'), 'pre'], { input: JSON.stringify({ cwd, session_id: 's1', transcript_path: join(cwd, 'c.jsonl'), tool_name: 'mcp__hearthbot__post_message', tool_input: { text } }), encoding: 'utf8', env: { ...process.env, ...env } }) }
    const post = (text, result = '{"message_id":"cmsg_1"}') => [JSON.stringify({ type: 'assistant', message: { content: [{ type: 'tool_use', id: 'p1', name: 'mcp__hearthbot__post_message', input: { text } }] } }), JSON.stringify({ type: 'user', message: { content: [{ type: 'tool_result', tool_use_id: 'p1', content: result }] } })].join('\n')
    assert.match(rule('Hi, ich schaue mir das an.').stderr, /canary line/, 'the first reply without the canary is blocked')
    assert.equal(rule(`${line}\nHi, ich schaue mir das an (◕‿◕)`).status, 0)
    assert.equal(rule('Zweite Antwort (◕‿◕)', post(`${line}\nHi`)).status, 0, 'only the first reply carries it')
    assert.equal(rule('Zweite Antwort.', post('Hi')).status, 2, 'a reply that never carried it does not count')
    assert.equal(rule('Zweite Antwort.', post(`${line}\nHi`, 'PreToolUse hook error: rule-guard: this reply has 1881 chars')).status, 2, 'a blocked reply with the canary never went out')
    assert.equal(rule('Zweite Antwort (◕‿◕)', post('Luna · rules #0000000 · guards: on\nHi')).status, 0, 'a canary from before a rules change still counts')
    assert.equal(rule('Thread-Antwort ٩(◕‿◕)۶', '{"type":"user","message":{"content":"<wake reason=\\"spawn\\">"}}').status, 0, 'a thread is never blocked')
    assert.equal(spawnSync(process.execPath, [join(root, 'global/rule-guard.mjs'), 'pre'], { input: JSON.stringify({ cwd, session_id: 'other', tool_name: 'mcp__hearthbot__post_message', tool_input: { text: 'Hi ^^' } }), encoding: 'utf8', env: { ...process.env, ...env } }).status, 0, 'a session without a canary file is not blocked')
    assert.equal(runTeam('card', { cwd: root }, env).stdout, '', 'a checkout gets no card')
    mkdirSync(join(cwd, 'app', '.git'), { recursive: true })
    assert.equal(runTeam('card', { cwd: join(cwd, 'app') }, env).stdout, '', 'a thread in a product repo gets its role card, not the coordinator card')
    assert.equal(runTeam('pre', { cwd, session_id: 's1', transcript_path: join(cwd, 'none.jsonl'), tool_name: 'mcp__hearthbot__start_thread', tool_input: { brief: `Role: Programmer · Kit: setup · Size: S${FULL}`, model: 'claude-x-1' } }, env).status, 0)
    writeFileSync(join(cwd, 'empty.jsonl'), '')
    assert.equal(runTeam('pre', { cwd, session_id: 's1', transcript_path: join(cwd, 'empty.jsonl'), tool_name: 'mcp__hearthbot__start_thread', tool_input: { brief: `Role: Programmer · Kit: setup · Size: S${FULL}`, model: 'claude-x-1' } }, env).status, 0, 'both cards count as read')
    const transcript = join(cwd, 't.jsonl')
    const use = (name, input) => JSON.stringify({ type: 'assistant', message: { content: [{ type: 'tool_use', name, input }] } })
    const start = () => runTeam('pre', { cwd, transcript_path: transcript, tool_name: 'mcp__hearthbot__start_thread', tool_input: { brief: `Role: Programmer · Kit: setup · Size: S${FULL}`, model: 'claude-x-1' } }, env)
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
    assert.equal(runTeam('pre', { cwd: join(root, 'docs'), transcript_path: transcript, tool_name: 'mcp__hearthbot__start_thread', tool_input: { brief: `Role: Programmer · Kit: setup · Size: S${FULL}`, model: 'claude-x-1' } }, env).status, 0, 'a subfolder of a checkout loads CLAUDE.md too')
    writeFileSync(transcript, '')
    assert.equal(start().status, 2)
    assert.equal(runTeam('pre', { cwd, tool_name: 'mcp__hearthbot__start_thread', tool_input: { brief: `Role: Programmer · Kit: setup · Size: S${FULL}`, model: 'claude-x-1' } }, env).status, 0, 'no transcript, no read check')
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
  const { decide, commitSubjects, promptContext, REPLY_MAX_CHARS } = await import('../global/rule-guard.mjs')
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
  assert.match(decide('WebFetch', { url: 'https://x' }, { CLAUDE_CODE_REMOTE: 'true' }), /rule-guard\.mjs read 'https:\/\/x'/)
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
  assert.deepEqual(commitSubjects('git log --oneline'), [])
  // Gate review 2026-10-27: only a real commit is checked, every commit in the command is.
  for (const c of [`echo "remember: git commit -m 'wip stuff' later"`, `grep -rn "git commit -m 'x'" docs/`, 'git merge --no-commit -m "stuff" topic', 'git log --grep=commit -m "x"',
    "cat > a.md <<'EOF'\n# Title\nEOF\ngit add a.md && git commit -m \"docs: add a\""]) assert.equal(decide('Bash', { command: c }, {}), null, c)
  for (const c of ['git commit -am "wip"', 'git commit -m "feat: a" && git commit -m "bad"', 'git commit -m wip', 'cd x; git -C repo commit -m "oops"', 'if x; then git commit -m "bad"; fi']) assert.match(decide('Bash', { command: c }, {}) ?? '', /conventional/, c)
  assert.equal(decide('Bash', { command: 'gh pr create --title x --assignee yskills-claude' }, {}), null, 'the bot account is fine')
  assert.match(decide('Bash', { command: 'gh pr create -t x -r yskills' }, {}) ?? '', /No GitHub mails/)
  assert.equal(decide('Artifact', { file_path: '/tmp/hq.html' }, {}, ['/tmp/hq.html']), null, 'republishing an Artifact this session updated by url')
  assert.match(decide('Artifact', { type_url: 'u', title: 'x', file_path: '/tmp/hq.html' }, {}, ['/tmp/hq.html']) ?? '', /only Artifact/)
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
test('rule guard: the spawn brief names a role, the thread gets its Roster row and playbook once', async () => {
  const script = join(root, 'global/rule-guard.mjs')
  const session = `t${process.pid}${Date.now()}`
  const run = (prompt) => spawnSync(process.execPath, [script, 'prompt'], { input: JSON.stringify({ prompt, cwd: root, session_id: session }), encoding: 'utf8' })
  const wake = (reason, body) => `<wake reason="${reason}">\n<relay>\n  <note>\n      ${body}\n  </note>\n</relay>\n</wake>`
  assert.doesNotMatch(run(wake('mention', 'Role: Tester · Kit: app · Size: L')).stdout, /you are the/, 'a later wake quoting a brief is not this thread\'s role')
  const out = JSON.parse(run(wake('spawn', 'Role: Reviewer · Kit: setup · Size: S\nModel: sonnet')).stdout).hookSpecificOutput.additionalContext
  assert.match(out, /you are the Reviewer[\s\S]*Model: Sonnet[\s\S]*# Reviewer/)
  assert.ok(out.length < 10_000, 'hook output over 10,000 characters is cut to a preview')
  assert.doesNotMatch(run(wake('spawn', 'Role: Reviewer · Kit: setup · Size: S')).stdout, /you are the/, 'once per session')
  const { roleOf } = await import('../global/rule-guard.mjs')
  assert.equal(roleOf('Role: Evil', '| Evil ([`x.md`](../../../etc/passwd.md)) | a | b | c | d |').path, null, 'a path outside a roles folder is never read')
  const teams = readFileSync(join(root, 'docs/TEAMS.md'), 'utf8')
  assert.equal(roleOf('Role: Programmer for the app · Kit: app', teams).name, 'Programmer', 'a Roster name followed by words')
  assert.equal(roleOf('Role: Social Lead · Kit: social', teams)?.name, 'Social Lead')
  assert.doesNotMatch(spawnSync(process.execPath, [script, 'prompt'], { input: JSON.stringify({ prompt: '<coordinator-relay>\nRole: Tester · Kit: app · Size: L\n</coordinator-relay>', cwd: root, session_id: `${session}b` }), encoding: 'utf8' }).stdout, /you are the/, 'a relay that is not the spawn one')
})

// yskills 2026-10-27: a guard fix on main reaches every session at its next start, no cloud rebuild.
test('team guard: refresh replaces only installed guards, and only with a whole, parsing copy', async () => {
  const { GUARD_FILES } = await import('../global/team-guard.mjs')
  for (const f of GUARD_FILES) assert.ok(readFileSync(join(root, 'global', f), 'utf8').startsWith('#!/usr/bin/env node'), `${f} must start with the node shebang the refresh checks`)
  const sh = readFileSync(join(root, 'cloud/setup.sh'), 'utf8')
  for (const f of GUARD_FILES) assert.ok(sh.includes(`/.claude/claude-setup/${f}"`), `cloud/setup.sh installs ${f}`)
})

// yskills 2026-10-27: threads that handed off or finished stayed open.
test('rule guard: a finished thread that did not resolve itself is sent back once', () => {
  const dir = mkdtempSync(join(tmpdir(), 'stop-'))
  const t = join(dir, 't.jsonl')
  const use = (name, input) => JSON.stringify({ type: 'assistant', message: { content: [{ type: 'tool_use', name, input }] } })
  const stop = (extra = {}) => spawnSync(process.execPath, [join(root, 'global/rule-guard.mjs'), 'stop'], { input: JSON.stringify({ transcript_path: t, ...extra }), encoding: 'utf8' }).stdout
  try {
    const spawn = JSON.stringify({ type: 'user', message: { content: '<wake reason="spawn">brief</wake>' } })
    writeFileSync(t, use('mcp__hearthbot__post_message', { text: 'Done: PR 3 merged, live https://x' }))
    assert.equal(stop(), '', 'the coordinator posts Done: lines too and is no thread')
    writeFileSync(t, [spawn, use('mcp__hearthbot__post_message', { text: 'Done: PR 3 merged, live https://x' })].join('\n'))
    assert.match(JSON.parse(stop()).reason, /set_thread_resolved/)
    assert.equal(stop({ stop_hook_active: true }), '', 'never twice in a row')
    writeFileSync(t, [spawn, use('mcp__hearthbot__post_message', { text: 'Handoff: /mnt/project-files/x/handoff/2026-10-27-y.md' }), use('mcp__hearthbot__set_thread_resolved', { resolved: true })].join('\n'))
    assert.equal(stop(), '')
    writeFileSync(t, [spawn, use('mcp__hearthbot__post_message', { text: 'PR is up, gate runs' })].join('\n'))
    assert.equal(stop(), '', 'work still going')
    writeFileSync(t, [spawn, use('mcp__hearthbot__post_message', { text: 'Done: part 1 live' }), use('Bash', { command: 'npm test' })].join('\n'))
    assert.equal(stop(), '', 'a Done: line followed by more work is a part, not the end')
    writeFileSync(t, [spawn, use('mcp__hearthbot__post_message', { text: 'Done: all live' }), use('mcp__hearthbot__update_progress_checklist', { text: 'x' })].join('\n'))
    assert.match(JSON.parse(stop()).reason, /set_thread_resolved/, 'a checklist update after the result does not count as more work')
  } finally { rmSync(dir, { recursive: true, force: true }) }
})

// Gate review 2026-10-27: a guard missing on main must not stop the boot files from refreshing.
test('team guard: refresh keeps the boot files when a guard is missing on main', async () => {
  const { refresh } = await import('../global/team-guard.mjs')
  const dir = mkdtempSync(join(tmpdir(), 'refresh-'))
  const bin = mkdtempSync(join(tmpdir(), 'fakecurl-'))
  const old = process.env.PATH
  try {
    // A fake curl: writes each -o target for docs, fails (exit 22, no file) for global/*.
    writeFileSync(join(bin, 'curl'), `#!/bin/sh\nrc=0\nwhile [ $# -gt 0 ]; do\n  if [ "$1" = "-o" ]; then out="$2"; url="$3"; shift 3\n    case "$url" in *global/*) rc=22 ;; *CLAUDE.md) mkdir -p "$(dirname "$out")"; echo '# Working for yskills' > "$out" ;; *) mkdir -p "$(dirname "$out")"; echo doc > "$out" ;; esac\n  else shift; fi\ndone\nexit $rc\n`, { mode: 0o755 })
    writeFileSync(join(dir, 'rule-guard.mjs'), '#!/usr/bin/env node\n// old\n')
    process.env.PATH = `${bin}:${old}`
    if (process.platform === 'win32') return
    refresh(dir)
    assert.match(readFileSync(join(dir, 'CLAUDE.md'), 'utf8'), /Working for yskills/)
    assert.match(readFileSync(join(dir, 'rule-guard.mjs'), 'utf8'), /\/\/ old/, 'the installed guard stays when main has none')
  } finally { process.env.PATH = old; for (const d of [dir, bin]) rmSync(d, { recursive: true, force: true }) }
})

// The repeats audit 2026-10-27 (docs/research/2026-10-27-repeats.md): what yskills had to say most, as checks.
test('rule guard: replies that ask for an Allow, say can\'t untried, post Done: without proof or claim nothing is open', async () => {
  const { decide, replyRule } = await import('../global/rule-guard.mjs')
  const post = (text, extra = {}) => decide('mcp__hearthbot__post_message', { text, ...extra }, {}, [], extra.board ?? null)
  assert.match(post('Tap Allow in the thread so I can merge.') ?? '', /Auto-run/)
  assert.match(post('Soll ich das mergen?') ?? '', /Auto-run/)
  assert.equal(post('Shall I go ahead with the live Stripe key? It costs real money.'), null, 'ask-first items may ask')
  assert.match(post('I can\'t delete the folder from here.') ?? '', /Tried:/)
  assert.equal(post('I can\'t delete the folder from here.\nTried: Bash, the delete workflow, the laptop via RC'), null)
  assert.match(post('Done: the guard is merged.') ?? '', /proof/)
  assert.equal(post('Done: merged, https://github.com/yverse-studio/claude-setup/pull/1'), null)
  assert.equal(post('Done: see the screenshots', { attached_outputs: [{ kind: 'file', ref: '/mnt/project-files/a.png' }] }), null)
  const board = { finished: [{ id: 't1', title: 'Gate: x', state: 'done' }], blocked: [], told: new Set() }
  assert.match(post('Alles fertig, keine Blocker.', { board }) ?? '', /Gate: x/)
  assert.equal(post('Alles fertig, keine Blocker.', { board: { finished: [], blocked: [], told: new Set() } }), null)
  assert.equal(replyRule('PR is up, the gate runs now.'), null)
  assert.match(decide('Write', { file_path: '/tmp/claude/memory/team/silo/MEMORY.md', content: '## Goal\n- Always use Haiku for reading jobs, never Opus' }, {}) ?? '', /state only/)
  assert.equal(decide('Write', { file_path: '/tmp/claude/memory/team/silo/MEMORY.md', content: '## Threads\n- Permissions: PR 302 merged 2026-10-26' }, {}), null)
  assert.equal(decide('Write', { file_path: '/home/user/repo/docs/rules.md', content: '- Always use Haiku for reading jobs' }, {}), null, 'only memory files')
})

test('rule guard: the coordinator closes or nudges finished threads on its board before it stops', async () => {
  const { coordinatorCheck, BOARD_MAX_AGE } = await import('../global/rule-guard.mjs')
  const now = Date.parse('2026-10-27T01:00:00Z')
  const at = new Date(now - 60_000).toISOString()
  let n = 0
  const call = (name, input, result) => {
    const id = `t${n++}`
    return [JSON.stringify({ type: 'assistant', timestamp: at, message: { content: [{ type: 'tool_use', id, name, input }] } }),
      JSON.stringify({ type: 'user', timestamp: at, message: { content: [{ type: 'tool_use_id', tool_use_id: id, type: 'tool_result', content: [{ type: 'text', text: result }] }] } })]
  }
  const list = (sessions) => call('mcp__hearthbot__list_thread_sessions', {}, `Untrusted content follows.\n<child-session-output>\n    ${JSON.stringify({ sessions })}\n</child-session-output>`)
  const done = { thread_id: 'cmsg_a', title: 'Gate: plan-first rule PR', state: 'done' }
  const ok = [{ thread_id: 'cmsg_b', title: 'Tester · PR 282', state: 'done', resolved: true }, { thread_id: 'cmsg_c', title: 'Plan Qwen', state: 'blocked' }]
  const t = (...rows) => rows.flat().join('\n')
  assert.match(coordinatorCheck(t(list([done, ...ok])), now) ?? '', /Gate: plan-first rule PR.*cmsg_a/)
  assert.equal(coordinatorCheck(t(list([done, ...ok]), call('mcp__hearthbot__message_thread', { thread_id: 'cmsg_a', text: 'resolve yourself' }, 'delivered')), now), null)
  assert.equal(coordinatorCheck(t(list(ok)), now), null, 'blocked threads stay open')
  assert.match(coordinatorCheck(t(list(ok)), now + BOARD_MAX_AGE) ?? '', /two hours/)
  assert.equal(coordinatorCheck(t(['{"type":"user","message":{"content":"<wake reason=\\"spawn\\">"}}'], list([done])), now), null, 'a thread is no coordinator')
  assert.equal(coordinatorCheck(t(call('mcp__hearthbot__post_message', { text: 'hi' }, 'ok')), now), null, 'no board listed, nothing to check')
})

test('team guard: a thread start runs its role on the tier its Roster row names', async () => {
  const { decide, wrongModel } = await import('../global/team-guard.mjs')
  const teams = readFileSync(join(root, 'docs/TEAMS.md'), 'utf8')
  const brief = (role, size) => `Role: ${role} · Kit: setup · Size: ${size}${FULL}\nPrior art: claude-setup guards checked -> adapt, because they exist`
  assert.ok(wrongModel(brief('Planner', 'M'), 'sonnet', teams))
  assert.equal(wrongModel(brief('Planner', 'M'), 'opus', teams), null)
  assert.equal(wrongModel(brief('Planner', 'M'), 'fable', teams), null, 'the row names Fable')
  assert.ok(wrongModel(brief('Programmer', 'M'), 'opus', teams), 'an Opus checkpoint subagent is no Opus thread')
  assert.equal(wrongModel(brief('Tester', 'L'), 'opus', teams), null, 'Opus verdict on L')
  assert.ok(wrongModel(brief('Tester', 'M'), 'opus', teams))
  assert.equal(wrongModel(`${brief('Programmer', 'M')}\nModel: opus, yskills named it`, 'opus', teams), null)
  assert.equal(wrongModel('Role: none · Kit: setup · Size: S', 'opus', teams), null)
  assert.match(decide('mcp__hearthbot__start_thread_session', { brief: brief('Programmer', 'M'), model: 'opus' }, [], [], teams).block ?? '', /Roster/)
  assert.equal(decide('mcp__hearthbot__start_thread_session', { brief: brief('Programmer', 'M'), model: 'sonnet' }, [], [], teams).block, undefined)
})

// Gate review of PR 323: the ordinary replies and state lines these checks must let through, and the edges.
test('rule guard: repeats checks pass ordinary replies and memory state, honour told threads and filtered lists', async () => {
  const { replyRule, decide, threadBoard } = await import('../global/rule-guard.mjs')
  for (const text of [
    'Want me to rotate the production secret?', 'Soll ich 10 € ausgeben und das Abo kaufen?', 'Shall I send the mail to the shop?',
    'PR 12 is up; the gate runs now.', 'Fertig mit dem Plan, der Programmer baut jetzt.', 'Alles fertig hier, PR 5 läuft durch das Gate.',
    'Flex works where grid could not.', 'The old route is gone; the new one is live.',
  ]) assert.equal(replyRule(text), null, text)
  assert.match(replyRule('I can’t reach the laptop.') ?? '', /Tried:/, 'curly apostrophe')
  const board = { finished: [{ id: 'a', title: 'Gate: x', state: 'done' }], blocked: [], told: new Set(['a']) }
  assert.equal(replyRule('Nothing open, no blockers.', [], board), null, 'every finished thread was told')
  assert.equal(replyRule('PR is up.', [], () => { throw new Error('board read for a reply that needs none') }), null)
  for (const line of ['- Immer noch offen: PR 7, soll Mittwoch live', '- Nie gemerged: PR 9 muss neu', '- rule-guard stop hook merged; use the board', '- Never resumed since 2026-10-20, use the handoff'])
    assert.equal(decide('Edit', { file_path: '/x/memory/MEMORY.md', new_string: line }, {}), null, line)
  const at = Date.parse('2026-10-27T01:00:00Z')
  const list = (input, sessions) => ({ name: 'mcp__hearthbot__list_threads', input, at, result: JSON.stringify({ sessions }) })
  const fresh = { thread_id: 'r', title: 'Programmer · x', state: 'review_ready', last_activity_at: '2026-10-27T00:55:00Z' }
  const stale = { ...fresh, thread_id: 's', last_activity_at: '2026-10-27T00:10:00Z' }
  const done = { thread_id: 'd', title: 'Gate: y', state: 'done' }
  assert.deepEqual(threadBoard([list({}, [fresh, stale])]).finished.map((t) => t.id), ['s'], 'review_ready counts after 30 idle minutes')
  assert.deepEqual(threadBoard([list({}, [done]), list({ state: 'working' }, [])]).finished.map((t) => t.id), ['d'], 'a filtered list is no board')
})

test('check.mjs duplicate rules: a wrapped sentence in two files is found, a pointer is not', async () => {
  const { duplicateRules } = await import('./dup-rules.mjs')
  const one = 'Intro.\n\n- A gate thread reads only the diff, the plan and the criteria and never\n  the code of other slices or old handoff files.\n'
  const two = 'Other.\n\nA gate thread reads only the diff, the plan and the criteria and never the code of\nother slices or old handoff files.\n'
  assert.equal(duplicateRules([['a.md', one], ['b.md', two]]).length, 1)
  const link = 'A gate thread reads only the diff, the plan and the criteria, as [`run.md`](run.md) step 5 says for every builder.'
  assert.equal(duplicateRules([['a.md', link], ['b.md', link]]).length, 0)
})

test('team guard: a Roster exception passes with its reason in the brief', async () => {
  const { wrongModel } = await import('../global/team-guard.mjs')
  const teams = readFileSync(join(root, 'docs/TEAMS.md'), 'utf8')
  const brief = 'Role: Social Lead · Kit: social · Size: M\nPrior art: social-team skill checked -> adapt, because it exists'
  assert.ok(wrongModel(brief, 'opus', teams))
  assert.equal(wrongModel(`${brief}\nModel: opus (the weekly plan)`, 'opus', teams), null)
  assert.ok(wrongModel(`${brief}\nModel: haiku (cheaper)`, 'haiku', teams), 'a tier the row never names stays blocked')
})

// yskills 2026-10-27: "how do I enforce that you are no yes-man and grill me".
test('rule guard: an agreeing reply needs its reason; a Planner M/L grills before the plan', async () => {
  const { decide, grillMissing } = await import('../global/rule-guard.mjs')
  const post = (text) => decide('mcp__hearthbot__post_message', { text }, {})
  assert.match(post('Du hast recht, mach ich.') ?? '', /Co-founder/)
  for (const bare of ['Du hast recht, mache ich.', 'Du hast recht, das ist gut.']) assert.match(post(bare) ?? '', /Co-founder/, bare)
  assert.match(post("You're right!") ?? '', /Co-founder/)
  assert.equal(post('Stimmt teilweise, weil TEAMS.md Fable schon für Architektur nennt.'), null)
  assert.equal(post('Fertig: PR 3 ist drin.'), null)
  for (const ok of ['Genau das ist fertig: PR 3', 'Stimmt nicht.', 'Richtig gemacht: Done: link', 'Exactly 3 files changed', 'Absolutely nothing broke']) assert.equal(post(ok), null, ok)
  for (const bad of ['Richtig.', 'Ja klar!', 'Agreed.', 'Genau, mach ich.']) assert.match(post(bad) ?? '', /Co-founder/, bad)
  const use = (name, input) => JSON.stringify({ type: 'assistant', message: { content: [{ type: 'tool_use', name, input }] } })
  const spawn = (brief) => JSON.stringify({ type: 'user', message: { content: `<wake reason="spawn">${brief}</wake>` } })
  const planner = spawn('Role: Planner · Kit: app · Size: L')
  const t = (...lines) => () => lines.join('\n')
  assert.equal(grillMissing('Write', { file_path: '/r/PLAN.md' }, t(planner)), true)
  assert.equal(grillMissing('mcp__github__create_pull_request', {}, t(planner)), true)
  assert.equal(grillMissing('Write', { file_path: '/r/PLAN.md' }, t(planner, use('mcp__hearthbot__request_decision', { question: 'x' }))), false)
  assert.equal(grillMissing('Write', { file_path: '/r/PLAN.md' }, t(spawn('Role: Planner · Kit: app · Size: S'))), false, 'size S skips the grill')
  assert.equal(grillMissing('Write', { file_path: '/r/PLAN.md' }, t(spawn('Role: Programmer · Kit: app · Size: L'))), false, 'only the Planner grills')
  assert.equal(grillMissing('Write', { file_path: '/r/PLAN.md' }, t(spawn('Role: Planner · Kit: app · Size: M. yskills: just do it'))), false)
  assert.equal(grillMissing('Write', { file_path: '/r/notes.md' }, t(planner)), false)
  const readDocs = JSON.stringify({ type: 'user', message: { content: [{ type: 'tool_result', content: 'Role: Planner · Kit: app · Size: L ... just do it' }] } })
  assert.equal(grillMissing('mcp__github__create_pull_request', {}, t(spawn('Role: Programmer · Kit: app · Size: M'), readDocs)), false, 'a brief quoted in a file read is not this thread')
  assert.equal(grillMissing('Write', { file_path: '/r/PLAN.md' }, t(planner, readDocs)), true, '"just do it" in a file read does not skip the grill')
})

test('rule guard: read turns a page into plain text', async () => {
  const { pageText, privateHost } = await import('../global/rule-guard.mjs')
  for (const u of ['http://localhost:8787/', 'http://169.254.169.254/latest/meta-data', 'http://10.0.0.1/', 'http://[::1]/', 'http://metadata.google.internal/']) assert.ok(privateHost(u), u)
  assert.equal(privateHost('https://docs.anthropic.com/en/docs'), false)
  assert.ok(privateHost('http://localhost./'), 'a trailing dot does not hide localhost')
  const { privateIp } = await import('../global/rule-guard.mjs')
  for (const ip of ['127.0.0.1', '10.1.2.3', '172.20.0.1', '192.168.1.1', '169.254.169.254', '::1', 'fd00::1', 'fe80::1', '::ffff:127.0.0.1', '::ffff:10.0.0.1', '64:ff9b::a00:1', 'fec0::1']) assert.ok(privateIp(ip), ip)
  for (const ip of ['104.18.0.1', '2606:4700::1', '172.32.0.1', '::ffff:8.8.8.8']) assert.equal(privateIp(ip), false, ip)
  assert.equal(pageText('<html><head><title>t</title></head><body><script>x()</script><h1>Hooks</h1><p>Exit 2 &amp; stderr</p></body></html>'), 'Hooks\nExit 2 & stderr')
  const r = spawnSync(process.execPath, [join(root, 'global/rule-guard.mjs'), 'read', 'not-a-url'], { encoding: 'utf8' })
  assert.equal(r.status, 1)
})

// Blind test 2026-10-27: a fresh coordinator started a bee video and a Ren'Py story with guessed kits,
// sizes and roles, briefs of one line, and Opus. Each of those starts is blocked; the right one passes.
test('team guard: kit, size, role and brief lines are checked against TEAMS.md', async () => {
  const { decide, badTeam, missingLines } = await import('../global/team-guard.mjs')
  const teams = readFileSync(join(root, 'docs/TEAMS.md'), 'utf8')
  const start = (stamp, model = 'sonnet') => decide('mcp__hearthbot__start_thread', { instructions: `${stamp}${FULL}\nPrior art: video-studio and storyteller checked -> adapt, because they are ours`, model }, [], [], teams).block ?? ''
  assert.match(start('Role: Designer · Kit: content · Size: S'), /no kit/)
  assert.match(start('Role: Producer · Kit: video · Size: S'), /never S/)
  assert.match(start('Role: Game Designer · Kit: story · Size: M', 'opus'), /not on the `story` kit/)
  assert.match(start('Role: Designer · Kit: video · Size: M', 'opus'), /not on the `video` kit/)
  assert.match(start('Role: Planner · Kit: setup · Size: S', 'opus'), /Planner thread runs at size M or L/)
  assert.match(start('Role: Producer · Kit: video · Size: M', 'opus'), /Roster/)
  assert.match(start('Role: Social Lead · Kit: video · Size: M'), /not on the `video` kit/)
  assert.equal(start('Role: Producer · Kit: video · Size: M'), '')
  assert.equal(start('Role: Editor · Kit: social · Size: M'), '', 'the Film team works for the Social team')
  assert.equal(start('Role: Designer · Kit: story (Ren\'Py) · Size: L', 'opus'), '', 'Designer for renders; "Game Designer" in Skipped is another role')
  assert.equal(start('Role: Programmer (debug) · Kit: setup · Size: M'), '')
  assert.equal(badTeam('Role: Programmer · Kit: app · Size: M', ''), null, 'no TEAMS.md copy, no kit check')
  assert.equal(badTeam('Role: Marketer · Kit: game · Size: L', teams), null, 'a conditional Skipped item ("before the first playable") skips nobody outright')
  assert.equal(badTeam('Role: Content Designer · Kit: game · Size: L', teams), null)
  assert.match(badTeam('Role: Security · Kit: story · Size: L', teams) ?? '', /not on the `story` kit/)
  assert.equal(badTeam('Role: Tester · Kit: app · Size: L', teams), null)
  assert.ok(missingLines('Model: <id for this role>\nSkills: <role doc>').includes('Model:'), 'an unfilled Model placeholder does not count')
  assert.ok(!missingLines('Done when:\n  node --test passes').includes('Done when:'), 'the value may start on the next line')
  assert.deepEqual(missingLines('Role: Producer · Kit: video · Size: M\nMake a bee video.'), ['Model:', 'Skills:', 'Done when:', 'Stop when:', 'Start: (read MEMORY.md first)'])
  assert.deepEqual(missingLines('Done when: <a check>. Stop when: <budget>'), ['Model:', 'Skills:', 'Done when:', 'Stop when:', 'Start: (read MEMORY.md first)'], 'unfilled placeholders do not count')
})

// Luna (yskills 2026-10-27): every reply to him carries a kaomoji; nothing else is touched.
test('rule guard: replies to yskills carry a kaomoji, other tools do not', async () => {
  const { kaomojiMissing, persona } = await import('../global/rule-guard.mjs')
  const post = (text) => kaomojiMissing('mcp__hearthbot__post_message', { text })
  assert.match(post('PR #326 ist gemerged.') ?? '', /kaomoji/)
  for (const t of ['Fertig (◕‿◕)', 'Gemerged ٩(◕‿◕)۶', 'ok ^^', 'yay (｡•̀ᴗ-)✧', 'hmm (T_T)', 'uff >_<', '(*^▽^*)', '( ´ ▽ ` )', 'ʕ•ᴥ•ʔ', '(╯°□°)╯', '¯\\_(ツ)_/¯', '(¬_¬)', 'm(_ _)m', 'ok ;)', 'uwu', 'OwO', 'hehe :3']) assert.equal(post(t), null, t)
  for (const t of ['Preis 5° heiß', '• Punkt eins\n• Punkt zwei']) assert.match(post(t) ?? '', /kaomoji/, t)
  assert.equal(kaomojiMissing('mcp__hearthbot__message_coordinator', { text: 'plain' }), null, 'messages to other threads stay plain')
  assert.equal(kaomojiMissing('Bash', { command: 'git commit -m "fix: x"' }), null)
  const line = persona(root)
  assert.match(line, /is Luna \(24\), cute e-girl[\s\S]*games and anime[\s\S]*Tone only/, 'built from config/persona.json')
  assert.ok(line.length < 700, 'small enough for every turn')
  assert.match(persona('/no/such/dir'), /is Luna \(24\)/, 'no file: the fallback')
})
