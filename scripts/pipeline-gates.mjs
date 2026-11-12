#!/usr/bin/env node
// Pipeline gates from the companyxy error report 2026-11-12 (docs/character-workflow.md, Gates; gate.md, Asset PRs).
// Pure checks over plain data, so they run in CI and on the laptop without Blender:
//   sheet <SHEET.md...>        point 3  cast sheet with measures and a look lock before any model
//   fit <measure.json>         point 4  every fit measured against all BT_ presets and all CH_ keys
//   look <look_states.json>    point 5  every look state sets every look switch
//   drivers <drivers.json>     point 5  no driver with a dead or unresolved variable (dump: scripts/blender/dump_drivers.py)
//   previews <dir> [--fix]     point 7  thumb.jpg older than a final render in its folder
// Each prints OK or RED lines and exits 1 on any RED.
import { spawnSync } from 'node:child_process'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { basename, dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const field = (text, label) => text.match(new RegExp(`^[ \\t>*-]*\\**${label}\\**:[ \\t]*(.*)$`, 'im'))?.[1]?.trim() ?? null
const placeholder = (v) => !v || /<[^>\n]+>/.test(v.replace(/<https?:[^>]*>/g, ''))

// Point 3: stage 1 and 2 of docs/preproduction-workflow.md. No body, face or outfit job starts on a sheet this rejects.
export function sheetProblems(text) {
  const out = []
  const need = (label, ok, hint) => { const v = field(text, label); if (placeholder(v) || !ok(v)) out.push(`${label}: ${hint}`) }
  need('Age', (v) => Number(v.match(/\d+/)?.[0]) >= 18, 'a number, 18 or more')
  need('Height', (v) => /\d{2,3}\s*cm/.test(v), 'height in cm, e.g. 168 cm')
  need('Measurements', (v) => (v.match(/\d+(\.\d+)?/g) ?? []).length >= 3, 'bust / waist / hips as three numbers')
  need('Base body and preset', (v) => v.length > 3, 'the base body and its preset values')
  need('Silhouette numbers', (v) => /\d/.test(v), 'the numbers the gate silhouette row checks')
  need('Hair', (v) => v.length > 3, 'colour by comparison, length, texture')
  need('Palette', (v) => v.split(/[,/]/).filter((x) => x.trim()).length >= 3, '3 to 5 colours')
  need('Look-Lock', (v) => /\d{4}-\d{2}-\d{2}/.test(v) && /(https?:\/\/|card)/i.test(v), 'owner card link and date (YYYY-MM-DD) of the approval')
  return out
}

// Point 4: the measure output of tools/laptop/fit_garment.py carries `_inventory` ({BT: [...], CH: [...]}, the body's keys).
// Every piece's `after` block (`before` for a measure-only run) needs a state per BT_ preset and a `char_<name>` per CH_ key, all inside the limit.
const OFFSET_MM = 4
const FACE_MAX_PCT = 0.5
export function fitReportProblems(report) {
  const inv = report?._inventory
  if (!inv?.BT || !inv?.CH) return ['report has no _inventory {BT, CH}: measure with the current fit_garment.py, which lists the body keys']
  const need = [...inv.BT, ...inv.CH.map((k) => `char_${k.replace(/^CH_/, '')}`)]
  const out = []
  for (const [item, pieces] of Object.entries(report)) {
    if (item.startsWith('_')) continue
    for (const [piece, r] of Object.entries(pieces)) {
      if (piece.startsWith('_')) continue
      const block = r.after ?? r.before ?? {}
      const missing = need.filter((k) => !block[k])
      if (missing.length) out.push(`${item}/${piece}: not measured against ${missing.join(', ')}`)
      for (const k of need) {
        const s = block[k]
        if (s && (s.depth_mm > OFFSET_MM || s.face_deep_pct > FACE_MAX_PCT)) out.push(`${item}/${piece}: ${k} clips ${s.depth_mm} mm deep, ${s.face_deep_pct} % of faces (limit ${OFFSET_MM} mm, ${FACE_MAX_PCT} %)`)
      }
    }
  }
  return out
}

// Point 5: a sheet script sets every look switch (tights_on, shoes_on, ...) for every state it renders, never only the ones it remembers.
export function lookStateProblems({ switches = [], states = {} } = {}) {
  if (!switches.length) return ['no look switches listed: dump the body\'s custom properties that change the look into "switches"']
  const out = []
  for (const [name, set] of Object.entries(states)) {
    const miss = switches.filter((s) => !(s in set))
    if (miss.length) out.push(`state "${name}" does not set ${miss.join(', ')}`)
  }
  return out
}

// Point 5: drivers as dumped by scripts/blender/dump_drivers.py. A scripted driver's variable must appear in its expression
// (Rika's foot-in-shoe driver had a dead variable) and every target must resolve.
export function driverProblems(drivers) {
  const out = []
  for (const d of drivers) {
    const where = `${d.owner} ${d.path}`
    for (const v of d.variables ?? []) {
      if (d.type === 'SCRIPTED' && !new RegExp(`\\b${v.name}\\b`).test(d.expression ?? '')) out.push(`${where}: variable ${v.name} is not used in "${d.expression}"`)
      for (const t of v.targets ?? []) {
        if (!t.id || !t.data_path) out.push(`${where}: variable ${v.name} has no target`)
        else if (!t.resolved) out.push(`${where}: variable ${v.name} (${t.data_path}) does not resolve`)
      }
    }
  }
  return out
}

// Point 7: thumb.jpg must be newer than every final render beside it.
const FINAL = /\.(webm|mp4|mov|gif)$/i
export function stalePreviews(root) {
  const out = []
  const walk = (dir) => {
    const names = readdirSync(dir, { withFileTypes: true })
    const thumb = names.find((e) => e.isFile() && e.name === 'thumb.jpg')
    const finals = names.filter((e) => e.isFile() && FINAL.test(e.name) && !/^(thumb|preview)/i.test(e.name)).map((e) => ({ name: e.name, mtime: statSync(join(dir, e.name)).mtimeMs }))
    if (thumb && finals.length) {
      const t = statSync(join(dir, 'thumb.jpg')).mtimeMs
      const newer = finals.filter((f) => f.mtime > t)
      if (newer.length) out.push({ dir, finals: newer.map((f) => f.name), final: join(dir, newer.sort((a, b) => b.mtime - a.mtime)[0].name) })
    }
    for (const e of names) if (e.isDirectory() && !/^(_|\.|node_modules)/.test(e.name)) walk(join(dir, e.name))
  }
  walk(root)
  return out
}

const run = (cmd, args) => spawnSync(cmd, args, { encoding: 'utf8' })
export function refreshPreview(finalFile, exec = run) {
  const thumb = join(dirname(finalFile), 'thumb.jpg')
  const r = exec('ffmpeg', ['-y', '-loglevel', 'error', '-ss', '0.5', '-i', finalFile, '-frames:v', '1', '-q:v', '3', thumb])
  return r.status === 0 ? { ok: true, thumb } : { ok: false, why: `ffmpeg exit ${r.status}` }
}

function main([cmd, ...args]) {
  const json = (f) => JSON.parse(readFileSync(f, 'utf8'))
  const jobs = {
    sheet: () => args.filter((a) => !a.startsWith('--')).flatMap((f) => sheetProblems(readFileSync(f, 'utf8')).map((p) => `${basename(f)}: ${p}`)),
    fit: () => fitReportProblems(json(args[0])),
    look: () => lookStateProblems(json(args[0])),
    drivers: () => driverProblems(json(args[0])),
    previews: () => stalePreviews(args[0]).map((s) => {
      if (args.includes('--fix')) { const r = refreshPreview(s.final); return r.ok ? null : `${s.dir}: could not refresh thumb.jpg (${r.why})` }
      return `${s.dir}: thumb.jpg is older than ${s.finals.join(', ')} (run with --fix)`
    }).filter(Boolean),
  }
  if (!jobs[cmd] || !args.length) { console.error('usage: pipeline-gates.mjs sheet|fit|look|drivers|previews <file or dir> [--fix]'); return 2 }
  const problems = jobs[cmd]()
  for (const p of problems) console.log(`RED ${p}`)
  console.log(problems.length ? `RESULT RED ${cmd}: ${problems.length} problem(s)` : `OK ${cmd}`)
  return problems.length ? 1 : 0
}
if (process.argv[1] === fileURLToPath(import.meta.url)) process.exitCode = main(process.argv.slice(2))
