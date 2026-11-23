import { test } from 'node:test'
import assert from 'node:assert/strict'
import { topicHits, countTopics, compareTopics } from './topic-claims.mjs'

const topics = (s) => topicHits(s).map((h) => h.topic).sort()

test('topicHits finds the four workflow topics', () => {
  assert.deepEqual(topics('Max two working threads at a time.'), ['threadCount'])
  assert.deepEqual(topics('At 5/5 the gate merges (author thread for S and M, gate thread for L).'), ['gateWhere', 'whoMerges'])
  assert.ok(topics('A fresh Opus reviewer gates each piece.').includes('gateModel'))
})

test('unrelated sentences are no hits', () => {
  assert.deepEqual(topics('the thread closes when the PR merges.'), [])
  assert.deepEqual(topics('At most 2 Blender processes at once on 16 GB RAM'), [])
})

test('a sentence that points at TEAMS.md or gate.md is not counted', () => {
  assert.deepEqual(topics('The gate merges at 5/5 (`gate.md`, Merge policy).'), [])
  assert.deepEqual(topics('Max two working threads (`TEAMS.md`).'), [])
})

test('countTopics skips the home file and allowed sentences', () => {
  const s = 'at most one thread writes the same rig or `.blend` at a time.'
  const f = '.claude/skills/operator/roles/animator.md'
  assert.equal(countTopics([[f, `- ${s}`]], []).perFile[f], 1)
  assert.equal(countTopics([[f, `- ${s}`]], [{ file: f, starts: 'at most one thread writes', reason: 'x' }]).perFile[f] ?? 0, 0)
  assert.equal(countTopics([['docs/TEAMS.md', 'Max two working threads at a time.']], []).hits.length, 0)
  assert.equal(countTopics([['docs/WORKFLOW.md', 'Max two working threads at a time.']], []).hits[0].topic, 'threadCount')
})

test('compareTopics errors only for a rise above baseline', () => {
  assert.match(compareTopics({ perFile: { 'a.md': 2 } }, { 'a.md': 1 }).join('\n'), /a\.md/)
  assert.match(compareTopics({ perFile: { 'b.md': 1 } }, {}).join('\n'), /b\.md/)
  assert.deepEqual(compareTopics({ perFile: { 'a.md': 1 } }, { 'a.md': 1 }), [])
  assert.deepEqual(compareTopics({ perFile: { 'a.md': 0 } }, { 'a.md': 3 }), [])
})

test('countTopics returns the allow entries that matched no sentence', () => {
  const f = '.claude/skills/operator/roles/animator.md'
  const used = { file: f, starts: 'at most one thread writes', reason: 'x' }
  const stale = { file: f, starts: 'a sentence that is gone', reason: 'x' }
  const r = countTopics([[f, '- at most one thread writes the same rig or `.blend` at a time.']], [used, stale])
  assert.deepEqual(r.unusedAllow, [stale])
})
