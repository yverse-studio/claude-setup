#!/usr/bin/env node
// Fails when a game's design doc lacks what roles/game-designer.md asks of it: every heading with
// content, numbers in the session and difficulty parts, two NOT lines, three references with a
// link, the day read, Copy and Skip, and a Not checked list. Usage: node gdd-check.mjs [design/GDD.md]  (exit 1 on errors)
import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

export const REQUIRED_HEADINGS = ['Core loop', 'Session length', 'Progression', 'Difficulty curve', 'Feel and feedback', 'Monetisation hooks', 'Not this', 'References']
const MIN_REFERENCES = 3
const MIN_NOT_LINES = 2
const MIN_CURVE_ROWS = 2
export const PLACEHOLDER = /<(?:name|game|store link|date|numbers as read|what|what and why)>/g // the template's own; game text such as <kbd> is not one
const DAY_READ = /\b\d{4}-\d{2}-\d{2}\b/
const DIVIDER = /^\s*\|?[\s:|-]+\|[\s:|-]*$/
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

export function checkGdd(md) {
  const errors = []
  const s = sections(md)
  for (const h of REQUIRED_HEADINGS) {
    if (!(h in s)) errors.push(`no "## ${h}" section`)
    else if (!s[h].trim()) errors.push(`## ${h} is empty`)
  }
  for (const m of md.matchAll(PLACEHOLDER)) errors.push(`template placeholder left: ${m[0].slice(0, 40)}`)
  for (const h of ['Session length', 'Difficulty curve']) {
    if (s[h]?.trim() && !/\d/.test(s[h])) errors.push(`## ${h} has no number`)
  }
  const rows = (s['Difficulty curve'] ?? '').split('\n').filter((l) => /^\s*\|/.test(l) && !DIVIDER.test(l)).slice(1)
  if (s['Difficulty curve']?.trim() && rows.filter((r) => /\d/.test(r)).length < MIN_CURVE_ROWS) errors.push(`## Difficulty curve: a table with at least ${MIN_CURVE_ROWS} rows that carry numbers`)
  if (s['Not this'] !== undefined && bullets(s['Not this']).length < MIN_NOT_LINES) errors.push(`## Not this: at least ${MIN_NOT_LINES} bullets`)
  const refs = bullets(s.References ?? '')
  if (s.References !== undefined && refs.length < MIN_REFERENCES) errors.push(`## References: ${refs.length} of ${MIN_REFERENCES} games`)
  for (const r of refs) {
    for (const [re, what] of [[/https?:\/\//, 'a link'], [/\bCopy:/, '"Copy:"'], [/\bSkip:/, '"Skip:"'], [DAY_READ, 'the day read (YYYY-MM-DD)']]) {
      if (!re.test(r)) errors.push(`reference without ${what}: ${r.trim().slice(0, 50)}`)
    }
  }
  if (!/^\*{0,2}Not checked:/m.test(md)) errors.push('no "Not checked:" list')
  return errors
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const file = resolve(process.argv[2] ?? 'design/GDD.md')
  if (!existsSync(file)) { console.error(`gdd: ${file} does not exist; the Game Designer writes it before the first build (roles/game-designer.md)`); process.exit(1) }
  const errors = checkGdd(readFileSync(file, 'utf8'))
  for (const e of errors) console.error('gdd: ' + e)
  console.log(errors.length ? `gdd: ${errors.length} problem(s)` : 'gdd: ok')
  process.exit(errors.length ? 1 : 0)
}
