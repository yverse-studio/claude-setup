// The hard gate round counter (global/gate-rounds.mjs through global/rule-guard.mjs). Run: node --test scripts/gate-rounds.test.mjs
// Proof for yskills (2026-11-12): round 4 without Fable is refused, round 7 without a card is refused, an incomplete brief is blocked.
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'
import { cli, gateBrief, mergeProblem, parseHeadline, readLedger, recordRound, roundProblem } from '../global/gate-rounds.mjs'

const root = join(fileURLToPath(import.meta.url), '..', '..')
const PR = { owner: 'yverse-studio', repo: 'vacation-game', issue_number: 13 }
const ASSET = 'yverse-studio/vacation-game#13'

// One session: a temp ledger dir, a transcript with the session's model, and the real hook as a child process.
function session(model = 'sonnet-test', extra = []) {
  const dir = mkdtempSync(join(tmpdir(), 'gate-'))
  const transcript = join(dir, 't.jsonl')
  const env = { ...process.env, CLAUDE_SETUP_GATE_DIR: join(dir, 'gate'), CLAUDE_SETUP_RULE_GUARD: '' }
  const lines = [{ type: 'assistant', message: { model, content: [] } }, ...extra]
  writeFileSync(transcript, lines.map((l) => JSON.stringify(l)).join('\n'))
  const hook = (tool, input) => spawnSync(process.execPath, [join(root, 'global/rule-guard.mjs'), 'pre'], { input: JSON.stringify({ cwd: dir, session_id: 's', transcript_path: transcript, tool_name: tool, tool_input: input }), encoding: 'utf8', env })
  const gate = (round, score, tail = '') => hook('mcp__github__add_issue_comment', { ...PR, body: `Gate ${score}/5 (L, round ${round})${tail}\n1 CI pass` })
  const run = (...args) => cli(args, env)
  return { dir, env, hook, gate, run, transcript }
}

test('headline: round, score and importance are read from the gate post', () => {
  assert.deepEqual(parseHeadline('Gate 4.2/5 (L, round 3) [important]'), { round: 3, score: 4.2, important: true })
  assert.deepEqual(parseHeadline('Gate 5/5 (S, round 1), merging'), { round: 1, score: 5, important: false })
  assert.equal(parseHeadline('Gate fail, round 2').score, null)
  assert.equal(parseHeadline('looks good to me'), null)
})

test('rounds 1 to 3 run, round 4 without a Fable director is refused', () => {
  const s = session()
  for (const n of [1, 2, 3]) assert.equal(s.gate(n, '3.8').status, 0, `round ${n}`)
  const r4 = s.gate(4, '4.0')
  assert.equal(r4.status, 2)
  assert.match(r4.stderr, /round 4 .* needs a Fable director/)
  assert.equal(readLedger(join(s.dir, 'gate'), ASSET).rounds.length, 3, 'a refused round is not counted')
})

test('nobody skips ahead or starts over: round 2 right away, and round 1 again, are refused', () => {
  const s = session()
  assert.match(s.gate(2, '3.0').stderr, /skips ahead/)
  s.gate(1, '3.0'); s.gate(2, '3.0')
  assert.match(s.gate(1, '3.0').stderr, /behind the ledger/)
})

test('only a Fable session records the director; then rounds 4 to 6 run and round 7 needs a card', () => {
  const s = session()
  for (const n of [1, 2, 3]) s.gate(n, '3.8')
  const plan = join(s.dir, 'plan.md'); writeFileSync(plan, 'Goal. '.repeat(50))
  const cmd = { command: `node ~/.claude/claude-setup/gate-rounds.mjs direct ${ASSET} --plan ${plan}` }
  assert.match(s.hook('Bash', cmd).stderr, /only a Fable session records the director, this one runs on sonnet-test/)
  const fable = session('fable-test')
  assert.equal(fable.hook('Bash', cmd).status, 0, 'a Fable session may')
  assert.equal(s.run('direct', ASSET, '--plan', plan).code, 0)
  for (const n of [4, 5, 6]) assert.equal(s.gate(n, '4.0').status, 0, `round ${n}`)
  const r7 = s.gate(7, '4.0')
  assert.equal(r7.status, 2)
  assert.match(r7.stderr, /round 7 .* needs a card to yskills/)
})

test('a card must really be posted in the session; then three more rounds run, the tenth needs a new card', () => {
  const card = { type: 'user', message: { content: [{ type: 'tool_result', tool_use_id: 'u1', content: 'card posted cmsg_CARD123' }] } }
  const use = { type: 'assistant', message: { model: 'sonnet-test', content: [{ type: 'tool_use', id: 'u1', name: 'mcp__hearthbot__request_decision', input: {} }] } }
  const s = session('sonnet-test', [use, card])
  const lone = session()
  for (const n of [1, 2, 3]) s.gate(n, '3.8')
  const plan = join(s.dir, 'plan.md'); writeFileSync(plan, 'Goal. '.repeat(50))
  s.run('direct', ASSET, '--plan', plan)
  for (const n of [4, 5, 6]) s.gate(n, '4.0')
  assert.match(s.hook('Bash', { command: `node gate-rounds.mjs card ${ASSET} --ref cmsg_MADEUP999` }).stderr, /not found in this session/)
  assert.equal(s.hook('Bash', { command: `node gate-rounds.mjs card ${ASSET} --ref cmsg_CARD123` }).status, 0)
  assert.equal(lone.hook('Bash', { command: `node gate-rounds.mjs card ${ASSET} --ref cmsg_CARD123` }).status, 2, 'a session that posted no card cannot record one')
  assert.equal(s.run('card', ASSET, '--ref', 'cmsg_CARD123').code, 0)
  for (const n of [7, 8, 9]) assert.equal(s.gate(n, '4.0').status, 0, `round ${n}`)
  assert.equal(s.gate(10, '4.0').status, 2)
})

test('the ledger cannot be edited by hand', () => {
  const s = session()
  assert.match(s.hook('Write', { file_path: `${s.dir}/gate/yverse-studio_vacation-game_13.json`, content: '{}' }).stderr, /written only by gate-rounds\.mjs/)
  assert.match(s.hook('Bash', { command: `echo '{}' > ${s.dir}/gate/x.json` }).stderr, /written only by gate-rounds\.mjs/)
  assert.equal(s.hook('Bash', { command: `cat ${s.dir}/gate/x.json` }).status, 0, 'reading is fine')
})

test('no merge below the threshold (4.2 never merges), 4.5 merges, 4.8 when important', () => {
  const s = session()
  s.gate(1, '4.2')
  const m = s.hook('mcp__github__merge_pull_request', { owner: 'yverse-studio', repo: 'vacation-game', pullNumber: 13 })
  assert.equal(m.status, 2)
  assert.match(m.stderr, /scored 4\.2, under 4\.5: no merge below the threshold, no exception/)
  s.gate(2, '4.5')
  assert.equal(s.hook('mcp__github__merge_pull_request', { owner: 'yverse-studio', repo: 'vacation-game', pullNumber: 13 }).status, 0)
  const imp = session(); imp.gate(1, '4.6', ' [important]')
  assert.equal(imp.hook('mcp__github__merge_pull_request', { owner: 'yverse-studio', repo: 'vacation-game', pullNumber: 13 }).status, 2)
  assert.equal(mergeProblem(recordRound(readLedger('/nonexistent', 'x'), { round: 1, score: 4.8, important: true })), null)
})

test('a PR without any gate round is not blocked at merge (not every repo uses the counter)', () => {
  assert.equal(session().hook('mcp__github__merge_pull_request', { owner: 'a', repo: 'b', pullNumber: 1 }).status, 0)
})

test('a broken ledger path fails closed', () => {
  const s = session()
  s.env.CLAUDE_SETUP_GATE_DIR = join(s.transcript, 'gate') // a file as parent: mkdir fails
  const r = spawnSync(process.execPath, [join(root, 'global/rule-guard.mjs'), 'pre'], { input: JSON.stringify({ cwd: s.dir, session_id: 's', transcript_path: s.transcript, tool_name: 'mcp__github__add_issue_comment', tool_input: { ...PR, body: 'Gate 5/5 (S, round 1)' } }), encoding: 'utf8', env: s.env })
  assert.equal(r.status, 2)
  assert.match(r.stderr, /fail closed/)
})

test('imported history: a PR that already ran 11 rounds needs the director and the card from now on', () => {
  const s = session()
  assert.equal(s.run('init', ASSET, '--round', '6').code, 0)
  assert.match(roundProblem(readLedger(join(s.dir, 'gate'), ASSET), 7), /needs a card/)
  assert.equal(s.run('init', ASSET, '--round', '2').code, 2, 'init runs once')
})

test('briefs: a gate round without Asset, round 4 without the director, a new hub without a picture card are blocked', () => {
  const s = session(); const dir = join(s.dir, 'gate')
  assert.match(gateBrief('Role: Programmer\nRound: 2', { dir }), /needs an `Asset:/)
  assert.match(gateBrief('Role: Programmer\nRound: 4\nAsset: shell', { dir, model: 'sonnet-test' }), /no ledger/)
  s.run('init', 'shell', '--round', '3')
  assert.match(gateBrief('Role: Programmer\nRound: 4\nAsset: shell', { dir, model: 'sonnet-test' }), /needs a Fable director/)
  assert.equal(gateBrief('Role: Planner\nRound: 4\nAsset: shell', { dir, model: 'fable-test' }), '', 'the Fable thread that becomes the director may start')
  assert.match(gateBrief('Role: Designer\nBuild the new hub for the village', { dir }), /Picture card: <link>/)
  assert.equal(gateBrief('Role: Designer\nBuild the new hub\nPicture card: #cmsg_01ABC', { dir }), '')
  assert.equal(gateBrief('Role: Programmer\nFix the login bug', { dir }), '', 'an ordinary brief is not touched')
  assert.equal(gateBrief('Round: 1\nAsset: brand-new', { dir }), '')
})

test('a PR that brings a new hub, start screen or style needs its picture card link', () => {
  const s = session()
  const open = (body) => s.hook('mcp__github__create_pull_request', { owner: 'yverse-studio', repo: 'vacation-game', title: 'feat: new start screen', body })
  assert.match(open('A start screen with a map.').stderr, /Picture card/)
  assert.equal(open('Picture card: https://claude.ai/code/project/x?thread=cmsg_01\nA start screen.').status, 0)
})

test('the ledger CLI is wired in both installers and the cloud setup (checked by scripts/check.mjs too)', () => {
  for (const f of ['install.mjs', 'cloud/setup.sh']) assert.match(readFileSync(join(root, f), 'utf8'), /gate-rounds\.mjs/, f)
})
