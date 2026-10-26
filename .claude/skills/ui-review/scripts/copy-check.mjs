#!/usr/bin/env node
// Fails when a project's copy deck breaks what roles/content-designer.md asks of it: every heading
// filled, a voice with three lines, a DE and an EN cell on every term and string, no avoided
// term, no vague or long button label, no promo word or "not just X" pattern in either language.
// A copy deck with a "Languages: en" line is English only: Terms are term | never, Strings are where | text.
// Usage: node copy-check.mjs [design/COPY.md]  (exit 1 lists what fails)
import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { VAGUE_LABELS } from './design-check.mjs'

export const REQUIRED_HEADINGS = ['Voice', 'Terms', 'Strings']
const MIN_VOICE_LINES = 3
const MIN_TERMS = 2
const MAX_BUTTON_WORDS = 4
export const PLACEHOLDER = /<(?:name|text|term|where|variant|German|English)>/g // the template's own
// SLOP.md 9 plus the ce-noslop promotional words; the German list is a starting list, extend it in Lessons.
export const PROMO = ['unlock', 'elevate', 'seamless', 'seamlessly', 'supercharge', 'groundbreaking', 'stunning', 'revolutionize', 'nahtlos', 'bahnbrechend', 'revolutionär', 'entfessle']
const NOT_JUST = /\bnot (?:just|only|merely)\b|\bnicht (?:nur|bloß)\b/i
const DIVIDER = /^\s*\|?[\s:|-]+\|[\s:|-]*$/
const wordRe = (w) => new RegExp(`(?<![\\p{L}\\p{N}])${w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?![\\p{L}\\p{N}])`, 'iu')

function sections(md) {
  const out = {}
  let name = null
  for (const line of md.split('\n')) {
    const h = line.match(/^##\s+(.+?)\s*$/)
    if (h) { name = h[1]; out[name] = '' } else if (name) out[name] += line + '\n'
  }
  return out
}

const rows = (text) => text.split('\n').filter((l) => /^\s*\|/.test(l) && !DIVIDER.test(l)).slice(1)
  .map((l) => l.trim().replace(/^\||\|$/g, '').split('|').map((c) => c.trim()))

export function checkCopy(md) {
  const errors = []
  const s = sections(md)
  for (const h of REQUIRED_HEADINGS) {
    if (!(h in s)) errors.push(`no "## ${h}" section`)
    else if (!s[h].trim()) errors.push(`## ${h} is empty`)
  }
  for (const m of md.matchAll(PLACEHOLDER)) errors.push(`template placeholder left: ${m[0]}`)
  const voice = (s.Voice ?? '').split('\n').filter((l) => /^\s*[-*]\s+\S/.test(l))
  if (s.Voice?.trim() && voice.length < MIN_VOICE_LINES) errors.push(`## Voice has ${voice.length} lines, needs ${MIN_VOICE_LINES}`)
  const enOnly = /^Languages:\s*en\s*$/mi.test(md)
  const terms = rows(s.Terms ?? '')
  if (s.Terms?.trim() && terms.length < MIN_TERMS) errors.push(`## Terms has ${terms.length} rows, needs ${MIN_TERMS}`)
  const avoid = []
  terms.forEach((row, i) => {
    const [de, en, never = ''] = enOnly ? [row[0], row[0], row[1]] : row
    if (!de || !en) errors.push(`## Terms row ${i + 1} lacks a German or an English term`)
    avoid.push(...never.split(',').map((w) => w.trim()).filter(Boolean))
  })
  const strings = rows(s.Strings ?? '')
  if (s.Strings?.trim() && !strings.length) errors.push('## Strings has no row')
  strings.forEach((row, i) => {
    const [where = '', de = '', en = ''] = enOnly ? [row[0], row[1], row[1]] : row
    const at = `## Strings row ${i + 1} (${where.slice(0, 30)})`
    if (!de || !en) return errors.push(`${at} lacks a German or an English text`)
    if (!enOnly && de.toLowerCase() === en.toLowerCase() && /\s/.test(de)) errors.push(`${at}: German and English are the same sentence`)
    for (const [lang, text] of enOnly ? [['EN', en]] : [['DE', de], ['EN', en]]) {
      for (const w of PROMO) if (wordRe(w).test(text)) errors.push(`${at}: ${lang} uses promo word "${w}" (SLOP.md 9)`)
      for (const w of avoid) if (wordRe(w).test(text)) errors.push(`${at}: ${lang} uses "${w}", which ## Terms rules out`)
      if (NOT_JUST.test(text)) errors.push(`${at}: ${lang} says "not just X" (a rejected option nobody raised)`)
      if (/button/i.test(where)) {
        if (VAGUE_LABELS.includes(text.toLowerCase().replace(/[.!]+$/, ''))) errors.push(`${at}: ${lang} label "${text}" is vague (SLOP.md 23)`)
        if (text.split(/\s+/).length > MAX_BUTTON_WORDS) errors.push(`${at}: ${lang} label has more than ${MAX_BUTTON_WORDS} words`)
      }
    }
  })
  return errors
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const file = resolve(process.argv[2] ?? 'design/COPY.md')
  if (!existsSync(file)) { console.error(`copy-check: ${file} does not exist`); process.exit(1) }
  const errors = checkCopy(readFileSync(file, 'utf8'))
  for (const e of errors) console.log(`FAIL ${e}`)
  console.log(errors.length ? `copy-check: ${errors.length} failing` : 'copy-check: pass')
  process.exit(errors.length ? 1 : 0)
}
