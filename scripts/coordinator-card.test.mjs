import { test } from 'node:test'
import assert from 'node:assert/strict'
import { buildCard, ruleRows, CARD_MAX } from './coordinator-card.mjs'

test('the card builds, stays under 6,000 characters and has its parts', () => {
  const card = buildCard({ hash: 'abc1234', date: '2026-11-08' })
  assert.ok(card.length < CARD_MAX, String(card.length))
  assert.match(card, /^Coordinator card \(claude-setup abc1234, 2026-11-08\)/)
  for (const s of ['Pre-flight', 'Spawn rule', 'One home per rule', 'Roster']) assert.ok(card.includes(s), s)
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
