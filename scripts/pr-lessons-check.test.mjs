// The PR Lessons: line: a named home or "none, because ...", nothing else.
// Run: node --test scripts/pr-lessons-check.test.mjs
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { checkLessons } from './pr-lessons-check.mjs'

const body = (line) => `## What changes\nx\n\n${line}\n`

test('passes with a reason', () => {
  assert.ok(checkLessons(body('Lessons: none, because the fix is covered by a test')))
})
test('passes with a path and section', () => {
  assert.ok(checkLessons(body('Lessons: .claude/skills/operator/roles/programmer.md (Lessons)')))
})
test('passes with two paths', () => {
  assert.ok(checkLessons(body('Lessons: scripts/pr-lessons-check.mjs, .claude/skills/operator/gate.md (Checks)')))
})
test('fails without a line', () => {
  assert.equal(checkLessons('## What changes\nx\n'), false)
})
test('fails on an empty line', () => {
  assert.equal(checkLessons(body('Lessons:')), false)
  assert.equal(checkLessons(body('Lessons: ')), false)
})
test('fails on none without a because', () => {
  assert.equal(checkLessons(body('Lessons: none')), false)
})
test('fails on a too short reason', () => {
  assert.equal(checkLessons(body('Lessons: none, because x')), false)
})
