#!/usr/bin/env node
// Fails when a project's tracking plan breaks what operator/roles/analytics.md asks of it: every
// heading filled, few core events named Object + Action in Title Case, no dynamic values in names,
// snake_case properties, every event tied to a question, one HQ money metric and a cookieless or
// consent basis that agrees with the banner line. Also checks the weekly numbers line.
// checkRoleDoc guards the Tools table of operator/roles/analytics.md (every row ends in a source) and its legal-check lines.
// Usage: node analytics-check.mjs [analytics/TRACKING.md]  (exit 1 lists what fails)
import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

export const REQUIRED_HEADINGS = ['Objectives', 'Events', 'Privacy']
export const MONEY_METRICS = ['visitors7d', 'signups', 'paying', 'revenueMonth'] // the HQ project-row fields (docs/hq-rows.md)
export const MAX_EVENTS = 12
export const PLACEHOLDER = /<(?:name|Object Action|question|metric|basis|properties|tool|ja\/nein)>/g // the template's own
const PAST_IRREGULAR = ['Paid', 'Sent', 'Left', 'Built', 'Bought', 'Began', 'Won', 'Lost', 'Chose', 'Shown', 'Seen', 'Made']
const DYNAMIC = /\d|[()#:@/]/
const DIVIDER = /^\s*\|?[\s:|-]+\|[\s:|-]*$/
const ESTIMATE = /~|≈|\bca\.|\bcirca\b|\babout\b|\bapprox|\betwa\b|\bungefähr\b|schätz/i

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

export function eventNameErrors(name) {
  const errors = []
  const words = name.split(/\s+/).filter(Boolean)
  if (DYNAMIC.test(name)) errors.push(`"${name}" has a dynamic value (a number or punctuation)`)
  if (words.length < 2) errors.push(`"${name}" is one word; name Object + Action`)
  if (words.some((w) => !/^[A-Z][a-z]*$/.test(w))) errors.push(`"${name}" is not Title Case words (e.g. "Checkout Started")`)
  const last = words.at(-1) ?? ''
  if (words.length >= 2 && !/ed$/.test(last) && !PAST_IRREGULAR.includes(last)) errors.push(`"${name}" does not end in a past-tense action (Started, Paid, ...)`)
  return errors
}

export function checkTracking(md) {
  const errors = []
  const s = sections(md)
  for (const h of REQUIRED_HEADINGS) {
    if (!(h in s)) errors.push(`no "## ${h}" section`)
    else if (!s[h].trim()) errors.push(`## ${h} is empty`)
  }
  for (const m of md.matchAll(PLACEHOLDER)) errors.push(`template placeholder left: ${m[0]}`)
  const objectives = (s.Objectives ?? '').split('\n').filter((l) => /^\s*[-*]\s+\S/.test(l))
  if (s.Objectives?.trim() && !objectives.length) errors.push('## Objectives has no bullet line')
  const events = rows(s.Events ?? '')
  if (s.Events?.trim() && !events.length) errors.push('## Events has no row')
  if (events.length > MAX_EVENTS) errors.push(`## Events has ${events.length} rows, max ${MAX_EVENTS}: keep few core events with properties`)
  const seen = new Set()
  const bases = []
  events.forEach(([name = '', question = '', metric = '', basis = '', props = ''], i) => {
    const at = `## Events row ${i + 1} (${name.slice(0, 30)})`
    if (!name || !question || !metric || !basis) return errors.push(`${at} lacks a name, question, money metric or basis`)
    for (const e of eventNameErrors(name)) errors.push(`${at}: ${e}`)
    if (seen.has(name.toLowerCase())) errors.push(`${at}: duplicate event name`)
    seen.add(name.toLowerCase())
    if (!MONEY_METRICS.includes(metric)) errors.push(`${at}: money metric "${metric}" is not one of ${MONEY_METRICS.join(', ')}`)
    if (!/^(?:cookieless|consent)\b/.test(basis)) errors.push(`${at}: basis must start with "cookieless" or "consent"`)
    else bases.push(basis.startsWith('consent') ? 'consent' : 'cookieless')
    for (const p of props.split(',').map((x) => x.trim()).filter(Boolean)) {
      if (!/^[a-z][a-z]*(?:_[a-z]+)*$/.test(p)) errors.push(`${at}: property "${p}" is not snake_case without digits`)
    }
  })
  const privacy = s.Privacy ?? ''
  const tool = privacy.match(/^\s*[-*]\s*Tool:\s*(\S.*)$/im)?.[1]
  const banner = privacy.match(/^\s*[-*]\s*Banner:\s*(ja|nein)\b/im)?.[1]?.toLowerCase()
  if (s.Privacy?.trim() && !tool) errors.push('## Privacy lacks a "- Tool:" line')
  if (s.Privacy?.trim() && !banner) errors.push('## Privacy lacks a "- Banner: ja" or "- Banner: nein" line')
  if (banner === 'nein' && bases.includes('consent')) errors.push('an event needs consent but ## Privacy says Banner: nein')
  if (banner === 'ja' && bases.length && !bases.includes('consent')) errors.push('## Privacy says Banner: ja but no event needs consent; drop the banner or the tool')
  return errors
}

// "<project> KW42 | Besucher 7d: 120 | Anmeldungen: 4 | Zahlende: 1 | Umsatz: 9,00 € live | Quelle: Umami, gelesen 2026-10-19T08:00Z"
export function checkNumbersLine(line) {
  const errors = []
  if (ESTIMATE.test(line)) errors.push('numbers line contains an estimate word or sign; copy the number as read or write "nicht gelesen"')
  const fields = line.split('|').map((f) => f.trim())
  if (!/^\S+ KW\d{1,2}$/.test(fields[0] ?? '')) errors.push('numbers line must start with "<project> KW<nn>"')
  for (const key of ['Besucher 7d', 'Anmeldungen', 'Zahlende', 'Umsatz']) {
    const value = fields.find((f) => f.startsWith(`${key}:`))?.slice(key.length + 1).trim()
    if (value === undefined) errors.push(`numbers line lacks "${key}:"`)
    else if (!/^(?:\d[\d.,]*(?: €)?(?: (?:live|Testgeld))?|nicht gelesen)$/.test(value)) errors.push(`"${key}: ${value}" is neither a number nor "nicht gelesen"`)
  }
  if (!fields.some((f) => /^Quelle: .+, gelesen \d{4}-\d{2}-\d{2}/.test(f))) errors.push('numbers line lacks "Quelle: <tool>, gelesen <ISO date>"')
  return errors
}

// operator/roles/analytics.md: each Tools row names its source (a vendor URL or "none needed"), and the legal check stays in Method and Bar.
export function checkRoleDoc(md) {
  const errors = []
  const s = sections(md)
  const tools = rows(s.Tools ?? '')
  if (!tools.length) errors.push('roles/analytics.md: ## Tools has no row')
  for (const cells of tools) {
    const [tool = '', , , , source = ''] = cells
    if (cells.length !== 5) errors.push(`roles/analytics.md: Tools row "${tool}" has ${cells.length} cells, expected 5`)
    else if (!/^(?:https?:\/\/\S+|none needed\b)/.test(source)) errors.push(`roles/analytics.md: Tools row "${tool}" has no source (a vendor URL or "none needed")`)
  }
  for (const h of ['Method', 'Bar']) {
    if (!(s[h] ?? '').includes('legal-reviewer')) errors.push(`roles/analytics.md: ## ${h} lost the legal-reviewer check`)
  }
  return errors
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const file = resolve(process.argv[2] ?? 'analytics/TRACKING.md')
  if (!existsSync(file)) { console.error(`analytics-check: ${file} does not exist`); process.exit(1) }
  const errors = checkTracking(readFileSync(file, 'utf8'))
  for (const e of errors) console.log(`FAIL ${e}`)
  console.log(errors.length ? `analytics-check: ${errors.length} failing` : 'analytics-check: pass')
  process.exit(errors.length ? 1 : 0)
}
