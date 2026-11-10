import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

// Blender is not available in CI, so this reads the script: a stale delta.json once rebuilt an approved model (GameDev 2026-11-10).
const src = readFileSync(join(dirname(fileURLToPath(import.meta.url)), 'blender', 'delta_rebuild.py'), 'utf8')

test('the rebuild extracts delta and old-file dump fresh unless --reuse-delta is given', () => {
  assert.match(src, /if '--reuse-delta' not in A or not os\.path\.exists\(delta\):/)
  assert.match(src, /if '--reuse-delta' not in A or not os\.path\.exists\(livedump\):/)
  assert.doesNotMatch(src, /if not os\.path\.exists\(delta\)/)
})

test('--keep-approved fails a rebuild whose body rest moves more than 3 mm', () => {
  assert.match(src, /--keep-approved/)
  assert.match(src, /mm <= 3/)
})
