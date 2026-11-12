// Companyxy report 2026-11-12, points 3 to 8: each gate below was red (missing) before scripts/pipeline-gates.mjs existed.
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { mkdtempSync, mkdirSync, writeFileSync, utimesSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { sheetProblems, fitReportProblems, lookStateProblems, driverProblems, stalePreviews, refreshPreview, intakeProblems, bodyInventory } from './pipeline-gates.mjs'

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
  const xform = drv('a', [{ name: 'a', type: 'TRANSFORMS', targets: [{ id: 'Armature', data_path: '', bone_target: 'foot_L', resolved: true }] }])
  assert.deepEqual(driverProblems([xform]), [], 'a transform variable has a bone, not a data path')
  const ctx = drv('a', [{ name: 'a', type: 'CONTEXT_PROP', targets: [{ id: null, data_path: '', resolved: false }] }])
  assert.deepEqual(driverProblems([ctx]), [], 'a context variable has no id')
  const lostBone = drv('a', [{ name: 'a', type: 'TRANSFORMS', targets: [{ id: 'Armature', data_path: '', bone_target: 'gone', resolved: false }] }])
  assert.match(driverProblems([lostBone]).join('|'), /does not resolve/)
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

// asset-intake: a downloaded asset is processed, not listed. Each rule has one violating asset beside the happy path.
// The bases come from the body's _inventory (measure.json of fit_garment.py), never from intake.json (gate #483 r1, B2).
const BODY = { _inventory: { BT: ['BT_petite'], CH: ['CH_rika'] } }
const INV = bodyInventory(BODY)
const LICENCE = '# Licence\n- Source: https://example.org/pack\n- Licence: CC-BY 4.0\n- Commercial use: yes\n- Adult use: yes\n- Attribution: Example Studio\n'
const REPORT = { type: 'garment', rows: { BT_petite: { preview: 'preview/BT_petite.png', number: { min_mm: 2.1, inside_pct: 0 } }, char_rika: { preview: 'preview/char_rika.png', number: { min_mm: 1.8, inside_pct: 0 } } }, catalog: { bases_fitted: ['BT_petite', 'char_rika'], md5: { 'files/CL_x.blend': 'abc' } } }
function asset(mutate = () => {}) {
  const dir = mkdtempSync(join(tmpdir(), 'intake-'))
  for (const d of ['source', 'files', 'preview']) mkdirSync(join(dir, d))
  writeFileSync(join(dir, 'source', 'pack.zip'), 'zip')
  writeFileSync(join(dir, 'files', 'CL_x.blend'), 'blend')
  writeFileSync(join(dir, 'LICENCE.md'), LICENCE)
  for (const k of ['BT_petite', 'char_rika']) writeFileSync(join(dir, 'preview', `${k}.png`), 'png')
  writeFileSync(join(dir, 'intake.json'), JSON.stringify(REPORT))
  const past = new Date(Date.now() - 60000)
  utimesSync(join(dir, 'files', 'CL_x.blend'), past, past)
  mutate(dir)
  return dir
}
const problems = (m, inv = INV) => { const d = asset(m); try { return intakeProblems(d, inv).join('|') } finally { rmSync(d, { recursive: true, force: true }) } }
const report = (patch) => (d) => writeFileSync(join(d, 'intake.json'), JSON.stringify({ ...REPORT, ...patch }))

test('intake: bodyInventory reads the _inventory of a fit measure the same way the fit gate does', () => {
  assert.deepEqual(INV, ['BT_petite', 'char_rika'])
  assert.deepEqual(bodyInventory({}), [])
})

test('intake: a processed asset with a row and preview per base passes', () => {
  assert.equal(problems(), '')
})

test('intake: without the body inventory it fails, and a report that fits fewer bases than the body has fails', () => {
  assert.match(problems(() => {}, []), /no body inventory/)
  // the author cannot shorten the list: the body has three bases, intake.json fits two
  assert.match(problems(() => {}, [...INV, 'BT_tall']), /base BT_tall: no row.*catalog\.bases_fitted lacks BT_tall/)
  // an inventory typed into intake.json is ignored
  assert.match(problems(report({ inventory: ['char_rika'] }), [...INV, 'BT_tall']), /base BT_tall: no row/)
})

test('intake: a missing or empty source/ fails', () => {
  assert.match(problems((d) => rmSync(join(d, 'source', 'pack.zip'))), /source\/ is missing or empty/)
})

test('intake: no licence note, or a placeholder field, fails (quarantine)', () => {
  assert.match(problems((d) => rmSync(join(d, 'LICENCE.md'))), /_quarantine/)
  assert.match(problems((d) => writeFileSync(join(d, 'LICENCE.md'), LICENCE.replace('CC-BY 4.0', '<licence>'))), /"Licence:"/)
  assert.match(problems((d) => writeFileSync(join(d, 'LICENCE.md'), LICENCE.replace('- Adult use: yes\n', ''))), /"Adult use:"/)
})

test('intake: Adult use or Commercial use "no", or an unclear answer, goes to quarantine (gate #483 r1, B3)', () => {
  for (const [field, value] of [['Adult use', 'no'], ['Commercial use', 'No, personal use only'], ['Adult use', 'unclear'], ['Commercial use', 'unknown'], ['Adult use', 'nein']]) {
    assert.match(problems((d) => writeFileSync(join(d, 'LICENCE.md'), LICENCE.replace(new RegExp(`${field}: yes`), `${field}: ${value}`))), new RegExp(`"${field}: .*_quarantine`), `${field}: ${value}`)
  }
  assert.equal(problems((d) => writeFileSync(join(d, 'LICENCE.md'), LICENCE.replace('Attribution: Example Studio', 'Attribution: none required'))), '', 'no attribution needed is fine')
})

test('intake: Adult use and Commercial use are allow-lists, only yes or ja passes', () => {
  for (const field of ['Adult use', 'Commercial use']) {
    for (const value of ['?', 'not specified', 'keine Angabe', 'maybe', 'see website', 'permitted?', 'yes?', 'Yes ?']) {
      assert.match(problems((d) => writeFileSync(join(d, 'LICENCE.md'), LICENCE.replace(`${field}: yes`, `${field}: ${value}`))), new RegExp(`"${field}: .*_quarantine`), `${field}: ${value}`)
    }
    for (const value of ['yes', 'Yes, no restrictions', 'ja']) assert.equal(problems((d) => writeFileSync(join(d, 'LICENCE.md'), LICENCE.replace(`${field}: yes`, `${field}: ${value}`))), '', `${field}: ${value}`)
  }
})

test('intake: a report that is only a file list fails', () => {
  assert.match(problems((d) => rmSync(join(d, 'intake.json'))), /file list/)
  assert.match(problems((d) => writeFileSync(join(d, 'intake.json'), JSON.stringify({ type: 'garment', files: ['a.fbx', 'b.png'] }))), /no rows/)
})

test('intake: every base of the inventory needs a row, a preview and a number', () => {
  assert.match(problems(report({ rows: { BT_petite: REPORT.rows.BT_petite } })), /base char_rika: no row/)
  assert.match(problems((d) => rmSync(join(d, 'preview', 'char_rika.png'))), /base char_rika: preview .* does not exist/)
  assert.match(problems(report({ rows: { ...REPORT.rows, char_rika: { preview: 'preview/char_rika.png' } } })), /garment needs number/)
})

test('intake: a garment or hair number must be a real clearance: numeric, 0 mm or more, 0 % inside', () => {
  for (const number of [{}, 'fine', { min_mm: -12, inside_pct: 40 }, { min_mm: 1, inside_pct: 3 }, { min_mm: '2' }]) {
    assert.match(problems(report({ rows: { ...REPORT.rows, char_rika: { preview: 'preview/char_rika.png', number } } })), /char_rika: a garment needs number/, JSON.stringify(number))
  }
  assert.match(problems(report({ type: 'hair' })), /^$/)
})

test('intake: the type is one of garment, hair, eyes, face', () => {
  assert.match(problems(report({ type: 'shoes' })), /type "shoes" is none of/)
  assert.match(problems(report({ type: 'Garment' })), /type "Garment" is none of/)
  assert.match(problems(report({ type: undefined })), /is none of/)
})

test('intake: eyes and faces may be visual-only with a reason, garments and hair may not', () => {
  const visual = (type, why) => report({ type, rows: Object.fromEntries(INV.map((k) => [k, { preview: `preview/${k}.png`, visual: true, why }])) })
  assert.equal(problems(visual('eyes', 'no metric for an eye in a socket, 4 views checked')), '')
  assert.match(problems(visual('eyes', 'ok')), /visual: true with a why/)
  assert.match(problems(visual('hair', 'looks fine in the render here')), /hair needs number/)
})

test('intake: a preview older than the asset files fails', () => {
  assert.match(problems((d) => { const old = new Date(Date.now() - 3600000); utimesSync(join(d, 'preview', 'BT_petite.png'), old, old) }), /base BT_petite: preview is older/)
})

test('intake: the catalog must list every fitted base and a hash', () => {
  assert.match(problems(report({ catalog: { bases_fitted: ['BT_petite'], md5: {} } })), /bases_fitted lacks char_rika.*md5 is empty/)
})
