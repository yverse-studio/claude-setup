import { test } from 'node:test'
import assert from 'node:assert/strict'
import { existsSync, mkdtempSync, readFileSync, readdirSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { buildIndex, buildCard, ruleRows, briefBlock, CARD_MAX } from './coordinator-card.mjs'

test('the card builds, stays under CARD_MAX characters and has its parts', () => {
  const card = buildCard({ hash: 'abc1234', date: '2026-11-08' })
  assert.ok(card.length < CARD_MAX, String(card.length))
  assert.match(card, /^Coordinator card \(claude-setup abc1234, 2026-11-08\)/)
  for (const s of ['Before every reply', 'Thread brief', 'Models', 'Roster', 'Kits', 'COORDINATOR-RULES-INDEX.md', '3 failed rounds on one asset', '4-6 Fable director', 'Picture card:']) assert.ok(card.includes(s), s)
})

test('the pre-flight carries the masterplan duty (roles/project-manager.md, Masterplan)', () => {
  const card = buildCard({ hash: 'x', date: 'd' })
  const pre = card.split('## Thread brief')[0]
  for (const s of ['PLAN.json', 'plan.mjs', 'Stand', 'write_custom_view']) assert.ok(pre.includes(s), s)
})

test('the card holds the one brief template, copied from docs/templates/thread-brief.md, with its Threads line', () => {
  const card = buildCard({ hash: 'x', date: 'd' })
  const md = readFileSync(new URL('../docs/templates/thread-brief.md', import.meta.url), 'utf8')
  assert.ok(card.includes(briefBlock(md)), 'the card carries the template block unchanged')
  assert.match(card, /^Threads: <list_threads checked/m)
  assert.throws(() => briefBlock('no block here'))
})

test('lines with a hook or no failure on record are off the card, the ones the hook-less chat must keep stay (M27 step 6)', () => {
  const card = buildCard({ hash: 'x', date: 'd' })
  for (const gone of ['## Spawn rule', 'Escalation: stuck twice', '3 failed gate rounds', 'One home per rule']) assert.ok(!card.includes(gone), gone)
  for (const kept of ['second fresh thread for one asset', 'restart is not posted']) assert.ok(card.includes(kept), kept)
})

test('ruleRows reads the table', () => {
  assert.deepEqual(ruleRows('x\n## One home per rule\n\n| Rule | Home | Others |\n|---|---|---|\n| A | `a.md` | b |\n'), [{ rule: 'A', home: '`a.md`' }])
})

test('the rules index holds every row, unclipped, under 20,000 characters', () => {
  const idx = buildIndex({ hash: 'x', date: 'd' })
  assert.ok(idx.length < 20000, String(idx.length))
  assert.ok(idx.split('\n').filter((l) => l.startsWith('- ')).length >= 40)
  assert.match(idx, /^Rules index \(claude-setup x, d\)/)
})

test('the pre-flight carries the vacation-game fixes (facts, role check, dependencies, play before look)', () => {
  const card = buildCard({ hash: 'x', date: 'd' })
  for (const s of ['only from a source read this turn', "same role and topic as the thread's title", 'Depends on: #n', 'real moment', 'Controls and World life']) assert.ok(card.includes(s), s)
})

test('a flag is never taken as the output path (#439: --help wrote a file named --help)', async () => {
  const { spawnSync } = await import('node:child_process')
  const { mkdtempSync, readdirSync } = await import('node:fs')
  const { tmpdir } = await import('node:os')
  const dir = mkdtempSync(`${tmpdir()}/card-`)
  const r = spawnSync('node', [new URL('./coordinator-card.mjs', import.meta.url).pathname, '--help'], { cwd: dir, encoding: 'utf8' })
  assert.equal(r.status, 2)
  assert.deepEqual(readdirSync(dir), [])
})

test('the first rule is the one loop (yskills 2026-11-12): role, playbook, Researcher gap, learnings back; its hooks behave', async () => {
  const card = buildCard({ hash: 'x', date: 'd' })
  const first = card.split('## Before every reply\n\n')[1].split('\n')[0]
  for (const s of ['every thread has a role', 'Role: none', 'playbook, skills and workflows', 'Researcher finds', 'back to claude-setup', 'start receipt', 'unknown role or kit name']) assert.ok(first.includes(s), s)
  const { stamped } = await import('../global/team-guard.mjs')
  assert.equal(stamped('Role: Programmer · Kit: setup · Size: S'), true)
  assert.equal(stamped('Role: none · Kit: setup · Size: S'), true, 'a mini or unclear task may name no role')
  assert.equal(stamped('Kit: setup · Size: S'), false, 'a brief without a Role line is refused')
  assert.match(readFileSync(new URL('../global/rule-guard.mjs', import.meta.url), 'utf8'), /export function threadReceipt\(role, brief/)
})

// S1 of the spec-to-review plan: team-guard refuses an unknown role or kit now, so the card must not tell the chat to check by hand,
// and the index carries one ready Role/Kit/Model/Skills line per Roster role (the chat has no Bash to run scripts/brief.mjs).
test('the card says team-guard refuses an unknown role or kit; the index lists every Roster role with its kits, model and playbook', () => {
  const card = buildCard({ hash: 'x', date: '2026-11-12' })
  assert.match(card, /team-guard refuses a brief with no Role line or an unknown role or kit name/)
  assert.doesNotMatch(card, /neither refuses an unknown role name/)
  const idx = buildIndex({ hash: 'x', date: '2026-11-12' })
  assert.match(idx, /- Programmer: Kit: [^\n]*setup[^\n]*; Model: sonnet; Runs as: [^\n]*; Skills: \.claude\/skills\/operator\/roles\/programmer\.md/)
  const teams = readFileSync(new URL('../docs/TEAMS.md', import.meta.url), 'utf8')
  for (const l of teams.split('\n').filter((x) => /^\| [A-Z][\w ]* \(\[`/.test(x))) assert.ok(idx.includes(`- ${l.slice(2, l.indexOf(' ('))}: Kit:`), l.slice(0, 30))
})

test('M30: the CLI writes one rendered brief file per role next to the card, and the index points at them', () => {
  const dir = mkdtempSync(join(tmpdir(), 'card-'))
  const r = spawnSync(process.execPath, [new URL('./coordinator-card.mjs', import.meta.url).pathname, join(dir, 'COORDINATOR-CARD.md')], { encoding: 'utf8' })
  assert.equal(r.status, 0, r.stderr)
  const files = readdirSync(join(dir, 'briefs'))
  assert.ok(files.includes('programmer.md') && files.includes('reviewer.md') && !files.includes('project-manager.md'), files.join(', '))
  assert.match(readFileSync(join(dir, 'briefs/programmer.md'), 'utf8'), /^# Brief file: Programmer[\s\S]*Model: claude-sonnet[\s\S]*Acceptance:/)
  assert.ok(existsSync(join(dir, 'COORDINATOR-RULES-INDEX.md')))
  assert.match(readFileSync(join(dir, 'COORDINATOR-RULES-INDEX.md'), 'utf8'), /briefs\/<role>\.md/)
})

test('BRIEF-TEMPLATES.md is generated next to the card, and a brief filled from it passes team-guard on the first start', async () => {
  const { missingLines } = await import('../global/team-guard.mjs')
  const dir = mkdtempSync(join(tmpdir(), 'card-'))
  const r = spawnSync(process.execPath, [new URL('./coordinator-card.mjs', import.meta.url).pathname, join(dir, 'COORDINATOR-CARD.md')], { encoding: 'utf8' })
  assert.equal(r.status, 0, r.stderr)
  const tpl = readFileSync(join(dir, 'BRIEF-TEMPLATES.md'), 'utf8')
  assert.match(tpl, /^# Brief templates \(generated by claude-setup scripts\/coordinator-card\.mjs/)
  // fill every <...> the way a coordinator does; the owner's cited message asks "ist das nicht Sota?"
  const fill = (block) => block.replace(/<[^>\n]*>+/g, 'x filled value here').replace(/^Item:.*$/m, 'Item: new').replace(/^Start:.*$/m, 'Start: read MEMORY.md first, then gate.md')
    .replace(/^Gate:.*$/m, 'Gate: n/a size S docs only change') + '\nOwner: ist das nicht Sota?'
  const block = (text) => text.match(/```\n([\s\S]*?)```/)[1]
  for (const [name, text] of [['BRIEF-TEMPLATES.md', tpl], ['briefs/programmer.md', readFileSync(join(dir, 'briefs/programmer.md'), 'utf8')], ['briefs/reviewer.md', readFileSync(join(dir, 'briefs/reviewer.md'), 'utf8')]]) {
    const brief = fill(block(text)).replace(/^Role:.*$/m, (l) => (l.includes('Reviewer') ? 'Role: Reviewer · Kit: setup · Size: M' : 'Role: Programmer · Kit: setup · Size: S'))
    assert.deepEqual(missingLines(brief), [], `${name}: a filled template still misses lines`)
    assert.ok(missingLines(brief.replace(/^Researcher:.*$/m, '')).some((l) => l.startsWith('Researcher:')), `${name}: the research line is the guard's`)
  }
})
