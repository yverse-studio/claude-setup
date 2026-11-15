// Pure parts of scripts/role-eval.mjs: no model call. Run: node --test scripts/role-eval.test.mjs
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import { buildArgs, buildRow, modelId, passMark, pluginFiles, roleHash } from './role-eval.mjs'

const MODELS = 'Models: Fable (claude-aa-1): x. Opus (claude-bb-2): y. Haiku (claude-cc-3) z.'
const fixture = JSON.parse(readFileSync(new URL('./fixtures/role-eval/with-without-1run.json', import.meta.url), 'utf8'))
const row = (counts, extra = {}) => buildRow({ role: 'reviewer', hash: 'h', model: 'm', date: 'd', open: 'o', result: counts, ...extra })
const res = (role, base, runs = 3) => ({ costUsd: 1, cases: [{ name: 'c', arms: { with: Array.from({ length: runs }, (_, i) => ({ passed: i < role, graders: [] })), without: Array.from({ length: runs }, (_, i) => ({ passed: i < base })) } }] })

test('a: the command line holds the safety flags', () => {
  const a = buildArgs({ dir: '.', model: 'M', judge: 'J', out: '/o', json: '/j', dir: '/d' }).join(' ')
  for (const f of ['--no-publish', '--output-dir /o', '--model M', '--judge-model J', '--max-cost-usd 3', '--runs 3', '--ablation with-without']) assert.ok(a.includes(f), f)
})
test('b: model id from the first tier word of the Roster cell', () => {
  assert.equal(modelId('Fable; Opus when Fable is unavailable', MODELS), 'claude-aa-1')
  assert.throws(() => modelId('as yskills sets it', MODELS), /no Roster model/)
})
test('c: hash stops at ## Lessons', () => {
  assert.equal(roleHash('# R\n\nrule\n\n## Lessons\n\n- a\n'), roleHash('# R\n\nrule\n\n## Lessons\n\n- a\n- b\n'))
  assert.notEqual(roleHash('# R\n\nrule\n'), roleHash('# R\n\nrule2\n'))
})
test('d: the role is the skill, the case prompt is the task alone', () => {
  const f = pluginFiles('reviewer', '# Reviewer\nrule', { c: { task: 'TASK', graders: { 'g.md': 'G' } } })
  assert.match(f['skills/reviewer/SKILL.md'], /^---\nname: reviewer\n[\s\S]*# Reviewer\nrule/)
  assert.equal(f['evals/c/prompt.md'], 'TASK')
  assert.equal(f['evals/c/graders/g.md'], 'G')
  assert.match(f['evals/c/graders/fired.md'], /type: tool_used\ntool: Skill/)
})
test('e: role 3/3 and baseline 3/3 needs no role file', () => {
  assert.equal(row(res(3, 3)).needsRole, 'no')
  assert.equal(row(res(3, 1)).needsRole, 'yes')
  assert.equal(row(res(3, 2)).needsRole, 'no')
})
test('f: a real result file becomes the row', () => {
  const r = row(fixture)
  assert.deepEqual(r.cases.seeded, { role: 1, baseline: 1, runs: 1, fired: 1 })
  assert.equal(r.costUsd, fixture.costUsd)
})
test('g: pass mark 3 for gate roles, 2 for makers', () => {
  for (const g of ['reviewer', 'tester', 'story-editor', 'playtester']) assert.equal(passMark(g), 3)
  assert.equal(passMark('programmer'), 2)
})
test('h: a second run keeps the first counts as before', () => {
  const first = row(res(1, 1))
  const second = row(res(3, 1), { prev: first })
  assert.equal(second.before.cases.c.role, 1)
  assert.equal(second.cases.c.role, 3)
  assert.equal(row(res(2, 1), { prev: second }).before.cases.c.role, 1)
})
test('i: the open list is the one the caller passes', () => {
  assert.equal(row(res(3, 3)).open, 'o')
})
