// scripts/ref_sheet.py (GameDev 2026-11-18: look checks ran on a T-pose without the owner's refs).
// Run: node --test scripts/ref-sheet.test.mjs
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'

const script = join(fileURLToPath(import.meta.url), '..', 'ref_sheet.py')
const py = (code) => spawnSync('python3', ['-c', code], { encoding: 'utf8' })
const run = (args) => spawnSync('python3', [script, ...args], { encoding: 'utf8' })
const hasPil = py('import PIL').status === 0

function fixture() {
  const d = mkdtempSync(join(tmpdir(), 'refsheet-'))
  for (const dir of ['adult', 'blob']) mkdirSync(join(d, dir))
  const mk = (p, w, h) => py(`from PIL import Image; Image.new('RGB',(${w},${h}),(120,90,60)).save(${JSON.stringify(p)})`)
  mk(join(d, 'still.png'), 400, 300); mk(join(d, 'adult', 'a.png'), 200, 400); mk(join(d, 'adult', 'b.jpg'), 300, 300)
  mk(join(d, 'blob', 'c.png'), 250, 500); mk(join(d, 'sheet.png'), 900, 450)
  return d
}

test('the sheet holds all four groups and is written', { skip: !hasPil }, () => {
  const d = fixture()
  const r = run(['--still', join(d, 'still.png'), '--adult-refs', join(d, 'adult'), '--blobcg', join(d, 'blob'), '--sheet', join(d, 'sheet.png'), '--out', join(d, 'out', 's.jpg'), '--height', '100'])
  assert.equal(r.status, 0, r.stderr)
  assert.ok(existsSync(join(d, 'out', 's.jpg')))
  assert.match(r.stdout, /IN-SCENE STILL: 1.*OWNER REFS \(adult-refs\): 2.*BlobCG REFS: 1.*APPROVED SHEET: 1/)
})

test('a missing still or an empty ref folder stops the sheet, so no gate scores without refs', { skip: !hasPil }, () => {
  const d = fixture()
  const base = ['--adult-refs', join(d, 'adult'), '--blobcg', join(d, 'blob'), '--sheet', join(d, 'sheet.png'), '--out', join(d, 's.jpg')]
  const noStill = run(base)
  assert.equal(noStill.status, 1)
  assert.match(noStill.stderr, /IN-SCENE STILL/)
  mkdirSync(join(d, 'empty'))
  const noRefs = run(['--still', join(d, 'still.png'), '--adult-refs', join(d, 'empty'), '--blobcg', join(d, 'blob'), '--sheet', join(d, 'sheet.png'), '--out', join(d, 's.jpg')])
  assert.equal(noRefs.status, 1)
  assert.match(noRefs.stderr, /OWNER REFS/)
})
