#!/usr/bin/env node
// Writes the folder the project chat reads first: COORDINATOR-CARD.md, COORDINATOR-RULES-INDEX.md, ROSTER.md and briefs/<role>.md. The project-chat
// coordinator has no Bash, no repo and no hooks (proven 2026-11-08), so threads write these files to /mnt/project-files/claude-setup/ and the coordinator
// Reads them. Everything is rendered by global/card-render.mjs (the boot copy refreshes a stale folder in every project at a thread's start, M50 slice B).
// Usage: node scripts/coordinator-card.mjs [out-path]   (default ./COORDINATOR-CARD.md; the other files go beside it)
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { CARD_MAX, INDEX_MAX, buildCard as card, buildIndex as index, cardHash, renderAll, ruleRows, writeAll } from '../global/card-render.mjs'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const read = (f) => readFileSync(join(root, f), 'utf8').replace(/\r/g, '')
export { CARD_MAX, INDEX_MAX, ruleRows }
export const buildCard = (o = {}) => card({ teams: read('docs/TEAMS.md'), ...o })
export const buildIndex = (o = {}) => index({ teams: read('docs/TEAMS.md'), map: read('docs/MAP.md'), ...o })

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const out = process.argv[2] ?? './COORDINATOR-CARD.md'
  if (out.startsWith('-')) { console.error(`coordinator-card: "${out}" is a flag, not an output path (usage: node scripts/coordinator-card.mjs [out-path])`); process.exit(2) }
  const dir = dirname(out)
  const files = renderAll({ base: root })
  const name = out.split(/[\\/]/).pop()
  if (name !== 'COORDINATOR-CARD.md') { files.set(name, files.get('COORDINATOR-CARD.md')); files.delete('COORDINATOR-CARD.md') }
  const written = writeAll(dir, files)
  console.log(`${out}: hash ${cardHash(root)}, ${files.size} files (${[...files.keys()].filter((k) => k.startsWith('briefs/')).length} brief files) in ${dir}, ${written} written`)
}
