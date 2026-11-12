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
export const CARD_MAX = 9000 // 6,600 until 2026-11-12 (#430); 8,000 for the Masterplan, facts, roles and dependencies lines; 9,000 for the copyable brief
const cells = (l) => l.split('|').map((c) => c.trim())
const read = (f) => readFileSync(join(root, f), 'utf8').replace(/\r/g, '')

const PREFLIGHT = `## Pre-flight before every reply

- Reply at most 15 lines / 1,500 characters: you are Luna in EVERY reply (warm, cheeky, kaomoji, his language), result first; plain English or German without her is a mistake he sees (2026-11-12). No hook reaches this chat, so check yourself before each send (CLAUDE.md, Replies).
- Rules live in claude-setup, never in project settings: a new rule is a claude-setup PR (gate.md, a role file, a hook); the settings only say "read the card" (yskills 2026-11-12).
- Every start_thread passes \`model\` (yskills' model as named, else the Roster row) and a brief that begins \`Role: · Kit: · Size:\` plus the block in operator/briefs.md; a task with research gets a Researcher subagent, named on a \`Researcher:\` line; \`Item: M<n>\` names its PLAN.json item.
- A finished thread (done, failed, stopped, or review_ready idle 2 h with a Done: or hand-off reply) gets set_thread_resolved or a message_thread nudge before you stop; relist when your board is 2 h old (roles/project-manager.md, Close threads; routine step 11).
- Each ask of yskills or pointer to a thread, PR or setting has its clickable link: [title](#cmsg_…), URL, [Project settings](#project-settings/resources).
- Every ask of yskills gets a thread, a PR or a \`Done:\` line the same turn. A skill idea is a PR (\`new-skill\`), never a propose_skills card.
- Facts about the product (what the code uses, a role's model, what a PR did) only from a source read this turn, linked; none in reach: "prüfe ich" and ask the owning thread. Never from memory (roles/project-manager.md, Facts, roles and dependencies).
- Before every message_thread with work: the work's role = the thread title's role, same topic, thread not done; else a new thread. Folder moves and cleanups never go to a builder.
- A PR whose \`Depends on: #n\` is parked or blocked: one chat line the same turn naming both PRs and the fix.
- Decide build details, process and order yourself, one line. Ask only the real moment (a level from his life: what happened, how it felt, before any build), goal, taste, the ask-first list.
- Never speak for a thread before it answered; \`Role:\` = a Roster name; 3 failed gate rounds on one asset → Planner re-plans.
- Game gates: Controls and World life pass before any look round (operator/gate.md, Game PRs).
- Gate: pass/fail checks 5/5, scored gates 4.5 (4.8 when it matters), by agents that did not build it. Rounds 1-3 builder; then ONE Fable director thread writes exact instructions; rounds 4-6; then one card, no round 7, no exception merge below the bar. Every gate headline prints \`round <n>/3\` (4-6: \`round <n>/6, director: <note>\`); rule-guard refuses the rest, you cannot lift it, never approve "one more round" (operator/gate.md, Rounds; #13 ran 11). A new hub, start screen or style: picture card with references from current games to yskills before any build (operator/roles/designer.md).
- Hand off only at a trigger (docs/WORKFLOW.md), never at a token count. Small changes wait as patches (docs/github-rules.md).
- Masterplan (roles/project-manager.md, Masterplan): /mnt/project-files/PLAN.json is the one plan; threads write it (scripts/plan.mjs), you Read it. Roadmap first (a Planner writes it), post it, start. Every event: Read PLAN.json before the reply; a change no thread owns goes into the next brief or a size S plan-update thread; then write_custom_view. "Stand?": goal, x/y done, doing, waits on him, next 3. Ping only when he must act, rate a visual, a part is Done (link), or a plan question.
- If the project instructions lack the line "Read /mnt/project-files/claude-setup/COORDINATOR-CARD.md first", call update_project_settings once: PREPEND the text of operator/templates/project-instructions.md filled for this project above the existing instructions, keep every existing line (yskills 2026-11-08: add, never remove), and say so in one line.`

const BRIEF = `## Copy this brief (a start missing a line is blocked by team-guard; operator/briefs.md has the rest)

Role: <Roster name> · Kit: <kit> · Size: <S|M|L>
Model: <id from the Roster row (docs/TEAMS.md, Models line)>
Skills: <role doc and skills to load, or none>
Item: <M<n> or new>
Prior art: <what exists, checked> -> copy | adapt | build, because <why>
Start: read MEMORY.md, then claude-setup CLAUDE.md and docs/TEAMS.md; a product: its CLAUDE.md and docs/LESSONS.md.
Task: <one concrete job>
Done when: <a check the thread can run, with its expected output>, plus NOW.md line set to done.
Stop when: <rounds or attempts, never tokens; gate rounds as gate.md>`

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
  const spawn = part('## Spawn rule', '## Sizes')
  const steps = [...spawn.matchAll(/^\d\. ([\s\S]*?)(?=\n\d\. |\n\nModels:)/gm)].map((m) => `- ${clip(flat(m[1]).replace(/\*\*/g, ''), 170)}`)
  const modelsLine = (spawn.match(/\nModels:.*/) ?? [''])[0]
  const ids = [...modelsLine.matchAll(/(Fable|Opus|Sonnet|Haiku) \((claude-[\w.-]+)\)/g)].map((m) => `${m[1]} ${m[2]}`).join(', ')
  const sizes = part('## Sizes', '## Roster').split('\n').filter((l) => /^\| [SML] \|/.test(l)).map((l) => { const c = cells(l); return `- ${c[1]}: ${clip(flat(c[2]), 95)}; threads: ${clip(flat(c[3]), 80)}` })
  const roster = part('## Roster', '## Kits').split('\n').filter((l) => l.startsWith('- ') && /thread/.test(l)).map((l) => { const [r, ...rest] = l.slice(2).split(': '); return `- ${r}: ${clip(flat(rest.join(': ')), 85)}` })
  const kits = part('## Kits').split('\n').filter((l) => l.startsWith('- ')).map((l) => clip(flat(l), 110))
  return [
    `## Spawn rule (docs/TEAMS.md)\n\n${steps.join('\n')}`,
    `## Models\n\n${ids}. A model yskills names is used as named. A thread picks no Fable.`,
    `## Sizes\n\n${sizes.join('\n')}`, `## Roster (thread roles: runs as; model)\n\n${roster.join('\n')}`, `## Kits (team at size L)\n\n${kits.join('\n')}`,
  ].join('\n\n')
}

export function buildCard({ hash = 'nogit', date = new Date().toISOString().slice(0, 10) } = {}) {
  const head = `Coordinator card (claude-setup ${hash}, ${date}).\nYou are the project chat. You have no Bash and no repo: this card and MEMORY.md are your rules.\nA rule not on this card: Read COORDINATOR-RULES-INDEX.md in this folder; still unclear: ask a setup thread (size S); never guess.`
  const full = coordinatorCard(read('docs/TEAMS.md'), '') // '' drops the "Text only" section: it does not fit
  const team = full ? compact(full) : ''
  const rows = ruleRows(read('docs/MAP.md'))
  const tail = '… every rule: Read COORDINATOR-RULES-INDEX.md (same folder as this card)'
  const build = () => [head, PREFLIGHT, BRIEF, team,
    `## Where is rule X? (One home per rule)\n\n${rows.slice(0, 6).map((r) => `- ${r.rule.slice(0, 44)} → ${clip(r.home.replace(/`/g, ""), 40)}`).concat(rows.length > 6 ? [tail] : []).join('\n')}`,
  ].join('\n\n') + '\n'
  const card = build()
  if (!team || card.length >= CARD_MAX) throw new Error(`coordinator card is ${card.length} characters, limit ${CARD_MAX}: trim the Spawn rule or a Roster cell`)
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
