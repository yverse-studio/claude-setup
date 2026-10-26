import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { styleErrors } from './styles-check.mjs'

const STYLE = '# S\n## Tokens\n## Do\n## Don\'t\n## How to use it\n'
const make = ({ style = STYLE, refs = 'image', row = true, index = true } = {}) => {
  const dir = mkdtempSync(join(tmpdir(), 'st-'))
  if (index) writeFileSync(join(dir, 'README.md'), row ? '| [a](a/STYLE.md) |\n' : '| none |\n')
  mkdirSync(join(dir, 'a'))
  if (style !== null) writeFileSync(join(dir, 'a', 'STYLE.md'), style)
  if (refs === 'image') { mkdirSync(join(dir, 'a', 'refs')); writeFileSync(join(dir, 'a', 'refs', 'x.png'), '') }
  if (refs === 'text') { mkdirSync(join(dir, 'a', 'refs')); writeFileSync(join(dir, 'a', 'refs', 'x.txt'), '') }
  if (refs === 'file') writeFileSync(join(dir, 'a', 'refs'), '')
  return dir
}

test('a complete style passes', () => assert.deepEqual(styleErrors(make()), []))
test('no STYLE.md', () => assert.match(styleErrors(make({ style: null }))[0], /no STYLE\.md/))
test('no refs folder', () => assert.match(styleErrors(make({ refs: 'none' })).join(), /refs: no image/))
test('refs without an image', () => assert.match(styleErrors(make({ refs: 'text' })).join(), /refs: no image/))
test('refs is a file, not a folder', () => assert.match(styleErrors(make({ refs: 'file' })).join(), /refs: no image/))
test('missing template section', () => assert.match(styleErrors(make({ style: '# S\n## Tokens\n' })).join(), /lacks "## Do"/))
test('missing index row', () => assert.match(styleErrors(make({ row: false })).join(), /no row for a/))
test('missing README.md is an error line', () => assert.match(styleErrors(make({ index: false })).join(), /README\.md: missing/))
test('missing styles folder is an error line', () => assert.deepEqual(styleErrors(join(tmpdir(), 'nope-styles')), ['styles/: missing']))
