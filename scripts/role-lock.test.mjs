// yskills 2026-11-12: "du hast keine Rollen gegeben und kein Thread hat sich beschwert". A thread whose brief names no Roster role refuses to work,
// and a role does not write the files another role owns. Run: node --test scripts/role-lock.test.mjs
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'

const root = join(fileURLToPath(import.meta.url), '..', '..')
let n = 0
const guard = (mode, session, payload) => spawnSync(process.execPath, [join(root, 'global/rule-guard.mjs'), mode], { input: JSON.stringify({ cwd: root, session_id: session, transcript_path: join(mkdtempSync(join(tmpdir(), 'rl-')), 't.jsonl'), ...payload }), encoding: 'utf8', env: { ...process.env, CLAUDE_SETUP_RULE_GUARD: '' } })
const BLOCKS = `Threads: list_threads checked, none open on this topic
Model: sonnet
Skills: none
Prior art: obra/superpowers checked -> adapt, because ours reads hearthbot tools
Start: read MEMORY.md, then claude-setup CLAUDE.md
Done when: the test passes
Stop when: 3 attempts`
const spawn = (brief) => `<wake reason="spawn"><relay>${brief}</relay></wake>`
const tool = (session, name, input = {}) => guard('pre', session, { tool_name: name, tool_input: input })

test('a thread started without a valid Roster role does no work and may only talk to the coordinator', () => {
  for (const [label, head] of [['no Role line', 'Kit: setup · Size: S'], ['Role: none', 'Role: none · Kit: setup · Size: S'], ['an invented role', 'Role: Devlog Hero · Kit: setup · Size: S']]) {
    const id = `rolelock${process.pid}x${++n}`
    const out = guard('prompt', id, { prompt: spawn(`${head}\n${BLOCKS}`) })
    assert.match(out.stdout, /Brief check/, label)
    const bash = tool(id, 'Bash', { command: 'ls' })
    assert.equal(bash.status, 2, `${label}: Bash refused`)
    assert.match(bash.stderr, /brief breaks the team rules[\s\S]*message_coordinator/, label)
    assert.equal(tool(id, 'Write', { file_path: '/tmp/x.md', content: 'x' }).status, 2, `${label}: Write refused`)
    assert.equal(tool(id, 'mcp__hearthbot__message_coordinator', { text: 'brief wrong' }).status, 0, `${label}: it may ask the coordinator`)
  }
})

test('a corrected brief lifts the lock, a valid first brief never locks', () => {
  const ok = `Role: Programmer · Kit: setup · Size: S\n${BLOCKS}`
  const fresh = `rolelock${process.pid}x${++n}`
  assert.doesNotMatch(guard('prompt', fresh, { prompt: spawn(ok) }).stdout, /Brief check/)
  assert.equal(tool(fresh, 'Bash', { command: 'ls' }).status, 0, 'a valid start works')
  const id = `rolelock${process.pid}x${++n}`
  guard('prompt', id, { prompt: spawn(`Kit: setup · Size: S\n${BLOCKS}`) })
  assert.equal(tool(id, 'Bash', { command: 'ls' }).status, 2)
  guard('prompt', id, { prompt: `<coordinator-relay><relay from="coordinator"><note>Re-brief:\nRole: Programmer · Kit: setup · Size: S\nModel: <model id from the Roster row></note></relay></coordinator-relay>` })
  assert.equal(tool(id, 'Bash', { command: 'ls' }).status, 2, 'a re-brief that still lacks lines does not lift it')
  guard('prompt', id, { prompt: `<coordinator-relay><relay from="coordinator"><note>Re-brief:\n${ok}</note></relay></coordinator-relay>` })
  assert.equal(tool(id, 'Bash', { command: 'ls' }).status, 0, 'a complete re-brief lifts it')
})

// Gate round 1 of the #450 re-land: an M-size re-brief carries a Title check note (no failure), and the lifted thread gets its role stamp.
test('an M-size re-brief lifts the lock too, and a lifted thread is stamped with its role', () => {
  const id = `rolelock${process.pid}x${++n}`
  guard('prompt', id, { prompt: spawn(`Kit: setup · Size: M\n${BLOCKS}`) })
  assert.equal(tool(id, 'Bash', { command: 'ls' }).status, 2)
  guard('prompt', id, { prompt: `<coordinator-relay><relay from="coordinator"><note>Re-brief:\nRole: Programmer · Kit: setup · Size: M\nGate: Reviewer thread before owner\n${BLOCKS}</note></relay></coordinator-relay>` })
  assert.equal(tool(id, 'Bash', { command: 'ls' }).status, 0, 'the Title check note is no brief failure')
  assert.equal(readFileSync(join(tmpdir(), `claude-setup-role-${id}`), 'utf8'), 'Programmer', 'the role stamp is written on lift')
})

test('hands off: a Social Lead does not write the script or the hook itself, the Writer and others may', () => {
  const as = (role) => { const id = `rolelock${process.pid}x${++n}`; writeFileSync(join(tmpdir(), `claude-setup-role-${id}`), role); return id }
  const lead = as('Social Lead')
  for (const f of ['/w/devlog-script.md', '/w/hook-lines.md']) {
    const r = tool(lead, 'Write', { file_path: f, content: 'x' })
    assert.equal(r.status, 2, f)
    assert.match(r.stderr, /that is the (Writer|Hook Checker)'s work/, f)
  }
  assert.equal(tool(lead, 'Write', { file_path: '/w/week-plan.md', content: 'x' }).status, 0, 'its own work passes')
  assert.equal(tool(as('Writer'), 'Write', { file_path: '/w/devlog-script.md', content: 'x' }).status, 0, 'the owner may')
  assert.equal(tool(as('Programmer'), 'Write', { file_path: '/w/script.mjs', content: 'x' }).status, 0, 'other roles are not bound by this row')
})

// Security review 2026-11-12 (re-land of #450): the gate role is the exact Roster name from the role stamp, never a prefix.
test('only an exact gate role counts as the verdict author', async () => {
  const { authorProblem } = await import('../global/gate-rounds.mjs')
  for (const role of ['Reviewer', 'tester', 'Evaluator']) assert.equal(authorProblem('Gate 5/5 (S, round 1)', { role }), null, role)
  for (const role of ['Reviewer-ish', 'Testers', 'gate', 'Reviewer · x', 'Programmer']) assert.match(authorProblem('Gate 5/5 (S, round 1)', { role }) ?? '', /builder cannot pass/, role)
})
