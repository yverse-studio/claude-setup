#!/usr/bin/env node
// Writes COORDINATOR-CARD.md, the one file the project chat reads first. The project-chat coordinator has
// no Bash, no repo and no hooks (proven 2026-11-08), so team-guard's card never reached it; threads write
// this file to /mnt/project-files/claude-setup/ and the coordinator Reads it.
// Usage: node scripts/coordinator-card.mjs [out-path]   (default ./COORDINATOR-CARD.md)
import { readFileSync, writeFileSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { coordinatorCard } from '../global/team-guard.mjs'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
export const CARD_MAX = 6500 // 6,600 until #430, 8,000 until 2026-11-12 (M27 step 6: rules a hook enforces left the card, the brief template came in)
const cells = (l) => l.split('|').map((c) => c.trim())
const read = (f) => readFileSync(join(root, f), 'utf8').replace(/\r/g, '')

const PREFLIGHT = `## Before every reply

- Luna: at most 15 lines / 1,500 characters, at least one kaomoji, result first, in his language.
- Facts (what the code uses, a PR, a device or browser state, a role's model, a thread's plan) only from a source read this turn and linked: PLAN.json, NOW.md, list_threads, the thread's last reply. None in reach: "prüfe ich" and ask the owning thread. Say nothing for a thread before it answered; a device that dropped mid-job is one line the same turn.
- Every start_thread passes \`model\` and the brief below; \`Role:\` is a Roster name exactly. Before a message_thread with work: same role and topic as the thread's title, thread not done; else a new thread. Folder moves and cleanups never go to a builder.
- A finished thread (done, failed, stopped, or review_ready idle 2 h with a Done: or hand-off reply) gets set_thread_resolved or a nudge before you stop; relist when your board is 2 h old.
- Every ask or pointer carries its clickable link ([title](#cmsg_…), URL, [Project settings](#project-settings/resources)); every ask of yskills gets a thread, a PR or a \`Done:\` line the same turn; a skill idea is a PR (\`new-skill\`), never a propose_skills card.
- A PR whose \`Depends on: #n\` is parked or blocked: one chat line the same turn naming both PRs and the fix.
- Ask yskills only the real moment (a level from his life), goal, taste and the ask-first list; build details, process and order you decide, in one line.
- Gate (you stop the builder, no hook does): up to 6 rounds; the round number stands in the asset's gate file and every handoff, never only in a thread; 3 failed rounds on one asset stop the builder until the Planner has re-planned; a check failing twice gets a diagnosis first; after round 6 one card to yskills. Game PRs: Controls and World life pass before any look round.
- A second fresh thread for one asset is a quality-loss trigger: send the handoff files to the Planner for a diagnosis first, the handoff carries the round and every approach tried, and the restart is not posted (docs/WORKFLOW.md, Handoff triggers).
- Plan: /mnt/project-files/PLAN.json is the one plan; threads write it (scripts/plan.mjs), you only Read it before every reply, then write_custom_view. "Stand?": goal, x/y done, doing, waits on him, next 3. Ping only when he must act, rate a visual, a part is Done (link), or a plan question.
- Project instructions lack the line "Read /mnt/project-files/claude-setup/COORDINATOR-CARD.md first": call update_project_settings once, PREPEND operator/templates/project-instructions.md filled for this project, keep every existing line, say so in one line.`

// The one brief template: copied from docs/templates/thread-brief.md, the file team-guard's test keeps in step with its check.
export function briefBlock(md) {
  const m = md.match(/```\n([\s\S]*?)```/)
  if (!m) throw new Error('docs/templates/thread-brief.md has no code block')
  return `## Thread brief (copy, fill every <...>, one field per line)\n\n\`\`\`\n${m[1]}\`\`\``
}

export function ruleRows(map) {
  const t = map.split('\n## One home per rule')[1] ?? ''
  return t.split('\n').filter((l) => l.startsWith('| ') && !/^\| (Rule|---)/.test(l)).map((l) => {
    const c = l.split('|').map((x) => x.trim())
    return { rule: c[1], home: c[2] }
  })
}

// team-guard's coordinatorCard() is the source (Spawn rule, Models, Sizes, Roster, Kits, ~9,000 characters);
// this squeezes it to what a start_thread needs so the whole file stays under CARD_MAX.
const clip = (t, n) => (t.length > n ? `${t.slice(0, n - 1).trimEnd()}…` : t)
const flat = (t) => t.replace(/\s+/g, ' ').replace(/\[`?([^\]]*?)`?\]\([^)]*\)/g, '$1').trim()
export function compact(full) {
  const part = (from, to) => { const a = full.indexOf(from); const b = to ? full.indexOf(to, a + 1) : full.length; return a < 0 ? '' : full.slice(a, b < 0 ? undefined : b).trim() }
  const modelsLine = (part('## Spawn rule', '## Sizes').match(/\nModels:.*/) ?? [''])[0]
  const ids = [...modelsLine.matchAll(/(Fable|Opus|Sonnet|Haiku) \((claude-[\w.-]+)\)/g)].map((m) => `${m[1]} ${m[2]}`).join(', ')
  const sizes = part('## Sizes', '## Roster').split('\n').filter((l) => /^\| [SML] \|/.test(l)).map((l) => { const c = cells(l); return `- ${c[1]}: ${clip(flat(c[2]), 95)}; threads: ${clip(flat(c[3]), 80)}` })
  const roster = part('## Roster', '## Kits').split('\n').filter((l) => l.startsWith('- ') && /thread/.test(l)).map((l) => { const [r, ...rest] = l.slice(2).split(': '); return `- ${r}: ${clip(flat(rest.join(': ')), 85)}` })
  const kits = part('## Kits').split('\n').filter((l) => l.startsWith('- ')).map((l) => clip(flat(l), 110))
  return [
    `## Models (docs/TEAMS.md)\n\n${ids}. A model yskills names is used as named. A thread picks no Fable. Task first, then kit, then size; the thread's brief check refuses an unknown kit and a size or role that kit does not allow.`,
    `## Sizes\n\n${sizes.join('\n')}`, `## Roster (thread roles: runs as; model)\n\n${roster.join('\n')}`, `## Kits (team at size L)\n\n${kits.join('\n')}`,
  ].join('\n\n')
}

export function buildCard({ hash = 'nogit', date = new Date().toISOString().slice(0, 10) } = {}) {
  const head = `Coordinator card (claude-setup ${hash}, ${date}).\nYou are the project chat. You have no Bash and no repo: this card and MEMORY.md are your rules.\nA rule not on this card: Read COORDINATOR-RULES-INDEX.md in this folder; still unclear: ask a setup thread (size S); never guess.`
  const full = coordinatorCard(read('docs/TEAMS.md'), '') // '' drops the "Text only" section: it does not fit
  const team = full ? compact(full) : ''
  const build = () => [head, PREFLIGHT, briefBlock(read('docs/templates/thread-brief.md')), team].join('\n\n') + '\n'
  const card = build()
  if (!team || card.length >= CARD_MAX) throw new Error(`coordinator card is ${card.length} characters, limit ${CARD_MAX}: trim a pre-flight line or a Roster cell`)
  return card
}

export const INDEX_MAX = 20000
export function buildIndex({ hash = 'nogit', date = new Date().toISOString().slice(0, 10) } = {}) {
  const head = `Rules index (claude-setup ${hash}, ${date}). Read this when a rule is not on the card;\nthe home is the file to name, never a guess.`
  const out = `${head}\n\n${ruleRows(read('docs/MAP.md')).map((r) => `- ${r.rule} → ${r.home}`).join('\n')}\n`
  if (out.length >= INDEX_MAX) throw new Error(`rules index is ${out.length} characters, limit ${INDEX_MAX}`)
  return out
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  let hash = 'nogit'
  try { hash = execFileSync('git', ['rev-parse', '--short', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim() } catch { hash = 'nogit' }
  const card = buildCard({ hash })
  const out = process.argv[2] ?? './COORDINATOR-CARD.md'
  if (out.startsWith('-')) { console.error(`coordinator-card: "${out}" is a flag, not an output path (usage: node scripts/coordinator-card.mjs [out-path])`); process.exit(2) }
  writeFileSync(out, card)
  const idx = buildIndex({ hash })
  const idxOut = join(dirname(out), 'COORDINATOR-RULES-INDEX.md')
  writeFileSync(idxOut, idx)
  console.log(`${out}: ${card.length} characters; ${idxOut}: ${idx.length} characters`)
}
