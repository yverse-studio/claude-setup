#!/usr/bin/env node
// A game repo that makes sound (audio files, or AudioContext / new Audio / Howl in src/) must carry
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
export const AUDIO_FILE = /\.(?:ogg|mp3|wav|m4a|flac|opus|aac)$/i
export const AUDIO_CODE = /\bAudioContext\b|\bnew Audio\(|\bHowl\(/
const ALLOWED_LICENCE = /\bCC0\b|public domain|own (?:synthesis|work)/i
const DAY_READ = /\b\d{4}-\d{2}-\d{2}\b/
const DIVIDER = /^\s*\|?[\s:|-]+\|[\s:|-]*$/
const BUDGET = /\bBudget:\s*(\d+)\s*KB\b/i
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
    if (!(h in s)) errors.push(`no "## ${h}" section`)
    else if (!s[h].trim()) errors.push(`## ${h} is empty`)
  }
  for (const m of md.matchAll(PLACEHOLDER)) errors.push(`template placeholder left: ${m[0].slice(0, 40)}`)
  for (const h of NUMBERED) if (s[h]?.trim() && !/\d/.test(s[h])) errors.push(`## ${h} has no number`)
  if (s['File budget']?.trim() && !BUDGET.test(s['File budget'])) errors.push('## File budget: write "Budget: <n> KB"')
  const rows = (s['Sound palette'] ?? '').split('\n').filter((l) => /^\s*\|/.test(l) && !DIVIDER.test(l)).slice(1)
  if (s['Sound palette']?.trim() && !rows.some((r) => /\d/.test(r))) errors.push('## Sound palette: a table with at least one row that carries a length in ms')
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
  const rows = new Map((manifest?.assets ?? []).filter((a) => a.path).map((a) => [a.path.replace(/\/$/, ''), a]))
  for (const f of files) {
    const row = [...rows.entries()].find(([p]) => f.path === p || f.path.startsWith(p + '/'))?.[1]
    if (!row) errors.push(`${f.path}: no assets/manifest.json row`)
    else if (!ALLOWED_LICENCE.test(row.licence ?? '')) errors.push(`${f.path}: licence "${row.licence ?? ''}" is not CC0, public domain or own synthesis`)
  }
  const budget = Number(doc?.match(BUDGET)?.[1])
  const total = files.reduce((n, f) => n + f.bytes, 0)
  if (budget && total > budget * 1024) errors.push(`audio files total ${Math.ceil(total / 1024)} KB, over the doc's budget of ${budget} KB`)
  return errors
}

const SKIP_DIRS = new Set(['node_modules', '.git', 'dist', '.output', '.nuxt', 'coverage'])
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
  const code = all.filter((p) => /[\\/]src[\\/].+\.(?:ts|js|mjs|vue)$/.test(p) && AUDIO_CODE.test(readFileSync(p, 'utf8')))
  const read = (rel) => (existsSync(join(root, rel)) ? readFileSync(join(root, rel), 'utf8') : null)
  const manifestText = read('assets/manifest.json')
  const errors = checkAudio({ doc: read('design/AUDIO.md'), files, manifest: manifestText ? JSON.parse(manifestText) : null, usesAudioCode: code.length > 0 })
  for (const e of errors) console.error('audio: ' + e)
  console.log(errors.length ? `audio: ${errors.length} problem(s)` : `audio: ok (${files.length} files${code.length ? `, sound in ${code.length} source files` : ''})`)
  process.exit(errors.length ? 1 : 0)
}
