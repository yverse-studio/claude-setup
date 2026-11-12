// Companyxy report 2026-11-12, points 3 to 8: each gate below was red (missing) before scripts/pipeline-gates.mjs existed.
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { mkdtempSync, mkdirSync, writeFileSync, utimesSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { sheetProblems, fitReportProblems, lookStateProblems, driverProblems, stalePreviews, refreshPreview } from './pipeline-gates.mjs'

const SHEET = `# Character sheet: Mira
## Story (stage 1)
- Age: 24
## Look (stage 2, locked by the owner)
- Height: 168 cm
- Measurements: 86 / 62 / 92 cm
- Base body and preset: female base, BT_curvy 0.6
- Silhouette numbers: waist girth 62 cm, hip gap 4 cm
- Hair: copper like an old penny, shoulder length, wavy
- Palette: copper, cream, teal
## Approval
- Look-Lock: https://claude.ai/code/card/abc · 2026-11-12`

test('point 3: no model without a cast sheet that has measures and a look lock', () => {
  assert.deepEqual(sheetProblems(SHEET), [])
  assert.match(sheetProblems(SHEET.replace('- Measurements: 86 / 62 / 92 cm', '- Measurements: <bust / waist / hips cm>')).join('|'), /Measurements/)
  assert.match(sheetProblems(SHEET.replace('Age: 24', 'Age: 17')).join('|'), /Age/)
  assert.match(sheetProblems(SHEET.replace(/- Look-Lock:.*/, '- Look-Lock: <owner card link> · <date>')).join('|'), /Look-Lock/)
  assert.match(sheetProblems(SHEET.replace(/- Look-Lock:.*/, '')).join('|'), /Look-Lock/)
  assert.match(sheetProblems(SHEET.replace('Height: 168 cm', 'Height: tall')).join('|'), /Height/)
})

test('point 4: a fit report must cover every BT preset and every CH key, each inside the limit', () => {
  const state = (mm = 1) => ({ depth_mm: mm, face_deep_pct: 0.1 })
  const piece = { after: { rika: state(), saki: state(), BT_slim: state(), BT_curvy: state(), char_rika: state(), char_yumeka: state(), char_lily: state(), pass: true } }
  const report = { _inventory: { BT: ['BT_slim', 'BT_curvy'], CH: ['CH_rika', 'CH_yumeka', 'CH_lily'] }, CL_vest: { top: piece } }
  assert.deepEqual(fitReportProblems(report), [])
  const missing = structuredClone(report); delete missing.CL_vest.top.after.char_lily; delete missing.CL_vest.top.after.BT_curvy
  assert.match(fitReportProblems(missing).join('|'), /CL_vest\/top[^|]*char_lily[^|]*BT_curvy|CL_vest\/top[^|]*BT_curvy[^|]*char_lily/)
  const clip = structuredClone(report); clip.CL_vest.top.after.char_yumeka = state(35)
  assert.match(fitReportProblems(clip).join('|'), /char_yumeka[^|]*35/)
  assert.match(fitReportProblems({ CL_vest: { top: piece } }).join('|'), /_inventory/, 'no inventory, no gate')
})

test('point 5: every look state sets every look switch, and no driver has a dead variable', () => {
  const ok = { switches: ['tights_on', 'shoes_on'], states: { nackt: { tights_on: 0, shoes_on: 0 }, buero: { tights_on: 1, shoes_on: 1 } } }
  assert.deepEqual(lookStateProblems(ok), [])
  const bad = { switches: ['tights_on', 'shoes_on'], states: { nackt: { shoes_on: 0 }, buero: { tights_on: 1, shoes_on: 1 } } }
  assert.match(lookStateProblems(bad).join('|'), /nackt[^|]*tights_on/)
  assert.match(lookStateProblems({ switches: [], states: {} }).join('|'), /no look switches/)
  const drv = (expression, vars, type = 'SCRIPTED') => ({ owner: 'Rika', path: 'key_blocks["Foot_In_Shoe"].value', type, expression, variables: vars })
  const good = drv('toe + heel', [{ name: 'toe', targets: [{ id: 'Armature', data_path: 'pose.bones["toe"].rotation_euler[0]', resolved: true }] }, { name: 'heel', targets: [{ id: 'Armature', data_path: 'x', resolved: true }] }])
  assert.deepEqual(driverProblems([good]), [])
  const dead = drv('toe', [{ name: 'toe', targets: [{ id: 'Armature', data_path: 'x', resolved: true }] }, { name: 'ankle', targets: [{ id: 'Armature', data_path: 'y', resolved: true }] }])
  assert.match(driverProblems([dead]).join('|'), /ankle[^|]*not used/)
  const unresolved = drv('a', [{ name: 'a', targets: [{ id: 'Armature', data_path: 'pose.bones["gone"].x', resolved: false }] }])
  assert.match(driverProblems([unresolved]).join('|'), /does not resolve/)
  const empty = drv('a', [{ name: 'a', targets: [{ id: null, data_path: '', resolved: false }] }])
  assert.match(driverProblems([empty]).join('|'), /no target/)
  assert.deepEqual(driverProblems([drv('', [{ name: 'a', targets: [{ id: 'B', data_path: 'x', resolved: true }] }], 'AVERAGE')]), [], 'non-script types use every variable')
})

test('point 7: a preview older than its final render is stale and is regenerated', () => {
  const root = mkdtempSync(join(tmpdir(), 'preview-'))
  const dir = join(root, 'ch01', 'scene_a'); mkdirSync(dir, { recursive: true })
  const put = (name, sec) => { const f = join(dir, name); writeFileSync(f, 'x'); utimesSync(f, sec, sec); return f }
  put('thumb.jpg', 1000); const final = put('final.webm', 2000)
  assert.deepEqual(stalePreviews(root).map((s) => s.dir), [dir])
  const calls = []
  const r = refreshPreview(final, (cmd, args) => { calls.push([cmd, ...args]); writeFileSync(join(dir, 'thumb.jpg'), 'new'); return { status: 0 } })
  assert.equal(r.ok, true)
  assert.match(calls[0].join(' '), /ffmpeg .*final\.webm .*thumb\.jpg/)
  assert.deepEqual(stalePreviews(root), [], 'fresh after the refresh')
  const failed = refreshPreview(final, () => ({ status: 1 }))
  assert.equal(failed.ok, false)
})
