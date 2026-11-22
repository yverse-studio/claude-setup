// Companyxy report 2026-11-12, points 3 to 8: each gate below was red (missing) before scripts/pipeline-gates.mjs existed.
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, utimesSync, rmSync } from 'node:fs'
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
  assert.match(sheetProblems(SHEET.replace(/- Look-Lock:.*/, '- Look-Lock: owner card, 2026-11-12')).join('|'), /Look-Lock/) // the bare word card is no proof
  assert.deepEqual(sheetProblems(SHEET.replace(/- Look-Lock:.*/, '- Look-Lock: #cmsg_01ABCDEFG · 2026-11-12')), [])
  assert.match(sheetProblems(SHEET.replace('Height: 168 cm', 'Height: tall')).join('|'), /Height/)
})

test('#599: a sheet with a look lock has DECISIONS.md beside it, through the CLI too', () => {
  const dir = mkdtempSync(join(tmpdir(), 'decisions-'))
  try {
    assert.match(sheetProblems(SHEET, dir).join('|'), /DECISIONS\.md[^|]*decisions-/)
    writeFileSync(join(dir, 'DECISIONS.md'), '- 2026-11-10 succubus outfit: chosen, https://claude.ai/code/card/x\n')
    assert.deepEqual(sheetProblems(SHEET, dir), [])
    assert.match(sheetProblems(SHEET, 'no-such-folder').join('|'), /none in \/[^|]*no-such-folder[^|]*Owner decisions/, 'a relative folder is named in full, and the hint names the paragraph')
    rmSync(join(dir, 'DECISIONS.md'))
    assert.deepEqual(sheetProblems(SHEET.replace(/- Look-Lock:.*/, ''), dir).filter((p) => p.startsWith('DECISIONS')), [], 'no second line for a sheet that already lacks its look lock')
    writeFileSync(join(dir, 'SHEET.md'), SHEET)
    const cli = (f) => spawnSync('node', [join(dirname(fileURLToPath(import.meta.url)), 'pipeline-gates.mjs'), 'sheet', f], { encoding: 'utf8' })
    const red = cli(join(dir, 'SHEET.md')); assert.equal(red.status, 1); assert.match(red.stdout + red.stderr, /DECISIONS\.md/)
    writeFileSync(join(dir, 'DECISIONS.md'), 'x\n')
    assert.equal(cli(join(dir, 'SHEET.md')).status, 0)
  } finally { rmSync(dir, { recursive: true, force: true }) }
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

// #630 (GameDev 2026-11-15): the scene card lay as v3 and v4 copies and the wrong one was read; one scene folder holds one scene card.
import { sceneCardProblems } from './pipeline-gates.mjs'
const sceneFolder = (files) => {
  const d = mkdtempSync(join(tmpdir(), 'scene-630-'))
  for (const f of files) { mkdirSync(join(d, f, '..'), { recursive: true }); writeFileSync(join(d, f), 'x') }
  return d
}
test('#630 cards: a conflict copy or a root copy beside the scene card is RED with every path named; one card passes', () => {
  const clean = sceneFolder(['scene/scene_card.md', 'scene/handoff.md', 'scene/pose.json'])
  const copies = sceneFolder(['scene/scene_card.md', 'scene/scene_card_v3.md', 'scene/scene-card v4 (conflict copy).md', 'scene_card.md', 'notes/card.md'])
  try {
    assert.deepEqual(sceneCardProblems(clean), [])
    const out = sceneCardProblems(copies).join('|')
    for (const p of ['scene/scene_card.md', 'scene/scene_card_v3.md', 'scene/scene-card v4 (conflict copy).md', 'scene_card.md']) assert.ok(out.includes(p), `names ${p}: ${out}`)
    assert.doesNotMatch(out, /notes/, 'an unrelated card file is not a scene card')
    const two = sceneFolder(['scene/scene_card.md', 'scene/scene_card_v3.md'])
    try {
      const pair = sceneCardProblems(two).join('|')
      assert.match(pair, /scene\/scene_card\.md.*scene\/scene_card_v3\.md|scene\/scene_card_v3\.md.*scene\/scene_card\.md/, 'a card plus one conflict copy is RED, both paths named')
      const red = spawnSync(process.execPath, [GATE, 'cards', two], { encoding: 'utf8' })
      assert.equal(red.status, 1)
      assert.match(red.stdout, /^RED .*scene_card_v3\.md/m)
    } finally { rmSync(two, { recursive: true, force: true }) }
    const cli = spawnSync(process.execPath, [GATE, 'cards', copies], { encoding: 'utf8' })
    assert.equal(cli.status, 1)
    assert.match(cli.stdout, /^RED .*scene_card_v3\.md/m)
    assert.equal(spawnSync(process.execPath, [GATE, 'cards', clean], { encoding: 'utf8' }).status, 0)
  } finally { rmSync(clean, { recursive: true, force: true }); rmSync(copies, { recursive: true, force: true }) }
})

// #631: the scene plan's pass list is the one in game-pipeline.md (a fresh plan gate passes it only when ...); the old-scene row lives there once, and the Animator rule points at it.
test('#631: the plan gate row names the old scene a plan copies, once, in the pass list; roles/animator.md points to it', () => {
  const root = join(dirname(fileURLToPath(import.meta.url)), '..')
  const gate = readFileSync(join(root, 'docs/game-pipeline.md'), 'utf8').split('\n').find((l) => l.startsWith('**One chapter plan, gated before any build**')) ?? ''
  assert.match(gate, /passes it only when.*every scene names the old scene it copies by path \(or says that none exists and why\)/, 'the pass list has the row, with the answer for a first scene')
  const animator = readFileSync(join(root, '.claude/skills/operator/roles/animator.md'), 'utf8')
  assert.doesNotMatch(animator, /The plan names the old scene it copies/, 'the rule is not worded a second time')
  assert.match(animator, /plan gate[^\n]*game-pipeline\.md/, 'the Animator rule points to the pass list')
})

// #689: the pre-gate file check. Fixtures live in a temp project-files folder; every red case feeds one violation to a green file.
import { pregateProblems, pregateCheck, pregateMissing } from '../global/rule-guard.mjs'

const PG_DOCS = {
  'docs/recipe.md': 'Passed recipe: the real garment route with a fitted shell, scored 4.9 on Mira bikini.\nSecond line about fitting.',
  'docs/pitfalls.md': [
    'Do not use alpha to hide skin showing through the garment.',
    'A strap that floats above the shoulder must be pulled with the follow key.',
    'Never bake a hem before the contact check is clean.',
    'Hair cards clip through the hood when the hood is fitted last.',
    'The gate got only one front and one back picture last time.',
  ].join('\n'),
  'docs/old-gate.md': 'Gate 3.2: skin showed at the waist, the material change did nothing.\nThe seams at the side read flat from the left.',
}
const Q = {
  recipe: 'the real garment route with a fitted shell, scored 4.9',
  p1: 'Do not use alpha to hide skin showing through the garment.',
  p2: 'A strap that floats above the shoulder must be pulled',
  p3: 'Never bake a hem before the contact check is clean.',
  p4: 'Hair cards clip through the hood when the hood is fitted last.',
  p5: 'The gate got only one front and one back picture last time.',
}
const VIEWS = ['front', 'back', 'left', 'right', 'close chest']
function pgFile({ type = 'garment', docs = ['docs/recipe.md', 'docs/pitfalls.md'], recipe = `| docs/recipe.md | ${Q.recipe} | Mira bikini 4.9 | fit it the same way |`, pitfalls, tick = 'x', score = 'Self-score: 4.8 (silhouette 5, contact 4.8, seams 4.6, skin 5)', views = VIEWS } = {}) {
  const rows = pitfalls ?? [Q.p1, Q.p2, Q.p3, Q.p4, Q.p5].map((q) => `| docs/pitfalls.md | ${q} | contact.py number |`)
  return [
    '# PREGATE: bikini', `Type: ${type}`, `Docs: ${docs.join(', ')}`,
    '## Recipe', '| Source | Quote | Passed as | Use |', '|---|---|---|---|', recipe,
    '## Pitfalls', '| # | Source | Quote | Checked by | OK |', '|---|---|---|---|---|',
    ...rows.map((r, i) => (r.startsWith('none') ? `| ${i + 1} | ${r} | | | |` : `| ${i + 1} ${r}${tick ? ` [${tick}] |` : ' |'}`)),
    score, '## Views', '| View | File |', '|---|---|', ...views.map((v) => `| ${v} | gate/bikini/${v.replace(/\s+/g, '-')}.png |`),
  ].join('\n')
}
// A pitfall row is `| <n> | <source> | <quote> | <checked by> | [x] |`: pgFile writes it from `| <source> | <quote> | <checked by> |`.
function pgProject({ list, files = {} } = {}) {
  const root = mkdtempSync(join(tmpdir(), 'pregate-'))
  const put = (p, body) => { mkdirSync(dirname(join(root, p)), { recursive: true }); writeFileSync(join(root, p), body) }
  for (const [p, body] of Object.entries(PG_DOCS)) put(p, body)
  for (const v of VIEWS) put(`gate/bikini/${v.replace(/\s+/g, '-')}.png`, 'png-bytes')
  if (list !== undefined) put('PREGATE-DOCS.md', list)
  for (const [p, body] of Object.entries(files)) put(p, body)
  return { root, put, done: () => rmSync(root, { recursive: true, force: true }) }
}
const LIST = '| Type | Doc | Laptop path |\n|---|---|---|\n| garment | docs/recipe.md | STUDIO_ROOT\\docs\\recipe.md |\n| garment | docs/pitfalls.md | |\n| scene | docs/pitfalls.md | |\n'
const pg = (p, text, stage = 'plan', extra = {}) => { p.put('gate/bikini/PREGATE.md', text); return pregateCheck(join(p.root, 'gate/bikini/PREGATE.md'), stage, [p.root], extra) }

test('#689 test 1: a plan with a recipe row, five pitfalls and the project list is OK', () => {
  const p = pgProject({ list: LIST })
  try { const r = pg(p, pgFile()); assert.deepEqual(r.problems, []); assert.equal(r.noList, false) } finally { p.done() }
})

test('#689 test 2: a plan is red for each violation, one assertion each', () => {
  const p = pgProject({ list: LIST })
  const red = (text, re, msg) => assert.match(pg(p, text).problems.join('\n'), re, msg)
  const rows = (...q) => q.map((x) => `| docs/pitfalls.md | ${x} | contact.py number |`)
  try {
    red(pgFile({ pitfalls: [`| docs/pitfalls.md | ${PG_DOCS['docs/old-gate.md'].split('\n')[0]} | n |`, ...rows(Q.p2, Q.p3, Q.p4, Q.p5)], docs: ['docs/recipe.md', 'docs/pitfalls.md', 'docs/old-gate.md'] }), /not found in docs\/pitfalls\.md/, 'a quote that sits in another listed doc is not found in its own Source')
    red(pgFile({ pitfalls: rows('Do not use alpha', Q.p2, Q.p3, Q.p4, Q.p5) }), /under 25 characters/, 'a short quote')
    red(pgFile({ pitfalls: rows(Q.p1, Q.p1, Q.p3, Q.p4, Q.p5) }), /used in two rows/, 'one quote twice')
    red(pgFile({ pitfalls: [`| docs/old-gate.md | ${PG_DOCS['docs/old-gate.md'].split('\n')[0]} | n |`, ...rows(Q.p2, Q.p3, Q.p4, Q.p5)] }), /Source docs\/old-gate\.md is not in Docs:/, 'a Source outside Docs:')
    red(pgFile({ docs: ['docs/recipe.md', 'docs/pitfalls.md', 'docs/old-gate.md'] }), /docs\/old-gate\.md[^\n]*no row quotes it/, 'a Docs: entry no row quotes')
    red(pgFile({ docs: ['docs/recipe.md', 'docs/pitfalls.md', 'docs/gone.md'] }), /docs\/gone\.md[^\n]*no root holds it/, 'a doc no root holds')
    red(pgFile({ docs: ['docs/pitfalls.md'], recipe: 'none, searched docs/pitfalls.md' }), /docs\/recipe\.md[^\n]*lists it for garment/, 'a doc the list names for this Type left out of Docs:')
    red(pgFile({ pitfalls: rows(Q.p1, Q.p2, Q.p3, Q.p4) }), /5 pitfall rows/, 'four pitfall rows')
    red(pgFile({ recipe: '' }), /no Recipe row/, 'no Recipe row')
    red(pgFile({ type: '' }).replace('Type: ', 'Typo: '), /Type:/, 'no Type')
    red(pgFile({ pitfalls: [`| docs/pitfalls.md | ${Q.p1} | |`, ...rows(Q.p2, Q.p3, Q.p4, Q.p5)] }), /no "Checked by"/, 'a quoted pitfall without Checked by')
    // a short list laid next to the pre-gate file is ignored; the root list still makes the file red
    p.put('gate/bikini/PREGATE-DOCS.md', '| Type | Doc | Laptop path |\n|---|---|---|\n| garment | docs/pitfalls.md | |\n')
    red(pgFile({ docs: ['docs/pitfalls.md'], recipe: 'none, searched docs/pitfalls.md' }), /docs\/recipe\.md[^\n]*lists it for garment/, 'the list beside the file does not shadow the root list')
  } finally { p.done() }
})

test('#689 test 3: none-rows and a project with no list file pass the plan, and the OK says the builder chose the docs', () => {
  const p = pgProject()
  try {
    const text = pgFile({ recipe: 'none, searched docs/recipe.md, docs/pitfalls.md', pitfalls: [`| docs/pitfalls.md | ${Q.p1} | contact.py number |`, `| docs/pitfalls.md | ${Q.p2} | contact.py number |`, 'none, searched docs/pitfalls.md', 'none, searched docs/old-gate.md', 'none, searched docs/old-gate.md'], docs: ['docs/recipe.md', 'docs/pitfalls.md'] })
    const r = pg(p, text.replace('Docs: docs/recipe.md, docs/pitfalls.md', 'Docs: docs/pitfalls.md'))
    assert.deepEqual(r.problems, [])
    assert.equal(r.noList, true)
  } finally { p.done() }
})

test('#689 test 4: a plan-OK file is red at the gate for each violation', () => {
  const p = pgProject({ list: LIST })
  const red = (text, re, msg) => assert.match(pg(p, text, 'gate').problems.join('\n'), re, msg)
  try {
    assert.deepEqual(pg(p, pgFile(), 'plan').problems, [], 'the same file passes the plan')
    red(pgFile({ tick: '' }), /not ticked/, 'unticked rows')
    red(pgFile({ score: 'Self-score: 4.5 (silhouette 5, contact 4)' }), /Self-score/, 'a self-score under 4.8')
    red(pgFile({ score: 'Self-score: 4.9' }), /Self-score[^\n]*rubric rows/, 'a self-score with no rows')
    red(pgFile({ views: ['front', 'back'] }), /no "left" view/, 'a garment with front and back only')
    p.put('gate/bikini/front.png', '')
    red(pgFile({ views: ['front', 'back', 'left', 'right', 'close chest'] }), /front[^\n]*(missing|empty)/, 'a view file of 0 bytes')
    red(pgFile({ type: 'scene', views: ['front', 'close up'] }), /non-pov/, 'a scene without a non-pov view')
  } finally { p.done() }
})

test('#689 test 5: a ticked file with a 4.8 self-score and five views passes the gate', () => {
  const p = pgProject({ list: LIST })
  try { assert.deepEqual(pg(p, pgFile(), 'gate').problems, []) } finally { p.done() }
})

test('#689 test 6: the hook refuses a hand-in without a passing pre-gate file of the right stage (Animator and Character TD only)', () => {
  const p = pgProject({ list: LIST })
  const env = { CLAUDE_SETUP_PROJECT_FILES: p.root }
  const gate = (stage) => `Pre-gate: ${stage} gate/bikini/PREGATE.md`
  const call = (tool, text, role = 'Character TD', extra = {}) => pregateMissing(tool, { text, ...extra }, role, env)
  const refused = (v, msg) => assert.match(v ?? '', /^rule-guard: .*pipeline-gates\.mjs pregate/s, msg)
  try {
    p.put('gate/bikini/PREGATE.md', pgFile())
    p.put('gate/bikini/PLAN-ONLY.md', pgFile({ tick: '', score: '' }))
    const plan = 'Pre-gate: plan gate/bikini/PLAN-ONLY.md'
    refused(call('mcp__hearthbot__post_message', 'Done: bikini is in gate/bikini/ (bikini.glb)'), 'Done: with no line')
    refused(call('mcp__hearthbot__post_message', 'Done: bikini is in gate/bikini/\nPre-gate: n/a, not needed here'), 'n/a never passes a hand-in')
    assert.equal(call('mcp__hearthbot__post_message', `Done: bikini is in gate/bikini/\n${gate('gate')}`), null, 'a passing gate file')
    refused(call('mcp__hearthbot__post_message', `Done: the piece is in gate/x/ (x.glb)\n${plan}`), 'a plan-stage file on Done: with no picture')
    assert.equal(call('mcp__hearthbot__message_coordinator', `Gate request: plan v2\n${plan}`), null, 'a plan to its gate')
    refused(call('mcp__hearthbot__message_coordinator', 'Gate request: plan v2\nPre-gate: n/a, no file yet'), 'n/a on a gate request')
    refused(call('mcp__hearthbot__message_thread', `Gate request: build\nfront.png\n${plan}`), 'a picture on a gate request needs the gate stage')
    assert.equal(call('mcp__hearthbot__message_thread', `Gate request: build\nfront.png\n${gate('gate')}`), null, 'a gate file with a picture')
    refused(call('mcp__hearthbot__post_message', 'Here is the result', 'Character TD', { attached_outputs: [{ kind: 'file', ref: '/mnt/project-files/x.png' }] }), 'an attachment with no line')
    assert.equal(call('mcp__hearthbot__message_coordinator', 'Which bone do you want for the strap?'), null, 'a question is no hand-in')
    refused(call('mcp__hearthbot__post_message', 'Done: scene is in gate/s/', 'Animator'), 'Animator Done: with no line')
    assert.equal(call('mcp__hearthbot__post_message', `Done: scene is in gate/s/\n${gate('gate')}`, 'Animator'), null, 'Animator with a passing file')
    for (const text of ['Done: x', 'Gate request: build\nfront.png', 'Done: x\nPre-gate: n/a, nothing']) assert.equal(call('mcp__hearthbot__post_message', text, 'Programmer'), null, `Programmer: ${text}`)
    assert.equal(pregateMissing('Bash', { command: 'echo Done: x' }, 'Character TD', env), null, 'other tools are not checked')
    // a red file names the command and the first three problems
    p.put('gate/bikini/RED.md', pgFile({ tick: '', score: 'Self-score: 3' }))
    const why = call('mcp__hearthbot__post_message', 'Done: x\nPre-gate: gate gate/bikini/RED.md')
    assert.match(why, /node scripts\/pipeline-gates\.mjs pregate gate\/bikini\/RED\.md --stage gate/)
    assert.ok(why.split('\n').filter((l) => /^\s*- /.test(l)).length <= 3)
  } finally { p.done() }
})

test('#689 test 7: the CLI exits 1 with the problem lines on a red file and prints OK pregate gate on a green one', () => {
  const p = pgProject({ list: LIST })
  const cli = join(dirname(fileURLToPath(import.meta.url)), 'pipeline-gates.mjs')
  try {
    p.put('gate/bikini/PREGATE.md', pgFile())
    const ok = spawnSync(process.execPath, [cli, 'pregate', join(p.root, 'gate/bikini/PREGATE.md'), '--stage', 'gate', '--root', p.root], { encoding: 'utf8' })
    assert.equal(ok.status, 0, ok.stdout)
    assert.match(ok.stdout, /^OK pregate gate$/m)
    p.put('gate/bikini/PREGATE.md', pgFile({ tick: '' }))
    const bad = spawnSync(process.execPath, [cli, 'pregate', join(p.root, 'gate/bikini/PREGATE.md'), '--stage', 'gate', '--root', p.root], { encoding: 'utf8' })
    assert.equal(bad.status, 1)
    assert.match(bad.stdout, /^RED .*not ticked/m)
  } finally { p.done() }
})
