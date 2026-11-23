import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { execFileSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { memorySize, MEMORY_LIMIT } from './memory-size.mjs'

const cli = fileURLToPath(new URL('./memory-size.mjs', import.meta.url))

test('memory-size: a 1 KB topic file passes, a 3 KB one is flagged, MEMORY.md is never flagged', () => {
  const dir = mkdtempSync(join(tmpdir(), 'memsize-'))
  try {
    writeFileSync(join(dir, 'small.md'), 'x'.repeat(1024))
    writeFileSync(join(dir, 'big.md'), 'x'.repeat(3072))
    writeFileSync(join(dir, 'MEMORY.md'), 'x'.repeat(9000))
    writeFileSync(join(dir, 'notes.txt'), 'x'.repeat(9000))
    assert.equal(MEMORY_LIMIT, 1536)
    assert.deepEqual(memorySize(dir), [{ file: 'big.md', bytes: 3072 }])
    assert.throws(() => execFileSync('node', [cli, dir], { stdio: 'pipe' }), (e) => e.status === 1 && /big\.md.*3072/.test(String(e.stdout)))
    rmSync(join(dir, 'big.md'))
    assert.deepEqual(memorySize(dir), [])
    assert.match(execFileSync('node', [cli, dir], { encoding: 'utf8' }), /^ok/m)
  } finally { rmSync(dir, { recursive: true, force: true }) }
})

test('memory-size: a missing directory is no error', () => {
  assert.deepEqual(memorySize('/no/such/memory/dir'), [])
  assert.match(execFileSync('node', [cli, '/no/such/memory/dir'], { encoding: 'utf8' }), /no memory directory/)
})
