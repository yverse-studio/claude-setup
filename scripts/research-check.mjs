// Checks a research report against roles/researcher.md (Method): a Sources section, a Not checked
// list, and a link or path:line in every bullet or table row of the body. Usage: node scripts/research-check.mjs <file>...
import { readFileSync } from 'node:fs'

const SOURCE = /https?:\/\/|\]\(|`[^`\s]+:\d+[^`]*`|\binferred\b/
let failed = false
for (const f of process.argv.slice(2)) {
  const text = readFileSync(f, 'utf8')
  const errors = []
  if (!/^#+\s.*Sources/im.test(text)) errors.push('no "Sources" section')
  if (!/^Not checked:/m.test(text)) errors.push('no "Not checked:" list')
  let tail = false // bullets under "Not checked:" list gaps, not claims
  text.split('\n').forEach((l, i) => {
    if (/^Not checked:/.test(l)) tail = true
    const claim = /^\s*[-*]\s+\S/.test(l) || /^\|\s*[^\s|-]/.test(l)
    if (claim && !tail && !/^\|\s*(Part|Source)\b/.test(l) && !SOURCE.test(l)) errors.push(`line ${i + 1} has no source: ${l.trim().slice(0, 60)}`)
  })
  if (errors.length) { failed = true; console.error(`${f}\n${errors.map((e) => `x ${e}`).join('\n')}`) }
}
process.exit(failed ? 1 : 0)
