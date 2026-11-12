import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { buildIndex, buildCard, ruleRows, briefBlock, CARD_MAX } from './coordinator-card.mjs'

test('the card builds, stays under CARD_MAX characters and has its parts', () => {
  const card = buildCard({ hash: 'abc1234', date: '2026-11-08' })
  assert.ok(card.length < CARD_MAX, String(card.length))
  assert.match(card, /^Coordinator card \(claude-setup abc1234, 2026-11-08\)/)
  for (const s of ['Before every reply', 'Thread brief', 'Models', 'Roster', 'Kits', 'COORDINATOR-RULES-INDEX.md']) assert.ok(card.includes(s), s)
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

test('rules a hook already enforces are not repeated on the card (M27 step 6)', () => {
  const card = buildCard({ hash: 'x', date: 'd' })
  for (const gone of ['## Spawn rule', 'Hand off only at a trigger', 'Escalation: stuck twice', '3 failed gate rounds', 'One home per rule']) assert.ok(!card.includes(gone), gone)
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
