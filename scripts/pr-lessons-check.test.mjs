// The PR Lessons: line: a named home or "none, because ...", nothing else.
// Run: node --test scripts/pr-lessons-check.test.mjs
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { readFileSync } from 'node:fs'
import { checkLessons, checkPriorArt } from './pr-lessons-check.mjs'

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

test('passes for a hook, a test or a python file, and with CRLF line endings', () => {
  assert.equal(checkLessons(body('Lessons: global/attempt-guard.mjs, scripts/guards.test.mjs')), true)
  assert.equal(checkLessons(body('Lessons: .claude/skills/watch/scripts/watch.py (Learnings)')), true)
  assert.equal(checkLessons(body('Lessons: none, because the check covers it').replace(/\n/g, '\r\n')), true)
})

test('the unfilled PR template fails, so the hint comment never counts as the line', () => {
  assert.equal(checkLessons(readFileSync(new URL('../.github/pull_request_template.md', import.meta.url), 'utf8')), false)
})


test('prior art: a decision with what was checked passes, a bare or empty line fails', () => {
  assert.ok(checkPriorArt(body('Prior art: ECC hooks and superpowers checked; adapt the hook pattern, because ours must read hearthbot tools')))
  assert.ok(checkPriorArt(body('Prior art: none, because this is a one-line typo fix')))
  assert.equal(checkPriorArt(body('Prior art:')), false)
  assert.equal(checkPriorArt(body('Prior art: looked around')), false)
  assert.equal(checkPriorArt('## What changes\nx\n'), false)
})

test('a fix PR names the check that now catches the miss', async () => {
  const { checkFixHasCheck } = await import('./pr-lessons-check.mjs')
  assert.ok(checkFixHasCheck('fix: x', body('Lessons: scripts/guards.test.mjs')))
  assert.ok(checkFixHasCheck('fix(hq): x', body('Lessons: global/rule-guard.mjs, docs/MAP.md')))
  assert.ok(checkFixHasCheck('fix: x', body('Lessons: none, because a typo has nothing to check')))
  assert.equal(checkFixHasCheck('fix: x', body('Lessons: docs/MAP.md')), false, 'a doc line alone is no check')
  assert.ok(checkFixHasCheck('docs: x', body('Lessons: docs/MAP.md')), 'only fix PRs')
  assert.ok(checkFixHasCheck(undefined, body('Lessons: docs/MAP.md')), 'no title given')
})

test('a scored asset PR links the real frames', async () => {
  const { checkRender } = await import('./pr-lessons-check.mjs')
  assert.equal(checkRender('Gate 5/5: the pose clears every contact.'), false)
  assert.ok(checkRender('Gate 5/5: the pose clears every contact.\nRender: .shots/pose-front.png'))
  assert.ok(checkRender('Gate 5/5 for the scene.\nRender: https://example.com/strip'))
  assert.equal(checkRender('Gate 4/5, scene.\nRender: looked at it'), false, 'a claim is no link')
  assert.ok(checkRender('Gate 5/5: the login form works.'), 'no asset, no render line')
})
