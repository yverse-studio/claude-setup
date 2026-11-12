// M28 PR 1: the structure check of a task's PLAN.md (plan 2026-11-12-M28-short-plan.md). Each rule has a test that feeds it a violation.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { join } from 'node:path'
import { checkPlan } from './task-plan-check.mjs'

const root = join(fileURLToPath(import.meta.url), '..', '..')
const ok = readFileSync(join(root, 'scripts/fixtures/task-plan-ok.md'), 'utf8')
const template = readFileSync(join(root, 'docs/templates/task-plan.md'), 'utf8')
const without = (text, re) => text.replace(re, '')

test('the empty template fails and a filled fixture passes', () => {
  assert.ok(checkPlan(template).length > 0, 'the template is not a plan')
  assert.deepEqual(checkPlan(ok, { topic: 'HUD/UI' }), [])
})

test('every gap is listed at once, a missing Acceptance section among them', () => {
  const gaps = checkPlan(without(without(ok, /## Acceptance[\s\S]*?(?=## Gate point)/), /## Risks[\s\S]*?(?=## Acceptance|## Gate point)/))
  assert.ok(gaps.some((g) => /Acceptance/.test(g)))
  assert.ok(gaps.some((g) => /Risks/.test(g)))
})

test('References need a MAIN line', () => {
  assert.ok(checkPlan(ok.replace('- MAIN: ', '- ')).some((g) => /MAIN/.test(g)))
})

test('a hud or look topic needs a card link in References, other topics do not', () => {
  const noCard = ok.replace('cmsg_01AbCdEf12345', 'a screenshot')
  assert.ok(checkPlan(noCard, { topic: 'HUD/UI' }).some((g) => /cmsg_/.test(g)))
  assert.ok(checkPlan(noCard, { topic: 'look' }).some((g) => /cmsg_/.test(g)))
  assert.deepEqual(checkPlan(noCard, { topic: 'Hair' }), [])
})

test('a Measured line without a number, unit or command fails; a By eye line needs a view and its reference', () => {
  assert.ok(checkPlan(ok.replace('- Contrast ratio at least 4.5.', '- It looks crisp.')).some((g) => /Measured/.test(g)))
  assert.ok(checkPlan(ok.replace('- Phone view of the full bar against the reference card.', '- Looks nice.')).some((g) => /By eye/.test(g)))
  assert.ok(checkPlan(without(ok, /### By eye[\s\S]*?(?=## Gate point)/)).some((g) => /By eye/.test(g)), 'the list itself is required')
})

test('Gate point names asset and topic, Still needed is a list or nothing', () => {
  assert.ok(checkPlan(ok.replace('Asset: duck-hud\n', '')).some((g) => /Gate point/.test(g)))
  assert.ok(checkPlan(ok.replace('Topic: HUD/UI\n', '')).some((g) => /Gate point/.test(g)))
  assert.ok(checkPlan(ok.replace(/## Still needed[\s\S]*$/, '## Still needed\n')).some((g) => /Still needed/.test(g)))
  assert.deepEqual(checkPlan(ok.replace('nothing', '- the card answer from yskills'), { topic: 'HUD/UI' }), [])
})

test('a prose line under Still needed fails, only a list or the word nothing passes', () => {
  assert.ok(checkPlan(ok.replace('nothing', 'the card answer'), { topic: 'HUD/UI' }).some((g) => /Still needed/.test(g)))
  assert.ok(checkPlan(ok.replace('nothing', 'nothing\nand more prose'), { topic: 'HUD/UI' }).some((g) => /Still needed/.test(g)))
  assert.deepEqual(checkPlan(ok.replace('nothing', 'Nichts'), { topic: 'HUD/UI' }), [])
})

test('German headings count the same', () => {
  const de = ok.replace('## Goal', '## Ziel').replace('## References', '## Referenzen').replace('## Method', '## Methode').replace('## Risks', '## Risiken')
    .replace('## Acceptance', '## Kriterien').replace('### Measured', '### Gemessen').replace('### By eye', '### Nach Sicht').replace('## Gate point', '## Gate-Punkt').replace('## Still needed', '## Ich brauche noch')
  assert.deepEqual(checkPlan(de, { topic: 'HUD/UI' }), [])
})

test('the CLI exits 1 with the gaps on the template and 0 on the fixture', () => {
  const run = (f, ...extra) => spawnSync(process.execPath, [join(root, 'scripts/task-plan-check.mjs'), join(root, f), ...extra], { encoding: 'utf8' })
  const bad = run('docs/templates/task-plan.md')
  assert.equal(bad.status, 1)
  assert.match(bad.stderr, /Goal/)
  assert.equal(run('scripts/fixtures/task-plan-ok.md', '--topic', 'HUD/UI').status, 0)
})
