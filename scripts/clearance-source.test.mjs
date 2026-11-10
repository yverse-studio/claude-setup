// clearance.py cannot run without Blender, so this guards its two #391 crashes at source level.
// Run: node --test scripts/clearance-source.test.mjs
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'

const src = readFileSync(join(dirname(fileURLToPath(import.meta.url)), 'blender', 'clearance.py'), 'utf8')

test('no garment name is split with [1] on _Cos_ (IndexError for names without it)', () => {
  assert.doesNotMatch(src, /split\(\s*["']_Cos_["']\s*\)\s*\[\s*1\s*\]/)
})

test('faces without report= is refused before any fix pass runs', () => {
  const guard = src.indexOf("if FACES and not (REPORT or A.get('case'))")
  assert.ok(guard > 0, 'faces guard missing')
  assert.ok(guard < src.indexOf('def measure'), 'guard must sit before measure()/the fix passes')
})
