import { test } from 'node:test'
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const run = (text) => {
  const f = join(mkdtempSync(join(tmpdir(), 'rc-')), 'r.md')
  writeFileSync(f, text)
  return spawnSync('node', ['scripts/research-check.mjs', f], { encoding: 'utf8' })
}

test('a report with sources and a Not checked list passes', () => {
  assert.equal(run('# R\n- claim (`a.md:3`)\n## Sources\n- https://x\nNot checked:\n- foo\n').status, 0)
})
test('a claim without a source fails', () => {
  assert.match(run('# R\n- claim\n## Sources\n- https://x\nNot checked:\n').stderr, /line 2 has no source/)
})
test('a report without Not checked fails', () => {
  assert.match(run('# R\n## Sources\n- https://x\n').stderr, /Not checked/)
})
