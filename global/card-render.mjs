#!/usr/bin/env node
// M50 slice B: the renderer of everything the project chat reads, in the boot copy (~/.claude/claude-setup/card-render.mjs), so every thread
// start can refresh a stale rulebook in ITS project with no checkout: COORDINATOR-CARD.md, COORDINATOR-RULES-INDEX.md, ROSTER.md and
// briefs/<role>.md. All of it is rendered from docs/TEAMS.md, docs/MAP.md and BRIEF_FIELDS (global/team-guard.mjs); nothing in it is written by hand.
// scripts/coordinator-card.mjs is the CLI over it, rule-guard calls refreshCard() when a thread starts (docs/MAP.md, Coordinator card).
import { createHash, randomBytes } from 'node:crypto'
import { existsSync, lstatSync, mkdirSync, readFileSync, readdirSync, renameSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { BRIEF_FIELDS, GATE_BUILDER_ROLES, GUARD_FILES, badRole, badTeam, coordinatorCard, kitNames, kitRows, rosterNames } from './team-guard.mjs'
import { GATE_ROLES, roleOf } from './rule-guard.mjs'

export const CARD_MAX = 6800 // 6,600 until #430, 8,000 until 2026-11-12 (M27 step 6: rules a hook enforces left the card, the brief template came in)
export const INDEX_MAX = 20000
const cells = (l) => l.split('|').map((c) => c.trim())
const today = () => new Date().toISOString().slice(0, 10)

const PREFLIGHT = `## Before every reply

- How we work, one loop: every thread has a role from the Roster (only a mini or unclear task has \`Role: none\`); the role loads its playbook, skills and workflows from claude-setup; what it lacks a Researcher finds; what holds for every project goes back to claude-setup. team-guard refuses a brief with no Role line or an unknown role or kit name; rule-guard's start receipt shows the role loaded and ends with \`card #<hash>\`: another hash than this card's header means Read this card again.
- Downloads/assets: Character TD runs \`asset-intake\`; Archivist indexes after the gate.
- Luna: at most 15 lines / 1,500 characters, at least one kaomoji, result first, in his language.
- Facts (code, PR, device, model, plan) only from a source read this turn and linked: PLAN.json, NOW.md, list_threads, a thread's last reply. None in reach: "prüfe ich", ask the owning thread; silent for a thread until it answered; a dropped device is one line the same turn.
- Every start_thread passes \`model\` and a brief copied from briefs/<role>.md (section Thread brief). Before a message_thread with work: same role and topic as the thread's title, thread not done; else a new thread. Folder moves and cleanups never go to a builder.
- A finished thread (done, failed, stopped, or review_ready idle 2 h with Done:/hand-off) gets set_thread_resolved or a nudge before you stop; relist when your board is 2 h old.
- Every ask or pointer carries its clickable link ([title](#cmsg_…), URL, [Project settings](#project-settings/resources)); every ask of yskills gets a thread, a PR or a \`Done:\` line the same turn; a skill idea is a PR (\`new-skill\`), never a propose_skills card.
- A PR whose \`Depends on: #n\` is parked or blocked: one chat line the same turn naming both PRs and the fix.
- Ask yskills only the real moment (a level from his life), goal, taste and the ask-first list; build details, process and order you decide, in one line.
- Hard round counter (hook): 3 rounds at 4.5 (4.8 important), 4-6 Fable director, 7+ a card; no merge below; you release none; a PASS needs no OK. 3 failed rounds on one asset: re-plan. A gate round's brief has the Round, Asset and Picture card lines (briefs/reviewer.md). Controls and World life first.
- A new rule is a PR to claude-setup, never only a Project settings edit.
- A second fresh thread for one asset is a quality-loss trigger: send the handoff files to the Planner for a diagnosis first, the handoff carries the round and every approach tried, and the restart is not posted (docs/WORKFLOW.md, Handoff triggers).
- Plan: /mnt/project-files/PLAN.json is the one plan; threads write it (scripts/plan.mjs), you only Read it before every reply, then write_custom_view. "Stand?": goal, x/y done, doing, waits on him, next 3. Ping only when he must act, rate, or a part is Done (link).
- Project instructions lack the line "Read /mnt/project-files/claude-setup/COORDINATOR-CARD.md first": call update_project_settings once, PREPEND operator/templates/project-instructions.md filled in, keep every existing line, say so in one line.`

export function ruleRows(map) {
  const t = map.split('\n## One home per rule')[1] ?? ''
  return t.split('\n').filter((l) => l.startsWith('| ') && !/^\| (Rule|---)/.test(l)).map((l) => {
    const c = l.split('|').map((x) => x.trim())
    return { rule: c[1], home: c[2] }
  })
}

// team-guard's coordinatorCard() is the source (Spawn rule, Models, Sizes, Roster, Kits, ~9,000 characters);
// this squeezes it to what a start_thread needs so the whole file stays under CARD_MAX. ROSTER.md holds the same rows unclipped.
const clip = (t, n) => (t.length > n ? `${t.slice(0, n - 1).trimEnd()}…` : t)
const flat = (t) => t.replace(/\s+/g, ' ').replace(/\[`?([^\]]*?)`?\]\([^)]*\)/g, '$1').trim()
export function compact(full) {
  const part = (from, to) => { const a = full.indexOf(from); const b = to ? full.indexOf(to, a + 1) : full.length; return a < 0 ? '' : full.slice(a, b < 0 ? undefined : b).trim() }
  const modelsLine = (part('## Spawn rule', '## Sizes').match(/\nModels:.*/) ?? [''])[0]
  const ids = [...modelsLine.matchAll(/(Fable|Opus|Sonnet|Haiku) \((claude-[\w.-]+)\)/g)].map((m) => `${m[1]} ${m[2]}`).join(', ')
  const sizes = part('## Sizes', '## Roster').split('\n').filter((l) => /^\| [SML] \|/.test(l)).map((l) => { const c = cells(l); return `- ${c[1]}: ${clip(flat(c[2]), 70)}; threads: ${clip(flat(c[3]), 60)}` })
  const roster = part('## Roster', '## Kits').split('\n').filter((l) => l.startsWith('- ') && /thread/.test(l)).map((l) => { const [r, ...rest] = l.slice(2).split(': '); return `- ${r}: ${clip(flat(rest.join(': ')), 44)}` })
  const kits = part('## Kits').split('\n').filter((l) => l.startsWith('- ')).map((l) => clip(flat(l), 90))
  // A card with an empty Sizes, Roster or Kits section would send the chat to guess (M50 slice B: a test pins this).
  for (const [name, rows] of [['Sizes', sizes], ['Roster', roster], ['Kits', kits]]) if (!rows.length) throw new Error(`coordinator card: the ${name} section of docs/TEAMS.md has no row`)
  return [
    `## Models (docs/TEAMS.md)\n\n${ids}. A model yskills names is used as named. A thread picks no Fable. Task first, then kit, then size; the thread's brief check refuses an unknown kit and a size or role that kit does not allow.`,
    `## Sizes\n\n${sizes.join('\n')}`, `## Roster (thread roles: runs as; model; all of it in ROSTER.md)\n\n${roster.join('\n')}`, `## Kits (team at size L; roles and sizes per kit in ROSTER.md)\n\n${kits.join('\n')}`,
  ].join('\n\n')
}

const BRIEF_SECTION = `## Thread brief

Copy briefs/<role>.md of this folder (one per Roster role, its Model line inside; kits and sizes per role in ROSTER.md), fill every <...>, paste it as the brief, pass its Model as \`model\`. Nothing else is added or written from memory.
A refusal names every gap at once: send those lines to the same thread with message_thread, never a new thread.
A device thread passes \`message_id\` (yskills' message or your own project-chat post), never \`project_post_id\` or \`auto_attach=false\`.`

export function buildCard({ teams, hash = 'nogit', date = today() }) {
  const head = `Coordinator card (claude-setup ${hash}, ${date}).\nYou are the project chat. You have no Bash and no repo: this card and MEMORY.md are your rules.\nA rule not on this card: Read COORDINATOR-RULES-INDEX.md in this folder; still unclear: ask a setup thread (size S); never guess.`
  const full = coordinatorCard(teams, '') // '' drops the "Text only" section: it does not fit
  if (!full) throw new Error('coordinator card: docs/TEAMS.md has no Roster or Kits rows')
  const card = [head, PREFLIGHT, BRIEF_SECTION, compact(full)].join('\n\n') + '\n'
  if (card.length >= CARD_MAX) throw new Error(`coordinator card is ${card.length} characters, limit ${CARD_MAX}: trim a pre-flight line or a Roster cell`)
  return card
}

export function buildIndex({ teams, map, hash = 'nogit', date = today() }) {
  const head = `Rules index (claude-setup ${hash}, ${date}). Read this when a rule is not on the card;\nthe home is the file to name, never a guess.`
  const roles = `## Brief lines per role (a filled copy of briefs/<role>.md in this folder (lowercase, dashes) is the brief; ROSTER.md lists the kits and sizes)\n\n${roleLines(teams).map((l) => `- ${l}`).join('\n')}`
  const out = `${head}\n\n${ruleRows(map).map((r) => `- ${r.rule} → ${r.home}`).join('\n')}\n\n${roles}\n`
  if (out.length >= INDEX_MAX) throw new Error(`rules index is ${out.length} characters, limit ${INDEX_MAX}`)
  return out
}

// ---- roles, kits, models: what a brief file and ROSTER.md say (the same helpers scripts/brief.mjs generates a brief with)
const TIERS = ['fable', 'opus', 'sonnet', 'haiku']
const modelIds = (teams) => Object.fromEntries([...teams.matchAll(/(Fable|Opus|Sonnet|Haiku) \((claude-[\w.-]+)\)/g)].map((m) => [m[1].toLowerCase(), m[2]]))
// The tier a thread of this role starts on: the first tier its Roster row names (a later "Fable on a hard task" is the coordinator's call).
export const modelCell = (row) => row.match(/Model: (.*?)\.?$/)?.[1] ?? ''
export const tierOf = (row) => TIERS.find((t) => (modelCell(row).split(';')[0]).toLowerCase().includes(t)) // undefined: the row names none (the Project Manager's is set by yskills)
const runsAs = (row) => row.match(/Runs as: (.*?)\. Model:/)?.[1] ?? ''
export const stub = (role, kit, size) => `Role: ${role} · Kit: ${kit} · Size: ${size}`
// The model a thread of this role starts on at this size: the first tier its Roster row names, Fable for a Planner at size L (team-guard wrongModel).
export const modelFor = (role, size, teams) => {
  const tier = role === 'Planner' && size === 'L' ? 'fable' : tierOf(roleOf(stub(role, 'setup', size), teams).row)
  return tier ? modelIds(teams)[tier] : undefined
}
// The sizes a role may start on a kit: the sizes the guard accepts (a Planner never at S).
let sized = { teams: null, found: new Map() } // one answer per role and kit: the guard parses docs/TEAMS.md on every call
export const sizesOf = (role, kit, teams) => {
  if (sized.teams !== teams) sized = { teams, found: new Map() }
  const key = `${role}\0${kit}`
  if (!sized.found.has(key)) sized.found.set(key, sizesFor(role, kit, teams))
  return sized.found.get(key)
}
const sizesFor = (role, kit, teams) => ['S', 'M', 'L'].filter((size) => !badRole(stub(role, kit, size), teams) && !badTeam(stub(role, kit, size), teams) && (role !== 'Planner' || size !== 'S'))

// One line per Roster role: the kits it may start on at size M, its tier and its playbook.
export function roleLines(teams) {
  return rosterNames(teams).map((role) => {
    const info = roleOf(stub(role, 'setup', 'M'), teams)
    const ok = kitNames(teams).filter((kit) => !badTeam(stub(role, kit, 'M'), teams))
    return `${role}: Kit: ${ok.length ? ok.join(', ') : 'none at size M (see Kits)'}; Model: ${tierOf(info.row) ?? modelCell(info.row)}; Runs as: ${runsAs(info.row).slice(0, 40)}; Skills: ${info.path ?? 'its Roster row'}`
  })
}

// ROSTER.md: every Roster role and every kit, unclipped; per kit the thread roles and sizes the guard accepts, per role the kits.
export function renderRoster({ teams, hash = 'nogit', date = today() }) {
  const kits = kitRows(teams)
  const hasBrief = (role) => tierOf(roleOf(stub(role, 'setup', 'M'), teams).row) // the Project Manager (set by yskills) is no thread role
  const roles = rosterNames(teams).map((role) => {
    const info = roleOf(stub(role, 'setup', 'M'), teams)
    const on = kits.map((k) => [k.kit, sizesOf(role, k.kit, teams)]).filter(([, s]) => s.length)
    if (!hasBrief(role)) return `- **${role}**: runs as: ${flat(runsAs(info.row))}; model: ${modelCell(info.row)}; playbook: ${info.path ?? 'its Roster row'}; no thread brief (never started as a thread)`
    return `- **${role}**: runs as: ${flat(runsAs(info.row))}; model: ${modelCell(info.row)}; playbook: ${info.path ?? 'its Roster row'}; starts on: ${on.length ? on.map(([k, s]) => `${k} (${s.join(' ')})`).join(', ') : 'no kit (no thread brief)'}`
  })
  const kitText = kits.map((k) => {
    const who = rosterNames(teams).filter(hasBrief).map((role) => [role, sizesOf(role, k.kit, teams)]).filter(([, s]) => s.length)
    return `### ${k.kit}\n\n- Team at size L: ${flat(k.team)}\n- Skipped: ${flat(k.skipped)}\n- Thread roles (sizes): ${who.map(([r, s]) => `${r} (${s.join(' ')})`).join(', ')}`
  })
  return `Roster and kits (claude-setup ${hash}, ${date}), rendered from docs/TEAMS.md and the guard's own role and kit check; never edited by hand.\nA brief names a role from this list on a kit that lists it, at a size it lists; briefs/<role>.md has the brief for each.\n\n## Roles\n\n${roles.join('\n')}\n\n## Kits\n\n${kitText.join('\n\n')}\n`
}

// ---- briefs/<role>.md: the stamp, then one line per row of BRIEF_FIELDS that holds for the role (a new row of the table appears here by itself),
// then the four parts of the free task text (taught, never checked).
const ORDER = ['Model', 'Item', 'Plan', 'Acceptance', 'Threads', 'Prior art', 'Skills', 'Sheet', 'Look-Lock', 'Topic', 'Researcher', 'Gate', 'Tester', 'Done when', 'Stop when', 'Start']
const GATE_ROUND_LINES = ['Round: <n> (gate rounds only; delete otherwise)', 'Asset: <owner/repo#n> (with Round)', 'Picture card: <link | none, because <why>> (new look only; delete otherwise)']
const TASK_PARTS = ['Objective: <what finished looks like, one sentence, in the owner\'s words where he gave them>', 'Output: <the files, PR or links the thread hands back, and in what shape>',
  'Tools and sources: <what to read and use first (repo paths, URLs, #n) and what to leave alone>', 'Boundaries: <what the thread must not touch, and the point where it stops and asks>']
export function renderBrief(role, teams, fields = BRIEF_FIELDS) {
  const info = roleOf(stub(role, 'setup', 'M'), teams)
  if (!tierOf(info.row)) return null // the Project Manager's model is set by yskills: no thread brief
  const kits = kitNames(teams).filter((kit) => sizesOf(role, kit, teams).length)
  if (!kits.length) return null
  const offered = [...new Set(kits.flatMap((kit) => sizesOf(role, kit, teams)))]
  const kitCell = kits.map((kit) => (sizesOf(role, kit, teams).length < offered.length ? `${kit} (size ${sizesOf(role, kit, teams).join(' or ')} only)` : kit)).join(' | ')
  const gateRole = GATE_ROLES.test(role)
  const probes = [stub(role, 'game', 'M'), stub(role, 'setup', 'M')]
  const rows = new Map(fields.map((f) => [f.key, f]))
  const keys = [...ORDER.filter((k) => rows.has(k) || k === 'Topic'), ...fields.map((f) => f.key).filter((k) => !ORDER.includes(k))]
  const at = keys.indexOf('Done when')
  const keyed = [...keys.filter((k) => ORDER.includes(k)).slice(0, at < 0 ? undefined : at), ...keys.filter((k) => !ORDER.includes(k)), ...keys.filter((k) => ORDER.includes(k)).slice(at < 0 ? keys.length : at)]
  const lines = [`Role: ${role} · Kit: <${kitCell}> · Size: <${offered.join('|')}>`]
  for (const key of keyed) {
    if (key === 'Done when' && gateRole) lines.push(...GATE_ROUND_LINES)
    const f = rows.get(key)
    if (key === 'Topic') { if (role === 'Reviewer') lines.push('Topic: <checklist topic> (delete unless a topic gate)'); continue }
    if (f.applies && !probes.some((p) => f.applies(p))) continue
    if (key === 'Model') lines.push(`Model: ${role === 'Planner' ? `<${modelFor(role, 'M', teams)} at size M | ${modelFor(role, 'L', teams)} at size L>` : modelFor(role, 'M', teams)}`)
    else if (key === 'Skills') lines.push(`Skills: ${info.path ?? f.tpl.slice(8)}`)
    else if (key === 'Prior art' && gateRole) lines.push(`Prior art: .claude/skills/operator/gate.md and the <kit>'s checks (docs/TEAMS.md, Kits) -> adapt, because the gate rules and checks already exist`)
    else if (key === 'Gate' && !new RegExp(`^${GATE_BUILDER_ROLES}$`).test(role)) continue
    else lines.push(f.tpl)
  }
  return `# Brief file: ${role}\n\nCopy the block, fill every <...>, delete the lines marked delete, start the thread with it as the brief, title \`${role} · <what>\` and \`model\` = the Model line (${modelFor(role, 'M', teams)} at size M). Scope, Basis and Assets live in the item (the Item: line), the thread reads them there. Sizes and kits are checked by team-guard; the block is rendered from BRIEF_FIELDS and docs/TEAMS.md (claude-setup global/card-render.mjs), never edited by hand.\n\n\`\`\`\n${lines.join('\n')}\n\`\`\`\n\nThen write the task itself under the block, in four short parts (taught, not checked):\n\n\`\`\`\n${TASK_PARTS.join('\n')}\n\`\`\`\n`
}
export const briefFileName = (role) => `${role.toLowerCase().replace(/[^a-z0-9]+/g, '-')}.md`

// ---- the whole folder, and its refresh
// Layout of a base: a claude-setup checkout (global/ and docs/) or the installed copy ~/.claude/claude-setup (guards beside docs/).
const guardDir = (base) => (existsSync(join(base, 'global')) ? join(base, 'global') : base)
const read = (f) => (existsSync(f) ? readFileSync(f, 'utf8').replace(/\r/g, '') : '')
// One hash over everything the folder is rendered from, so the card is stale exactly when a guard or TEAMS.md or MAP.md changed.
export function cardHash(base) {
  const h = createHash('sha256')
  for (const f of [...GUARD_FILES.map((g) => join(guardDir(base), g)), join(base, 'docs', 'TEAMS.md'), join(base, 'docs', 'MAP.md')]) h.update(`${f.split(/[\\/]/).pop()}\0${read(f)}`)
  return h.digest('hex').slice(0, 8)
}
export function renderAll({ base, hash = cardHash(base), date = today() }) {
  const teams = read(join(base, 'docs', 'TEAMS.md'))
  const files = new Map([['COORDINATOR-CARD.md', buildCard({ teams, hash, date })], ['COORDINATOR-RULES-INDEX.md', buildIndex({ teams, map: read(join(base, 'docs', 'MAP.md')), hash, date })], ['ROSTER.md', renderRoster({ teams, hash, date })]])
  for (const role of rosterNames(teams)) { const text = renderBrief(role, teams); if (text) files.set(`briefs/${briefFileName(role)}`, text) }
  return files
}
// The folder is shared by every thread of the project: never write through a link planted there, and never reuse a guessable temp name.
// The one writer of writeAll and the start log: temp name, then rename; a linked folder or file is refused.
function safeWrite(to, text, name = to) {
  mkdirSync(join(to, '..'), { recursive: true })
  if (lstatSync(join(to, '..')).isSymbolicLink() || (existsSync(to) && lstatSync(to).isSymbolicLink())) throw new Error(`card-render: ${name} is behind a symlink, refused`)
  const tmp = `${to}.${randomBytes(6).toString('hex')}.new`
  try { writeFileSync(tmp, text, { flag: 'wx' }); renameSync(tmp, to) } catch (e) { rmSync(tmp, { force: true }); throw e }
}
// Writes only what changed (temp name, then rename), so two threads writing at once leave a whole file, and a second run writes nothing.
export function writeAll(dir, files) {
  let written = 0
  // The card is the marker refreshCard reads, so it goes last: a write that fails or is killed halfway leaves the old card and the next start repairs the rest.
  for (const [name, text] of [...files].sort(([a], [b]) => (a === 'COORDINATOR-CARD.md') - (b === 'COORDINATOR-CARD.md'))) {
    const to = join(dir, name)
    if (existsSync(to) && readFileSync(to, 'utf8') === text) continue
    safeWrite(to, text, name)
    written++
  }
  return written
}
// The project's shared folder: /mnt/project-files in a cloud thread. Absent (a laptop session): nothing to refresh.
// Under `node --test` (NODE_TEST_CONTEXT, inherited by spawned hooks) only an explicit CLAUDE_SETUP_PROJECT_FILES counts: a test run never writes into the real folder (7,707 stray brief-log files, 2026-11-12).
export function projectFolder(env = process.env) {
  if (env.NODE_TEST_CONTEXT && !env.CLAUDE_SETUP_PROJECT_FILES) return null
  for (const d of [env.CLAUDE_SETUP_PROJECT_FILES, '/mnt/project-files', '/mnt/attach/project-files']) if (d && existsSync(d)) return join(d, 'claude-setup')
  return null
}
// A thread's start: rewrites the folder when no card exists or the card's hash is not the one this copy renders. Returns the hash it wrote, or null.
// A failure never stops the start (the card stays as it was).
export function refreshCard(base, out = projectFolder()) {
  try {
    if (!out || !existsSync(join(base, 'docs', 'TEAMS.md'))) return null
    const hash = cardHash(base)
    const have = read(join(out, 'COORDINATOR-CARD.md')).match(/^Coordinator card \(claude-setup (\w+),/)?.[1]
    if (have === hash && existsSync(join(out, 'ROSTER.md'))) return null
    writeAll(out, renderAll({ base, hash }))
    return hash
  } catch { return null }
}

// ---- M50 slice C: every thread start is counted, so the false-start rate is a number (docs/WORKFLOW.md, Thread starts)
// One file per start, `brief-log/<date>-<session>.json` in the project's rulebook folder; one writer per file, so two threads never overwrite each other.
// Outcomes: clean, repaired, refused (a judgment gap), wrong-model (a restart is needed), duplicate (reserved: the start was not needed).
export const OUTCOMES = ['clean', 'repaired', 'refused', 'wrong-model', 'duplicate']
export const FALSE_STARTS = ['refused', 'wrong-model', 'duplicate']
// The outcome of one start from the brief check's text (rule-guard briefCheck) and the model check's text.
export function startOutcome(check = '', modelCheckText = '') {
  if (/^Model check\b/.test(modelCheckText)) return { outcome: 'wrong-model', reasons: ['model'] }
  const full = [...String(check).matchAll(/\((\d+)\) (.*?)(?= \(\d+\) |\. Do no work)/g)].map((m) => m[2].trim())
  if (/^Brief check\b/.test(check)) return { outcome: full.some((i) => /ask the coordinator to restart it on that model/.test(i)) ? 'wrong-model' : 'refused', reasons: full.map((i) => i.slice(0, 80)) }
  // Any repair text counts, whatever it repairs: the missing-lines note and the gate role's Prior art note both start with `Brief repair (no block):`.
  const repair = String(check).match(/Brief repair \(no block\): ([^\n]*)/)
  if (!repair) return { outcome: 'clean', reasons: [] }
  const lacks = repair[1].match(/^the brief lacks ([^.]*?)\. Work as if/)?.[1]
  return { outcome: 'repaired', reasons: lacks ? lacks.split(', ') : [repair[1].slice(0, 60)] }
}
const logName = (session, date) => `${date}-${String(session).replace(/\W/g, '').slice(0, 40)}.json`
const writeLog = (file, entry) => safeWrite(file, `${JSON.stringify(entry)}\n`)
// Writes the start's file. `info`: { session, project, role, kit, size, guard, card, outcome, reasons }. A failure never stops the start.
export function logStart(info, out = projectFolder(), now = new Date()) {
  try {
    if (!out || !info?.session) return null
    const date = now.toISOString().slice(0, 10)
    const file = join(out, 'brief-log', logName(info.session, date))
    if (existsSync(file)) return file // the hook may fire twice for one start: the first entry stands
    writeLog(file, { at: now.toISOString(), project: '', role: '', kit: '', size: '', guard: '', card: '', outcome: 'clean', reasons: [], relays: 0, lifted: false, ...info })
    return file
  } catch { return null }
}
// A later relay on a refused start is added to the same file (`lifted` once a relay brings the thread to work).
export function noteRelay(session, lifted, out = projectFolder()) {
  try {
    if (!out || !session) return false
    const files = existsSync(join(out, 'brief-log')) ? readdirSync(join(out, 'brief-log')).filter((f) => f.endsWith(`-${String(session).replace(/\W/g, '').slice(0, 40)}.json`)) : []
    if (!files.length) return false
    const file = join(out, 'brief-log', files.sort().at(-1))
    const entry = JSON.parse(readFileSync(file, 'utf8'))
    if (!FALSE_STARTS.includes(entry.outcome)) return false
    writeLog(file, { ...entry, relays: (entry.relays ?? 0) + 1, lifted: Boolean(entry.lifted || lifted) })
    return true
  } catch { return false }
}
// The count over a folder: `starts N: clean a, repaired b, refused c, wrong-model d, duplicate e (false starts f, g%); top reason: ...`. `since` is a Date or null.
export function statsLine(out = projectFolder(), since = null) {
  const dir = out ? join(out, 'brief-log') : ''
  const entries = []
  for (const f of dir && existsSync(dir) ? readdirSync(dir) : []) {
    try { const e = JSON.parse(readFileSync(join(dir, f), 'utf8')); if (!since || new Date(e.at) >= since) entries.push(e) } catch { /* a cut file counts as nothing */ }
  }
  const count = Object.fromEntries(OUTCOMES.map((o) => [o, entries.filter((e) => e.outcome === o).length]))
  const bad = FALSE_STARTS.reduce((n, o) => n + count[o], 0)
  const reasons = new Map()
  for (const e of entries.filter((x) => x.outcome !== 'clean')) for (const r of e.reasons ?? []) reasons.set(r, (reasons.get(r) ?? 0) + 1)
  const top = [...reasons].sort((a, b) => b[1] - a[1])[0]
  const pct = entries.length ? Math.round((100 * bad) / entries.length) : 0
  return `starts ${entries.length}: ${OUTCOMES.map((o) => `${o} ${count[o]}`).join(', ')} (false starts ${bad}, ${pct}%); top reason: ${top ? `${top[0]} (${top[1]}x)` : 'none'}`
}
