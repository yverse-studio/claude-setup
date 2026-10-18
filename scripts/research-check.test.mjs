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
test('table header and divider rows are not claims, body rows need a source', () => {
  const t = (row) => run(`# R\n| Product | Price |\n|:--|--|\n${row}\n## Sources\n- https://x\nNot checked:\n`)
  assert.equal(t('| a | 5 (https://x) |').status, 0)
  assert.match(t('| a | 5 |').stderr, /line 4 has no source/)
})
test('a Resources heading is not a Sources section', () => {
  assert.match(run('# R\n- c (https://x)\n## Resources\nNot checked:\n').stderr, /no "Sources"/)
})
test('claims after the Not checked list are still checked', () => {
  assert.match(run('# R\nNot checked:\n- gap\n## Sources\n- https://x\n## More\n- claim\n').stderr, /line 7 has no source/)
})
test('sentences and numbered items need a source too', () => {
  assert.match(run('# R\nFoo is free.\n1. Bar is cheap\n## Sources\n- https://x\nNot checked:\n').stderr, /line 2[\s\S]*line 3/)
})
test('a sentence after the Not checked list needs a source', () => {
  assert.match(run('# R\n## Sources\n- https://x\nNot checked:\n- gap\n\nFoo costs 5 euro.\n').stderr, /line 7 has no source/)
})
test('a host:port in backticks is not a source', () => {
  assert.match(run('# R\n- runs on `localhost:8787`\n## Sources\n- https://x\nNot checked:\n').stderr, /line 2 has no source/)
})
test('a heading that merely mentions sources is not a Sources section', () => {
  assert.match(run('# R\n- c (https://x)\n## No sources found\nNot checked:\n').stderr, /no "Sources"/)
})
