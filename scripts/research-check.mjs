// Checks a research report against roles/researcher.md (Method): a Sources section, a Not checked
// list, and a link or path:line in every content line outside it (bullet, numbered item, table row,
// sentence). Usage: node scripts/research-check.mjs <file>...
import { readFileSync } from 'node:fs'

const SOURCE = /https?:\/\/|\]\(|`[^`\s]+\.[a-z]{1,5}:\d+[^`]*`|\binferred\b/
const DIVIDER = /^\s*\|?[\s:|-]+\|[\s:|-]*$/
let failed = false
for (const f of process.argv.slice(2)) {
  const lines = readFileSync(f, 'utf8').split('\n')
  const errors = []
  if (!lines.some((l) => /^#+\s*(\d+\.\s*)?Sources\b/i.test(l))) errors.push('no "Sources" section')
  if (!lines.some((l) => /^Not checked:/.test(l))) errors.push('no "Not checked:" list')
  let gaps = false // bullets directly under "Not checked:" list gaps, not claims
  let fence = false
  lines.forEach((l, i) => {
    if (/^\s*```/.test(l)) fence = !fence
    if (fence || /^\s*```/.test(l)) return
    if (gaps && !/^\s*[-*]\s/.test(l)) gaps = false
    if (/^Not checked:/.test(l)) gaps = true
    const isHeader = DIVIDER.test(lines[i + 1] ?? '') && /^\s*\|/.test(l)
    if (gaps || !l.trim() || /^#/.test(l) || DIVIDER.test(l) || isHeader) return
    if (!SOURCE.test(l)) errors.push(`line ${i + 1} has no source: ${l.trim().slice(0, 60)}`)
  })
  // #595: a "## 4b" teardown needs the six topics, and each product block (### heading, or the section itself) one [S] line with a link.
  const i4 = lines.findIndex((l) => /^##\s+4b\b/i.test(l))
  if (i4 >= 0) {
    const end = lines.findIndex((l, j) => j > i4 && /^##\s/.test(l))
    const sec = lines.slice(i4 + 1, end < 0 ? undefined : end)
    const body = sec.join('\n')
    const topics = [['tech stack', /tech stack/i], ['cost model', /cost model/i], ['smart part', /smart part/i], ['cheap and stable', /cheap and stable/i], ['complaints', /complaints/i], ['copy/skip', /copy\/skip/i]]
    const missing = topics.filter(([, re]) => !re.test(body)).map(([n]) => n)
    if (missing.length) errors.push(`4b teardown lacks the topic(s): ${missing.join(', ')}`)
    const blocks = body.split(/^###\s.*$/m).slice(sec.some((l) => /^###\s/.test(l)) ? 1 : 0)
    blocks.forEach((b, n) => { if (!b.split('\n').some((l) => /\[S\]/.test(l) && /https?:\/\/|\]\(/.test(l))) errors.push(`4b teardown block ${n + 1} has no [S] line with a link`) })
  }
  if (errors.length) { failed = true; console.error(`${f}\n${errors.map((e) => `x ${e}`).join('\n')}`) }
}
process.exit(failed ? 1 : 0)
