import { test } from 'node:test'
import assert from 'node:assert/strict'
import { buildIndex, buildCard, ruleRows, CARD_MAX } from './coordinator-card.mjs'

test('the card builds, stays under CARD_MAX characters and has its parts', () => {
  const card = buildCard({ hash: 'abc1234', date: '2026-11-08' })
  assert.ok(card.length < CARD_MAX, String(card.length))
  assert.match(card, /^Coordinator card \(claude-setup abc1234, 2026-11-08\)/)
  for (const s of ['Pre-flight', 'Spawn rule', 'One home per rule', 'Roster']) assert.ok(card.includes(s), s)
})

test('the pre-flight carries the masterplan duty (roles/project-manager.md, Masterplan)', () => {
  const card = buildCard({ hash: 'x', date: 'd' })
  const pre = card.split('## Spawn rule')[0]
  for (const s of ['## Masterplan', 'update_memory', 'Stand', 'write_custom_view', 'roles/project-manager.md']) assert.ok(pre.includes(s), s)
})

test('the index lines are rule → home, cut at 60 characters', () => {
  const card = buildCard({ hash: 'x', date: 'd' })
  const lines = card.split('## Where is rule X?')[1].split('\n').filter((l) => l.startsWith('- '))
  assert.ok(lines.length > 5)
  for (const l of lines) assert.match(l, /^- .{1,60} → /)
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
  for (const s of ['only from a source read this turn', "thread title's role", 'Depends on: #n', 'real moment', 'Controls and World life']) assert.ok(card.includes(s), s)
})
