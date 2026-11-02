// node scripts/migration/rewrite-owner.mjs <repo-dir> <old-owner> <new-owner> [--run]
// Rewrites the owner in tracked text files: "OLD/repo" paths, github.com/OLD, org/owner fields,
// `head=OLD:`. Plain-word mentions of a person (yskills) are left alone. Dry run unless --run.
import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { git } from './lib.mjs'

const [dir, oldO, newO, flag] = process.argv.slice(2)
if (!dir || !oldO || !newO) { console.error('usage: rewrite-owner.mjs <dir> <old> <new> [--run]'); process.exit(2) }
const run = flag === '--run'
const o = oldO.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
const rules = [
  new RegExp(`(?<![\\w-])${o}(?=/[\\w.-])`, 'g'),                                  // OLD/repo, github.com/OLD/repo
  new RegExp(`(?<=(?:org|ORG|owner|OWNER|Organization|account_name)["']?\\s*[:=]\\s*["']?)${o}(?![\\w-])`, 'g'),
  new RegExp(`(?<=head=)${o}(?=:)`, 'g'),                                        // gh api head=OLD:branch
  new RegExp(`(?<=/organizations/)${o}(?=/)`, 'g'),
]
const SKIP = /^(docs\/(archive|research)\/|PROGRESS\.md$)|\.(png|jpe?g|gif|webp|zip|vrm|glb|mp[34]|wav|ogg|pdf|bundle|patch)$/i
let files = 0, hits = 0
for (const f of git(dir, 'ls-files').split('\n')) {
  if (!f || SKIP.test(f)) continue
  let text
  try { text = readFileSync(join(dir, f), 'utf8') } catch { continue }
  if (text.includes('\0')) continue
  let n = 0
  const next = rules.reduce((t, re) => t.replace(re, () => (n++, newO)), text)
  if (!n) continue
  files++; hits += n
  console.log(`${String(n).padStart(3)}  ${f}`)
  if (run) writeFileSync(join(dir, f), next)
}
console.log(`\n${hits} replacements in ${files} files${run ? ' (written)' : ' (dry run, add --run)'}. Then: node scripts/check.mjs && npm test`)
