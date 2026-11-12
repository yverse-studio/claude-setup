import { test } from 'node:test'
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { mkdtempSync, writeFileSync, mkdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { overlaps, otherBranches } from './pr-overlap.mjs'

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

// Two real branches off one main that both edit shared.md (the #443/#444 case): the check sees it from either side.
test('otherBranches finds a local branch that touches the same file, not a merged or unrelated one', () => {
  const dir = mkdtempSync(join(tmpdir(), 'overlap-'))
  const git = (...a) => execFileSync('git', ['-c', 'user.name=t', '-c', 'user.email=t@t', ...a], { cwd: dir, encoding: 'utf8' })
  const put = (f, s) => { mkdirSync(join(dir, f, '..'), { recursive: true }); writeFileSync(join(dir, f), s) }
  git('init', '-q', '-b', 'main')
  put('shared.md', 'base\n'); put('other.md', 'base\n')
  git('add', '-A'); git('commit', '-q', '-m', 'base')
  git('checkout', '-q', '-b', 'merged'); put('shared.md', 'merged\n'); git('commit', '-qam', 'm')
  git('checkout', '-q', 'main'); git('merge', '-q', '--ff-only', 'merged')
  git('checkout', '-q', '-b', 'pr-443', 'main~1'); put('shared.md', '443\n'); git('commit', '-qam', '443')
  git('checkout', '-q', '-b', 'pr-unrelated', 'main~1'); put('other.md', 'x\n'); git('commit', '-qam', 'u')
  git('checkout', '-q', '-b', 'pr-444', 'main'); put('shared.md', '444\n'); git('commit', '-qam', '444')
  const found = otherBranches({ cwd: dir, base: 'main', head: 'pr-444' })
  assert.deepEqual(found.map((b) => b.name).sort(), ['pr-443', 'pr-unrelated'])
  assert.deepEqual(overlaps(['shared.md'], found), [{ name: 'pr-443', files: ['shared.md'] }])
})
