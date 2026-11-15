// #601: the project-files root holds entry files only. Run: node --test scripts/root-check.test.mjs
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'
import { entryFiles, strayFiles } from './root-check.mjs'

const cli = join(fileURLToPath(import.meta.url), '..', 'root-check.mjs')
const run = (root) => spawnSync(process.execPath, [cli, root], { encoding: 'utf8' })
function root(t, files = {}, dirs = []) {
  const d = mkdtempSync(join(tmpdir(), 'root-check-'))
  t.after(() => rmSync(d, { recursive: true, force: true }))
  for (const [n, c] of Object.entries(files)) writeFileSync(join(d, n), c)
  for (const n of dirs) mkdirSync(join(d, n))
  return d
}

test('a root with entry files and folders only is OK', (t) => {
  const r = run(root(t, { 'MAP.md': '# map', 'FIND.md': '', 'PROVEN.md': '', 'PIPELINE.md': '', 'README.md': '' }, ['lib', 'gate']))
  assert.equal(r.status, 0, r.stdout)
  assert.match(r.stdout, /^OK /)
})

test('one stray .png is RED, named, and the exit is 1', (t) => {
  const r = run(root(t, { 'MAP.md': '# map', 'blender-proof.png': 'x', 'notes.log': 'y' }))
  assert.equal(r.status, 1)
  assert.match(r.stdout, /RED [^\n]*blender-proof\.png is not an entry file/)
  assert.match(r.stdout, /RED [^\n]*notes\.log/)
})

test('the Entry files line of MAP.md is the allow list; MAP.md always counts; a folder is never a stray; a dot file is not read', (t) => {
  const d = root(t, { 'MAP.md': '# map\n- **Entry files:** STATUS.md, `ROSTER.md`\n', 'STATUS.md': '', 'ROSTER.md': '', 'FIND.md': '', '.layout.json': '{}' }, ['unsorted.png'])
  assert.deepEqual([...entryFiles(d)].sort(), ['MAP.md', 'ROSTER.md', 'STATUS.md'], 'MAP.md is not named on the line and still counts')
  assert.deepEqual(strayFiles(d), ['FIND.md'], 'FIND.md is no entry file of this project')
})

test('a missing root says so and exits 2; no argument exits 2', (t) => {
  assert.equal(run(join(tmpdir(), 'root-check-no-such-folder')).status, 2)
  assert.equal(spawnSync(process.execPath, [cli], { encoding: 'utf8' }).status, 2)
})
