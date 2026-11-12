import { test } from 'node:test'
import assert from 'node:assert/strict'
import { staleDrafts, brakeVerdict, LIMIT } from './pr-brake.mjs'

const now = Date.parse('2026-11-12T12:00:00Z')
const pr = (n, hoursOld, draft = true) => ({ number: n, draft, created_at: new Date(now - hoursOld * 3600e3).toISOString() })

test('only drafts older than 24 h count', () => {
  const prs = [pr(1, 25), pr(2, 23), pr(3, 48, false), pr(4, 30)]
  assert.deepEqual(staleDrafts(prs, now).map((p) => p.number), [1, 4])
})

test('more than 10 stale drafts stops a new PR, exactly 10 does not (plan 2026-11-12, M41)', () => {
  assert.equal(LIMIT, 10)
  const ten = Array.from({ length: 10 }, (_, i) => pr(i, 30))
  assert.equal(brakeVerdict(ten, now).ok, true)
  const eleven = [...ten, pr(99, 30)]
  const v = brakeVerdict(eleven, now)
  assert.equal(v.ok, false)
  assert.match(v.message, /11 drafts older than 24 h/)
  assert.match(v.message, /#99/)
})

test('an unreadable PR list never blocks: it warns', () => {
  const v = brakeVerdict(null, now)
  assert.equal(v.ok, null)
  assert.match(v.message, /not checked/)
})
