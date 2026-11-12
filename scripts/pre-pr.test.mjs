import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, mkdtempSync, mkdirSync, copyFileSync, chmodSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { spawnSync } from 'node:child_process'
import { ciSteps, cleanEnv as cleanEnvForTest } from './pre-pr.mjs'

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

test('children of pre-pr never see GIT_DIR and friends (issue #419)', async () => {
  const { cleanEnv } = await import('./pre-pr.mjs')
  const env = cleanEnv({ GIT_DIR: '/x', GIT_WORK_TREE: '/y', GIT_INDEX_FILE: 'i', GIT_COMMON_DIR: 'c', GIT_OBJECT_DIRECTORY: 'o', PATH: '/bin', GIT_AUTHOR_NAME: 'a' })
  assert.deepEqual(Object.keys(env).sort(), ['GIT_AUTHOR_NAME', 'PATH'])
})

test('the hook does not exec a .git/hooks/pre-push that is a copy of itself (issue #419)', () => {
  const dir = mkdtempSync(join(tmpdir(), 'hookloop-'))
  const hook = join(dir, 'global-hook')
  copyFileSync(new URL('../global/git-hooks/pre-push', import.meta.url), hook)
  chmodSync(hook, 0o755)
  const run = (cwd, env) => spawnSync('sh', [hook], { cwd, env: { ...process.env, PRE_PR_SKIP: '1', ...env }, encoding: 'utf8', timeout: 10000 })
  const repo = join(dir, 'repo')
  mkdirSync(repo)
  const g = (...a) => spawnSync('git', a, { cwd: repo, env: cleanEnvForTest(), encoding: 'utf8' })
  g('init', '-q')
  mkdirSync(join(repo, '.git/hooks'), { recursive: true })
  copyFileSync(hook, join(repo, '.git/hooks/pre-push'))
  chmodSync(join(repo, '.git/hooks/pre-push'), 0o755)
  const r = run(repo)
  assert.equal(r.error, undefined) // no timeout = no loop
  assert.equal(r.status, 0)
  // a different own hook still runs
  writeFileSync(join(repo, '.git/hooks/pre-push'), '#!/bin/sh\nexit 7\n')
  assert.equal(run(repo).status, 7)
})

// 2026-11-11: #417 (a fix: PR) went red in CI because pre-pr never saw the title; a body without a title now fails here (from #415).
test('pre-pr fails a body check that has no title, and a fix: title without a check file', () => {
  const dir = mkdtempSync(join(tmpdir(), 'prepr-'))
  const file = join(dir, 'body.md')
  writeFileSync(file, 'Prior art: docs/x -> adapt, because y.\nLessons: docs/github-rules.md\n')
  const run = (...a) => spawnSync('node', ['scripts/pre-pr.mjs', '--quick', '--body', file, ...a], { cwd: new URL('..', import.meta.url).pathname, encoding: 'utf8', env: { ...cleanEnvForTest() } })
  const noTitle = run()
  assert.notEqual(noTitle.status, 0)
  assert.match(noTitle.stdout, /pass --title/)
  const fixTitle = run('--title', 'fix: x')
  assert.notEqual(fixTitle.status, 0)
  assert.match(fixTitle.stdout, /PR body \(Prior art:, Lessons:, fix check\)/)
})

// Plan 2026-11-12, M41: the PR brake runs at PR-open time (--body, not the --quick pre-push run).
test('pre-pr runs the PR brake with --body and counts only a real verdict', () => {
  const src = readFileSync(new URL('./pre-pr.mjs', import.meta.url), 'utf8')
  assert.match(src, /if \(body && !quick\) \{\s*const v = brakeVerdict\(openPrs\(/)
  assert.match(src, /if \(v\.ok !== null\) results\.push\(\['PR brake', v\.ok\]\)/)
})
