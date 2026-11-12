import { test } from 'node:test'
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { overlaps, otherBranches, rank } from './pr-overlap.mjs'

test('overlaps lists the files two changes share, per other change, and skips the unrelated ones', () => {
  const mine = ['docs/MAP.md', 'scripts/a.mjs']
  const others = [
    { name: 'claude/443', files: ['docs/MAP.md', 'docs/TEAMS.md'] },
    { name: 'claude/444', files: ['scripts/b.mjs'] },
    { name: 'claude/445', files: ['scripts/a.mjs', 'docs/MAP.md'] },
  ]
  assert.deepEqual(overlaps(mine, others), [
    { name: 'claude/443', files: ['docs/MAP.md'] },
    { name: 'claude/445', files: ['docs/MAP.md', 'scripts/a.mjs'] },
  ])
  assert.deepEqual(overlaps([], others), [])
})

test('rank puts a real overlap before one that only shares the hot files (MAP, CI list)', () => {
  const list = [{ name: 'a', files: ['docs/MAP.md', '.github/workflows/ci.yml'] }, { name: 'b', files: ['scripts/pre-pr.mjs'] }, { name: 'c', files: ['docs/MAP.md', 'scripts/pre-pr.mjs', 'docs/TEAMS.md'] }]
  assert.deepEqual(rank(list).map((o) => o.name), ['c', 'b', 'a'])
})

// Real branches off one main (the #443/#444 case): the check sees an overlap from either side, but not a merged, squash-merged,
// stale or self branch (squash merges leave their branch behind, and 37 of them drowned the first version in noise).
test('otherBranches finds a recent branch that touches the same file, not merged, squash-merged, stale or self', () => {
  const dir = mkdtempSync(join(tmpdir(), 'overlap-'))
  const git = (env, ...a) => execFileSync('git', ['-c', 'user.name=t', '-c', 'user.email=t@t', ...a], { cwd: dir, encoding: 'utf8', env: { ...process.env, ...env } }).trim()
  const put = (f, s) => writeFileSync(join(dir, f), s)
  git({}, 'init', '-q', '-b', 'main')
  put('shared.md', 'base\n'); put('other.md', 'base\n'); put('sq.md', 'base\n')
  git({}, 'add', '-A'); git({}, 'commit', '-q', '-m', 'base')
  const root = git({}, 'rev-parse', 'HEAD')
  git({}, 'checkout', '-q', '-b', 'merged'); put('shared.md', 'merged\n'); git({}, 'commit', '-qam', 'feat: merged')
  git({}, 'checkout', '-q', 'main'); git({}, 'merge', '-q', '--ff-only', 'merged')
  git({}, 'checkout', '-q', '-b', 'pr-squashed', root); put('sq.md', 'sq\n'); git({}, 'commit', '-qam', 'feat: squashed work')
  git({}, 'checkout', '-q', 'main'); git({}, 'merge', '-q', '--squash', 'pr-squashed'); git({}, 'commit', '-q', '-m', 'feat: squashed work (#9)\n\n* feat: squashed work')
  git({}, 'checkout', '-q', '-b', 'pr-443', root); put('shared.md', '443\n'); git({}, 'commit', '-qam', 'feat: 443')
  git({}, 'checkout', '-q', '-b', 'pr-unrelated', root); put('other.md', 'x\n'); git({}, 'commit', '-qam', 'feat: unrelated')
  git({}, 'checkout', '-q', '-b', 'pr-stale', root); put('shared.md', 'old\n'); git({ GIT_COMMITTER_DATE: '2020-01-01T00:00:00Z' }, 'commit', '-qam', 'feat: stale')
  git({}, 'checkout', '-q', '-b', 'pr-444', 'main'); put('shared.md', '444\n'); git({}, 'commit', '-qam', 'feat: 444')
  const found = otherBranches({ cwd: dir, base: 'main', head: 'pr-444' })
  assert.deepEqual(found.map((b) => b.name).sort(), ['pr-443', 'pr-unrelated'])
  assert.deepEqual(overlaps(['shared.md'], found), [{ name: 'pr-443', files: ['shared.md'] }])
  git({}, 'checkout', '-q', '--detach', 'HEAD') // a detached HEAD must not warn about its own branch
  assert.deepEqual(otherBranches({ cwd: dir, base: 'main', head: 'HEAD' }).map((b) => b.name).sort(), ['pr-443', 'pr-unrelated'])
  rmSync(dir, { recursive: true, force: true })
})
