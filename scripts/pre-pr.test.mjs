import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import { ciSteps } from './pre-pr.mjs'

test('pre-pr mirrors the CI test line and the three PR checks', () => {
  const yml = readFileSync(new URL('../.github/workflows/ci.yml', import.meta.url), 'utf8')
  const s = ciSteps(yml)
  assert.match(s.tests, /^node --test .*scripts\/pre-pr\.test\.mjs/)
  assert.match(yml, /floor-guard\.mjs --base origin/)
  assert.match(yml, /pr-lessons-check\.mjs/)
  assert.equal(s.check, 'node scripts/check.mjs')
})

test('the git pre-push hook runs pre-pr only where the repo has one', () => {
  const hook = readFileSync(new URL('../global/git-hooks/pre-push', import.meta.url), 'utf8')
  assert.match(hook, /scripts\/pre-pr\.mjs/)
  assert.match(hook, /-f scripts\/pre-pr\.mjs/)
  assert.match(hook, /git-common-dir/) // a repo's own hook still runs
})

test('the hook recognises only real yverse-studio remotes', () => {
  const hook = readFileSync(new URL('../global/git-hooks/pre-push', import.meta.url), 'utf8')
  const block = hook.match(/case "\$remote_url" in[\s\S]*?esac/)[0]
  const ours = (url) => spawnSync('sh', ['-c', `remote_url='${url}'; ${block}; [ -n "$ours" ] && echo yes || echo no`], { encoding: 'utf8' }).stdout.trim()
  assert.equal(ours('https://github.com/yverse-studio/claude-setup'), 'yes')
  assert.equal(ours('git@github.com:yverse-studio/worker.git'), 'yes')
  assert.equal(ours('https://github.com/yverse-studio-evil/x'), 'no')
  assert.equal(ours('https://evil.example/github.com/yverse-studio/x'), 'no')
  assert.equal(ours('https://github.com/other/yverse-studio/x'), 'no')
})

// Companyxy report 2026-11-12, point 11: a doc patch was blocked by 25 failing checks that were already red on main.
test('pre-pr tells a red main from a red branch: main first, as its own PR', async () => {
  const { diagnoseRed } = await import('./pre-pr.mjs')
  assert.equal(diagnoseRed({ failed: [], baseOk: true }), null, 'nothing failed, nothing to say')
  assert.match(diagnoseRed({ failed: ['check.mjs'], baseOk: false }), /main is red[\s\S]*fix main first[\s\S]*own[\s\S]*PR/i)
  assert.match(diagnoseRed({ failed: ['check.mjs'], baseOk: true }), /your branch/i)
  assert.match(diagnoseRed({ failed: ['tests (CI line)'], baseOk: null }), /could not check main/i)
})

test('baseCheckOk runs the failing steps on the base too: red tests on main are not blamed on the branch', async () => {
  const { baseCheckOk } = await import('./pre-pr.mjs')
  const calls = []
  const run = (cmd, argv) => { calls.push([cmd, ...argv].join(' ')); return { status: /--test/.test(argv.join(' ')) ? 1 : 0 } }
  assert.equal(baseCheckOk(['tests (CI line)'], run), false)
  assert.ok(calls.some((c) => /^node --test /.test(c)), 'the CI test line ran on the base')
  assert.equal(baseCheckOk(['check.mjs'], run), true)
})

// cleanup/PLAN.md step 3: the overlap warning (scripts/pr-overlap.mjs) runs inside pre-pr and warns without failing.
test('pre-pr runs the overlap warning and does not count it as a failure', () => {
  const src = readFileSync(new URL('./pre-pr.mjs', import.meta.url), 'utf8')
  assert.match(src, /overlapWarnings\(\{ cwd: root, base \}\)/)
  assert.doesNotMatch(src, /results\.push\(\['overlap/)
})
