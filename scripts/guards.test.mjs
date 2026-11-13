// The hard guards: deny rules for the "never" lines, hook hygiene, and the lint that keeps
// never/always rules honest. Run: node --test scripts/guards.test.mjs
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { cpSync, existsSync, mkdirSync, statSync, symlinkSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { studioPath } from './paths.mjs'

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
      assert.ok(e.timeout > 0 && e.timeout <= (e.event === 'PreCompact' ? 10 : 5), `${e.command}: timeout must be 1 to 5 s (10 for PreCompact), is ${e.timeout}`)
      // Only the context guard has to see every tool call; anything else names the tools it wants.
      // UserPromptSubmit and Stop have no tool to match, so they carry no matcher.
      if ((e.matcher === '*' || !e.matcher) && !['UserPromptSubmit', 'Stop', 'PreCompact'].includes(e.event)) assert.ok(e.command.includes('context-guard.mjs'), `${e.command}: matcher must be narrow`)
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

test('check.mjs fails when a doc ties a handoff to a token count (handoff only at a trigger)', () => {
  const copy = mkdtempSync(join(tmpdir(), 'guards-repo-'))
  try {
    cpSync(root, copy, { recursive: true, filter: (p) => !p.includes(`${join(root, '.git')}`) })
    const doc = join(copy, 'docs/pc-claude-user.md')
    writeFileSync(doc, readFileSync(doc, 'utf8') + '\nA thread should hand off at 350k and stop.\n')
    const r = spawnSync(process.execPath, [join(copy, 'scripts', 'check.mjs')], { encoding: 'utf8' })
    assert.equal(r.status, 1)
    assert.ok(r.stderr.includes('docs/pc-claude-user.md: banned phrase'), r.stderr)
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
    writeFileSync(briefs, readFileSync(briefs, 'utf8').replaceAll('Handoff:', 'Hand-off:'))
    const r = run()
    assert.equal(r.status, 1)
    for (const want of ['roles/programmer.md: lacks the link', 'thread brief block lacks "Handoff:"']) assert.ok(r.stderr.includes(want), `missing: ${want}\n${r.stderr}`)
  } finally { rmSync(copy, { recursive: true, force: true }) }
})

// Compact guard: PreCompact instructions only (S8: the state note file is gone).
const compactFile = join(root, 'global/compact-guard.mjs')
const runCompact = (input, env = {}) => spawnSync(process.execPath, [compactFile], { input, encoding: 'utf8', timeout: 10000, env: { ...process.env, ...env } })

test('compact guard: instructions on stdout, never fails', () => {
  const r = runCompact(JSON.stringify({ session_id: 'abcdef123456', trigger: 'auto' }))
  assert.equal(r.status, 0)
  for (const want of ['Role:', 'decision', 'verbatim']) assert.ok(r.stdout.includes(want), `missing ${want}: ${r.stdout}`)
  for (const input of ['', 'not json', '{}', '{"transcript_path":"/nope","cwd":"/nope"}']) assert.equal(runCompact(input).status, 0)
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
const FULL = '\nGate: Reviewer thread before owner\nItem: M30\nPlan: docs/plans/x.md\nAcceptance: node --test passes\nThreads: list_threads checked, none open on this topic\nModel: claude-x-1\nSkills: roles/programmer.md\nDone when: node --test passes. Stop when: two rounds.\nStart: read MEMORY.md, then CLAUDE.md\nPrior art: none, because a test brief'
const runTeam = (mode, payload, env = {}) => spawnSync(process.execPath, [teamFile, mode], {
  input: JSON.stringify(payload), encoding: 'utf8', timeout: 5000, env: { ...process.env, CLAUDE_CODE_CHILD_SESSION: '', ...env },
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
    const bare = FULL.replace(/\nPrior art:.*$/, '')
    const m = (extra, size = 'M') => runTeam('pre', { cwd, tool_name: 'mcp__hearthbot__start_thread', tool_input: { brief: `Role: ${size === 'S' ? 'Programmer' : 'Planner'} · Kit: app · Size: ${size}${bare}${extra}`, model: 'claude-x-1' } })
    assert.match(m('').stderr, /Prior art:/, 'an M brief without prior art is blocked')
    assert.match(m('', 'S').stderr, /Prior art:/, 'an S brief too (yskills 2026-11-03: research before guessing)')
    assert.equal(m('\nPrior art: <what was checked>').status, 2, 'the placeholder does not count')
    assert.equal(m('\nPrior art: bmad-code-org/BMAD-METHOD and our operator roles checked; adapt ours, because hearthbot threads').status, 0)
    assert.equal(start('Bash', { command: 'ls' }), 0)
    assert.equal(start('mcp__hearthbot__post_message', { text: 'x' }), 0)
    assert.equal(runTeam('pre', { cwd, tool_name: 'Agent', tool_input: { prompt: 'x' } }, { CLAUDE_SETUP_TEAM_GUARD: 'off' }).status, 0)
  } finally { rmSync(cwd, { recursive: true, force: true }) }
})

// yskills 2026-11-01: an Animator brief was blocked because the role was not in the Roster.
// yskills 2026-11-12: "Writer", "Storyteller" and "Story Writer" were all refused and the coordinator had to guess. The refusal names the roles the kit accepts.
test('team guard: an unknown or wrong role is refused with the roles that kit accepts; Story Writer and Story Editor are Roster roles on story', async () => {
  const { decide, rolesForKit } = await import('../global/team-guard.mjs')
  const teams = readFileSync(join(root, 'docs/TEAMS.md'), 'utf8')
  const brief = (role, kit, size = 'M') => ({ brief: `Role: ${role} · Kit: ${kit} · Size: ${size}\nPrior art: docs/TEAMS.md and .claude/skills/storyteller checked; adapt, because the story team exists${FULL.replace(/\nGate:[^\n]*/, '')}\nGate: Reviewer · story gate before owner`, title: `${role} · kapitel`, model: 'claude-x-1' })
  const out = (role, kit) => decide('mcp__hearthbot__start_thread', brief(role, kit), [], [], teams).block ?? ''
  assert.deepEqual(out('Story Writer', 'story'), '', 'Story Writer passes on story')
  assert.match(out('Storyteller', 'story'), /is no role.*on the story kit pick one of .*Story Writer, Story Editor/, 'an unknown role lists the story kit roles')
  assert.match(out('Writer', 'story'), /not on the `story` kit's team.*pick one of .*Story Writer/, 'a Roster role from another kit lists the story kit roles')
  assert.doesNotMatch(out('Storyteller', 'story'), /Hook Checker|Caption Writer/, 'the list is the kit\'s, not the whole Roster')
  assert.ok(rolesForKit(teams, 'story').includes('Story Editor') && !rolesForKit(teams, 'story').includes('Writer'))
  assert.ok(!rolesForKit(teams, 'site').includes('Story Writer'), 'Story Writer is skipped on site')
  assert.deepEqual(rolesForKit(teams, 'nonsense'), [])
})

// Asset intake PR: the Character TD is a Roster role on the game and story kits (yskills 2026-11-12: fitting is a 3D modeller's job).
test('team guard: a Character TD thread starts on game and story, needs the Gate and Sheet lines, a typo in the role blocks', async () => {
  const { decide } = await import('../global/team-guard.mjs')
  const teams = readFileSync(join(root, 'docs/TEAMS.md'), 'utf8')
  const brief = (kit, { role = 'Character TD', size = 'M', gate = true, sheet = true } = {}) => ({ brief: `Role: ${role} · Kit: ${kit} · Size: ${size}\nPrior art: docs/clothing-pipeline.md and .claude/skills/asset-intake checked; adapt, because the fit rules exist${FULL.replace(/\nGate:[^\n]*/, '')}${gate ? '\nGate: Reviewer · gate asset intake before owner' : ''}${sheet ? '\nSheet: n/a intake of a download, no new body or look' : ''}`, title: `${role} · hoodie`, model: 'claude-x-1' })
  for (const kit of ['game', 'story']) assert.deepEqual(decide('mcp__hearthbot__start_thread', brief(kit), [], [], teams), {}, `Character TD passes on ${kit}`)
  for (const kit of ['site', 'app', 'setup']) assert.match(decide('mcp__hearthbot__start_thread', brief(kit), [], [], teams).block ?? '', /not on the `\w+` kit's team/, `Character TD is skipped on ${kit}`)
  assert.match(decide('mcp__hearthbot__start_thread', brief('game', { gate: false }), [], [], teams).block ?? '', /Gate:/, 'size M without the Gate line is refused')
  assert.match(decide('mcp__hearthbot__start_thread', brief('game', { sheet: false }), [], [], teams).block ?? '', /Sheet:/, 'a modelling role names its sheet or says n/a')
  assert.match(decide('mcp__hearthbot__start_thread', brief('game', { role: 'Character TDX' }), [], [], teams).block ?? '', /no role in docs\/TEAMS\.md/, 'a typo in the role name still blocks')
  assert.match(decide('mcp__hearthbot__start_thread', { ...brief('game'), model: 'claude-haiku-x' }, [], [], teams).block ?? '', /runs on/, 'Haiku is not a Character TD tier')
})

test('team guard: an Animator thread starts on the game and story kits, on Sonnet, not on site or setup', async () => {
  const { decide } = await import('../global/team-guard.mjs')
  const teams = readFileSync(join(root, 'docs/TEAMS.md'), 'utf8')
  const brief = (kit, size = 'M') => ({ brief: `Role: Animator · Kit: ${kit} · Size: ${size}\nPrior art: docs/game-pipeline.md and our blender-body skill checked; adapt, because the key-pose library exists${FULL}\nSheet: n/a scene animation, no body or outfit model change`, title: 'Animator · fenster', model: 'claude-x-1' })
  for (const kit of ['game', 'story']) assert.deepEqual(decide('mcp__hearthbot__start_thread', brief(kit), [], [], teams), {}, `Animator passes on ${kit}`)
  for (const kit of ['site', 'app', 'setup']) assert.match(decide('mcp__hearthbot__start_thread', brief(kit), [], [], teams).block ?? '', /not on the `\w+` kit's team/, `Animator is skipped on ${kit}`)
  assert.match(decide('mcp__hearthbot__start_thread', { ...brief('game'), model: 'claude-opus-x' }, [], [], teams).block ?? '', /runs on sonnet/, 'the Animator runs on Sonnet')
  const why = { ...brief('game'), model: 'claude-opus-x' }
  why.brief = why.brief.replace('Prior art:', 'Model: opus (hard posing judged by the image)\nPrior art:')
  assert.deepEqual(decide('mcp__hearthbot__start_thread', why, [], [], teams), {}, 'Opus passes for posing when the brief says why')
})

test('team guard: a size L Programmer brief needs a Tester line first', () => {
  const cwd = mkdtempSync(join(tmpdir(), 'team-'))
  try {
    const start = (brief) => runTeam('pre', { cwd, tool_name: 'mcp__hearthbot__start_thread', tool_input: { brief: `${brief}${FULL}\nPrior art: checked templates/new-project; adapt it, because it has auth`, model: 'claude-x-1' } })
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

// Cloud thread 2026-11-12: it starts in /home/user with the checkout in /home/user/claude-setup. The harness loads that
// CLAUDE.md anyway (seen in the thread's own first message), so the boot card was a second copy (2.6k tokens per call).
test('team guard: a checkout one folder below the cwd counts as loaded, no boot copy', () => {
  const home = mkdtempSync(join(tmpdir(), 'team-home-'))
  const cwd = mkdtempSync(join(tmpdir(), 'team-'))
  const env = { CLAUDE_SETUP_HOME: home, CLAUDE_SETUP_BOOT_FETCH: 'off', CLAUDE_CODE_CHILD_SESSION: '' }
  try {
    for (const f of ['CLAUDE.md', 'docs/TEAMS.md', 'docs/MAP.md']) cpSync(join(root, f), join(home, '.claude/claude-setup', f))
    const start = (id = 'c1') => JSON.parse(runTeam('start', { cwd, session_id: id }, env).stdout).hookSpecificOutput.additionalContext
    assert.match(start(), /Working for yskills|Boot \(claude-setup\)/, 'without the checkout the boot copy is printed')
    mkdirSync(join(cwd, 'claude-setup'))
    cpSync(join(root, 'CLAUDE.md'), join(cwd, 'claude-setup/CLAUDE.md'))
    assert.match(start('c2'), /^Team rule \(claude-setup docs\/TEAMS\.md\)/, 'with the checkout one folder down only the pointer is printed')
    assert.doesNotMatch(start('c2'), /Working for yskills|Boot \(claude-setup\)/, 'no second copy of CLAUDE.md')
    assert.equal(existsSync(join(home, '.claude/claude-setup/booted/c2.rules')), false, 'no rules mark: the file was not injected')
  } finally { rmSync(home, { recursive: true, force: true }); rmSync(cwd, { recursive: true, force: true }) }
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
  const { STOP_WORD } = await import('../global/gate-rounds.mjs')
  const blocked = [
    ['mcp__github__update_pull_request', { reviewers: ['yskills'] }],
    ['mcp__github__issue_write', { method: 'update', assignees: ['YSkills'] }],
    ['mcp__github__create_pull_request', { reviewers: ['yskills'] }],
    ['Bash', { command: 'gh pr create --title x --reviewer yskills' }],
    ['Bash', { command: 'git commit -m "update stuff"' }],
    ['Bash', { command: "git commit -m \"$(cat <<'EOF'\nadded hook\n\nbody\nEOF\n)\"" }],
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
  assert.match(decide('Bash', { command: 'gh pr create -t x -r yskills' }, {}) ?? '', /never request a review from or assign/)
  assert.equal(decide('Artifact', { file_path: '/tmp/hq.html' }, {}, ['/tmp/hq.html']), null, 'republishing an Artifact this session updated by url')
  assert.match(decide('Artifact', { type_url: 'u', title: 'x', file_path: '/tmp/hq.html' }, {}, ['/tmp/hq.html']) ?? '', /only Artifact/)
  assert.match(promptContext('<wake><message trigger="true" from="human">Stopp!</message></wake>', STOP_WORD), /said stop/)
  assert.equal(promptContext('stop the server on port 8787 please', STOP_WORD), '')
})

test('rule guard: hook entry blocks with exit 2 and the off switch works', () => {
  const script = join(root, 'global/rule-guard.mjs')
  const run = (mode, input, env = {}) => spawnSync(process.execPath, [script, mode], { input: JSON.stringify(input), encoding: 'utf8', env: { ...process.env, ...env } })
  const pr = { tool_name: 'mcp__github__update_pull_request', tool_input: { reviewers: ['yskills'] } }
  assert.equal(run('pre', pr).status, 2)
  assert.equal(run('pre', pr, { CLAUDE_SETUP_RULE_GUARD: 'off' }).status, 0)
  assert.equal(run('prompt', { prompt: 'hello' }).status, 0)
})

// yskills 2026-10-27: every thread always knows exactly which role it has.
test('rule guard: the spawn brief names a role, the thread gets its Roster row and playbook once', async () => {
  const script = join(root, 'global/rule-guard.mjs')
  const session = `t${process.pid}${Date.now()}`
  const run = (prompt) => spawnSync(process.execPath, [script, 'prompt'], { input: JSON.stringify({ prompt, cwd: root, session_id: session }), encoding: 'utf8' })
  const wake = (reason, body) => `<wake reason="${reason}">\n<relay>\n  <note>\n      ${body}\n  </note>\n</relay>\n</wake>`
  assert.doesNotMatch(run(wake('mention', 'Role: Tester · Kit: app · Size: L')).stdout, /you are the/, 'a later wake quoting a brief is not this thread\'s role')
  const out = JSON.parse(run(wake('spawn', 'Role: Reviewer · Kit: setup · Size: S\nModel: sonnet')).stdout).hookSpecificOutput.additionalContext
  assert.match(out, /you are the Reviewer[\s\S]*Model: Fable[\s\S]*# Reviewer/)
  assert.ok(out.length < 10_000, 'hook output over 10,000 characters is cut to a preview')
  assert.doesNotMatch(run(wake('spawn', 'Role: Reviewer · Kit: setup · Size: S')).stdout, /you are the/, 'once per session')
  const { roleOf } = await import('../global/rule-guard.mjs')
  assert.equal(roleOf('Role: Evil', '| Evil ([`x.md`](../../../etc/passwd.md)) | a | b | c | d |').path, null, 'a path outside a roles folder is never read')
  const teams = readFileSync(join(root, 'docs/TEAMS.md'), 'utf8')
  assert.equal(roleOf('Role: Programmer for the app · Kit: app', teams).name, 'Programmer', 'a Roster name followed by words')
  assert.equal(roleOf('Role: Social Lead · Kit: social', teams)?.name, 'Social Lead')
  // 2026-11-12: a project thread's first transcript entry starts with a <session-context> block, the spawn wake
  // comes after it; the lookup anchored at the start of the entry never found the brief, so no role card arrived.
  const { spawnPrompt, roleCard } = await import('../global/rule-guard.mjs')
  const entry = JSON.stringify({ type: 'user', message: { content: `<session-context nonce="x">\n- Every thread brief: stamp line Role: Kit: Size:\n</session-context nonce="x">\n\n${wake('spawn', 'Role: Tester · Kit: app · Size: L')}` } })
  const found = spawnPrompt('<wake reason="mention">hi</wake>', entry)
  assert.match(found, /^<wake reason="spawn">/, 'the brief is found behind a leading context block, cut at the spawn wake')
  assert.equal(roleOf(found, teams)?.name, 'Tester')
  assert.match(roleCard({ name: 'Tester', path: 'p.md', row: 'Job: x.' }, '# Tester'), /first line of your first checklist/, 'the thread shows which role and playbook it loaded')
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

// Routing test 2026-10-27: the self-update never replaced a guard, because `node --check` read the
// `.new` download as CommonJS and failed on `import`; a cached cloud image then kept its old guards.
test('team guard: refresh replaces an installed guard with main\'s ES module copy', async () => {
  const { refresh } = await import('../global/team-guard.mjs')
  const dir = mkdtempSync(join(tmpdir(), 'refresh-'))
  const bin = mkdtempSync(join(tmpdir(), 'fakecurl-'))
  const old = process.env.PATH
  try {
    writeFileSync(join(bin, 'curl'), `#!/bin/sh\nwhile [ $# -gt 0 ]; do\n  if [ "$1" = "-o" ]; then out="$2"; url="$3"; shift 3\n    mkdir -p "$(dirname "$out")"\n    case "$url" in *global/*) printf '#!/usr/bin/env node\\nimport { join } from "node:path"\\n// new\\n' > "$out" ;; *CLAUDE.md) echo '# Working for yskills' > "$out" ;; *) echo doc > "$out" ;; esac\n  else shift; fi\ndone\n`, { mode: 0o755 })
    writeFileSync(join(dir, 'rule-guard.mjs'), '#!/usr/bin/env node\n// old\n')
    process.env.PATH = `${bin}:${old}`
    if (process.platform === 'win32') return
    refresh(dir)
    assert.match(readFileSync(join(dir, 'rule-guard.mjs'), 'utf8'), /\/\/ new/)
    assert.deepEqual(readdirSync(dir).filter((f) => f.includes('.new')), [], 'no download is left behind')
  } finally { process.env.PATH = old; for (const d of [dir, bin]) rmSync(d, { recursive: true, force: true }) }
})

// Live bug 2026-11-12: a cloud image pasted before the round counter existed never got it, because refresh only
// updated guards already on disk; rule-guard then said "counter could not load" and refused posts and merges.
test('team guard: refresh fetches a guard file the image never installed', async () => {
  const { refresh, GUARD_FILES } = await import('../global/team-guard.mjs')
  const dir = mkdtempSync(join(tmpdir(), 'refresh-'))
  const bin = mkdtempSync(join(tmpdir(), 'fakecurl-'))
  const old = process.env.PATH
  try {
    writeFileSync(join(bin, 'curl'), `#!/bin/sh\nwhile [ $# -gt 0 ]; do\n  if [ "$1" = "-o" ]; then out="$2"; url="$3"; shift 3\n    mkdir -p "$(dirname "$out")"\n    case "$url" in *global/*) printf '#!/usr/bin/env node\\n// new\\n' > "$out" ;; *CLAUDE.md) echo '# Working for yskills' > "$out" ;; *) echo doc > "$out" ;; esac\n  else shift; fi\ndone\n`, { mode: 0o755 })
    writeFileSync(join(dir, 'rule-guard.mjs'), '#!/usr/bin/env node\n// old\n')
    process.env.PATH = `${bin}:${old}`
    if (process.platform === 'win32') return
    refresh(dir)
    for (const f of GUARD_FILES) assert.ok(existsSync(join(dir, f)), `${f} is installed by the refresh`)
    assert.match(readFileSync(join(dir, 'rule-guard.mjs'), 'utf8'), /\/\/ new/, 'an installed guard is still replaced')
    assert.deepEqual(readdirSync(dir).filter((f) => f.includes('.new')), [], 'no download is left behind')
    rmSync(join(dir, 'context-guard.mjs'), { force: true })
    refresh(dir, ['rule-guard.mjs'])
    assert.ok(!existsSync(join(dir, 'context-guard.mjs')), 'a partial refresh (only) fetches only what it was asked for')
  } finally { process.env.PATH = old; for (const d of [dir, bin]) rmSync(d, { recursive: true, force: true }) }
})

// Gate review 2026-11-12: a cloud container restarts from the cached image every session, so the old start hook
// never installs the new counter. The first call that needs it must fetch it itself, from an image that has
// only the two guards (the live case), not from a dir the new refresh already filled.
test('rule guard: a missing round counter is fetched on first use, a verdict post is then judged', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'cachedimage-'))
  const bin = mkdtempSync(join(tmpdir(), 'fakecurl-'))
  const old = process.env.PATH
  try {
    for (const f of ['rule-guard.mjs', 'team-guard.mjs']) cpSync(join(root, 'global', f), join(dir, f))
    writeFileSync(join(bin, 'curl'), `#!/bin/sh\nwhile [ $# -gt 0 ]; do\n  if [ "$1" = "-o" ]; then out="$2"; url="$3"; shift 3\n    mkdir -p "$(dirname "$out")"\n    case "$url" in *global/gate-rounds.mjs) printf '#!/usr/bin/env node\\nexport const gateStep = () => "counter says no"\\nexport const gateBrief = () => ""\\n' > "$out" ;; esac\n  else shift; fi\ndone\n`, { mode: 0o755 })
    process.env.PATH = `${bin}:${old}`
    if (process.platform === 'win32') return
    const { gateBlock } = await import(pathToFileURL(join(dir, 'rule-guard.mjs')).href)
    const post = { owner: 'o', repo: 'r', pullNumber: 1, body: 'Gate 5/5 (S, round 1)' }
    assert.match(await gateBlock('mcp__github__add_issue_comment', post, () => '', 'sonnet', true), /counter says no/, 'the fetched counter judged the post')
    assert.ok(existsSync(join(dir, 'gate-rounds.mjs')), 'the counter is installed')
  } finally { process.env.PATH = old; for (const d of [dir, bin]) rmSync(d, { recursive: true, force: true }) }
})

// M47 follow-up (fresh thread 2026-11-12 15:01: no guard line, no checklists.md, one guard file missing; the test uses attempt-guard.mjs as that guard): the cached image's old
// team-guard runs the start refresh with its own old lists, so files added later never arrive. The fresh rule-guard on disk
// fills in what its team-guard lists and the disk lacks, then names the version, on the spawn prompt and on the lookup path.
// S10 (a): merged means live. A cached image's old team-guard refreshes first, then runs the refreshed copy once, so a merged
// start-hook change reaches the session (#531 did not, 2026-11-13 00:26).
test('team guard: start refreshes first and prints what the refreshed copy prints, once', () => {
  if (process.platform === 'win32') return
  const home = mkdtempSync(join(tmpdir(), 'start-home-'))
  const bin = mkdtempSync(join(tmpdir(), 'fakecurl-'))
  const cwd = mkdtempSync(join(tmpdir(), 'chat-'))
  try {
    const dir = join(home, '.claude', 'claude-setup')
    mkdirSync(dir, { recursive: true })
    // The real hook runs the INSTALLED file, so the old copy is the guard itself, installed.
    cpSync(teamFile, join(dir, 'team-guard.mjs'))
    const runInstalled = (payload, env) => spawnSync(process.execPath, [join(dir, 'team-guard.mjs'), 'start'], { input: JSON.stringify(payload), encoding: 'utf8', timeout: 5000, env: { ...process.env, CLAUDE_CODE_CHILD_SESSION: '', ...env } })
    writeFileSync(join(bin, 'curl'), `#!/bin/sh\nwhile [ $# -gt 0 ]; do\n  if [ "$1" = "-o" ]; then out="$2"; url="$3"; shift 3\n    mkdir -p "$(dirname "$out")"\n    case "$url" in *global/team-guard.mjs) printf '#!/usr/bin/env node\\nimport "node:path"\\nprocess.stdout.write("fresh " + process.argv[2] + " " + (process.env.CLAUDE_SETUP_START_RERUN ?? "") + " " + process.env.CLAUDE_SETUP_BOOT_FETCH)\\n' > "$out" ;; *) echo doc > "$out" ;; esac\n  else shift; fi\ndone\n`, { mode: 0o755 })
    const env = { CLAUDE_SETUP_HOME: home, PATH: `${bin}:${process.env.PATH}` }
    assert.equal(runInstalled({ cwd, session_id: 'r1' }, env).stdout, 'fresh start 1 off', 'the refreshed copy ran once, with the loop flag and no second fetch')
    cpSync(teamFile, join(dir, 'team-guard.mjs'))
    assert.doesNotMatch(runInstalled({ cwd, session_id: 'r2' }, { ...env, CLAUDE_SETUP_START_RERUN: '1' }).stdout, /^fresh/, 'with the flag set this copy answers itself')
    cpSync(teamFile, join(dir, 'team-guard.mjs'))
    writeFileSync(join(bin, 'curl'), `#!/bin/sh\nwhile [ $# -gt 0 ]; do\n  if [ "$1" = "-o" ]; then out="$2"; shift 3; mkdir -p "$(dirname "$out")"; printf '#!/usr/bin/env node\\n// prints nothing\\n' > "$out"; else shift; fi\ndone\n`, { mode: 0o755 })
    assert.match(runInstalled({ cwd, session_id: 'r3' }, env).stdout, /Team rule|Boot \(claude-setup\)/, 'a new copy that prints nothing falls back to the running one')
  } finally { for (const d of [home, bin, cwd]) rmSync(d, { recursive: true, force: true }) }
})

// S10 (b): git skips a hook without the exec bit and says nothing, so the fetched pre-push must be executable and whole.
test('team guard: refresh fetches the pre-push hook, executable, and a cut-off download keeps the old one', () => {
  if (process.platform === 'win32') return
  const home = mkdtempSync(join(tmpdir(), 'hook-home-'))
  const bin = mkdtempSync(join(tmpdir(), 'fakecurl-'))
  const cwd = mkdtempSync(join(tmpdir(), 'chat-'))
  try {
    const dir = join(home, '.claude', 'claude-setup')
    const hook = join(dir, 'git-hooks', 'pre-push')
    writeFileSync(join(bin, 'curl'), `#!/bin/sh\nwhile [ $# -gt 0 ]; do\n  if [ "$1" = "-o" ]; then out="$2"; url="$3"; shift 3\n    mkdir -p "$(dirname "$out")"\n    case "$url" in *global/git-hooks/pre-push) printf '#!/bin/sh\\necho new\\n' > "$out" ;; *) echo doc > "$out" ;; esac\n  else shift; fi\ndone\n`, { mode: 0o755 })
    const env = { CLAUDE_SETUP_HOME: home, PATH: `${bin}:${process.env.PATH}` }
    runTeam('start', { cwd, session_id: 'h1' }, env)
    assert.ok(existsSync(hook), 'the hook is fetched')
    assert.ok((statSync(hook).mode & 0o111) !== 0, 'and executable')
    assert.match(readFileSync(hook, 'utf8'), /^#!\/bin\/sh/)
    writeFileSync(join(bin, 'curl'), `#!/bin/sh\nwhile [ $# -gt 0 ]; do\n  if [ "$1" = "-o" ]; then out="$2"; shift 3; mkdir -p "$(dirname "$out")"; printf '#!/bin/sh\\necho ha' > "$out"; else shift; fi\ndone\nexit 18\n`, { mode: 0o755 })
    runTeam('start', { cwd, session_id: 'h2' }, env)
    assert.match(readFileSync(hook, 'utf8'), /^#!\/bin\/sh\necho new/, 'a cut-off download keeps the installed hook')
  } finally { for (const d of [home, bin, cwd]) rmSync(d, { recursive: true, force: true }) }
})

test('rule guard: a thread start installs the guards and boot files an old image never listed, and names them', () => {
  if (process.platform === 'win32') return
  const dir = mkdtempSync(join(tmpdir(), 'oldimage-'))
  const bin = mkdtempSync(join(tmpdir(), 'fakecurl-'))
  try {
    for (const f of ['rule-guard.mjs', 'team-guard.mjs', 'gate-rounds.mjs', 'context-guard.mjs', 'compact-guard.mjs', 'card-render.mjs']) cpSync(join(root, 'global', f), join(dir, f))
    writeFileSync(join(bin, 'curl'), `#!/bin/sh\nwhile [ $# -gt 0 ]; do\n  if [ "$1" = "-o" ]; then out="$2"; url="$3"; shift 3\n    mkdir -p "$(dirname "$out")"\n    case "$url" in *global/attempt-guard.mjs) printf '#!/usr/bin/env node\\n' > "$out" ;; *checklists.md) echo '## Garment' > "$out" ;; esac\n  else shift; fi\ndone\n`, { mode: 0o755 })
    const env = { ...process.env, PATH: `${bin}:${process.env.PATH}`, CLAUDE_SETUP_RULE_GUARD: '' }
    const brief = `<wake reason="spawn"><relay>\nRole: Programmer · Kit: setup · Size: S${FULL}</relay></wake>`
    const run = (prompt, session, transcript = '') => spawnSync(process.execPath, [join(dir, 'rule-guard.mjs'), 'prompt'], { input: JSON.stringify({ prompt, cwd: root, session_id: session, transcript_path: transcript }), encoding: 'utf8', env }).stdout
    assert.match(run(brief, `old1${process.pid}`), /Guards in this session: [0-9a-f]{8} \(7\/7 installed\)/, 'the spawn start names all guards')
    assert.ok(existsSync(join(dir, 'attempt-guard.mjs')), 'the guard the old image never listed is installed')
    assert.ok(existsSync(join(dir, '.claude/skills/operator/checklists.md')), 'the boot file the old image never listed is installed')
    rmSync(join(dir, 'attempt-guard.mjs'))
    const transcript = join(dir, 't.jsonl')
    writeFileSync(transcript, JSON.stringify({ type: 'user', message: { role: 'user', content: brief } }))
    assert.match(run('<wake reason="mention"><message>hi</message></wake>', `old2${process.pid}`, transcript), /Guards in this session: [0-9a-f]{8} \(7\/7 installed\)/, 'a thread whose brief is found in the transcript gets the line too')
    const repo = spawnSync(process.execPath, [join(root, 'global/rule-guard.mjs'), 'prompt'], { input: JSON.stringify({ prompt: brief, cwd: root, session_id: `old3${process.pid}` }), encoding: 'utf8', env }).stdout
    assert.match(repo, /Guards in this session/, 'a checkout still names its guards')
    assert.equal(existsSync(join(root, 'global', '.claude')), false, 'run from a git checkout, it writes no boot files into the repo')
  } finally { for (const d of [dir, bin]) rmSync(d, { recursive: true, force: true }) }
})

// M50 slice B: the first thread start in a project with no card or a stale one writes the whole rulebook folder from the installed copy and says so once.
test('rule guard: a thread start refreshes a stale coordinator card in its project folder, once, and never fails the start', () => {
  if (process.platform === 'win32') return
  const dir = mkdtempSync(join(tmpdir(), 'cardstart-'))
  const bin = mkdtempSync(join(tmpdir(), 'nocurl-'))
  const out = mkdtempSync(join(tmpdir(), 'projfiles-'))
  try {
    for (const f of readdirSync(join(root, 'global')).filter((x) => x.endsWith('.mjs'))) cpSync(join(root, 'global', f), join(dir, f))
    mkdirSync(join(dir, 'docs'))
    for (const f of ['TEAMS.md', 'MAP.md']) cpSync(join(root, 'docs', f), join(dir, 'docs', f))
    writeFileSync(join(bin, 'curl'), '#!/bin/sh\nexit 0\n', { mode: 0o755 })
    const env = { ...process.env, PATH: `${bin}:${process.env.PATH}`, CLAUDE_SETUP_RULE_GUARD: '', CLAUDE_SETUP_PROJECT_FILES: out }
    const brief = `<wake reason="spawn"><relay>\nRole: Programmer · Kit: setup · Size: S${FULL}</relay></wake>`
    const run = (session) => spawnSync(process.execPath, [join(dir, 'rule-guard.mjs'), 'prompt'], { input: JSON.stringify({ prompt: brief, cwd: root, session_id: session }), encoding: 'utf8', env }).stdout
    assert.match(run(`card1${process.pid}`), /Card refreshed [0-9a-f]{8}: /, 'the start receipt names the refresh')
    for (const f of ['COORDINATOR-CARD.md', 'ROSTER.md', 'briefs/programmer.md']) assert.ok(existsSync(join(out, 'claude-setup', f)), f)
    assert.doesNotMatch(run(`card2${process.pid}`), /Card refreshed/, 'a current card is left alone and the start says nothing')
    writeFileSync(join(out, 'claude-setup', 'COORDINATOR-CARD.md'), 'Coordinator card (claude-setup 00000000, 2026-11-01).\nold')
    assert.match(run(`card3${process.pid}`), /Card refreshed/, 'a stale card is refreshed')
    const checkout = spawnSync(process.execPath, [join(root, 'global/rule-guard.mjs'), 'prompt'], { input: JSON.stringify({ prompt: brief, cwd: root, session_id: `card4${process.pid}` }), encoding: 'utf8', env: { ...env, CLAUDE_SETUP_PROJECT_FILES: mkdtempSync(join(tmpdir(), 'projfiles2-')) } }).stdout
    assert.doesNotMatch(checkout, /Card refreshed/, 'run from a checkout (no docs beside the guards) it renders nothing')
  } finally { for (const d of [dir, bin, out]) rmSync(d, { recursive: true, force: true }) }
})

// Plan M47: a thread's start proof names the guard version and any missing guard file.
test('team guard: the version line names the guards in force and the ones missing', async () => {
  const { guardVersion, GUARD_FILES } = await import('../global/team-guard.mjs')
  const dir = mkdtempSync(join(tmpdir(), 'version-'))
  try {
    for (const f of GUARD_FILES) writeFileSync(join(dir, f), `#!/usr/bin/env node\n// ${f}\n`)
    const full = guardVersion(dir)
    assert.match(full, new RegExp(`^Guards in this session: [0-9a-f]{8} \\(${GUARD_FILES.length}/${GUARD_FILES.length} installed\\)\\.$`))
    writeFileSync(join(dir, 'rule-guard.mjs'), '#!/usr/bin/env node\n// changed\n')
    assert.notEqual(guardVersion(dir), full, 'a changed guard changes the version')
    rmSync(join(dir, GUARD_FILES.at(-1)))
    assert.match(guardVersion(dir), new RegExp(`MISSING ${GUARD_FILES.at(-1).replace('.', '\\.')}`))
  } finally { rmSync(dir, { recursive: true, force: true }) }
})

// Routing test 2026-10-27: the project chat may run without hooks, so the thread checks its own start.
test('rule guard: a thread checks its spawn brief against TEAMS.md and sends a bad start back', async () => {
  const { briefCheck } = await import('../global/rule-guard.mjs')
  const spawn = (brief) => `<wake reason="spawn"><message>${brief}</message></wake>`
  assert.match(await briefCheck(spawn(`Role: Programmer · Kit: setup · Size: M${FULL}`), root), /^Title check[\s\S]*`Programmer · `[\s\S]*rename_thread/)
  assert.equal(await briefCheck(spawn(`Role: Programmer · Kit: setup · Size: S${FULL}`), root), '', 'size S needs no role title (yskills 2026-10-27)')
  assert.match(await briefCheck(spawn(`Role: none · Kit: setup · Size: S${FULL}`), root), /Brief check[\s\S]*names no role of the Roster/, 'no role is refused (yskills 2026-11-12), not waved through')
  assert.match(await briefCheck(spawn(`Role: Designer · Kit: content · Size: S${FULL}`), root), /Brief check[\s\S]*Kit: content is no kit[\s\S]*message_coordinator/)
  assert.match(await briefCheck(spawn('Make a bee video.'), root), /no `Role: · Kit: · Size:` stamp/)
  assert.match(await briefCheck(spawn('Role: Programmer · Kit: setup · Size: S\nFix it.'), root), /^Brief repair \(no block\): the brief lacks[\s\S]*Model[\s\S]*Item[\s\S]*Plan[\s\S]*Acceptance[\s\S]*first checklist line/, 'M50: at size S everything follows from the stamp, so nothing blocks')
  const bad = await briefCheck(spawn('Role: Designer · Kit: content · Size: M\nFix it.'), root)
  assert.match(bad, /^Brief check[\s\S]*Kit: content is no kit/, 'M50: one refusal lists every judgment gap at once')
  const sizeM = await briefCheck(spawn('Role: Programmer · Kit: setup · Size: M\nFix it.'), root)
  assert.match(sizeM, /^Brief check[\s\S]*Item is missing[\s\S]*Plan is missing[\s\S]*Acceptance is missing[\s\S]*Role: Programmer · Kit: <kit>[\s\S]*Item: <issue #n, PLAN\.json item/, 'at size M the three decisions and the role template')
  assert.doesNotMatch(sizeM.split('\n')[0], /Model|Skills|Start|Threads|Stop when/, 'what follows from the stamp is never in the refusal')
  assert.equal(await briefCheck('Role: Designer · Kit: content · Size: S', root), '', 'only the spawn wake')
  assert.match(await briefCheck(JSON.stringify(spawn(`Role: Programmer (debug) · Kit: setup · Size: M${FULL}`)), root), /^Title check/, 'an escaped wake, a role with a note')
  assert.equal(await briefCheck(spawn(`Role: Programmer · Kit: setup · Size: S${FULL}\nDone when: <b>x</b> and a < b`), root), '', 'other tags stay')
  const out = spawnSync(process.execPath, [join(root, 'global/rule-guard.mjs'), 'prompt'], { input: JSON.stringify({ prompt: spawn('Make a bee video.'), cwd: root, session_id: 'bc1' }), encoding: 'utf8' }).stdout
  assert.match(JSON.parse(out).hookSpecificOutput.additionalContext, /^Brief check/)
})

// Issue #335: the relay and the first wake queue together, so the hook fires once, on the wake that has no spawn marker.
test('rule guard: the spawn brief is checked from the transcript when the prompt that fires the hook is not the spawn one', () => {
  const dir = mkdtempSync(join(tmpdir(), 'rg-spawn-'))
  try {
    const entry = (text, type = 'user') => JSON.stringify({ type, message: { role: type, content: type === 'user' ? text : [{ type: 'text', text }] } })
    const wake = '<wake reason="spawn"><message>You are a Thread Session created by this project.</message></wake>'
    const relay = (brief) => `<relay from="coordinator" reason="spawn"><note>${brief}</note></relay>`
    const mention = '<wake reason="mention"><message>hi</message></wake>'
    const run = (lines, session) => {
      const transcript = join(dir, `${session}.jsonl`)
      writeFileSync(transcript, lines.join('\n'))
      return spawnSync(process.execPath, [join(root, 'global/rule-guard.mjs'), 'prompt'], { input: JSON.stringify({ prompt: mention, cwd: root, session_id: session, transcript_path: transcript }), encoding: 'utf8' }).stdout
    }
    const id = (name) => `${name}-${process.pid}`
    const bad = [entry(wake), entry(relay('Make a bee video.')), entry(mention)]
    assert.match(JSON.parse(run(bad, id('bc335'))).hookSpecificOutput.additionalContext, /^Brief check[\s\S]*no `Role: · Kit: · Size:` stamp/)
    assert.doesNotMatch(run(bad, id('bc335')), /Brief check/, 'once per session')
    assert.doesNotMatch(run([entry(wake), entry(relay(`Role: Programmer · Kit: setup · Size: S${FULL}`)), entry(mention)], id('bc335ok')), /Brief check/, 'a good brief passes, the bare spawn wake is not the brief')
    assert.doesNotMatch(run([entry('see this: <wake reason="spawn">Make a bee video.</wake>'), entry('x', 'assistant'), 'not json reason="spawn"'], id('bc335q')), /Brief check/, 'a chat that only quotes a spawn is no thread')
    assert.doesNotMatch(run([entry(`<wake reason="mention"><message>${relay('Make a bee video.')}</message></wake>`)], id('bc335w')), /Brief check/, 'a wake that quotes another thread\'s spawn relay is no thread')
  } finally { rmSync(dir, { recursive: true, force: true }) }
})

// The repeats audit 2026-10-27 (docs/research/2026-10-27-repeats.md): what yskills had to say most, as checks.
test('rule guard: replies that ask for an Allow, post Done: without proof or claim nothing is open', async () => {
  const { decide, replyRule } = await import('../global/rule-guard.mjs')
  const post = (text, extra = {}) => decide('mcp__hearthbot__post_message', { text, ...extra }, {}, [], extra.board ?? null)
  assert.match(post('Tap Allow in the thread so I can merge.') ?? '', /Hard rules/)
  assert.match(post('Soll ich das mergen?') ?? '', /Hard rules/)
  assert.equal(post('Shall I go ahead with the live Stripe key? It costs real money.'), null, 'ask-first items may ask')
  assert.match(post('Done: the guard is merged.') ?? '', /proof/)
  assert.equal(post('Done: merged, https://github.com/yverse-studio/claude-setup/pull/1'), null)
  assert.equal(post('Done: see the screenshots', { attached_outputs: [{ kind: 'file', ref: '/mnt/project-files/a.png' }] }), null)
  const board = { finished: [{ id: 't1', title: 'Gate: x', state: 'done' }], blocked: [], told: new Set() }
  assert.match(post('Alles fertig, keine Blocker.', { board }) ?? '', /Gate: x/)
  assert.equal(post('Alles fertig, keine Blocker.', { board: { finished: [], blocked: [], told: new Set() } }), null)
  assert.equal(replyRule('PR is up, the gate runs now.'), null)
})

test('team guard: an Agent call cannot run a gate agent below its file model', async () => {
  const { decide, downgraded } = await import('../global/team-guard.mjs')
  const dirs = [join(root, '.claude/agents')]
  assert.match(decide('Agent', { subagent_type: 'code-reviewer', model: 'sonnet' }, dirs).block ?? '', /runs on opus/)
  assert.equal(decide('Agent', { subagent_type: 'code-reviewer', model: 'opus' }, dirs).block, undefined)
  assert.equal(decide('Agent', { subagent_type: 'code-reviewer' }, dirs).block, undefined, 'the file model applies')
  assert.equal(decide('Agent', { subagent_type: 'doc-updater', model: 'sonnet' }, dirs).block, undefined, 'a higher tier passes')
  assert.equal(downgraded({ subagent_type: 'architect', model: 'opus' }, dirs), null, 'Opus takes Fable when it is out of credits')
  assert.equal(downgraded({ subagent_type: 'architect', model: 'sonnet' }, dirs), 'fable')
  assert.equal(downgraded({ subagent_type: 'code-reviewer', model: 'sonnet', prompt: 'yskills named sonnet' }, dirs), null, 'a model yskills named')
  assert.equal(downgraded({ subagent_type: 'code-reviewer', model: 'inherit' }, dirs), null, 'no tier, nothing to compare')
  assert.equal(downgraded({ subagent_type: 'no-such-agent', model: 'haiku' }, dirs), null, 'no agent file')
  assert.equal(downgraded({ subagent_type: 'code-reviewer', model: 'claude-sonnet-x[1m]' }, dirs), 'opus', 'a full id')
  for (const a of ['code-reviewer', 'security-reviewer', 'evaluator', 'legal-reviewer', 'red-team', 'design-critic'])
    assert.equal(downgraded({ subagent_type: a, model: 'sonnet' }, dirs), 'opus', `${a} is a gate agent on Opus`)
})

test('team guard: a thread start runs its role on the tier its Roster row names', async () => {
  const { decide, wrongModel } = await import('../global/team-guard.mjs')
  const teams = readFileSync(join(root, 'docs/TEAMS.md'), 'utf8')
  const brief = (role, size) => `Role: ${role} · Kit: setup · Size: ${size}${FULL}\nPrior art: claude-setup/global guards checked -> adapt, because they exist`
  assert.ok(wrongModel(brief('Planner', 'M'), 'sonnet', teams))
  assert.ok(wrongModel(brief('Planner', 'M'), 'opus', teams), 'S5: the Planner thread is Fable; Opus only when Fable is unavailable')
  assert.equal(wrongModel(brief('Planner', 'M'), 'fable', teams), null, 'the row names Fable')
  assert.ok(wrongModel(brief('Programmer', 'M'), 'opus', teams), 'an Opus checkpoint subagent is no Opus thread')
  // gate.md Rounds 2: the Fable gate director runs as a Designer thread (11-12: that start was refused for lack of a row).
  assert.equal(wrongModel(brief('Designer', 'S'), 'fable', teams), null, 'the Designer row names Fable for the gate director')
  assert.ok(wrongModel(brief('Designer', 'S'), 'sonnet', teams), 'a Designer is never Sonnet')
  assert.match(teams, /\| Designer .*Fable: art direction, gate director/, 'the Designer row names the gate director')
  // yskills 2026-11-03: gates always Opus, at every size.
  for (const size of ['S', 'M', 'L']) {
    assert.equal(wrongModel(brief('Tester', size), 'opus', teams), null, `Tester ${size} on Opus`)
    assert.ok(wrongModel(brief('Tester', size), 'sonnet', teams), `Tester ${size} never on Sonnet`)
  }
  assert.equal(wrongModel(`${brief('Programmer', 'M')}\nModel: opus, yskills named it`, 'opus', teams), null)
  assert.equal(wrongModel('Role: none · Kit: setup · Size: S', 'opus', teams), null)
  assert.match(decide('mcp__hearthbot__start_thread_session', { brief: brief('Programmer', 'M'), model: 'opus' }, [], [], teams).block ?? '', /Roster/)
  assert.equal(decide('mcp__hearthbot__start_thread_session', { brief: brief('Programmer', 'M'), model: 'sonnet' }, [], [], teams).block, undefined)
})

// yskills 2026-11-10: "everything you want me to do or show with a link". An ask of him or a thread pointer needs a clickable link.
test('rule guard: an ask of yskills or a thread pointer carries a clickable link', async () => {
  const { replyRule } = await import('../global/rule-guard.mjs')
  for (const text of [
    'Antwort steht im Thread Build plane chapter (◕‿◕)', 'Du musst nur den Ordner freigeben~', 'Bitte gib den Ordner frei (｡•̀ᴗ-)✧',
    'Waiting on you: the 3 cards in the Planner thread.', 'You need to approve the folder once.', 'Ich brauch noch deine Antwort zu Karte 2.',
    'Antwort steht im Planner-Thread.', 'Kannst du den Ordner freigeben?', 'Can you approve the folder?', 'Du müsstest den Ordner freigeben.', 'Siehe PR 400.',
  ]) assert.match(replyRule(text) ?? '', /clickable link/, text)
  for (const text of [
    'Antwort steht in [Build plane chapter](#cmsg_012abc) (◕‿◕)', 'Du musst nur hier freigeben: [Project settings](#project-settings/resources)',
    'Bitte schau dir https://github.com/yverse-studio/claude-setup/pull/400 an', 'Jaa, PR ist durch ٩(◕‿◕)۶ du musst nix machen~',
    'Du musst nichts tun, der Gate läuft.', 'Thread-Board ist leer, alles gemerged.',
    'Kein Ding, du musst dich um nichts kümmern.', 'Der Fix steht auf dem Thread-Board, alles grün.', 'Siehe Prüfbericht unten, alles grün.',
  ]) assert.equal(replyRule(text), null, text)
})

// Gate review of PR 323: the ordinary replies and state lines these checks must let through, and the edges.
test('rule guard: repeats checks pass ordinary replies, honour told threads and filtered lists', async () => {
  const { replyRule, decide, threadBoard } = await import('../global/rule-guard.mjs')
  for (const text of [
    'Want me to rotate the production secret?', 'Soll ich 10 € ausgeben und das Abo kaufen?', 'Shall I send the mail to the shop?',
    'PR 12 is up; the gate runs now.', 'Fertig mit dem Plan, der Programmer baut jetzt.', 'Alles fertig hier, PR 5 läuft durch das Gate.',
    'Flex works where grid could not.', 'The old route is gone; the new one is live.',
  ]) assert.equal(replyRule(text), null, text)
  const board = { finished: [{ id: 'a', title: 'Gate: x', state: 'done' }], blocked: [], told: new Set(['a']) }
  assert.equal(replyRule('Nothing open, no blockers.', [], board), null, 'every finished thread was told')
  assert.equal(replyRule('PR is up.', [], () => { throw new Error('board read for a reply that needs none') }), null)
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
  const brief = 'Role: Social Lead · Kit: social · Size: M\nPrior art: social-team/SKILL.md checked -> adapt, because it exists'
  assert.ok(wrongModel(brief, 'opus', teams))
  assert.equal(wrongModel(`${brief}\nModel: opus (the weekly plan)`, 'opus', teams), null)
  assert.ok(wrongModel(`${brief}\nModel: haiku (cheaper)`, 'haiku', teams), 'a tier the row never names stays blocked')
})

// yskills 2026-10-27: "how do I enforce that you grill me".
test('rule guard: a Planner M/L grills before the plan', async () => {
  const { decide, grillMissing } = await import('../global/rule-guard.mjs')
  const post = (text) => decide('mcp__hearthbot__post_message', { text }, {})
  assert.equal(post('Fertig: PR 3 ist drin.'), null)
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
  const start = (stamp, model = 'sonnet') => decide('mcp__hearthbot__start_thread', { instructions: `${stamp}${FULL}\nPrior art: video-studio/SKILL.md and storyteller checked -> adapt, because they are ours`, model }, [], [], teams).block ?? ''
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
  // Test project 2026-10-27: the bee video thread was not titled `Producer · <video>`.
  const titled = (title) => decide('mcp__hearthbot__start_thread', { title, instructions: `Role: Producer · Kit: video · Size: M${FULL}\nPrior art: video-studio/SKILL.md -> adapt, because it is ours`, model: 'sonnet' }, [], [], teams).block ?? ''
  assert.match(titled('Bienen-Video'), /Producer thread is titled `Producer · <what>`/)
  assert.equal(titled('Producer · Bienen-Video'), '')
  assert.equal(decide('mcp__hearthbot__start_thread', { title: 'Fix login', instructions: `Role: Programmer · Kit: app · Size: S${FULL}`, model: 'sonnet' }, [], [], teams).block, undefined, 'size S needs no role title')
  assert.equal(decide('mcp__hearthbot__start_thread', { title: 'Fix x', instructions: `Role: none · Kit: setup · Size: S${FULL}`, model: 'sonnet' }, [], [], teams).block, undefined, 'Role: none has no title rule')
  assert.equal(badTeam('Role: Programmer · Kit: app · Size: M', ''), null, 'no TEAMS.md copy, no kit check')
  assert.equal(badTeam('Role: Marketer · Kit: game · Size: L', teams), null, 'a conditional Skipped item ("before the first playable") skips nobody outright')
  assert.equal(badTeam('Role: Content Designer · Kit: game · Size: L', teams), null)
  assert.match(badTeam('Role: Security · Kit: story · Size: L', teams) ?? '', /not on the `story` kit/)
  assert.equal(badTeam('Role: Tester · Kit: app · Size: L', teams), null)
  assert.ok(missingLines('Model: <id for this role>\nSkills: <role doc>').includes('Model:'), 'an unfilled Model placeholder does not count')
  assert.ok(!missingLines('Done when:\n  node --test passes').includes('Done when:'), 'the value may start on the next line')
  assert.deepEqual(missingLines('Role: Producer · Kit: video · Size: M\nMake a bee video.'), ['Item: (#n of its issue, M<n> from PLAN.json, or new)', 'Plan: (the plan file or card this thread builds)', 'Acceptance: (what counts as accepted)', 'Model:', 'Skills:', 'Done when:', 'Stop when:', 'Start: (read MEMORY.md first)', 'Threads: (list_threads checked, none open on this topic)'])
  assert.deepEqual(missingLines(`Role: Planner · Kit: setup · Size: M${FULL}\nDone when: SOTA research on plan tracking is summarized`), ['Researcher: (the task asks for research)'], 'a research task names its Researcher')
  assert.deepEqual(missingLines(`Role: Planner · Kit: setup · Size: M${FULL}\nDone when: research on best practice summarized\nResearcher: general-purpose, sonnet`), [])
  assert.deepEqual(missingLines(`Role: Programmer · Kit: app · Size: S${FULL}\nFollow best practices for tests.`), [], 'an order to follow best practice is no research ask')
  assert.deepEqual(missingLines(`Role: Researcher · Kit: app · Size: M${FULL}\nFind the SOTA for offline sync.`), [], 'the Researcher itself names none')
  assert.deepEqual(missingLines(`Role: Programmer · Kit: app · Size: S${FULL}\nShortest reply. No extra subagents, research, screenshots or re-reads.`), [], 'the brief block itself is no research ask')
  assert.deepEqual(missingLines('Done when: <a check>. Stop when: <budget>'), ['Item: (#n of its issue, M<n> from PLAN.json, or new)', 'Plan: (the plan file or card this thread builds)', 'Acceptance: (what counts as accepted)', 'Model:', 'Skills:', 'Done when:', 'Stop when:', 'Start: (read MEMORY.md first)', 'Threads: (list_threads checked, none open on this topic)'], 'unfilled placeholders do not count')
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
  assert.match(line, /is Luna: 20, cute e-girl[\s\S]*games and anime[\s\S]*Voice: yskills: ist der PR durch\? Luna: [\s\S]*Tone only/, 'built from the Character Card V2 in config/persona.json')
  assert.ok(line.length < 1400, 'small enough for every turn')
  assert.doesNotMatch(line, /\{\{|<START>/, 'card tokens are filled in')
  assert.match(persona('/no/such/dir'), /is Luna: 20, cute e-girl/, 'no file: the fallback')
})

test('config/persona.json is valid JSON with at least five example chats', () => {
  const card = JSON.parse(readFileSync(join(root, 'config', 'persona.json'), 'utf8'))
  assert.equal(card.spec, 'chara_card_v2')
  assert.ok(card.data.mes_example.split('<START>').length > 5, 'five or more examples')
  assert.ok(!/\b(cock|cunt|pussy|nackt)\b/i.test(card.data.mes_example), 'public file stays mild')
})

test('rule guard: a PR in a repo with a PROGRESS.md warns when ## Jetzt is missing or untouched, never blocks', async () => {
  const { jetztWarning } = await import('../global/rule-guard.mjs')
  const sh = (cwd, ...a) => spawnSync('git', ['-C', cwd, ...a], { encoding: 'utf8' })
  const repo = mkdtempSync(join(tmpdir(), 'jetzt-'))
  try {
    sh(repo, 'init', '-q', '-b', 'main')
    sh(repo, 'config', 'user.email', 't@t'); sh(repo, 'config', 'user.name', 't')
    sh(repo, 'remote', 'add', 'origin', 'https://github.com/yverse-studio/yland.git')
    const commit = (m) => { sh(repo, 'add', '-A'); sh(repo, 'commit', '-qm', m) }
    const pr = { owner: 'yverse-studio', repo: 'yland', head: 'claude/x', base: 'main' }
    writeFileSync(join(repo, 'a.txt'), '1'); commit('chore: a')
    assert.equal(jetztWarning('mcp__github__create_pull_request', pr, repo), null, 'no PROGRESS.md: nothing to keep')
    writeFileSync(join(repo, 'PROGRESS.md'), '# Progress\n'); commit('docs: progress')
    sh(repo, 'update-ref', 'refs/remotes/origin/main', 'HEAD')
    sh(repo, 'checkout', '-q', '-b', 'claude/x')
    writeFileSync(join(repo, 'a.txt'), '2'); commit('fix: a')
    assert.match(jetztWarning('mcp__github__create_pull_request', pr, repo), /no `## Jetzt` block/)
    assert.equal(jetztWarning('mcp__github__update_pull_request', pr, repo), null, 'only a new PR')
    assert.equal(jetztWarning('mcp__github__create_pull_request', { ...pr, repo: 'other' }, repo), null, 'another repo than cwd')
    assert.equal(jetztWarning('mcp__github__create_pull_request', { ...pr, repo: 'yl' }, repo), null, 'a repo whose name is only a suffix')
    writeFileSync(join(repo, 'PROGRESS.md'), '# Progress\n\n## Jetzt\nZiel: x\nOffen:\n- a\nWartet auf dich:\n- nichts\nStand: 2026-10-27\n'); commit('docs: jetzt')
    assert.equal(jetztWarning('mcp__github__create_pull_request', pr, repo), null, 'PROGRESS.md changed in the PR')
    writeFileSync(join(repo, 'a.txt'), '3'); commit('fix: b')
    sh(repo, 'update-ref', 'refs/remotes/origin/main', 'HEAD~2')
    assert.equal(jetztWarning('mcp__github__create_pull_request', pr, repo), null, 'still in the diff against base')
    sh(repo, 'update-ref', 'refs/remotes/origin/main', 'HEAD~1')
    assert.match(jetztWarning('mcp__github__create_pull_request', pr, repo), /leaves PROGRESS.md untouched/)
  } finally { rmSync(repo, { recursive: true, force: true }) }
})

// yskills 2026-11-03: the Blender workflow tips are enforced so no progress is lost (one Blender slot, bl_server.py).
test('rule guard: no second headless Blender while bl_server.py runs; Blender only after the night plan and Fast loop were read', async () => {
  const { blenderStart, blenderServerBusy, blenderDocsMissing } = await import('../global/rule-guard.mjs')
  const starts = ['blender -b x.blend', '"/c/Program Files/Blender Foundation/Blender 5.1/blender.exe" -b --python a.py', '& "C:\\Program Files\\Blender Foundation\\Blender 5.1\\blender.exe" --background f.blend', 'cd /x && blender.exe -b f.blend', '$BL -b f.blend', '%BL% -b --python j.py', 'Start-Process -FilePath "C:\\B\\blender.exe" -ArgumentList \'-b f.blend\'', 'nohup blender -b f.blend > log 2>&1 &'] // path-lint: fixture
  for (const c of starts) assert.ok(blenderStart(c), c)
  for (const c of ['python scripts/blender/pose_precheck.py', 'ls tools/blender/', 'grep -i blender log.txt', 'echo "blender-5.1"', 'git commit -m "fix: blender pose"']) assert.equal(blenderStart(c), null, c)
  const server = '"C:/Program Files/Blender Foundation/Blender 5.1/blender.exe" -b --factory-startup --python C:/x/qa/bl_server.py -- C:/x/bl_jobs' // path-lint: fixture
  const busy = (command, procs = `node.exe\n${server}`, tool = 'Bash') => blenderServerBusy(tool, { command }, procs)
  assert.match(busy('blender -b f.blend --python render.py') ?? '', /bl_server\.py läuft.*bl_jobs.*submit_strip\.sh.*NIGHT-CHAIN\.md.*Persistent Blender/s)
  assert.match(busy('& "C:\\B\\blender.exe" --background f.blend', undefined, 'PowerShell') ?? '', /bl_server/, 'PowerShell too')
  assert.equal(busy('blender -b f.blend', 'node.exe\nbash -c "grep bl_server.py x"'), null, 'no bl_server running')
  assert.equal(busy(server), null, 'the command that starts bl_server.py itself')
  assert.equal(busy('blender f.blend'), null, 'not headless')
  assert.equal(busy('blender --version'), null)
  assert.equal(blenderServerBusy('Write', { command: 'blender -b' }, server), null)
  let listed = 0
  blenderServerBusy('Bash', { command: 'git status' }, () => { listed++; return server })
  assert.equal(listed, 0, 'processes are listed only for a headless Blender start')

  const read = (file_path) => JSON.stringify({ type: 'assistant', message: { content: [{ type: 'tool_use', id: file_path, name: 'Read', input: { file_path } }] } })
  process.env.STUDIO_ROOT ??= join(tmpdir(), 'studio-root-test') // the resolver has no default root
  const plan = read(studioPath('companyxy', 'ch01', 'NACHT-FIX-PLAN.md'))
  const cloudPlan = read('/mnt/project-files/NACHT-FIX-PLAN.md')
  const animator = read(studioPath('repos', 'claude-setup', '.claude', 'skills', 'operator', 'roles', 'animator.md'))
  assert.match(blenderDocsMissing('Bash', { command: 'blender -b f.blend' }, '') ?? '', /NACHT-FIX-PLAN\.md.* und .*animator\.md/)
  assert.match(blenderDocsMissing('mcp__Blender__execute_blender_code', { code: 'x' }, plan) ?? '', /animator\.md/)
  assert.doesNotMatch(blenderDocsMissing('mcp__Blender__execute_blender_code', { code: 'x' }, plan) ?? '', /NACHT/)
  assert.match(blenderDocsMissing('PowerShell', { command: '& $env:BL -b f.blend' }, () => animator) ?? '', /NACHT-FIX-PLAN/)
  assert.equal(blenderDocsMissing('Bash', { command: 'blender -b f.blend' }, `${plan}\n${animator}`), null)
  assert.equal(blenderDocsMissing('Bash', { command: 'blender -b f.blend' }, `${cloudPlan}\n${animator}`), null, 'cloud copy in the project files counts')
  assert.match(blenderDocsMissing('Bash', { command: 'blender -b f.blend' }, '') ?? '', /projects\/games\/companyxy\/ch01\/NACHT-FIX-PLAN\.md.*\/mnt\/project-files/)
  assert.equal(blenderDocsMissing('Bash', { command: 'git status' }, ''), null, 'not a Blender call')
  const bash = JSON.stringify({ type: 'assistant', message: { content: [{ type: 'tool_use', id: 'b', name: 'Bash', input: { command: 'cat NACHT-FIX-PLAN.md roles/animator.md' } }] } })
  assert.match(blenderDocsMissing('Bash', { command: 'blender -b f.blend' }, bash) ?? '', /NACHT/, 'only a Read counts')

  const dir = mkdtempSync(join(tmpdir(), 'blender-guard-'))
  try {
    const t = join(dir, 's1.jsonl')
    mkdirSync(join(dir, 's1', 'subagents'), { recursive: true })
    const run = (command, transcript, procs = '', agent_id) => {
      writeFileSync(t, transcript)
      return spawnSync(process.execPath, [join(root, 'global/rule-guard.mjs'), 'pre'], { input: JSON.stringify({ session_id: 's1', transcript_path: t, agent_id, tool_name: 'Bash', tool_input: { command } }), env: { ...process.env, CLAUDE_SETUP_PROCS: procs, CLAUDE_SETUP_RULE_GUARD: '' }, encoding: 'utf8' })
    }
    const unread = run('blender -b f.blend', '')
    assert.equal(unread.status, 2)
    assert.match(unread.stderr, /NACHT-FIX-PLAN/)
    assert.equal(run('blender -b f.blend', `${plan}\n${animator}`).status, 0)
    assert.equal(run('blender -b f.blend', `${plan}\n${animator}`, server).status, 2, 'bl_server.py runs')
    assert.equal(run('git status', '', server).status, 0)
    writeFileSync(join(dir, 's1', 'subagents', 'agent-a1.jsonl'), `${plan}\n${animator}`)
    assert.equal(run('blender -b f.blend', '', '', 'a1').status, 0, "a subagent's own reads count")
  } finally { rmSync(dir, { recursive: true, force: true }) }
})

// yskills 2026-11-03: the Animator handed off every ~30 min at 350k on a 1M model; the guard warns at 250k (work leaner), backstop at 700k (check the handoff triggers).
test('context guard: silent below 250k, warns at 250k, backstop at 700k', () => {
  const dir = mkdtempSync(join(tmpdir(), 'ctx-guard-'))
  try {
    const run = (tokens, id) => {
      const path = join(dir, `${id}.jsonl`)
      writeFileSync(path, `${JSON.stringify({ message: { usage: { input_tokens: 1, cache_read_input_tokens: tokens - 1 } } })}\n`)
      const r = spawnSync(process.execPath, [join(root, 'global/context-guard.mjs')], { input: JSON.stringify({ session_id: `t${id}${process.pid}`, transcript_path: path }), encoding: 'utf8', timeout: 5000 })
      rmSync(join(tmpdir(), `claude-context-guard-t${id}${process.pid}.json`), { force: true })
      return r.stdout
    }
    assert.equal(run(200_000, 'a'), '', 'below the warn point stays silent')
    assert.match(run(400_000, 'b'), /Batch independent calls/)
    assert.doesNotMatch(run(620_000, 'd'), /handoff triggers/, 'the old hand-off point is below the backstop (yskills 2026-11-03)')
    assert.match(run(720_000, 'c'), /handoff triggers/)
  } finally { rmSync(dir, { recursive: true, force: true }) }
})

// yskills 2026-11-03: no purchase without his explicit OK.
test('rule guard: checkout and cart pages are blocked, docs and his own test app pass', async () => {
  const { purchaseUrl, decide } = await import('../global/rule-guard.mjs')
  for (const url of ['https://shop.example.com/checkout?x=cs_test_1', 'https://8.8.8.8/checkout', 'https://www.amazon.de/gp/cart/view.html', 'https://shop.example.com/checkout', 'https://checkout.stripe.com/c/pay/cs_live_a1', 'https://buy.stripe.com/abc', 'https://store.steampowered.com/buy/123', 'https://www.paypal.com/checkoutnow?token=x'])
    assert.equal(purchaseUrl('mcp__claude-in-chrome__navigate', { url }), url, url)
  for (const url of ['https://nuxt.com/docs/getting-started/upgrade', 'https://create.roblox.com/docs/production/monetization/in-app-purchases', 'http://localhost:8787/checkout', 'http://127.0.0.1:3000/checkout', 'https://shop.test/checkout', 'https://checkout.stripe.com/c/pay/cs_test_a1', 'https://docs.stripe.com/payments/checkout'])
    assert.equal(purchaseUrl('mcp__Claude_Browser__navigate', { url }), null, url)
  assert.ok(purchaseUrl('mcp__Claude_Browser__browser_batch', { actions: [{ name: 'navigate', input: { url: 'https://x.com/cart' } }] }))
  assert.ok(purchaseUrl('Bash', { command: 'curl -X POST https://api.shop.com/v1/purchase' }))
  assert.equal(purchaseUrl('Read', { file_path: 'https://x.com/cart' }), null, 'only browser and shell steps')
  // bypass attempts (security review 2026-11-08)
  for (const url of ['HTTPS://x.com/cart', 'x.com/checkout', 'https://docs.evil.com/checkout', 'https://evil.com/checkout/cs_test_1', 'https://8.8.8.8/checkout', 'https://fd-shop.com/checkout', 'https://fe80shop.com/cart', 'https://shop.com./checkout', 'shop.com:8443/checkout', 'https://buy.stripe.com/x/cs_test_1/checkout', 'https://nuxt.com/checkout'])
    assert.ok(purchaseUrl('mcp__Claude_Browser__navigate', { url }), url)
  assert.ok(purchaseUrl('Bash', { command: 'curl -X POST shop.com/purchase' }))
  assert.equal(purchaseUrl('Bash', { command: 'curl http://127.0.0.1:8787/checkout' }), null)
  assert.match(decide('mcp__claude-in-chrome__navigate', { url: 'https://x.com/checkout' }) ?? '', /explicit OK/)
})

// yskills 2026-11-04: the coordinator runs without hooks, so the thread side checks its model pick and gate brief.
test('rule guard: a thread on the wrong model or a gate brief without gate rules does no work', async () => {
  const { briefCheck, sessionModel } = await import('../global/rule-guard.mjs')
  const wake = (brief) => `<wake reason="spawn"><relay>${brief}</relay></wake>`
  const tester = (prior) => `Role: Tester · Kit: app · Size: L${FULL.replace(/\nPrior art:.*$/, '')}\nPrior art: ${prior}`
  const withGate = tester('.claude/skills/operator/gate.md and the app kit checks -> adapt, because they are the gate')
  assert.match(await briefCheck(wake(withGate), root, 'claude-sonnet-x'), /Brief check[\s\S]*runs on sonnet, but the Tester runs on opus/)
  assert.doesNotMatch(await briefCheck(wake(withGate), root, 'claude-opus-x[1m]'), /Brief check|runs on/)
  assert.match(await briefCheck(wake(tester('none, because a test brief')), root, 'claude-opus-x'), /^Brief repair \(no block\)[\s\S]*gate\.md/, 'a gate role without gate.md in Prior art is told to read it, never locked')
  assert.doesNotMatch(await briefCheck(wake(withGate), root, null), /runs on/, 'an unknown model is not guessed')
  const line = (type, model) => JSON.stringify({ type, message: { model, content: [{ type: 'tool_use', input: { model: 'haiku' } }] } })
  assert.equal(sessionModel([line('assistant', 'claude-sonnet-x'), line('assistant', 'claude-opus-x')].join('\n'), {}), 'claude-opus-x')
  assert.equal(sessionModel(line('user', 'claude-haiku-x'), {}), null, 'only assistant entries')
})

test('rule guard: writes outside a folder\'s .layout.json are blocked', async () => {
  const { offLayout, decide } = await import('../global/rule-guard.mjs')
  const lib = mkdtempSync(join(tmpdir(), 'layout-'))
  try {
    mkdirSync(join(lib, 'references', '07_Boards'), { recursive: true })
    writeFileSync(join(lib, '.layout.json'), JSON.stringify({ why: 'one kind per folder', allow: ['README.md', 'references/**'] }))
    writeFileSync(join(lib, 'references', '.layout.json'), JSON.stringify({ why: 'boards per position', allow: ['*.md', '07_Boards/*/einzel/**', '07_Boards/*/NOTES.md'] }))
    assert.equal(offLayout(join(lib, 'README.md')), null)
    assert.equal(offLayout(join(lib, 'references', '07_Boards', 'doggy', 'einzel', 'a.png')), null)
    assert.equal(offLayout(join(lib, 'references', '07_Boards', 'doggy', 'NOTES.md')), null)
    assert.equal(offLayout(join(lib, 'fenster_v1.png'))?.rel, 'fenster_v1.png', 'no loose root files')
    assert.equal(offLayout(join(lib, 'references', '08_Kamera_Refs', 'x.png'))?.rel, '08_Kamera_Refs/x.png', 'the nearest layout applies')
    assert.equal(offLayout(join(lib, 'references', '.layout.json')), null, 'the layout itself')
    assert.equal(offLayout(join(tmpdir(), 'no-layout-here', 'x.md')), null, 'no layout, no rule')
    assert.match(decide('Write', { file_path: join(lib, 'loose.md'), content: 'x' }) ?? '', /outside the agreed folder structure/)
    writeFileSync(join(lib, '.layout.json'), '{ broken')
    assert.equal(offLayout(join(lib, 'loose.md')), null, 'a broken layout never blocks')
  } finally { rmSync(lib, { recursive: true, force: true }) }
})

test('rule guard: modelCheck compares the model the brief or yskills wants with the one running', async () => {
  const { modelCheck } = await import('../global/rule-guard.mjs')
  const run = (model) => JSON.stringify({ type: 'assistant', message: { model, content: [] } })
  const brief = (m, cited = '') => `<wake reason="spawn"><relay>${cited ? `<cited author="user">${cited}</cited>` : ''}Role: Programmer · Kit: setup · Size: S\nModel: ${m}\n</relay></wake>`
  assert.match(modelCheck(brief(['claude', 'fable', '5-1'].join('-')), run(['claude', 'sonnet', '5-5'].join('-'))), /^Model check \(docs\/TEAMS.md, Spawn rule 4\):[\s\S]*fable[\s\S]*sonnet[\s\S]*message_coordinator/)
  assert.match(modelCheck(brief('default', 'bitte ein Fable-Thread'), run(['claude', 'sonnet', '5-5'].join('-'))), /^Model check/)
  assert.equal(modelCheck(brief('sonnet'), run(['claude', 'sonnet', '5-5'].join('-'))), '')
  assert.equal(modelCheck(brief('default'), run(['claude', 'sonnet', '5-5'].join('-'))), '', 'no model wanted')
  assert.equal(modelCheck(brief('fable'), ''), '', 'no running model known yet')
})

// Skill ideas become PRs through new-skill, never a saved propose_skills card (an account skill: no PR, no gate, loads in every thread).
test('rule guard: propose_skills is refused and names new-skill; hook matchers see the tool', async () => {
  const { proposeSkillsBlocked } = await import('../global/rule-guard.mjs')
  for (const t of ['propose_skills', 'mcp__hearthbot__propose_skills', 'mcp__x__propose_skills']) assert.match(proposeSkillsBlocked(t) ?? '', /new-skill/, t)
  for (const t of ['Bash', 'mcp__hearthbot__post_message', 'Skill', 'propose_skills_later']) assert.equal(proposeSkillsBlocked(t), null, t)
  for (const f of ['cloud/setup.sh', 'install.mjs']) assert.match(readFileSync(join(root, f), 'utf8'), /\|propose_skills\|mcp__\.\*propose_skills/, `${f} matcher`)
  const run = spawnSync('node', [join(root, 'global/rule-guard.mjs'), 'pre'], { input: JSON.stringify({ tool_name: 'propose_skills', tool_input: {} }), encoding: 'utf8', env: { ...process.env, CLAUDE_SETUP_RULE_GUARD: '' } })
  assert.equal(run.status, 2, 'the hook exits 2 for propose_skills')
  assert.match(run.stderr, /new-skill/)
})

test('rule-guard: nothing opens on his screen unless he asked', async () => {
  const { opensWindow } = await import('../global/rule-guard.mjs')
  const w = (command) => opensWindow('Bash', { command })
  const bl = '"C:/Program Files/Blender Foundation/Blender 5.2/blender.exe"' // path-lint: fixture
  for (const c of ['explorer C:\\Users\\Claude\\Documents', 'ls ; explorer', 'Start-Process notepad.exe x.txt', 'cd x; start msedge https://a.b', 'xdg-open out.png', // path-lint: fixture
    `${bl} scene.blend`, `${bl} x.blend -- -b`, '& "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe" https://a.b', 'Invoke-Item sheet.png', // path-lint: fixture
    'cmd /c start "" a.png', 'powershell -Command "Invoke-Item a.png"', 'node scripts/laptop-job.mjs --name r -- blender x.blend -P a.py',
    'google-chrome https://a.b', 'chrome --headless-not https://a.b', '$p = Start-Process blender -ArgumentList x.blend -PassThru', 'Get-ChildItem *.png | ForEach-Object { Start-Process $_ }',
    'if (Test-Path a.png) { explorer a.png }', 'nohup blender x.blend &', 'timeout 60 blender x.blend', 'xargs -I{} explorer {}', 'bash -c "explorer ."', 'cmd /k start a.png', 'npx -y playwright test --headed',
    'npx playwright show-report', "# it's fine\nexplorer .", 'npx playwright test --headed', 'python -m webbrowser https://a.b', 'notepad a.txt']) assert.match(w(c) ?? '', /No windows/, c)
  for (const c of ['blender -b x.blend -P a.py', `${bl} --background --python a.py`, 'blender --command extension list', 'Start-Process -WindowStyle Hidden node a.mjs',
    'node scripts/laptop-job.mjs --name r -- blender -b x.blend -P a.py', 'chrome --headless --screenshot=a.png https://a.b', 'npx playwright test', 'grep -rn blender docs', 'npm start',
    'git log --oneline 2>&1 | tail -3', 'explorer C:\\x # yskills asked', 'pip install bpy', 'rg -n "start|explorer" docs', 'git commit -m "docs; explorer opens no window"',
    'grep -rn "Start-Process" docs scripts', 'git commit -m "fix: Start-Process now hidden"', 'git commit -m "guard: block \\"cmd /c start; explorer .\\" lines"', 'time grep -rn start docs', 'timeout 60 node a.mjs', 'echo Built $(date) start of run', 'echo $((1+2)) start', 'echo ${HOME} start',
    'node a.mjs --from $(git merge-base HEAD origin/main) start', "$body = @'\nDon't open anything\nStart the server\n'@\ngh pr create --body $body", 'cat <<"END-OF-BODY" > a.md\nStart the server\nExplorer shows it\nEND-OF-BODY', 'git commit -m "$(cat <<\'EOF\'\nfix: x\n\nBlender 5.2 is pinned\nStart the server\nExplorer shows it\nEOF\n)"',
    'cat > notes.md <<EOF\nChrome stays headless now\nEOF']) assert.equal(w(c), null, c)
  assert.equal(opensWindow('Write', { file_path: 'explorer.md' }), null)
})

test('rule-guard: an Archivist thread documents, it does not file references', async () => {
  const { archivistFiles } = await import('../global/rule-guard.mjs')
  const a = (tool, input) => archivistFiles(tool, input, 'Archivist\n')
  for (const command of ['mv /mnt/project-files/uploads/a.jpg /mnt/project-files/refs/aussehen/', 'Copy-Item a.png C:\\Users\\Claude\\Documents\\reference\\06\\', 'cp a.png refs/x/', // path-lint: fixture
    'cp a.png Referenzen/', 'tar xf a.tar -C refs/', 'curl -o refs/a.png https://a.b/a.png', 'cp a.png ./refs', 'cp a.png reference-images/', 'ln -s /x/a.png refs/a.png', 'cp a.png refs/heads/x.png', 'mv a.png refs/tags/', 'cd /x && cp a.png refs/', 'cp -t refs/ a.png', 'robocopy . refs\\ a.png', 'curl -sLo refs/a.png https://x/y.png', 'curl https://x/y.png > refs/a.png', 'git mv a.png refs/a.png']) assert.match(a('Bash', { command }) ?? '', /laptop lane/, command)
  assert.match(a('Write', { file_path: '/mnt/project-files/refs/posen/x.png' }) ?? '', /laptop lane/)
  assert.equal(a('Write', { file_path: '/mnt/project-files/refs/README.md' }), null)
  assert.equal(a('Edit', { file_path: '/mnt/project-files/PROVEN.md' }), null)
  assert.equal(a('Bash', { command: 'rm /mnt/project-files/_tmp/old.blend' }), null)
  for (const command of ['git mv docs/refs/a.md docs/refs/b.md', 'curl -sL https://raw.githubusercontent.com/o/r/refs/heads/main/scripts/a.mjs', 'curl -s https://api.github.com/repos/o/r/git/refs/heads/main',
    'git push origin refs/heads/x && cp a.py scripts/', 'tar czf /backup/refs-2026-11.tgz refs/', 'cp README.md refs', 'cp refs/a.png /backup/', 'grep -rn "cp " docs/refs/', 'grep -rln move refs/', 'rg -n "copy" refs', 'git commit -m "docs: copy the pose list to refs/"',
    'gh pr create --title "docs: move refs index" --body "cp a refs/"', 'rsync -a refs/ /mnt/backup/refs/', 'cp -r refs /mnt/backup/refs', 'ls refs/ > refs/INDEX.md']) assert.equal(a('Bash', { command }), null, command)
  assert.equal(archivistFiles('Write', { file_path: '/mnt/project-files/refs/posen/x.png' }, 'Animator'), null)
  assert.equal(archivistFiles('Write', { file_path: '/mnt/project-files/refs/posen/x.png' }, null), null)
})

// yskills 2026-11-12: every thread opens with a start receipt the hook builds from the transcript (role, kit, size, Skill calls, rules hash).
test('rule-guard: a thread\'s first reply carries the hook-built start receipt', async () => {
  const { threadReceipt, receiptMissing } = await import('../global/rule-guard.mjs')
  const post = 'mcp__hearthbot__post_message'
  const use = (id, name, input) => JSON.stringify({ type: 'assistant', message: { content: [{ type: 'tool_use', id, name, input }] } })
  const res = (id, content) => JSON.stringify({ type: 'user', message: { content: [{ type: 'tool_result', tool_use_id: id, content }] } })
  const brief = JSON.stringify({ type: 'user', message: { content: '<wake reason="spawn">Role: Programmer · Kit: setup · Size: S</wake>' } })
  const rules = readFileSync(join(root, 'CLAUDE.md'), 'utf8')
  const t0 = brief
  const line0 = threadReceipt('Programmer', 'Role: Programmer · Kit: setup · Size: S', t0, rules)
  assert.match(line0, /^Thread · Programmer · setup · S · item \? · skills: none · rules #[0-9a-f]{7} · missing: none$/, 'no Item line: item ?')
  assert.ok(threadReceipt('Programmer', 'Role: Programmer · Kit: setup · Size: S', t0, rules, undefined, 'abc12345').endsWith(' · card #abc12345'), 'the receipt names the card this start left in the project folder')
  assert.doesNotMatch(line0, /card #/, 'no card folder: no card part')
  assert.match(receiptMissing('mcp__hearthbot__post_message', { text: 'Luna · hi' }, 'Thread · P · card #abc12345', t0) ?? '', /TEAMS\.md\): Thread · P · card #abc12345/, 'a reply without the card part is refused')
  assert.match(threadReceipt('Planner', 'Role: Planner · Kit: setup · Size: M\nItem: M12', t0, rules), /^Thread · Planner · setup · M · item M12 · skills:/, 'the real brief shape and its Masterplan item')
  assert.match(threadReceipt('Planner', 'Role: Planner · Kit: setup · Size: M\nItem: new', t0, rules), /item new ·/, 'a new item')
  assert.match(threadReceipt('Programmer', 'Role: · Kit: · Size:', t0, rules), /· \? · \? · item \?/, 'template text reads as ?')
  const t1 = [t0, use('s1', 'Skill', { skill: 'ponytail' }), res('s1', 'ok')].join('\n')
  const line1 = threadReceipt('Programmer', 'Role: Programmer · Kit: setup · Size: S', t1, rules)
  assert.match(line1, /skills: ponytail /, 'a Skill call shows up in the receipt')
  assert.match(receiptMissing(post, { text: 'Hi (◕‿◕)' }, line1, t1) ?? '', /start receipt[\s\S]*Thread · Programmer/, 'no receipt: blocked with the exact line')
  assert.equal(receiptMissing(post, { text: `${line1}\nHi` }, line1, t1), null)
  assert.match(receiptMissing(post, { text: `${line0}\nHi` }, line1, t1) ?? '', /start receipt/, 'a receipt that hides a loaded skill is refused')
  assert.equal(receiptMissing('Bash', { command: 'ls' }, line1, t1), null, 'only replies')
  assert.equal(receiptMissing(post, { text: 'x' }, '', t1), null, 'no line, no check')
  const sent = [t1, use('p1', post, { text: `${line1}\nHi` }), res('p1', '{"message_id":"cmsg_1"}')].join('\n')
  assert.equal(receiptMissing(post, { text: 'Zweite' }, line1, sent), null, 'only the first reply carries it')
  const blocked = [t1, use('p1', post, { text: `${line1}\nHi` }), res('p1', 'PreToolUse hook error: rule-guard: too long')].join('\n')
  assert.match(receiptMissing(post, { text: 'Zweite' }, line1, blocked) ?? '', /start receipt/, 'a blocked try never went out')
})

// yskills 2026-11-12: design skills were not loadable in project threads and the threads only said so when asked. The plugin
// cache kept an old copy (only `publish`), so the receipt now lists what cannot load and the thread reads the file instead.
test('rule-guard: a skill that cannot load shows in the receipt and its file is read first', async () => {
  const { skillStatus, missingNote, threadReceipt, fallbackUnread, roleOf } = await import('../global/rule-guard.mjs')
  const home = mkdtempSync(join(tmpdir(), 'skills-home-'))
  try {
    const cache = join(home, '.claude', 'plugins', 'cache', 'setup-skills')
    mkdirSync(join(cache, 'skills', 'publish'), { recursive: true })
    writeFileSync(join(cache, 'skills', 'publish', 'SKILL.md'), '# publish')
    writeFileSync(join(home, '.claude', 'plugins', 'installed_plugins.json'), JSON.stringify({ plugins: { 'setup-skills@x': [{ installPath: cache }] } }))
    const names = ['impeccable', 'publish', 'design-critic']
    const status = skillStatus(names, { root, home, cwd: home })
    assert.deepEqual(status.loaded, ['publish'])
    assert.equal(missingNote(status), 'missing: impeccable, design-critic (read .claude/skills/impeccable/SKILL.md, .claude/agents/design-critic.md instead)')
    assert.equal(missingNote({ missing: [] }), 'missing: none')
    assert.match(missingNote({ missing: [{ name: 'nope', path: null }] }), /no file for nope/, 'a name with no file anywhere is still said')
    const full = join(home, 'full')
    cpSync(join(root, 'mods', 'setup-skills'), join(full, 'setup-skills'), { recursive: true, dereference: true })
    writeFileSync(join(home, '.claude', 'plugins', 'installed_plugins.json'), JSON.stringify({ plugins: { 'setup-skills@x': [{ installPath: join(full, 'setup-skills') }] } }))
    assert.deepEqual(skillStatus(['impeccable', 'ui-review'], { root, home, cwd: home }).missing, [], 'a fresh plugin copy carries the design skills')
    assert.ok(existsSync(join(full, 'setup-skills', 'skills', 'ui-review', 'scripts', 'design-check.mjs')), 'design-check.mjs resolves from the skill folder')
    const brief = 'Role: Designer · Kit: game · Size: M'
    const line = threadReceipt('Designer', brief, '', readFileSync(join(root, 'CLAUDE.md'), 'utf8'), status)
    assert.match(line, / · missing: impeccable, design-critic \(read /, 'the receipt carries it')
    const reads = (arg) => JSON.stringify({ type: 'assistant', message: { content: [{ type: 'tool_use', id: 'r1', name: 'Read', input: arg }] } })
    assert.match(fallbackUnread(status, '') ?? '', /impeccable\/SKILL\.md.*design-critic\.md/, 'unread fallback files are named')
    assert.equal(fallbackUnread(status, [reads({ file_path: '/x/.claude/skills/impeccable/SKILL.md' }), reads({ file_path: '/x/.claude/agents/design-critic.md' })].join('\n')), null)
    assert.equal(fallbackUnread({ loaded: [], missing: [] }, ''), null, 'nothing missing, nothing to read')
    assert.equal(roleOf('Role: Designer · Kit: game', readFileSync(join(root, 'docs/TEAMS.md'), 'utf8'))?.name, 'Designer')
  } finally { rmSync(home, { recursive: true, force: true }) }
})

test('rule-guard: the hook blocks a first reply until the fallback files are read, and says so when there is no checkout', () => {
  const dir = mkdtempSync(join(tmpdir(), 'receipt-skills-'))
  const id = `sk${process.pid}`
  const rolefile = join(tmpdir(), `claude-setup-role-${id}`)
  try {
    writeFileSync(rolefile, 'Designer')
    symlinkSync(root, join(dir, 'claude-setup')) // the thread runs outside the checkout, as a project thread does
    const spawned = JSON.stringify({ type: 'user', message: { content: '<wake reason="spawn">Role: Designer · Kit: game · Size: M</wake>' } })
    const run = (transcript, text = 'Hi (◕‿◕)') => { writeFileSync(join(dir, 't.jsonl'), transcript); return spawnSync(process.execPath, [join(root, 'global/rule-guard.mjs'), 'pre'], { input: JSON.stringify({ cwd: dir, session_id: id, transcript_path: join(dir, 't.jsonl'), tool_name: 'mcp__hearthbot__post_message', tool_input: { text } }), encoding: 'utf8', env: { ...process.env, CLAUDE_SETUP_HOME: dir } }) }
    const blocked = run(spawned)
    const receipt = blocked.stderr.match(/TEAMS\.md\): (Thread · .*)/)?.[1] ?? ''
    assert.match(receipt, /missing: /)
    const unread = run(spawned, `${receipt}\nHi (◕‿◕)`)
    assert.equal(unread.status, 2, 'the right receipt is not enough: the fallback files are read first')
    assert.match(unread.stderr, /read what stands in for it[\s\S]*impeccable\/SKILL\.md/)
    const read = (f) => JSON.stringify({ type: 'assistant', message: { content: [{ type: 'tool_use', id: `r${f.length}`, name: 'Read', input: { file_path: `/home/user/claude-setup/${f}` } }] } })
    const done = [spawned, ...['.claude/skills/impeccable/SKILL.md', '.claude/skills/ui-review/SKILL.md', '.claude/agents/design-critic.md'].map(read)].join('\n')
    assert.equal(run(done, `${receipt}\nHi (◕‿◕)`).status, 0, 'files read, receipt copied: the reply goes out')
    assert.equal(blocked.status, 2)
    assert.match(blocked.stderr, /missing: frontend-design, impeccable, ui-review, design-critic \(read \.claude\/skills\/impeccable\/SKILL\.md, \.claude\/skills\/ui-review\/SKILL\.md, \.claude\/agents\/design-critic\.md instead; no file for frontend-design\)/, 'an empty home says what is missing, with the file to read')
    // No checkout at or above the cwd (a project thread that did not add_repo): never a false `none`.
    rmSync(join(dir, 'claude-setup'), { force: true })
    const bare = mkdtempSync(join(tmpdir(), 'no-setup-'))
    try {
      const out = spawnSync(process.execPath, [join(root, 'global/rule-guard.mjs'), 'pre'], { input: JSON.stringify({ cwd: bare, session_id: id, transcript_path: join(dir, 't.jsonl'), tool_name: 'mcp__hearthbot__post_message', tool_input: { text: 'Hi (◕‿◕)' } }), encoding: 'utf8', env: { ...process.env, CLAUDE_SETUP_HOME: bare } })
      assert.equal(out.status, 2); assert.match(out.stderr, /missing: unknown \(no claude-setup checkout/)
    } finally { rmSync(bare, { recursive: true, force: true }) }
  } finally { rmSync(rolefile, { force: true }); rmSync(dir, { recursive: true, force: true }) }
})

test('rule-guard: the receipt check runs only in a spawned thread', () => {
  const dir = mkdtempSync(join(tmpdir(), 'receipt-'))
  const id = `rc${process.pid}`
  const rolefile = join(tmpdir(), `claude-setup-role-${id}`)
  try {
    writeFileSync(rolefile, 'Programmer')
    const run = (transcript) => { writeFileSync(join(dir, 't.jsonl'), transcript); return spawnSync(process.execPath, [join(root, 'global/rule-guard.mjs'), 'pre'], { input: JSON.stringify({ cwd: root, session_id: id, transcript_path: join(dir, 't.jsonl'), tool_name: 'mcp__hearthbot__post_message', tool_input: { text: 'Hi (◕‿◕)' } }), encoding: 'utf8', env: { ...process.env, CLAUDE_SETUP_HOME: dir } }) }
    const spawned = JSON.stringify({ type: 'user', message: { content: '<wake reason="spawn">Role: Programmer · Kit: setup · Size: S</wake>' } })
    assert.equal(run(spawned).status, 2, 'a spawned thread without the receipt is blocked')
    assert.match(run(spawned).stderr, /start receipt/)
    assert.equal(run(JSON.stringify({ type: 'user', message: { content: 'Role: Programmer · Kit: setup · Size: S' } })).status, 0, 'a pasted brief in a project chat is no thread')
  } finally { rmSync(rolefile, { force: true }); rmSync(dir, { recursive: true, force: true }) }
})

// Companyxy report 2026-11-12, point 1: almost every thread start failed the brief check one line at a time, so each
// start cost an extra round. One refusal now lists every problem and points at a fixed, tested template.
test('team guard: a bad brief is refused once with every problem and a template that itself passes', async () => {
  const { decide, missingLines, stamped, needsPriorArt, needsTester } = await import('../global/team-guard.mjs')
  const teams = readFileSync(join(root, 'docs/TEAMS.md'), 'utf8')
  const bad = decide('mcp__hearthbot__start_thread', { title: 'Fix it', instructions: 'Role: Programmer · Kit: app · Size: L\nBuild the thing.', model: 'claude-x-1' }, [], [], teams).block ?? ''
  for (const part of [/Threads:/, /Model:/, /Skills:/, /Done when:/, /Stop when:/, /Start:/, /Prior art:/, /Tester:/, /docs\/templates\/thread-brief\.md/]) assert.match(bad, part, `one refusal names ${part}`)
  const tpl = readFileSync(join(root, 'docs/templates/thread-brief.md'), 'utf8')
  const block = tpl.match(/```\n([\s\S]*?)```/)?.[1] ?? ''
  assert.ok(block, 'the template has one fenced brief block')
  const filled = block.replace(/<[^>\n]+>/g, (m) => (m === '<S|M|L>' ? 'M' : /^<kit/.test(m) ? 'setup' : /^<Role/.test(m) ? 'Programmer' : /^<Reviewer thread/.test(m) ? 'Reviewer · x' : /^<sources/.test(m) ? 'obra/superpowers' : /^<PLAN\.json item/.test(m) ? 'M30' : 'something concrete for this task'))
  assert.deepEqual(missingLines(filled), [], 'a filled template has every must-have line')
  assert.ok(stamped(filled) && !needsPriorArt(filled) && !needsTester(filled))
  const unfilled = missingLines(block)
  assert.ok(unfilled.length >= 4, 'the unfilled template does not pass by itself')
  assert.equal(decide('mcp__hearthbot__start_thread', { title: 'Programmer · Fix it', instructions: filled, model: 'claude-x-1' }, [], [], teams).block, undefined, 'a filled template starts the thread')
})

// Gate counter follow-up (PR #444): the one brief template carries the Round / Asset / Picture card lines the gate hook reads, so a coordinator copies them instead of finding them out from a refusal.
test('the brief template carries the Round, Asset and Picture card lines the gate hook reads', async () => {
  const { gateBrief, namesLook } = await import('../global/gate-rounds.mjs')
  const block = readFileSync(join(root, 'docs/templates/thread-brief.md'), 'utf8').match(/```\n([\s\S]*?)```/)?.[1] ?? ''
  for (const key of ['Round', 'Asset', 'Picture card']) assert.match(block, new RegExp(`^${key}: <`, 'm'), `${key} is its own line`)
  assert.ok(!namesLook(block), 'the template text itself never trips the picture note')
  const dir = mkdtempSync(join(tmpdir(), 'brief-gate-'))
  // Filled as laid out: the value and its hint swapped for the answer, the key at the start of its own line.
  const fill = (b, v) => b.replace(/^(Round|Asset|Picture card): .*$/gm, (_, k) => `${k}: ${v[k]}`)
  assert.equal(gateBrief(fill(block, { Round: '1', Asset: 'o/r#1', 'Picture card': 'none, because this builds no screen or look' }), { dir }), '', 'a template filled as laid out passes the gate check')
  assert.match(gateBrief(block, { dir }), /Round/, 'an unfilled Round line is caught, not skipped')
})

// Companyxy report 2026-11-12, point 2: a Researcher opened the Claude app's built-in browser instead of yskills' own
// Chrome on the laptop. The app browser is blocked unless the environment says yskills asked for it.
test('rule guard: the Claude app browser is blocked, Owner-Chrome and others are not', async () => {
  const { decide } = await import('../global/rule-guard.mjs')
  const app = (name, env = {}) => decide(`mcp__remote-devices__Claude_Browser__${name}`, { url: 'https://example.com' }, env)
  for (const name of ['navigate', 'tabs_create', 'browser_batch', 'preview_start']) assert.match(app(name) ?? '', /Owner-Chrome[\s\S]*claude-in-chrome/, name)
  assert.equal(app('navigate', { CLAUDE_SETUP_BROWSER: 'app' }), null, 'yskills asked for the app browser in his own words')
  assert.equal(decide('mcp__claude-in-chrome__navigate', { url: 'https://example.com' }, {}), null, 'Owner-Chrome passes')
  assert.equal(decide('mcp__plugin_playwright_playwright__browser_navigate', { url: 'https://example.com' }, {}), null, 'headless Playwright passes')
})

// Companyxy report 2026-11-12, point 8: garments were downloaded twice because nothing checked the wardrobe first.
test('rule guard: a garment download needs clothes_dupe.py on the same source earlier in the session', async () => {
  const { dupeCheckMissing } = await import('../global/rule-guard.mjs')
  const url = 'https://sketchfab.com/3d-models/school-uniform-0123456789abcdef0123456789abcdef'
  const seen = (command) => JSON.stringify({ message: { content: [{ type: 'tool_use', id: 't1', name: 'Bash', input: { command } }] } })
  const dl = { command: `curl -L -o inbox/uniform.zip "${url}/download"` }
  assert.match(dupeCheckMissing('Bash', dl, '') ?? '', /clothes_dupe\.py/)
  assert.equal(dupeCheckMissing('Bash', dl, seen(`python tools/laptop/clothes_dupe.py ${url}`)), null, 'checked first')
  assert.equal(dupeCheckMissing('Bash', { command: `python tools/laptop/clothes_dupe.py ${url} && curl -L -o x.zip ${url}` }, ''), null, 'same command, dupe check first')
  assert.match(dupeCheckMissing('Bash', dl, seen('python tools/laptop/clothes_dupe.py https://sketchfab.com/3d-models/other-ffffffffffffffffffffffffffffffff')) ?? '', /clothes_dupe/, 'another source does not count')
  assert.equal(dupeCheckMissing('Bash', { command: 'curl -L https://example.com/readme.txt -o r.txt' }, ''), null, 'not a garment source')
  assert.equal(dupeCheckMissing('Bash', { command: `git log ${url}` }, ''), null, 'not a download')
  assert.equal(dupeCheckMissing('Write', {}, ''), null)
})

// Gate review of PR 445: the first versions of these guards had false positives and a matcher gap.
test('gate fixes: no sheet demand for HUD or camera work, every app browser tool reaches the hook, dupe ids and hosts', async () => {
  const { missingLines } = await import('../global/team-guard.mjs')
  const { dupeCheckMissing } = await import('../global/rule-guard.mjs')
  assert.equal(missingLines(`Role: Programmer · Kit: game · Size: M${FULL}\nFit the new character outfit`).length, 2)
  for (const f of ['install.mjs', 'cloud/setup.sh']) assert.match(readFileSync(join(root, f), 'utf8'), /mcp__\.\*Claude_Browser__\.\*\|/, `${f} routes every Claude_Browser tool to rule-guard`)
  const seen = (command) => JSON.stringify({ message: { content: [{ type: 'tool_use', id: 't1', name: 'Bash', input: { command } }] } })
  const uid = '0123456789abcdef0123456789abcdef'
  assert.equal(dupeCheckMissing('Bash', { command: `curl -L -o a.zip https://sketchfab.com/3d-models/school-uniform-${uid}/download` }, seen(`python clothes_dupe.py ${uid}`)), null, 'the bare id counts')
  assert.equal(dupeCheckMissing('Bash', { command: 'curl -L -o a.zip https://myprefab.com/items/1' }, ''), null, 'myprefab.com is not fab.com')
  assert.match(dupeCheckMissing('Bash', { command: 'curl -L -o a.zip https://www.fab.com/listings/0123456789abcdef-0123-4567-89ab-0123456789ab' }, '') ?? '', /clothes_dupe/)
})

test('team guard: Programmer, Animator and Character TD briefs need the Sheet line however Role and Kit are separated', async () => {
  const { missingLines } = await import('../global/team-guard.mjs')
  for (const role of ['Programmer', 'Animator', 'Character TD']) {
    for (const head of [`Role: ${role} / Kit: game / Size: M`, `Role: ${role} - Kit: story - Size: M`, `Role: ${role}\nKit: game\nSize: M`]) {
      assert.ok(missingLines(`${head}${FULL}\nFit the outfit.`).some((l) => /Sheet/.test(l)), head)
    }
  }
  assert.ok(!missingLines(`Role: Programmer / Kit: setup / Size: M${FULL}`).some((l) => /Sheet/.test(l)), 'other kits need no sheet')
})

test('gate fixes: Sheet: must be a .md path and Look-Lock: a link or card, "later" does not count', async () => {
  const { missingLines } = await import('../global/team-guard.mjs')
  const b = (extra) => `Role: Programmer · Kit: game · Size: M${FULL}\nFit the character outfit.\n${extra}`
  assert.equal(missingLines(b('Sheet: later\nLook-Lock: later')).length, 2)
  assert.equal(missingLines(b('Sheet: characters/mira/SHEET.md\nLook-Lock: owner card https://claude.ai/c/1')).length, 0)
})

test('gate fixes: a Look-Lock card link inside the project (#cmsg_...) counts, a bare # does not (GameDev 2026-11-12: six starts refused)', async () => {
  const { missingLines } = await import('../global/team-guard.mjs')
  const b = (extra) => `Role: Programmer · Kit: game · Size: M${FULL}\nFit the character outfit.\n${extra}`
  assert.equal(missingLines(b('Sheet: characters/mira/SHEET.md\nLook-Lock: [Mira look](#cmsg_01D5edTu)')).length, 0)
  for (const bad of ['#later', '#cmsg_', '#cmsg']) assert.equal(missingLines(b(`Sheet: characters/mira/SHEET.md\nLook-Lock: ${bad}`)).length, 1, `${bad} is no card link`)
})

// Gate rounds 1 to 6 of PR 445 chased verbs and body words; the rule is now a plain one: no classifier.
test('team guard: every Programmer or Animator brief on a game or story kit names its cast sheet and look lock, or declares n/a', async () => {
  const { missingLines } = await import('../global/team-guard.mjs')
  const brief = (more, role = 'Programmer', kit = 'game') => `Role: ${role} · Kit: ${kit} · Size: L${FULL}\n${more}`
  const both = ['Sheet: (approved cast sheet, docs/preproduction-workflow.md)', 'Look-Lock: (owner card of the look)']
  for (const task of ['Fit the school outfit to Mira.', "Make Nova's legs longer", 'Put a hoodie on Kai', 'Make the HUD fit on 390px', 'Rig the camera dolly']) assert.deepEqual(missingLines(brief(task)), both, task)
  assert.deepEqual(missingLines(brief('Fit the school outfit to Mira.\nSheet: characters/mira/SHEET.md\nLook-Lock: https://claude.ai/card/1 2026-11-12')), [])
  assert.equal(missingLines(brief('Fit the outfit.\nSheet: <path>\nLook-Lock: <card>')).length, 2, 'placeholders do not count')
  assert.equal(missingLines(brief('Make the HUD fit on 390px.\nSheet: n/a this is a HUD layout job, no model changes')).length, 0, 'a declared exception passes')
  assert.equal(missingLines(brief('Make the HUD.\nSheet: n/a no')).length, 2, 'a one-word reason does not')
  assert.equal(missingLines(brief('Make the HUD.\nSheet: n/a\nModel: sonnet because the role says so')).length, 2, 'a bare n/a does not borrow the next line as its reason')
  assert.equal(missingLines(brief('Make the HUD.', 'Animator', 'story')).length, 2, 'Animator on the story kit too')
  assert.deepEqual(missingLines(brief('Fix the login page copy.', 'Programmer', 'app')), [], 'only game and story kits')
  assert.deepEqual(missingLines(brief('Write the cast sheet and body plan for Mira.', 'Planner', 'game')), [], 'the cast stage itself writes the sheet')
})

// yskills 2026-11-12 (persistent role threads, research 2026-11-12): a role thread is reused within one plan or PR,
// so a thread start while the same role has an open thread on the board must say why it is new.
const BOARD = (rows) => `<child-session-output nonce="x">{"sessions":[${rows.map(([title, state, resolved]) => `{"created_at":"2026-11-12T08:00:00Z","last_activity_at":"2026-11-12T08:10:00Z",${resolved ? '"resolved":true,' : ''}"state":"${state}","thread_id":"cmsg_${rows.findIndex((r) => r[0] === title)}","title":"${title}"}`).join(',')}],"total":${rows.length}}</child-session-output>`

const JSONL = (text, input = {}, id = 't1') => `${JSON.stringify({ message: { content: [{ type: 'tool_use', id, name: 'mcp__hearthbot__list_threads', input }] } })}\n${JSON.stringify({ message: { content: [{ type: 'tool_result', tool_use_id: id, content: [{ type: 'text', text }] }] } })}\n`

test('team guard: the coordinator reuses an open role thread instead of starting a second one', async () => {
  const { decide, boardThreads, openSameRole } = await import('../global/team-guard.mjs')
  const teams = readFileSync(join(root, 'docs/TEAMS.md'), 'utf8')
  const board = boardThreads(JSONL(BOARD([['Programmer · fix the login', 'working'], ['Planner · old plan', 'done', true], ['Animator · scene 1', 'review_ready'], ['Tester · PR 12', 'working']])))
  assert.deepEqual(openSameRole(board, 'Programmer'), ['Programmer · fix the login'])
  assert.deepEqual(openSameRole([{ title: 'Programmer·a', state: 'working' }, { title: 'Game Designer · x', state: 'working' }], 'Designer'), [], 'no prefix collision')
  assert.deepEqual(openSameRole([{ title: 'Programmer·a', state: 'working' }], 'Programmer'), ['Programmer·a'], 'the dot may sit tight')
  const odd = (text) => boardThreads(JSONL(text)).map((t) => t.title)
  assert.deepEqual(odd(JSON.stringify({ threads: [{ thread_id: 'a', state: 'working', title: 'Programmer · fix {x}', produced: [{ id: 1 }] }] }, null, 2)), ['Programmer · fix {x}'], 'braces, a nested array, pretty print and a threads key')
  assert.deepEqual(boardThreads(JSONL(BOARD([['Programmer · a', 'working']]), { state: 'done' })), [], 'a filtered listing is no board')
  assert.deepEqual(boardThreads(`${JSONL(BOARD([['Programmer · a', 'working']]))}${JSON.stringify({ message: { content: [{ type: 'tool_use', id: 'r1', name: 'mcp__hearthbot__set_thread_resolved', input: { thread_id: 'cmsg_0' } }] } })}\n`), [], 'resolved since the listing')
  assert.deepEqual(openSameRole(board, 'Planner'), [], 'a resolved thread is not reusable')
  assert.deepEqual(openSameRole(board, 'Animator'), ['Animator · scene 1'], 'review_ready counts as open')
  const start = (role, extra = '', size = 'M') => decide('mcp__hearthbot__start_thread', { brief: `Role: ${role} · Kit: setup · Size: ${size}${FULL}${extra}`, title: `${role} · next slice`, model: 'claude-x-1' }, [], [], teams, '', board)
  assert.match(start('Programmer').block ?? '', /Programmer · fix the login.*message_thread/s, 'an open Programmer thread: message it instead')
  assert.deepEqual(start('Programmer', '\nReuse: none (parallel slice on other files, plan 2)'), {}, 'a stated reason lets a second one start')
  assert.match(start('Programmer', '\nReuse: none').block ?? '', /Reuse:/, 'a bare none is no reason')
  assert.deepEqual(start('Programmer', '\nReuse: none (new PR)'), {}, 'a short real reason passes (TEAMS.md names "a new plan or PR")')
  assert.match(start('Programmer', '\nReuse: none ()').block ?? '', /Reuse:/, 'empty parentheses are no reason')
  assert.match(start('Programmer').block ?? '', /list_threads again/, 'the block says to relist a stale board')
  assert.match(start('Programmer', '\nReuse: none (<why this is a new thread>)').block ?? '', /Reuse:/, 'the template placeholder is no reason')
  assert.deepEqual(start('Planner'), {}, 'no open Planner thread: start as before')
  assert.deepEqual(start('Tester', '', 'L'), {}, 'the L gate Tester is always fresh (docs/TEAMS.md, Reuse rule)')
  const withReviewer = boardThreads(JSONL(BOARD([['Reviewer · Gate PR 1', 'working']])))
  assert.deepEqual(decide('mcp__hearthbot__start_thread', { brief: `Role: Reviewer · Kit: setup · Size: M${FULL}`, title: 'Reviewer · Gate PR 2', model: 'claude-x-1' }, [], [], teams, '', withReviewer), {}, 'every reviewer is fresh (docs/TEAMS.md, Reuse rule: Always fresh)')
  assert.deepEqual(decide('mcp__hearthbot__start_thread', { brief: `Role: Programmer · Kit: setup · Size: M${FULL}`, title: 'Programmer · x', model: 'claude-x-1' }, [], [], teams, '', []), {}, 'no board read: as before')
})

test('team guard: the hook reads the last thread board of the transcript', () => {
  const cwd = mkdtempSync(join(tmpdir(), 'team-'))
  try {
    const transcript = join(cwd, 't.jsonl')
    mkdirSync(join(cwd, 'docs'))
    cpSync(join(root, 'docs/TEAMS.md'), join(cwd, 'docs/TEAMS.md'))
    const read = `${JSON.stringify({ message: { content: [{ type: 'tool_use', name: 'Read', input: { file_path: 'claude-setup/CLAUDE.md docs/TEAMS.md' } }] } })}\n`
    writeFileSync(transcript, read + JSONL(BOARD([['Programmer · fix the login', 'working']])))
    const start = (extra = '') => runTeam('pre', { cwd, transcript_path: transcript, tool_name: 'mcp__hearthbot__start_thread', tool_input: { brief: `Role: Programmer · Kit: setup · Size: S${FULL}${extra}`, model: 'claude-x-1' } }, { CLAUDE_SETUP_HOME: cwd })
    assert.equal(start().status, 2)
    assert.match(start().stderr, /message_thread/)
    assert.equal(start('\nReuse: none (other plan, the old thread is long)').status, 0)
  } finally { rmSync(cwd, { recursive: true, force: true }) }
})


// 2026-11-12: a skill name as the Kit (game-3d, social-team) got the bare kit list; now the error says it is a skill.
test('team guard: a skill name as the Kit gets a hint and the valid kit list', async () => {
  const { badTeam } = await import('../global/team-guard.mjs')
  const teams = readFileSync(join(root, 'docs/TEAMS.md'), 'utf8')
  const msg = badTeam('Role: Programmer · Kit: game-3d · Size: M', teams) ?? ''
  assert.match(msg, /game-3d.*is a skill: put it on the Skills: line/)
  assert.match(msg, /pick one of [\w, -]*game/, 'the valid kits are listed')
  assert.doesNotMatch(badTeam('Role: Programmer · Kit: nonsense · Size: M', teams) ?? '', /is a skill/, 'an unknown word gets no skill hint')
})

// transition rule 6 (2026-11-12): gate images and PLAN-REVIEW.md live under gate/<asset>/, only the ledger itself is protected.
test('gate folder: files under gate/<asset>/ are free to write, the ledger and grants are not', async () => {
  const { gateStep } = await import('../global/gate-rounds.mjs')
  const dir = '/tmp/ledger-x'
  const step = (tool, input) => gateStep(tool, input, { dir })
  assert.equal(step('Write', { file_path: '/mnt/project-files/gate/o_r_7/r1/front.png' }), null)
  assert.equal(step('Write', { file_path: '/mnt/project-files/gate/o_r_7/PLAN-REVIEW.md' }), null)
  assert.equal(step('Write', { file_path: `${dir}/o_r_7/r2/side.png` }), null)
  assert.match(step('Write', { file_path: '/mnt/project-files/gate/o_r_7.json' }) ?? '', /written only by gate-rounds/)
  assert.match(step('Write', { file_path: `${dir}/o_r_7.json` }) ?? '', /written only by gate-rounds/)
  assert.match(step('Edit', { file_path: `${dir}/grants/card.o_r_7.json` }) ?? '', /written only by gate-rounds/)
  assert.equal(step('Bash', { command: 'mkdir -p /mnt/project-files/gate/o_r_7/r1 && cp /tmp/a.png /mnt/project-files/gate/o_r_7/r1/a.png' }), null)
  assert.match(step('Bash', { command: 'rm /mnt/project-files/gate/o_r_7.json' }) ?? '', /written only by gate-rounds/)
})

// M30: a brief names its Masterplan item, its plan and what counts as accepted; the Planner of a size L task runs on Fable; Reviewer and Researcher serve every kit.
test('team guard (M30): a brief without Item, Plan or Acceptance names each missing line', async () => {
  const { missingLines } = await import('../global/team-guard.mjs')
  const brief = `Role: Programmer · Kit: setup · Size: S${FULL}`
  assert.deepEqual(missingLines(brief), [])
  for (const [line, re] of [['Item:', /\nItem:[^\n]*/], ['Plan:', /\nPlan:[^\n]*/], ['Acceptance:', /\nAcceptance:[^\n]*/]]) {
    assert.ok(missingLines(brief.replace(re, '')).some((m) => m.startsWith(line)), `${line} is required`)
    assert.ok(missingLines(brief.replace(re, `\n${line} <placeholder>`)).some((m) => m.startsWith(line)), `${line} placeholder does not count`)
  }
  assert.ok(missingLines(brief.replace(/\nItem:[^\n]*/, '\nItem: soon')).some((m) => m.startsWith('Item:')), 'Item is M<n> or new')
  assert.deepEqual(missingLines(brief.replace(/\nItem:[^\n]*/, '\nItem: new')), [])
})

test('team guard (M30): a Planner at size L runs on Fable only; M needs Fable too; a stated reason passes', async () => {
  const { wrongModel } = await import('../global/team-guard.mjs')
  const teams = readFileSync(join(root, 'docs/TEAMS.md'), 'utf8')
  const id = (tier) => teams.match(new RegExp(`${tier} \\((claude-[\\w.-]+)\\)`, 'i'))[1]
  const brief = (size) => `Role: Planner · Kit: setup · Size: ${size}`
  assert.ok(wrongModel(brief('L'), id('Opus'), teams), 'Opus is refused for a Planner at L')
  assert.equal(wrongModel(brief('L'), id('Fable'), teams), null)
  assert.ok(wrongModel(brief('L'), id('Sonnet'), teams))
  assert.ok(wrongModel(brief('M'), id('Opus'), teams), 'S5: M is Fable too')
  assert.equal(wrongModel(`${brief('M')}\nModel: opus (Fable unavailable)`, id('Opus'), teams), null, 'S5: the way out at M')
  assert.equal(wrongModel(`${brief('L')}\nModel: opus (Fable is out of credits)`, id('Opus'), teams), null, 'the Models line lets Opus take over, said in the brief')
})

// S5 (#546, yskills 2026-11-13, decision 3): Planner and Reviewer threads run on Fable, a Researcher on Opus, a Programmer on Sonnet; only the Model cells of the Roster changed.
test('team guard (S5): the Roster model cells, table-driven', async () => {
  const { wrongModel } = await import('../global/team-guard.mjs')
  const teams = readFileSync(join(root, 'docs/TEAMS.md'), 'utf8')
  const brief = (role, size, extra = '') => `Role: ${role} · Kit: setup · Size: ${size}${extra}`
  const rows = [
    ['Planner', 'M', 'opus', '', true], ['Planner', 'M', 'fable', '', false], ['Planner', 'M', 'opus', '\nModel: opus (Fable unavailable)', false],
    ['Reviewer', 'M', 'opus', '', true], ['Reviewer', 'M', 'fable', '', false], ['Reviewer', 'S', 'opus', '\nModel: opus (Fable unavailable)', false],
    ['Researcher', 'M', 'sonnet', '', true], ['Researcher', 'M', 'opus', '', false],
    ['Programmer', 'M', 'sonnet', '', false], ['Programmer', 'M', 'opus', '', true],
  ]
  for (const [role, size, model, extra, refused] of rows) assert.equal(!!wrongModel(brief(role, size, extra), model, teams), refused, `${role} ${size} on ${model}${extra ? ' with a reason' : ''}`)
})

test('team guard (M30): a Reviewer or Researcher thread starts on every kit, a Programmer still not on video', async () => {
  const { badTeam } = await import('../global/team-guard.mjs')
  const teams = readFileSync(join(root, 'docs/TEAMS.md'), 'utf8')
  for (const kit of ['video', 'social', 'setup', 'game']) for (const role of ['Reviewer', 'Researcher']) assert.equal(badTeam(`Role: ${role} · Kit: ${kit} · Size: M`, teams), null, `${role} on ${kit}`)
  assert.ok(badTeam('Role: Programmer · Kit: video · Size: M', teams))
  assert.ok(badTeam('Role: Planner · Kit: social · Size: M', teams))
})

// S9 (#551): 18+ paths never reach GitHub. Three doors: the pre-push hook, push_files / create_or_update_file, the --no-verify deny.
test('neverPush: names a Private18 folder, nacht-*.rpy, kontakt_sex* and a .neverpush prefix, and nothing else', async () => {
  const { neverPush } = await import('../global/rule-guard.mjs')
  assert.deepEqual(neverPush(['src/a.ts', 'game/Private18/x.png', 'game/nacht-02.rpy', 'kontakt_sex_1.png', 'docs/readme.md', 'game/nachtigall.rpy']), ['game/Private18/x.png', 'game/nacht-02.rpy', 'kontakt_sex_1.png'])
  assert.deepEqual(neverPush(['secret/a.png', 'secretary/b.png'], ['secret']), ['secret/a.png'], 'a prefix is a folder, not a string start')
})

test('neverpush CLI: ok only on its exact line, blocks with the path, a rule-guard without the mode does not say ok', () => {
  const script = join(root, 'global/rule-guard.mjs')
  const run = (input) => spawnSync(process.execPath, [script, 'neverpush'], { input, encoding: 'utf8' })
  assert.equal(run('src/a.ts\n').stdout.trim(), 'neverpush: ok')
  const bad = run('src/a.ts\nPrivate18/x.png\n')
  assert.equal(bad.status, 1)
  assert.match(bad.stdout, /Private18\/x\.png/)
})

test('pre-push hook: a range whose middle commit adds a Private18 path is blocked and names it, PRE_PR_SKIP does not skip, a neutral range passes', () => {
  if (process.platform === 'win32') return
  const home = mkdtempSync(join(tmpdir(), 'np-home-'))
  const repo = mkdtempSync(join(tmpdir(), 'np-repo-'))
  try {
    mkdirSync(join(home, '.claude', 'claude-setup'), { recursive: true })
    cpSync(join(root, 'global/rule-guard.mjs'), join(home, '.claude', 'claude-setup', 'rule-guard.mjs'))
    const env = { ...process.env, CLAUDE_SETUP_HOME: home, PRE_PR_SKIP: '1' }
    for (const k of Object.keys(env)) if (k.startsWith('GIT_')) delete env[k]
    const g = (...a) => spawnSync('git', ['-c', 'user.name=t', '-c', 'user.email=t@t', ...a], { cwd: repo, env, encoding: 'utf8' })
    g('init', '-q', '-b', 'main')
    const commit = (file) => { mkdirSync(join(repo, join(file, '..')), { recursive: true }); writeFileSync(join(repo, file), 'x'); g('add', '-A'); g('commit', '-q', '-m', file) }
    commit('a.txt')
    const base = g('rev-parse', 'HEAD').stdout.trim()
    commit('b.txt'); commit('Private18/x.png'); commit('c.txt')
    const head = g('rev-parse', 'HEAD').stdout.trim()
    const hook = join(root, 'global/git-hooks/pre-push')
    const push = (url, lsha, rsha) => spawnSync('sh', [hook, 'origin', url], { cwd: repo, env, input: `refs/heads/main ${lsha} refs/heads/main ${rsha}\n`, encoding: 'utf8' })
    const blocked = push('https://github.com/yverse-studio/x', head, base)
    assert.equal(blocked.status, 1, blocked.stdout + blocked.stderr)
    assert.match(blocked.stdout, /Private18\/x\.png/)
    const mid = g('rev-parse', 'HEAD~2').stdout.trim()
    assert.equal(push('https://github.com/yverse-studio/x', mid, base).status, 0, 'a neutral range passes')
    assert.equal(push('https://example.org/x.git', head, base).status, 0, 'a non-GitHub remote is untouched')
    rmSync(join(home, '.claude', 'claude-setup', 'rule-guard.mjs'))
    assert.equal(push('https://github.com/other/x', mid, base).status, 1, 'a missing guard copy blocks')
    writeFileSync(join(home, '.claude', 'claude-setup', 'rule-guard.mjs'), '// old, no neverpush mode\n')
    assert.equal(push('https://github.com/other/x', mid, base).status, 1, 'an old copy without the mode blocks')
  } finally { for (const d of [home, repo]) rmSync(d, { recursive: true, force: true }) }
})

test('rule guard: push_files and create_or_update_file with a nacht-*.rpy path are blocked, a neutral one is not', () => {
  const script = join(root, 'global/rule-guard.mjs')
  const pre = (tool, tool_input) => spawnSync(process.execPath, [script, 'pre'], { input: JSON.stringify({ tool_name: tool, tool_input, cwd: tmpdir(), session_id: 'np1' }), encoding: 'utf8' }).stderr
  assert.match(pre('mcp__github__push_files', { owner: 'o', repo: 'r', branch: 'b', message: 'm', files: [{ path: 'game/nacht-03.rpy', content: 'x' }] }), /neverPush[\s\S]*nacht-03\.rpy/)
  assert.match(pre('mcp__github__create_or_update_file', { owner: 'o', repo: 'r', branch: 'b', message: 'm', path: 'a/Private18/b.png', content: 'x' }), /neverPush/)
  assert.doesNotMatch(pre('mcp__github__push_files', { owner: 'o', repo: 'r', branch: 'b', message: 'm', files: [{ path: 'src/a.ts', content: 'x' }] }), /neverPush/)
})

test('settings: both files deny --no-verify in any position (-C, -c forms too) and a -c core.hooksPath override', () => {
  for (const f of ['global/settings.json', '.claude/settings.json']) {
    const deny = JSON.parse(readFileSync(join(root, f), 'utf8')).permissions.deny
    assert.ok(deny.includes('Bash(git*push*--no-verify*)'), f)
    assert.ok(deny.includes('Bash(git*-c*core.hooksPath*)'), f)
    // Claude Code reads * as "anything": both forms the coordinator named match.
    const re = (rule) => new RegExp(`^${rule.slice(5, -1).replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*')}$`)
    assert.match('git -C ../wt push --no-verify origin main', re('Bash(git*push*--no-verify*)'))
    assert.match('git -c core.hooksPath=/dev/null push origin main', re('Bash(git*-c*core.hooksPath*)'))
  }
})

test('pre-push hook: an umlaut path, a merge commit and an unknown remote sha cannot slip a Private18 path past neverpush', () => {
  if (process.platform === 'win32') return
  const home = mkdtempSync(join(tmpdir(), 'np2-home-'))
  const repo = mkdtempSync(join(tmpdir(), 'np2-repo-'))
  try {
    mkdirSync(join(home, '.claude', 'claude-setup'), { recursive: true })
    cpSync(join(root, 'global/rule-guard.mjs'), join(home, '.claude', 'claude-setup', 'rule-guard.mjs'))
    const env = { ...process.env, CLAUDE_SETUP_HOME: home }
    for (const k of Object.keys(env)) if (k.startsWith('GIT_')) delete env[k]
    const g = (...a) => spawnSync('git', ['-c', 'user.name=t', '-c', 'user.email=t@t', ...a], { cwd: repo, env, encoding: 'utf8' })
    const put = (file) => { mkdirSync(join(repo, join(file, '..')), { recursive: true }); writeFileSync(join(repo, file), 'x'); g('add', '-A'); g('commit', '-q', '-m', file) }
    g('init', '-q', '-b', 'main'); put('a.txt')
    const base = g('rev-parse', 'HEAD').stdout.trim()
    put('Private18/ä.png')
    const head = g('rev-parse', 'HEAD').stdout.trim()
    const hook = join(root, 'global/git-hooks/pre-push')
    const push = (lsha, rsha) => spawnSync('sh', [hook, 'origin', 'https://github.com/o/x'], { cwd: repo, env, input: `refs/heads/main ${lsha} refs/heads/main ${rsha}\n`, encoding: 'utf8' })
    assert.equal(push(head, base).status, 1, 'an umlaut file name is not quoted past the check')
    g('checkout', '-q', '-b', 'side', base); put('s.txt')
    g('checkout', '-q', 'main'); g('merge', '-q', '--no-ff', '-m', 'merge', 'side')
    g('checkout', '-q', '-b', 'x', base); g('merge', '-q', '--no-ff', '-m', 'm2', 'main')
    assert.equal(push(g('rev-parse', 'x').stdout.trim(), base).status, 1, 'a merge commit is walked too')
    assert.equal(push(head, '1234567890123456789012345678901234567890').status, 1, 'an unknown remote sha falls back and still sees the path')
  } finally { for (const d of [home, repo]) rmSync(d, { recursive: true, force: true }) }
})

test('pre-push hook: a private second remote, an upper-case host and a root commit cannot hide a Private18 path', () => {
  if (process.platform === 'win32') return
  const home = mkdtempSync(join(tmpdir(), 'np3-home-'))
  const repo = mkdtempSync(join(tmpdir(), 'np3-repo-'))
  try {
    mkdirSync(join(home, '.claude', 'claude-setup'), { recursive: true })
    cpSync(join(root, 'global/rule-guard.mjs'), join(home, '.claude', 'claude-setup', 'rule-guard.mjs'))
    const env = { ...process.env, CLAUDE_SETUP_HOME: home, GIT_CONFIG_COUNT: '1', GIT_CONFIG_KEY_0: 'log.showRoot', GIT_CONFIG_VALUE_0: 'false' }
    for (const k of Object.keys(env)) if (k.startsWith('GIT_') && !k.startsWith('GIT_CONFIG_')) delete env[k]
    const g = (...a) => spawnSync('git', ['-c', 'user.name=t', '-c', 'user.email=t@t', ...a], { cwd: repo, env, encoding: 'utf8' })
    g('init', '-q', '-b', 'main')
    mkdirSync(join(repo, 'Private18')); writeFileSync(join(repo, 'Private18', 'r.png'), 'x'); g('add', '-A'); g('commit', '-q', '-m', 'root')
    const head = g('rev-parse', 'HEAD').stdout.trim()
    g('update-ref', 'refs/remotes/nas/main', head) // a private second remote already holds the commit
    const hook = join(root, 'global/git-hooks/pre-push')
    const push = (url, rsha = '0'.repeat(40)) => spawnSync('sh', [hook, 'origin', url], { cwd: repo, env, input: `refs/heads/main ${head} refs/heads/main ${rsha}\n`, encoding: 'utf8' })
    assert.equal(push('https://github.com/o/x').status, 1, 'the nas remote does not hide it, and a root commit is listed even with log.showRoot=false')
    assert.equal(push('https://GitHub.com/o/x').status, 1, 'host case does not matter')
    assert.equal(push('http://local_proxy@127.0.0.1:1234/git/o/x').status, 1, 'a cloud proxy origin counts as GitHub')
  } finally { for (const d of [home, repo]) rmSync(d, { recursive: true, force: true }) }
})

test('neverPush: a prefix matches through ./, .. and blanks and without case', async () => {
  const { neverPush } = await import('../global/rule-guard.mjs')
  assert.equal(neverPush(['.//secret/a', 'x/../secret/a', ' secret/a', 'Secret/a', 'secretary/a'], ['secret']).length, 4)
})

test('pre-push hook: a remote repointed at GitHub does not hide its old tracking refs', () => {
  if (process.platform === 'win32') return
  const home = mkdtempSync(join(tmpdir(), 'np4-home-'))
  const repo = mkdtempSync(join(tmpdir(), 'np4-repo-'))
  try {
    mkdirSync(join(home, '.claude', 'claude-setup'), { recursive: true })
    cpSync(join(root, 'global/rule-guard.mjs'), join(home, '.claude', 'claude-setup', 'rule-guard.mjs'))
    const env = { ...process.env, CLAUDE_SETUP_HOME: home }
    for (const k of Object.keys(env)) if (k.startsWith('GIT_')) delete env[k]
    const g = (...a) => spawnSync('git', ['-c', 'user.name=t', '-c', 'user.email=t@t', ...a], { cwd: repo, env, encoding: 'utf8' })
    g('init', '-q', '-b', 'main'); mkdirSync(join(repo, 'Private18')); writeFileSync(join(repo, 'Private18', 'x.png'), 'x'); g('add', '-A'); g('commit', '-q', '-m', 'x')
    const head = g('rev-parse', 'HEAD').stdout.trim()
    g('update-ref', 'refs/remotes/origin/main', head) // fetched from a private repo, then origin was repointed
    const r = spawnSync('sh', [join(root, 'global/git-hooks/pre-push'), 'origin', 'https://github.com/o/x'], { cwd: repo, env, input: `refs/heads/main ${head} refs/heads/main ${'0'.repeat(40)}\n`, encoding: 'utf8' })
    assert.equal(r.status, 1, r.stdout)
  } finally { for (const d of [home, repo]) rmSync(d, { recursive: true, force: true }) }
})

test('pre-push hook: a new branch is not blocked for history the destination already holds, only for what it lacks', () => {
  if (process.platform === 'win32') return
  const home = mkdtempSync(join(tmpdir(), 'np5-home-'))
  const top = mkdtempSync(join(tmpdir(), 'np5-top-'))
  try {
    mkdirSync(join(home, '.claude', 'claude-setup'), { recursive: true })
    cpSync(join(root, 'global/rule-guard.mjs'), join(home, '.claude', 'claude-setup', 'rule-guard.mjs'))
    const env = { ...process.env, CLAUDE_SETUP_HOME: home }
    for (const k of Object.keys(env)) if (k.startsWith('GIT_')) delete env[k]
    const bare = join(top, 'github.com', 'o', 'x.git') // the destination; its path names github.com
    mkdirSync(bare, { recursive: true })
    const run = (cwd, ...a) => spawnSync('git', ['-c', 'user.name=t', '-c', 'user.email=t@t', '-c', 'core.hooksPath=/dev/null', ...a], { cwd, env, encoding: 'utf8' }) // a global core.hooksPath (the installed setup) must not run on the fixture's own pushes
    run(bare, 'init', '-q', '--bare', '-b', 'main')
    const repo = join(top, 'work'); mkdirSync(repo)
    run(repo, 'init', '-q', '-b', 'main'); mkdirSync(join(repo, 'Private18')); writeFileSync(join(repo, 'Private18', 'x.png'), 'x'); run(repo, 'add', '-A'); run(repo, 'commit', '-q', '-m', 'old leak')
    run(repo, 'rm', '-q', '-r', 'Private18'); run(repo, 'commit', '-q', '-m', 'removed')
    run(repo, 'push', '-q', bare, 'main') // already on the destination (no hook is installed here)
    run(repo, 'checkout', '-q', '-b', 'feat'); writeFileSync(join(repo, 'a.txt'), 'x'); run(repo, 'add', '-A'); run(repo, 'commit', '-q', '-m', 'neutral')
    const feat = run(repo, 'rev-parse', 'HEAD').stdout.trim()
    const hook = join(root, 'global/git-hooks/pre-push')
    const push = (sha) => spawnSync('sh', [hook, 'origin', bare], { cwd: repo, env, input: `refs/heads/feat ${sha} refs/heads/feat ${'0'.repeat(40)}\n`, encoding: 'utf8' })
    assert.equal(push(feat).status, 0, 'old history the destination already holds does not block a new branch')
    run(repo, 'checkout', '-q', 'feat'); mkdirSync(join(repo, 'Private18')); writeFileSync(join(repo, 'Private18', 'y.png'), 'x'); run(repo, 'add', '-A'); run(repo, 'commit', '-q', '-m', 'new leak')
    assert.equal(push(run(repo, 'rev-parse', 'HEAD').stdout.trim()).status, 1, 'a new Private18 commit on that branch still blocks')
  } finally { for (const d of [home, top]) rmSync(d, { recursive: true, force: true }) }
})

test('pre-push hook: a tag on a tree (no commit to walk) blocks instead of passing with nothing listed', () => {
  if (process.platform === 'win32') return
  const home = mkdtempSync(join(tmpdir(), 'np6-home-'))
  const repo = mkdtempSync(join(tmpdir(), 'np6-repo-'))
  try {
    mkdirSync(join(home, '.claude', 'claude-setup'), { recursive: true })
    cpSync(join(root, 'global/rule-guard.mjs'), join(home, '.claude', 'claude-setup', 'rule-guard.mjs'))
    const env = { ...process.env, CLAUDE_SETUP_HOME: home }
    for (const k of Object.keys(env)) if (k.startsWith('GIT_')) delete env[k]
    const g = (...a) => spawnSync('git', ['-c', 'user.name=t', '-c', 'user.email=t@t', ...a], { cwd: repo, env, encoding: 'utf8' })
    g('init', '-q', '-b', 'main'); mkdirSync(join(repo, 'Private18')); writeFileSync(join(repo, 'Private18', 's.png'), 'x'); g('add', '-A'); g('commit', '-q', '-m', 'x')
    const tree = g('rev-parse', 'HEAD^{tree}').stdout.trim()
    const r = spawnSync('sh', [join(root, 'global/git-hooks/pre-push'), 'origin', 'https://github.com/o/x'], { cwd: repo, env, input: `refs/tags/tt ${tree} refs/tags/tt ${'0'.repeat(40)}\n`, encoding: 'utf8' })
    assert.equal(r.status, 1, r.stdout)
    assert.match(r.stdout, /does not point at a commit/)
  } finally { for (const d of [home, repo]) rmSync(d, { recursive: true, force: true }) }
})

test('pre-push hook: a git replace ref cannot hide a Private18 commit that the push still sends', () => {
  if (process.platform === 'win32') return
  const home = mkdtempSync(join(tmpdir(), 'np7-home-'))
  const repo = mkdtempSync(join(tmpdir(), 'np7-repo-'))
  try {
    mkdirSync(join(home, '.claude', 'claude-setup'), { recursive: true })
    cpSync(join(root, 'global/rule-guard.mjs'), join(home, '.claude', 'claude-setup', 'rule-guard.mjs'))
    const env = { ...process.env, CLAUDE_SETUP_HOME: home }
    for (const k of Object.keys(env)) if (k.startsWith('GIT_')) delete env[k]
    const g = (...a) => spawnSync('git', ['-c', 'user.name=t', '-c', 'user.email=t@t', ...a], { cwd: repo, env, encoding: 'utf8' })
    g('init', '-q', '-b', 'main'); writeFileSync(join(repo, 'a.txt'), 'x'); g('add', '-A'); g('commit', '-q', '-m', 'base')
    const base = g('rev-parse', 'HEAD').stdout.trim()
    mkdirSync(join(repo, 'Private18')); writeFileSync(join(repo, 'Private18', 's.png'), 'x'); g('add', '-A'); g('commit', '-q', '-m', 'leak')
    const head = g('rev-parse', 'HEAD').stdout.trim()
    const clean = g('commit-tree', '-p', base, '-m', 'clean', `${base}^{tree}`).stdout.trim()
    g('replace', head, clean) // the log view now shows a clean commit; the push still sends the real objects
    const r = spawnSync('sh', [join(root, 'global/git-hooks/pre-push'), 'origin', 'https://github.com/o/x'], { cwd: repo, env, input: `refs/heads/main ${head} refs/heads/main ${base}\n`, encoding: 'utf8' })
    assert.equal(r.status, 1, r.stdout)
    assert.match(r.stdout, /Private18\/s\.png/)
  } finally { for (const d of [home, repo]) rmSync(d, { recursive: true, force: true }) }
})

test('pre-push hook: log.diffMerges, diff.ignoreSubmodules and an insteadOf rewrite cannot hide a Private18 path', () => {
  if (process.platform === 'win32') return
  const home = mkdtempSync(join(tmpdir(), 'np8-home-'))
  const top = mkdtempSync(join(tmpdir(), 'np8-top-'))
  try {
    mkdirSync(join(home, '.claude', 'claude-setup'), { recursive: true })
    cpSync(join(root, 'global/rule-guard.mjs'), join(home, '.claude', 'claude-setup', 'rule-guard.mjs'))
    const base = { ...process.env, CLAUDE_SETUP_HOME: home }
    for (const k of Object.keys(base)) if (k.startsWith('GIT_')) delete base[k]
    const cfg = (pairs) => ({ ...base, GIT_CONFIG_COUNT: String(pairs.length), ...Object.fromEntries(pairs.flatMap(([k, v], i) => [[`GIT_CONFIG_KEY_${i}`, k], [`GIT_CONFIG_VALUE_${i}`, v]])) })
    const mk = (name) => { const d = join(top, name); mkdirSync(d); return d }
    const git = (cwd, ...a) => spawnSync('git', ['-c', 'user.name=t', '-c', 'user.email=t@t', ...a], { cwd, env: base, encoding: 'utf8' })
    const hook = join(root, 'global/git-hooks/pre-push')
    const run = (cwd, url, input, env) => spawnSync('sh', [hook, 'origin', url], { cwd, env, input, encoding: 'utf8' })
    // 1: a file added inside a merge commit, log.diffMerges=off
    const a = mk('a'); git(a, 'init', '-q', '-b', 'main'); writeFileSync(join(a, 'a.txt'), 'x'); git(a, 'add', '-A'); git(a, 'commit', '-q', '-m', 'base')
    const b0 = git(a, 'rev-parse', 'HEAD').stdout.trim()
    git(a, 'checkout', '-q', '-b', 'side'); writeFileSync(join(a, 's.txt'), 's'); git(a, 'add', '-A'); git(a, 'commit', '-q', '-m', 's')
    git(a, 'checkout', '-q', 'main'); writeFileSync(join(a, 'm.txt'), 'm'); git(a, 'add', '-A'); git(a, 'commit', '-q', '-m', 'm')
    git(a, 'merge', '-q', '--no-ff', '--no-commit', 'side'); mkdirSync(join(a, 'Private18')); writeFileSync(join(a, 'Private18', 's.png'), 'x'); git(a, 'add', '-A'); git(a, 'commit', '-q', '-m', 'merge')
    const ah = git(a, 'rev-parse', 'HEAD').stdout.trim()
    assert.equal(run(a, 'https://github.com/o/x', `refs/heads/main ${ah} refs/heads/main ${b0}\n`, cfg([['log.diffMerges', 'off']])).status, 1, 'a merge commit is listed whatever log.diffMerges says')
    // 3: a gitlink at a Private18 path, diff.ignoreSubmodules=all
    const c = mk('c'); git(c, 'init', '-q', '-b', 'main'); writeFileSync(join(c, 'a.txt'), 'x'); git(c, 'add', '-A'); git(c, 'commit', '-q', '-m', 'base')
    const c0 = git(c, 'rev-parse', 'HEAD').stdout.trim()
    git(c, 'update-index', '--add', '--cacheinfo', `160000,${c0},Private18/sub`); git(c, 'commit', '-q', '-m', 'gitlink')
    const ch = git(c, 'rev-parse', 'HEAD').stdout.trim()
    assert.equal(run(c, 'https://github.com/o/x', `refs/heads/main ${ch} refs/heads/main ${c0}\n`, cfg([['diff.ignoreSubmodules', 'all']])).status, 1, 'a gitlink path is listed whatever diff.ignoreSubmodules says')
    // 2: insteadOf sends ls-remote to a private repo that holds the 18+ commit
    const dest = join(top, 'github.com', 'o', 'x.git'); mkdirSync(dest, { recursive: true }); git(dest, 'init', '-q', '--bare', '-b', 'main')
    const d = mk('d'); git(d, 'init', '-q', '-b', 'main'); mkdirSync(join(d, 'Private18')); writeFileSync(join(d, 'Private18', 'x.png'), 'x'); git(d, 'add', '-A'); git(d, 'commit', '-q', '-m', 'leak')
    const priv = join(top, 'private.git'); git(top, 'clone', '-q', '--bare', d, priv)
    git(d, 'checkout', '-q', '-b', 'feat'); writeFileSync(join(d, 'n.txt'), 'n'); git(d, 'add', '-A'); git(d, 'commit', '-q', '-m', 'neutral')
    const dh = git(d, 'rev-parse', 'HEAD').stdout.trim()
    assert.equal(run(d, dest, `refs/heads/feat ${dh} refs/heads/feat ${'0'.repeat(40)}\n`, cfg([[`url.${priv}.insteadOf`, dest]])).status, 1, 'ls-remote against a rewritten URL excludes nothing')
  } finally { for (const x of [home, top]) rmSync(x, { recursive: true, force: true }) }
})

// #591 (yskills, C1 card 2026-11-13): a plan review is one pass/fail list, once; scores and rounds stay for pictures, looks and code.
test('gate.md: plan reviews are pass/fail, once; the score-rule pin in check.mjs is gone', () => {
  const rounds = readFileSync(join(root, '.claude/skills/operator/gate.md'), 'utf8').split(/^## Rounds$/m)[1] ?? ''
  assert.match(rounds, /\*\*Plan reviews are pass\/fail, once\.\*\*[^\n]*second FAIL[^\n]*card/)
  assert.doesNotMatch(readFileSync(join(root, 'scripts/check.mjs'), 'utf8'), /Scored gates \(the score rule\)/)
})

// #576 (yskills, CompanyXY 2026-11-13): one Reviewer thread may run all gate rounds of an asset (max 3); fixes are numbered with tile and location.
test('gate.md and the Reviewer role: one reviewer thread runs up to 3 rounds of an asset', () => {
  const gate = readFileSync(join(root, '.claude/skills/operator/gate.md'), 'utf8')
  assert.match(gate, /One reviewer thread, up to 3 rounds[\s\S]*numbered fixes, each with tile and location[\s\S]*fresh reviewer/)
  assert.match(readFileSync(join(root, '.claude/skills/operator/roles/reviewer.md'), 'utf8'), /all gate rounds of one asset \(at most 3\)[^\n]*numbered fixes/)
})
