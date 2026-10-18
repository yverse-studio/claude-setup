import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { checkAssets } from './check-assets.mjs'

const template = JSON.parse(readFileSync(new URL('../templates/manifest.json', import.meta.url), 'utf8'))
const templateFiles = ['assets/characters/vita/model.vrm', 'assets/moves/idle.vrma', 'assets/kits/kenney-furniture/chair.glb']

test('template manifest passes with its files', () => {
  assert.deepEqual(checkAssets(template, templateFiles), [])
})

test('a file without a row fails', () => {
  const errors = checkAssets(template, [...templateFiles, 'assets/audio/theme.mp3'])
  assert.ok(errors.some((e) => e.includes('assets/audio/theme.mp3')))
})

test('a row without a file fails', () => {
  const errors = checkAssets(template, templateFiles.slice(1))
  assert.ok(errors.some((e) => e.includes('model.vrm: row has no file')))
})

test('non-commercial licences fail', () => {
  for (const licence of ['CC-BY-NC 4.0', 'personal use only', 'VRM meta: personalNonProfit']) {
    const m = { assets: [{ name: 'x', path: 'assets/x.glb', source: 's', author: 'a', licence, commercial: true }] }
    assert.ok(checkAssets(m, ['assets/x.glb']).some((e) => e.includes('forbids')), licence)
  }
})

test('missing fields fail', () => {
  const m = { assets: [{ name: 'x', path: 'assets/x.glb', licence: 'CC0' }] }
  const errors = checkAssets(m, ['assets/x.glb'])
  assert.ok(errors.some((e) => e.includes('missing source')))
  assert.ok(errors.some((e) => e.includes('commercial is not true')))
})

test('a row without a path reports it instead of throwing', () => {
  const m = { assets: [{ name: 'x', source: 's', author: 'a', licence: 'CC0', commercial: true }] }
  assert.ok(checkAssets(m, []).some((e) => e.includes('missing path')))
})
test('a ./ or leading / on a row path names the same file (#185)', () => {
  for (const path of ['./assets/x.glb', '/assets/x.glb', './assets/x.glb/']) {
    const m = { assets: [{ name: 'x', path, source: 's', author: 'a', licence: 'CC0', commercial: true }] }
    assert.deepEqual(checkAssets(m, ['assets/x.glb']), [], path)
  }
})
