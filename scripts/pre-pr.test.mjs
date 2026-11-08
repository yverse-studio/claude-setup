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
