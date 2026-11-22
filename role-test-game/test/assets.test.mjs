// Gate goal 5 and the figure budget of goal 4, as a test: every shipped asset has a manifest row with
// name, sha256 and licence; the hashes match the files; nothing but "sfw"; no .blend, no source download.
import test from 'node:test'
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'
import { checkAssets } from '../scripts/check-assets.mjs'

const manifest = JSON.parse(readFileSync('assets/manifest.json', 'utf8'))
const walk = (d) => readdirSync(d).flatMap((n) => (statSync(join(d, n)).isDirectory() ? walk(join(d, n)) : [relative('.', join(d, n)).split('\\').join('/')]))
const files = walk('assets').filter((f) => f !== 'assets/manifest.json')

test('every file has a manifest row and every row a file, licences allow a paid game', () => {
  assert.deepEqual(checkAssets(manifest, files), [])
})

test('each row has a name, a sha256 that matches the file, and a licence', () => {
  for (const a of manifest.assets) {
    assert.ok(a.name && a.licence, `${a.path}: name or licence missing`)
    assert.match(a.sha256, /^[0-9a-f]{64}$/, `${a.path}: sha256`)
    assert.equal(createHash('sha256').update(readFileSync(a.path)).digest('hex'), a.sha256, `${a.path}: sha256 does not match the file`)
  }
})

test('nothing is rated other than sfw, no .blend and no source download ships', () => {
  assert.ok(manifest.assets.every((a) => a.rating === 'sfw'))
  const all = walk('.').filter((f) => !f.startsWith('node_modules/') && !f.startsWith('dist/') && !f.startsWith('.git/') && !f.startsWith('.shots/') && !f.startsWith('test-results/'))
  assert.deepEqual(all.filter((f) => /\.(blend\d*|zip|7z|rar|tar|gz)$/i.test(f)), [])
  assert.deepEqual(all.filter((f) => /(^|\/)source\//i.test(f)), [])
})

test('the figure file stays within 5 MB (gate goal 4; the triangle count is read in the browser by journey.mjs)', () => {
  const fig = manifest.assets.find((a) => a.path.endsWith('player.fbx'))
  assert.ok(fig && existsSync(fig.path))
  assert.ok(statSync(fig.path).size <= 5 * 1024 * 1024)
})
