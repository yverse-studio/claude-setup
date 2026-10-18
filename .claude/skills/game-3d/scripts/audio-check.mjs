#!/usr/bin/env node
// A game repo that makes sound (audio files, or AudioContext / new Audio / Howl / a synth library in src/) must carry
// design/AUDIO.md as roles/audio.md asks, and every audio file needs a manifest row with a licence
// that allows a paid game. Usage: node audio-check.mjs [repo root]  (exit 1 on errors)
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs'
import { join, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

export const REQUIRED_HEADINGS = ['Sound palette', 'Music plan', 'Mix bar', 'Mute and settings', 'Autoplay and platform', 'File budget', 'Not this', 'References']
const NUMBERED = ['Music plan', 'Mix bar', 'File budget']
const MIN_REFERENCES = 3
const MIN_NOT_LINES = 2
export const PLACEHOLDER = /<(?:name|game|store link|date|moments with sound, music layers, mute behaviour as heard|what|what and why)>/g // the template's own; game text such as <kbd> is not one
export const AUDIO_FILE = /\.(?:ogg|mp3|wav|m4a|flac|opus|aac|weba|aiff?|midi?)$/i
// Web Audio (also the webkit prefix), Audio and Howl, an import of a known synth library, or zzfx pasted in
const SYNTH_LIBS = 'zzfx|zzfxm|tone|jsfxr|sfxr|pizzicato|howler|webaudio-tinysynth|standardized-audio-context'
export const AUDIO_CODE = new RegExp(`\\b(?:webkit)?AudioContext\\b|\\bnew Audio\\(|\\bHowl\\(|\\bzzfx\\(|\\b(?:from|import|require\\()\\s*\\(?\\s*['"](?:${SYNTH_LIBS})(?:/[^'"]*)?['"]`)
// the whole value, not a mention: "not CC0", "CC0-NC" and "CC0 (trust me)" must fail
const ALLOWED_LICENCE = /^(?:(?:Creative Commons )?CC0(?:[ -]1\.0)?(?: Universal)?(?: \(CC0 1\.0\))?(?: Public Domain Dedication)?|public domain|own (?:synthesis|work))$/i
const DAY_READ = /\b\d{4}-\d{2}-\d{2}\b/
const DIVIDER = /^\s*\|?[\s:|-]+\|[\s:|-]*$/
// one `Budget: <n> KB` line (bold, bullet and case allowed) inside ## File budget; 0 KB would switch the size check off
const BUDGET_LINE = /^\s*(?:[-*]\s+)?\**Budget:\**\s*([1-9]\d*)\s*KB\b/gim
const budgets = (section) => [...(section ?? '').matchAll(BUDGET_LINE)].map((m) => Number(m[1]))
// code with comments cut out, so a commented-out import or a note about Tone.js is not sound
export const stripComments = (src) => src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|\s)\/\/.*$/gm, '$1')
const TEST_FILE = /(?:\.(?:test|spec)\.[^/\\]+$|[\\/]__tests__[\\/])/
const filled = (v) => typeof v === 'string' && v.trim() !== ''
const bullets = (text) => text.split('\n').filter((l) => /^\s*[-*]\s+\S/.test(l))

function sections(md) {
  const out = {}
  let name = null
  for (const line of md.split('\n')) {
    const h = line.match(/^##\s+(.+?)\s*$/)
    if (h) { name = h[1]; out[name] = '' } else if (/^\*{0,2}Not checked:/.test(line)) name = null
    else if (name) out[name] += line + '\n'
  }
  return out
}

export function checkDoc(md) {
  const errors = []
  const s = sections(md)
  for (const h of REQUIRED_HEADINGS) {
    if ([...md.matchAll(new RegExp(`^##\\s+${h}\\s*$`, 'gm'))].length > 1) errors.push(`## ${h} appears twice`)
    if (!(h in s)) errors.push(`no "## ${h}" section`)
    else if (!s[h].trim()) errors.push(`## ${h} is empty`)
  }
  for (const m of md.matchAll(PLACEHOLDER)) errors.push(`template placeholder left: ${m[0].slice(0, 40)}`)
  for (const h of NUMBERED) if (s[h]?.trim() && !/\d/.test(s[h])) errors.push(`## ${h} has no number`)
  if (s['File budget']?.trim() && budgets(s['File budget']).length !== 1) errors.push('## File budget: exactly one line "Budget: <n> KB"')
  const [head, ...rows] = (s['Sound palette'] ?? '').split('\n').filter((l) => /^\s*\|/.test(l) && !DIVIDER.test(l)).map((l) => l.trim().replace(/^\||\|$/g, '').split('|'))
  const col = head?.findIndex((c) => /length/i.test(c)) ?? -1
  if (s['Sound palette']?.trim() && !(col >= 0 && rows.some((r) => /^\s*\d+\s*(?:ms)?\s*$/i.test(r[col] ?? '')))) errors.push('## Sound palette: a table with a "Length" column and at least one row that carries a number in ms')
  if (s['Not this'] !== undefined && bullets(s['Not this']).length < MIN_NOT_LINES) errors.push(`## Not this: at least ${MIN_NOT_LINES} bullets`)
  const refs = bullets(s.References ?? '')
  if (s.References !== undefined && refs.length < MIN_REFERENCES) errors.push(`## References: ${refs.length} of ${MIN_REFERENCES} games`)
  for (const r of refs) {
    for (const [re, what] of [[/https?:\/\//, 'a link'], [/\bCopy:/, '"Copy:"'], [/\bSkip:/, '"Skip:"'], [DAY_READ, 'the day played (YYYY-MM-DD)']]) {
      if (!re.test(r)) errors.push(`reference without ${what}: ${r.trim().slice(0, 50)}`)
    }
  }
  if (!/^\*{0,2}Not checked:/m.test(md)) errors.push('no "Not checked:" list')
  return errors
}

// repo: { doc: string|null, files: [{ path, bytes }], manifest: object|null, usesAudioCode: boolean }
export function checkAudio({ doc, files, manifest, usesAudioCode }) {
  if (!files.length && !usesAudioCode && doc === null) return []
  const errors = []
  if (doc === null) errors.push('this game makes sound but design/AUDIO.md does not exist; the Audio role writes it (roles/audio.md)')
  else errors.push(...checkDoc(doc))
  if (manifest && !Array.isArray(manifest.assets)) errors.push('assets/manifest.json: "assets" must be a list')
  const rows = (Array.isArray(manifest?.assets) ? manifest.assets : []).filter((a) => a && typeof a.path === 'string' && a.path).map((a) => ({ ...a, path: a.path.replace(/^(?:\.?\/)+/, '').replace(/\/$/, '') })) // ./assets/a.ogg and /assets/a.ogg name the same file as assets/a.ogg
  for (const f of files) {
    const covering = rows.filter((r) => f.path === r.path || f.path.startsWith(r.path + '/'))
    if (!covering.length) errors.push(`${f.path}: no assets/manifest.json row`)
    for (const row of covering) { // every row that covers the file must pass, so a folder row cannot hide a stricter file row
      if (typeof row.licence !== 'string' || !ALLOWED_LICENCE.test(row.licence.trim())) errors.push(`${f.path}: licence "${row.licence ?? ''}" (row ${row.path}) is not exactly CC0, public domain or own synthesis`)
      else if (!filled(row.source) || !filled(row.author) || row.commercial !== true) errors.push(`${f.path}: manifest row ${row.path} needs source, author and commercial: true`)
    }
  }
  const [budget] = doc === null ? [] : budgets(sections(doc)['File budget'])
  const total = files.reduce((n, f) => n + f.bytes, 0)
  if (budget && total > budget * 1024) errors.push(`audio files total ${Math.ceil(total / 1024)} KB, over the doc's budget of ${budget} KB`)
  return errors
}

const SKIP_DIRS = new Set(['node_modules', '.git', 'dist', '.output', '.nuxt', 'coverage', '.shots', 'test-results', 'playwright-report'])
function walk(dir) {
  return readdirSync(dir).flatMap((n) => {
    const p = join(dir, n)
    if (statSync(p).isDirectory()) return SKIP_DIRS.has(n) ? [] : walk(p)
    return [p]
  })
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const root = resolve(process.argv[2] ?? '.')
  const all = walk(root)
  const files = all.filter((p) => AUDIO_FILE.test(p)).map((p) => ({ path: relative(root, p).split('\\').join('/'), bytes: statSync(p).size }))
  const code = all.filter((p) => /(?:^|[\\/])src[\\/].+\.(?:ts|js|mjs|vue)$/.test(relative(root, p)) && !TEST_FILE.test(p) && AUDIO_CODE.test(stripComments(readFileSync(p, 'utf8'))))
  const read = (rel) => (existsSync(join(root, rel)) ? readFileSync(join(root, rel), 'utf8') : null)
  const manifestText = read('assets/manifest.json')
  let manifest = null
  try { manifest = manifestText ? JSON.parse(manifestText) : null } catch { console.error('audio: assets/manifest.json is not valid JSON'); process.exit(1) }
  const errors = checkAudio({ doc: read('design/AUDIO.md'), files, manifest, usesAudioCode: code.length > 0 })
  for (const e of errors) console.error('audio: ' + e)
  console.log(errors.length ? `audio: ${errors.length} problem(s)` : `audio: ok (${files.length} files${code.length ? `, sound in ${code.length} source files` : ''})`)
  process.exit(errors.length ? 1 : 0)
}
