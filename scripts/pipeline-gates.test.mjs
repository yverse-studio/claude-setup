// Companyxy report 2026-11-12, points 3 to 8: each gate below was red (missing) before scripts/pipeline-gates.mjs existed.
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { mkdtempSync, mkdirSync, writeFileSync, utimesSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { spawnSync } from 'node:child_process'
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
const REPORT = { type: 'garment', rows: { BT_petite: { preview: 'preview/BT_petite.png', number: { min_mm: 2.1, inside_pct: 0 } }, char_rika: { preview: 'preview/char_rika.png', number: { min_mm: 1.8, inside_pct: 0 } } }, catalog: { bases_fitted: ['BT_petite', 'char_rika'], md5: { 'files/CL_x.blend': 'd41d8cd98f00b204e9800998ecf8427e' } } }
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
    for (const value of ['?', 'not specified', 'keine Angabe', 'maybe', 'see website', 'permitted?', 'yes?', 'Yes ?', 'yes (non-commercial)', 'Yes - personal use only', 'ja, aber nicht kommerziell', 'yes/no', 'Yes, except sexual content', 'Non-commercial only', 'CC BY-NC', 'Not permitted', 'personal use only', '-']) {
      assert.match(problems((d) => writeFileSync(join(d, 'LICENCE.md'), LICENCE.replace(`${field}: yes`, `${field}: ${value}`))), new RegExp(`"${field}: .*_quarantine`), `${field}: ${value}`)
    }
    for (const value of ['yes', 'Yes.', 'ja']) assert.equal(problems((d) => writeFileSync(join(d, 'LICENCE.md'), LICENCE.replace(`${field}: yes`, `${field}: ${value}`))), '', `${field}: ${value}`)
  }
})

test('intake: a report that is only a file list fails', () => {
  assert.match(problems((d) => rmSync(join(d, 'intake.json'))), /file list/)
  assert.match(problems((d) => writeFileSync(join(d, 'intake.json'), JSON.stringify({ type: 'garment', files: ['a.fbx', 'b.png'] }))), /no rows/)
})

test('intake: every base of the inventory needs a row, a preview and a number', () => {
  assert.match(problems(report({ rows: { BT_petite: REPORT.rows.BT_petite } })), /base char_rika: no row/)
  assert.match(problems((d) => rmSync(join(d, 'preview', 'char_rika.png'))), /base char_rika: preview .* is not an image file/)
  assert.match(problems(report({ rows: { ...REPORT.rows, char_rika: { preview: 'preview/char_rika.png' } } })), /garment needs number/)
})

test('intake: a garment or hair number must be a real clearance: numeric, 0 mm or more, 0 % inside', () => {
  for (const number of [{}, 'fine', { min_mm: -12, inside_pct: 40 }, { min_mm: 1, inside_pct: 3 }, { min_mm: '2' }]) {
    assert.match(problems(report({ rows: { ...REPORT.rows, char_rika: { preview: 'preview/char_rika.png', number } } })), /char_rika: a garment needs number/, JSON.stringify(number))
  }
  assert.match(problems(report({ type: 'hair' })), /^$/)
})

test('intake: a repeated licence line must pass too, the first one does not win (gate #483 r3, N4)', () => {
  assert.match(problems((d) => writeFileSync(join(d, 'LICENCE.md'), `${LICENCE}- Adult use: no\n`)), /"Adult use: no".*_quarantine/)
})

test('intake: a second licence line with a note or a placeholder cannot hide a no (gate #483 r4, blocker)', () => {
  for (const second of ['Adult use: no (see <file>)', 'Adult use: <unknown>', 'Adult use: no']) {
    assert.match(problems((d) => writeFileSync(join(d, 'LICENCE.md'), `${LICENCE}- ${second}\n`)), /"Adult use: .*_quarantine/, second)
  }
})

test('intake: a folder, an empty file or a non-image is no preview (gate #483 r4)', () => {
  assert.match(problems((d) => { rmSync(join(d, 'preview', 'char_rika.png')); mkdirSync(join(d, 'preview', 'char_rika.png')) }), /base char_rika: preview .* is not an image file/)
  assert.match(problems((d) => writeFileSync(join(d, 'preview', 'char_rika.png'), '')), /base char_rika: preview .* is not an image file/)
  assert.match(problems((d) => { writeFileSync(join(d, 'preview', 'char_rika.txt'), 'x'); writeFileSync(join(d, 'intake.json'), JSON.stringify({ ...REPORT, rows: { ...REPORT.rows, char_rika: { preview: 'preview/char_rika.txt', number: { min_mm: 1, inside_pct: 0 } } } })) }), /base char_rika: preview preview\/char_rika\.txt must be preview\/char_rika\.png/)
})

test('intake: a preview is the base\'s own file preview/<key>.<ext>, never a shared or outside image (gate #483 r5, B1)', () => {
  const row = (preview) => report({ rows: { ...REPORT.rows, char_rika: { preview, number: REPORT.rows.char_rika.number } } })
  for (const preview of ['preview/BT_petite.png', '../out.png', 'source/s.png', 'preview/../preview/char_rika.png', 'preview/char_rika.png/']) {
    assert.match(problems((d) => { writeFileSync(join(d, 'out.png'), 'png'); writeFileSync(join(d, 'source', 's.png'), 'png'); row(preview)(d) }), /base char_rika: preview .* must be preview\/char_rika\.png/, preview)
  }
  assert.equal(problems((d) => { writeFileSync(join(d, 'preview', 'char_rika.webp'), 'webp'); row('preview/char_rika.webp')(d) }), '')
})

test('intake: a visual row needs a real reason and no bad number beside it (gate #483 r5, S1)', () => {
  const rows = (extra) => report({ type: 'eyes', rows: Object.fromEntries(INV.map((k) => [k, { preview: `preview/${k}.png`, visual: true, ...extra }])) })
  assert.match(problems(rows({ why: ' '.repeat(12) })), /visual: true with a why/)
  for (const number of [{ min_mm: -5 }, { min_mm: 1 }, { min_mm: 1, inside_pct: 4 }, 'fine']) {
    assert.match(problems(rows({ why: 'no metric for an eye in a socket', number })), /eyes number must be complete, min_mm >= 0/, JSON.stringify(number))
  }
  assert.equal(problems(rows({ why: 'no metric for an eye in a socket', number: { min_mm: 0.4, inside_pct: 0 } })), '')
})

test('intake: odd files give RED lines, not a stack trace (gate #483 r5, S2)', () => {
  assert.match(problems((d) => { rmSync(join(d, 'source'), { recursive: true }); writeFileSync(join(d, 'source'), 'x') }), /source\/ is missing or empty/)
  assert.match(problems((d) => { rmSync(join(d, 'files'), { recursive: true }); writeFileSync(join(d, 'files'), 'x') }), /^$/)
  for (const bad of ['null', '[]', '"x"']) assert.match(problems((d) => writeFileSync(join(d, 'intake.json'), bad)), /intake.json is not an object/, bad)
})

const GATE = join(dirname(fileURLToPath(import.meta.url)), 'pipeline-gates.mjs')
const cli = (...args) => spawnSync(process.execPath, [GATE, 'intake', ...args], { encoding: 'utf8' })

test('intake CLI: OK with the body inventory, RED without it, and a bad --inventory is a RED line (gate #483 r5, S2)', () => {
  const d = asset()
  try {
    const measure = join(d, 'measure.json')
    writeFileSync(measure, JSON.stringify(BODY))
    const ok = cli(d, '--inventory', measure)
    assert.equal(ok.status, 0, ok.stdout + ok.stderr)
    assert.match(ok.stdout, /^OK intake/m)
    for (const args of [[d], [d, '--inventory'], [d, '--inventory', join(d, 'nope.json')]]) {
      const red = cli(...args)
      assert.equal(red.status, 1, args.join(' '))
      assert.match(red.stdout, /^RED /m)
      assert.doesNotMatch(red.stderr, /at .*\.mjs/, 'no stack trace')
    }
  } finally { rmSync(d, { recursive: true, force: true }) }
})

test('intake: the catalog is type-checked, bases_fitted an array of names and md5 an object of hashes (gate #483 r4)', () => {
  assert.match(problems(report({ catalog: { bases_fitted: 'BT_petite char_rika', md5: REPORT.catalog.md5 } })), /bases_fitted must be an array/)
  assert.match(problems(report({ catalog: { bases_fitted: [1, 2], md5: REPORT.catalog.md5 } })), /bases_fitted must be an array/)
  assert.match(problems(report({ catalog: { bases_fitted: REPORT.catalog.bases_fitted, md5: ['d41d8cd98f00b204e9800998ecf8427e'] } })), /md5 is empty/)
  assert.match(problems(report({ catalog: { bases_fitted: REPORT.catalog.bases_fitted, md5: { 'files/CL_x.blend': 'abc' } } })), /no md5 hash/)
})

test('intake: a prop is a type the skill promises, so the check accepts it (visual-only with a reason) and keeps the rest (gate #483 r4)', () => {
  const prop = (why) => report({ type: 'prop', rows: Object.fromEntries(INV.map((k) => [k, { preview: `preview/${k}.png`, visual: true, why }])) })
  assert.equal(problems(prop('held in the right hand on every base, 4 views checked')), '')
  assert.match(problems(prop('ok')), /visual: true with a why/)
  assert.match(problems(report({ type: 'weapon' })), /type "weapon" is none of garment, hair, eyes, face, prop/)
})

test('intake: a bold licence label cannot hide its value (gate #483 r2, F1)', () => {
  for (const [label, bad] of [['Adult use', 'no'], ['Commercial use', 'Non-commercial only']]) {
    assert.match(problems((d) => writeFileSync(join(d, 'LICENCE.md'), LICENCE.replace(`- ${label}: yes`, `- **${label}:** ${bad}`))), new RegExp(`"${label}: ${bad}.*_quarantine`))
    assert.match(problems((d) => writeFileSync(join(d, 'LICENCE.md'), LICENCE.replace(`- ${label}: yes`, `- **${label}**: ${bad}`))), new RegExp(`"${label}: ${bad}.*_quarantine`))
  }
  assert.equal(problems((d) => writeFileSync(join(d, 'LICENCE.md'), LICENCE.replace('- Adult use: yes', '- **Adult use:** yes'))), '')
})

test('intake: the type is one of garment, hair, eyes, face, prop', () => {
  assert.match(problems(report({ type: 'shoes' })), /type "shoes" is none of/)
  assert.match(problems(report({ type: 'Garment' })), /type "Garment" is none of/)
  assert.match(problems(report({ type: undefined })), /is none of/)
})

test('intake: eyes and faces may be visual-only with a reason, garments and hair may not', () => {
  const visual = (type, why) => report({ type, rows: Object.fromEntries(INV.map((k) => [k, { preview: `preview/${k}.png`, visual: true, why }])) })
  assert.equal(problems(visual('eyes', 'no metric for an eye in a socket, 4 views checked')), '')
  assert.match(problems(visual('eyes', 'ok')), /visual: true with a why/)
  assert.match(problems(visual('hair', 'looks fine in the render here')), /hair needs number/)
  // an eye or face row that carries a number refuses a negative clearance too (gate #483 r2, F4)
  const eyeNum = (n) => report({ type: 'eyes', rows: Object.fromEntries(INV.map((k) => [k, { preview: `preview/${k}.png`, number: n }])) })
  assert.match(problems(eyeNum({ min_mm: -3, inside_pct: 0 })), /eyes number must be complete, min_mm >= 0/)
  assert.equal(problems(eyeNum({ min_mm: 0.4, inside_pct: 0 })), '')
})

test('intake: a preview older than the asset files fails', () => {
  assert.match(problems((d) => { const old = new Date(Date.now() - 3600000); utimesSync(join(d, 'preview', 'BT_petite.png'), old, old) }), /base BT_petite: preview is older/)
})

test('intake: the catalog must list every fitted base and a hash', () => {
  assert.match(problems(report({ catalog: { bases_fitted: ['BT_petite'], md5: {} } })), /bases_fitted lacks char_rika.*md5 is empty/)
})
