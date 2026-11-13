#!/usr/bin/env node
// Team guard. Usage: team-guard.mjs start|pre (hook entries SessionStart, PreToolUse).
// Without a claude-setup checkout, start puts CLAUDE.md itself into context; it counts as read.
// start: refreshes the boot files (CLAUDE.md, docs/TEAMS.md, docs/MAP.md) from main into
// ~/.claude/claude-setup/ and puts the TEAMS.md pointer into every new session; a session without a
// claude-setup checkout (the project chat has none, so its CLAUDE.md never loaded; 2026-10-26 the
// coordinator started threads without reading any rule and guessed models) also gets the boot card.
// pre: refuses (exit 2) an Agent call or a thread start without `model`, because without it a
// thread gets the project default and a subagent inherits its parent (yskills, 2026-10-26: every
// thread and subagent ran on Opus). An Agent call whose subagent_type has an agent file with its own
// `model:` passes. It also refuses a thread start whose brief is a size L Programmer with no
// `Tester:` line (incident 2026-10-26: an L app ran without a Tester, docs/TEAMS.md Sizes: the
// Tester thread starts first and the Programmer brief names it), and a thread start before this
// session has read TEAMS.md (and CLAUDE.md, when it did not load on its own), and one whose brief has
// no `Role: · Kit: · Size:` stamp line (rule-guard puts the named role's playbook into the thread), and
// a size M or L one with no `Prior art:` line (look for what exists and works first, yskills 2026-10-27),
// and one whose `model` is a tier its role's Roster row does not name (wrongModel).
// Blind test 2026-10-27 ("Kit: content", a video at S, a Game Designer on a story, briefs of one line): a
// thread start also needs a kit from the Kits table, a size that kit allows, a role on that kit's team
// (badTeam), and the brief block's Model, Skills, Done when, Stop when and Start lines (missingLines).
// CLAUDE_SETUP_TEAM_GUARD=off turns it off. It never breaks a tool call on its own errors.
import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readdirSync, readFileSync, renameSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { homedir, tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
// rule-guard sits beside this file (GUARD_FILES); without it only the model-tier check is skipped.
let roleOf = () => null
let openThreads = () => []
let toolCalls = () => []
try { ({ roleOf, openThreads, toolCalls } = await import('./rule-guard.mjs')) } catch { /* no rule-guard here */ }

export const POINTER = 'Team rule (claude-setup docs/TEAMS.md): route every task on its own (task picks the kit, not the project; then size S/M/L), call only the roles it needs, as thread or subagent as the roster says, and pass `model` from the role\'s row on every thread start and Agent call.'
export const PM_FILE = '.claude/skills/operator/roles/project-manager.md'
export const CHECKLISTS = '.claude/skills/operator/checklists.md' // M48: the topics a Reviewer brief may name; in the boot copy so the guard knows them outside claude-setup too
export const BOOT_FILES = ['CLAUDE.md', 'docs/TEAMS.md', 'docs/MAP.md', PM_FILE, 'config/persona.json', CHECKLISTS]
const RAW = 'https://raw.githubusercontent.com/yverse-studio/claude-setup/main/'
const MARK = '# Working for yskills' // first line of claude-setup's CLAUDE.md

const THREAD_START = /^mcp__.*(start_thread|create_session)/
const AGENT = /^(Agent|Task)$/

const text = (file) => { try { return readFileSync(file, 'utf8') } catch { return '' } }

// claude-setup's CLAUDE.md loads on its own: a checkout at cwd, a parent of it or `<cwd>/claude-setup` (a cloud thread starts in /home/user), or install.mjs's block in ~/.claude/CLAUDE.md (laptop).
export function rulesLoaded(cwd, home) {
  const files = [join(home, '.claude', 'CLAUDE.md'), join(cwd, 'claude-setup', 'CLAUDE.md')]
  for (let d = cwd; ; d = dirname(d)) { files.push(join(d, 'CLAUDE.md')); if (dirname(d) === d) break }
  return files.some((f) => text(f).includes(MARK))
}

// One curl for all files (it honours HTTPS_PROXY). A failed or cut-off run replaces nothing; a file
// replaces the copy only when it arrived whole. The .new names carry the pid, so two starts never share one.
// The guards update themselves the same way (yskills 2026-10-27: a rule change on main must reach
// every session without a cloud rebuild): an installed guard is replaced by main's copy when that
// copy arrived whole and passes `node --check`; a guard added to GUARD_FILES later is installed the same way. A new hook entry still needs install.mjs or a rebuild.
export const GUARD_FILES = ['context-guard.mjs', 'compact-guard.mjs', 'attempt-guard.mjs', 'team-guard.mjs', 'rule-guard.mjs', 'gate-rounds.mjs', 'card-render.mjs']
const parses = (f) => { try { execFileSync(process.execPath, ['--check', f], { stdio: 'ignore', timeout: 2000 }); return true } catch { return false } }
// Two downloads, so a guard missing on main (renamed, or not merged yet) never costs the boot files,
// and each keeps its own time limit inside the hook's 5 s.
function fetchAll(dir, files, url, seconds) {
  // The extension stays last, so `node --check` reads a guard as the ES module it is (a `.new` name is CommonJS).
  const tmp = (f) => join(dir, f.replace(/(\.\w+)?$/, `.${process.pid}.new$1`))
  if (!files.length) return []
  const args = ['-fsSL', '--max-time', String(seconds), '--create-dirs']
  for (const f of files) args.push('-o', tmp(f), url(f))
  let ok = true
  try { execFileSync('curl', args, { stdio: 'ignore', timeout: seconds * 1000 + 500 }) } catch { ok = false }
  // curl -f writes nothing for a missing file; a cut-off run (ok false) keeps a guard only if it still parses.
  return files.map((f) => ({ f, tmp: tmp(f), got: existsSync(tmp(f)) && statSync(tmp(f)).size > 0, ok }))
}
const guardUrl = (f) => (GUARD_FILES.includes(f) ? `${RAW}global/${f}` : RAW + f)
export function refresh(dir, only = null) {
  const guards = GUARD_FILES.filter((f) => !only || only.includes(f)) // a guard missing on disk is fetched too: an image pasted before a guard existed never had it (2026-11-12)
  const boot = only ? [] : fetchAll(dir, BOOT_FILES, (f) => RAW + f, 2.5)
  install(dir, [...boot, ...fetchAll(dir, guards, guardUrl, 1.5)])
}
function install(dir, fetched) {
  for (const { f, tmp, got, ok } of fetched) {
    const whole = got && (f.endsWith('.mjs') ? text(tmp).startsWith('#!/usr/bin/env node') && parses(tmp) : ok && (f !== 'CLAUDE.md' || text(tmp).includes(MARK)))
    if (whole) renameSync(tmp, join(dir, f))
    else rmSync(tmp, { force: true })
  }
}

// M47 follow-up: a cached image's start hook is its own old team-guard, so it refreshes with its old lists and a guard or boot
// file added later never arrives. The first fresh code to run (rule-guard on a thread start) fills in by this copy's lists.
// Only an installed copy: run from a git checkout (claude-setup's own global/), it would write boot files into the repo (#478 gate round 1).
const inCheckout = (dir) => { for (let d = resolve(dir); ; d = dirname(d)) { if (existsSync(join(d, '.git'))) return true; if (dirname(d) === d) return false } }
export function fillMissing(dir) {
  if (inCheckout(dir)) return
  const missing = (list) => list.filter((f) => !existsSync(join(dir, f)))
  const files = [...missing(GUARD_FILES), ...missing(BOOT_FILES)]
  if (files.length) install(dir, fetchAll(dir, files, guardUrl, 2)) // one download, so it fits rule-guard's 5 s prompt hook
}

// The version of the guards this session runs, for the thread's start proof (plan M47: merged must mean live):
// a short hash over the installed GUARD_FILES, and the names of any missing one.
export function guardVersion(dir) {
  const have = GUARD_FILES.filter((f) => existsSync(join(dir, f)))
  const hash = createHash('sha256')
  for (const f of have) hash.update(`${f}\0${text(join(dir, f))}`)
  const missing = GUARD_FILES.filter((f) => !have.includes(f))
  return `Guards in this session: ${hash.digest('hex').slice(0, 8)} (${have.length}/${GUARD_FILES.length} installed${missing.length ? `, MISSING ${missing.join(', ')}: tell the coordinator` : ''}).`
}

export const modelFile = (session) => join(tmpdir(), `claude-setup-model-${String(session).replace(/[^A-Za-z0-9]/g, '')}`)

export const BOOT_MAX = 9800 // hook context over 10,000 characters is cut to a preview; scripts/check.mjs keeps both cards under this
// Cached per document: ROSTER.md and the brief files ask the same few sections thousands of times (M50 slice B: 5 s uncached, a thread start has 5).
let sections = { t: null, found: new Map() }
const section = (t, from, to) => {
  if (sections.t !== t) sections = { t, found: new Map() }
  const key = `${from}\0${to}`
  if (!sections.found.has(key)) { const a = t.indexOf(`\n## ${from}`); const b = t.indexOf(`\n## ${to}`, a + 1); sections.found.set(key, a < 0 ? '' : t.slice(a + 1, b < 0 ? undefined : b).trim()) }
  return sections.found.get(key)
}
const cells = (l) => l.split('|').map((c) => c.trim())

// Where no checkout loaded it, CLAUDE.md itself goes into context: nothing to remember to read (audit 2026-10-27).
export function rulesCard(claude) {
  return `Boot (claude-setup): no checkout loaded claude-setup's CLAUDE.md, so here it is, fresh from main. These are yskills' rules; follow them.\n\n${claude}`
}

// The coordinator's slice of docs/TEAMS.md (Spawn rule, Models line, Sizes, one line per role and kit):
// enough to start every thread with the right role and model; the rest of TEAMS.md and MAP.md only on demand.
export function coordinatorCard(teams) {
  const roster = teams.split('\n').filter((l) => /^\| [A-Z][\w ]* \(\[`/.test(l)).map((l) => { const c = cells(l); return `- ${c[1].replace(/ \(\[.*$/, '')}: ${c[4]}; ${c[5]}` })
  const kits = section(teams, 'Kits', 'Models for tasks').split('\n').filter((l) => /^\| `/.test(l)).map((l) => { const c = cells(l); return `- ${c[1]}: ${c[3]}` })
  const sizes = section(teams, 'Sizes', 'Pipeline').split('\n').filter((l) => l.startsWith('|'))
  if (!roster.length || !kits.length) return ''
  return [
    'Coordinator card (claude-setup docs/TEAMS.md, fresh from main): you are the coordinator here. Route every task with it; read the full TEAMS.md, MAP.md or a role file only when a task needs a part this card lacks, and roles/project-manager.md (Session start) at your first start.',
    section(teams, 'Spawn rule', 'Sizes'), `## Sizes\n\n${sizes.join('\n')}`,
    `## Roster (role: runs as; model)\n\n${roster.join('\n')}`, `## Kits (team at size L)\n\n${kits.join('\n')}`,
  ].filter(Boolean).join('\n\n')
}

// Session markers older than a week go; a session that old is never resumed (CLAUDE.md, Tokens).
const WEEK = 7 * 24 * 3600 * 1000
function sweep(folder) {
  try { for (const f of readdirSync(folder)) if (Date.now() - statSync(join(folder, f)).mtimeMs > WEEK) rmSync(join(folder, f), { force: true }) } catch { /* no folder yet */ }
}

export function bootCard(dir) {
  const has = BOOT_FILES.every((f) => existsSync(join(dir, f)))
  const where = has ? `${dir}/` : 'yverse-studio/claude-setup (add_repo it; the fresh copy did not download): '
  return `Boot (claude-setup): this session has no claude-setup checkout, so CLAUDE.md, the rules yskills wrote, did not load. Before your first reply, Read ${where}CLAUDE.md (fresh from main) and docs/MAP.md (Start here); before any thread start also docs/TEAMS.md. team-guard blocks a thread start until this session has read CLAUDE.md and TEAMS.md. The rule missed most: before agreeing with yskills, check it (evidence, a source, a test), then agree, disagree or say "partly, because ...", always with the reason.`
}

// Boot files this session has opened with a tool (Read, Bash, a GitHub fetch; an Agent prompt that names one does not count).
export function readBootFiles(transcript) {
  const seen = new Set()
  for (const line of text(transcript).split('\n')) {
    if (!line.includes('"tool_use"')) continue
    try {
      for (const c of JSON.parse(line).message?.content ?? []) {
        if (c?.type !== 'tool_use' || AGENT.test(c.name)) continue
        const s = JSON.stringify(c.input ?? {})
        if (s.includes('TEAMS.md')) seen.add('TEAMS.md')
        if (s.includes('CLAUDE.md') && s.includes('claude-setup')) seen.add('CLAUDE.md')
      }
    } catch { continue } // a line that is not JSON
  }
  return seen
}

// The `model:` of an agent file's frontmatter, or null.
export function fileModel(type, dirs) {
  if (!type || !/^[\w.-]+$/.test(type)) return null
  for (const d of dirs) {
    const file = join(d, `${type}.md`)
    const model = existsSync(file) && (readFileSync(file, 'utf8').split(/^---\s*$/m)[1] ?? '').match(/^model:\s*(\S+)/m)?.[1]
    if (model) return model
  }
  return null
}
export const hasOwnModel = (type, dirs) => Boolean(fileModel(type, dirs))

// An Agent call whose `model` is a cheaper tier than its agent file's own `model:` (yskills 2026-11-03: gates
// always Opus; the reviewer agent files say opus, and a `model: sonnet` on the call would override that).
// Two exits the Models line allows pass: Opus for a Fable file (Fable out of credits) and a model yskills named.
const RANK = ['haiku', 'sonnet', 'opus', 'fable']
const rankOf = (model) => RANK.findIndex((t) => String(model ?? '').toLowerCase().includes(t))
export function downgraded(input, dirs) {
  const own = fileModel(input.subagent_type, dirs)
  const call = rankOf(input.model)
  if (!own || call < 0 || call >= rankOf(own) || /yskills (named|asked|set|chose)/i.test(String(input.prompt ?? ''))) return null
  return rankOf(own) === RANK.indexOf('fable') && call === RANK.indexOf('opus') ? null : own
}

// The brief block's first line (operator/briefs.md): Role, Kit and Size, so the thread knows what it is (yskills 2026-10-27).
export function stamped(text) {
  const plain = text.replace(/[*_`]/g, '')
  return /^[ \t>-]*Role:[ \t]*\S/im.test(plain) && /\bKit:[ \t]*\S/i.test(plain) && /\bSize:[ \t]*[SML]\b/i.test(plain)
}

// Every size (yskills 2026-11-03: research before guessing, a small task too).
// Prior art (yskills 2026-11-12: "erst schauen was gut funktioniert, dann klauen oder reverse engineeren, dann selber bauen"): the line records real
// findings, not a gesture: a named source (URL, owner/repo or path, #n, a file name, a `name`) and the decision (copy, adapt, reuse, extend, build);
// or `none, because <why nothing could exist>`; or `to find: <where the Researcher looks>` when the Researcher has not run yet.
// scripts/pr-lessons-check.mjs holds the same rule for the PR body; scripts/pr-lessons-check.test.mjs runs one corpus through both.
const PA_SOURCE = /https?:\/\/\S+|[\w.-]+\/[\w.-]+|#\d+|\b[\w-]+\.(?:md|mjs|json|ts|js|yml|sh)\b|`[^`\n]{3,}`/
const PA_DECISION = /\b(copy|copied|adapt(?:ed|s)?|reuse[ds]?|build|built|extend(?:ed|s)?|reverse-engineer\w*)\b/i
export function priorArtOk(line) {
  const t = String(line).replace(/\*\*/g, '').trim()
  return /^none, because .{10,}$/i.test(t) || /\bto find:\s*\S{5,}/i.test(t) || (t.length >= 20 && PA_SOURCE.test(t) && PA_DECISION.test(t))
}
export function needsPriorArt(text) {
  const line = String(text).split('\n').map((l) => l.replace(/^[ \t>-]*(?:\*\*)?Prior art:(?:\*\*)?[ \t]*/i, (m) => (/Prior art:/i.test(m) ? '\u0000' : m))).find((l) => l.startsWith('\u0000'))
  return /\bSize:[ \t]*[SML]\b/i.test(String(text).replace(/[*_`]/g, '')) && !(line && priorArtOk(line.slice(1)))
}

const briefText = (input) => Object.values(input).filter((v) => typeof v === 'string').join('\n')
export function needsTester(text) {
  const plain = text.replace(/[*_`]/g, '')
  const isL = /^[ \t]*role:[^\n]*\bprogrammer\b/im.test(plain) && /\bsize:[ \t]*L\b/i.test(plain)
  const named = plain.match(/^[ \t]*tester:[ \t]*(\S[^\n]*)$/im)?.[1].trim()
  return isL && !(named && !/^(<.*>|none|n\/a|-+|tbd)$/i.test(named))
}

// The model tiers a brief's role may run on, from its Roster row: the first tier named, Fable where
// the row names it, and a tier the row gives "on L" for a size L brief (`Sonnet; Opus on L`). A thread start whose `model` is another tier was a guess (yskills 2026-10-27: "did you
// pick Opus on purpose?"); a model yskills named passes when the brief says so.
const TIERS = ['fable', 'opus', 'sonnet', 'haiku']
export function wrongModel(text, model, teams) {
  const role = teams && roleOf(text, teams)
  if (!role?.row || !model || /yskills (named|asked|set|chose)/i.test(text)) return null
  // A row's own exception ("Opus writes the weekly plan") passes when the brief says why: `Model: opus (the weekly plan)`.
  const why = text.replace(/[*_`]/g, '').match(/^[ \t>-]*Model:[ \t]*(\w+)[^\n]*\([^)\n]{5,}\)/im)?.[1]?.toLowerCase()
  if (why && String(model).toLowerCase().includes(why) && new RegExp(`\\b${why}\\b`, 'i').test(role.row)) return null
  const parts = (role.row.match(/Model: ([^\n]*?)\.?$/)?.[1] ?? '').split(';').map((p) => p.toLowerCase())
  const sizeL = /\bSize:[ \t]*L\b/i.test(text.replace(/[*_`]/g, ''))
  // The first tier is the thread's own; a later one only for Fable or a size L exception ("Opus on L"), never a subagent's.
  const allowed = TIERS.filter((t, _i, all) => parts.some((p, i) => p.includes(t) && (i === 0 ? all.filter((x) => p.includes(x)).indexOf(t) === 0 : t === 'fable' || (sizeL && /\bon l\b/.test(p)))))
  const tier = TIERS.find((t) => String(model).toLowerCase().includes(t))
  return allowed.length && tier && !allowed.includes(tier) ? { role: role.name, allowed, tier } : null
}

// A task that asks for research names its Researcher subagent (docs/TEAMS.md, Kits; yskills 2026-11-12:
// a Planner did the SOTA research itself). The brief block's own "No extra ... research" does not trigger it.
const ASKS_RESEARCH = /\b(SOTA|state of the art|research (on|about|into|what)|recherch\w*)\b/i
// Gate rounds 1 to 6 chased verbs and body words and every round found more. So there is no classifier: every Programmer or Animator brief
// on a game or story kit names its approved cast sheet and look lock, or declares in one line that it is no body, face or outfit job:
// `Sheet: n/a <why>` (10+ characters). A false "n/a" on a real modelling job is visible in the brief; a missing line is refused.
// The one list of roles whose game and story brief names a cast sheet (scripts/brief.mjs imports it: a third copy of this list let the generator drop Character TD).
export const SHEET_ROLES = ['Programmer', 'Animator', 'Character TD']
export const needsSheetRole = (role) => SHEET_ROLES.some((r) => r.toLowerCase() === String(role).trim().toLowerCase())
const needsSheet = (plain) => new RegExp(`^[ \\t>-]*Role:[ \\t]*(${SHEET_ROLES.join('|')})\\b`, 'im').test(plain) && /\bKit:[ \t]*(game|story)\b/i.test(plain)
  && !/^[ \t>-]*Sheet:[ \t]*n\/a[ \t]+\S[^\n]{9,}$/im.test(plain)
// CompanyXY 2026-11-12 (yskills 13:23, point 5): gates were planned only after the owner complained. A builder, designer or animator brief
// at size M or L names the Reviewer thread that gates its work before the owner sees it; the gate roles themselves need no such line.
// A Gate line names a reviewer thread (`Gate: Reviewer · fit round 2 before owner`), or says in 10+ characters why the slice has no owner-facing
// result (`Gate: n/a no owner-facing result, a CI script only`); the same shape as `Sheet: n/a`. `none`, `later` or `skipped` do not count.
export const GATE_BUILDER_ROLES = '(?:Planner|Programmer|Designer|Animator|Character TD|Story Writer|Game Designer|Content Designer|Sound Designer)'
export const GATE_LINE = /^[ \t>-]*Gate:[ \t]*(?:(?:Reviewer|Tester)\b[^\n]*\bbefore owner\b[^\n]*|n\/a[ \t]+\S[^\n]{9,})$/im
const needsGate = (plain) => new RegExp(`^[ \\t>-]*Role:[ \\t]*${GATE_BUILDER_ROLES}\\b`, 'im').test(plain) && /\bSize:[ \t]*[ML]\b/i.test(plain)
const small = (plain) => /\bSize:[ \t]*S\b/i.test(plain)
const gateRolePlain = (plain) => /^[ \t>-]*Role:[ \t]*(Tester|Reviewer|Security|Legal|Playtester|Hook Checker|Critic|Story Editor|Evaluator)\b/im.test(plain)
// M50 (plan 2026-11-12-brief-fix-plan, section 4): ONE table row per line of a thread brief. `tpl` is the template line (docs/templates/thread-brief.md and
// the refusal), `ok` says the line is there, `cls` says who closes a gap: judgment = only the coordinator can decide it (one refusal that lists every such
// gap), recoverable = the thread fetches or fills it itself, derived = follows from Role, Kit and Size (the hook states it). `fill` is the thread's own
// answer to a gap. `strict: false` rows are reported by decide() in their own words, not in missingLines().
// Same source as ITEM_REF in rule-guard.mjs (the first token on the Item line wins); scripts/item-context.test.mjs pins it.
export const ITEM_REF = /^[ \t>-]*Item:[^<\n]*?(?:\b(M\d+|new)\b|((?:[\w.-]+\/[\w.-]+)?#\d+))/im
// The one spelling of an Item token (`m3` -> `M3`, `NEW` -> `new`); rule-guard.mjs holds the same function, scripts/item-context.test.mjs pins it.
export const normItem = (t) => t.replace(/^m(?=\d)/, 'M').replace(/^new$/i, 'new')
const itemTok = (p) => { const m = p.match(ITEM_REF); return m ? normItem(m[2] ?? m[1]) : null }
const line = (re) => (plain) => re.test(plain)
const sizeCls = (plain) => (small(plain) ? 'recoverable' : 'judgment')
export const BRIEF_FIELDS = [
  { key: 'Item', name: 'Item: (#n of its issue, M<n> from PLAN.json, or new)', tpl: 'Item: <issue #n, PLAN.json item M<n> or new>', ok: line(ITEM_REF), clean: (p) => /^[ \t>-]*Item:[ \t]*(M\d+|new|(?:[\w.-]+\/[\w.-]+)?#\d+)[ \t]*$/m.test(p.replace(/^([ \t>-]*)item:/gim, '$1Item:')), cls: sizeCls, fill: (p) => `Item: ${itemTok(p) ?? 'new'}` },
  { key: 'Plan', name: 'Plan: (the plan file or card this thread builds)', tpl: 'Plan: <plan file or card it builds>', ok: line(/^[ \t>-]*Plan:[ \t]*[^<\s]/im), cls: sizeCls, fill: () => 'Plan: n/a, size S' },
  { key: 'Acceptance', name: 'Acceptance: (what counts as accepted)', tpl: 'Acceptance: <what counts as accepted>', ok: line(/^[ \t>-]*Acceptance:[ \t]*[^<\s]/im), cls: sizeCls, fill: () => 'Acceptance: propose one from the task, say so in your first checklist line' },
  { key: 'Model', name: 'Model:', tpl: 'Model: <model id of the role\'s Roster row>', ok: line(/^[ \t>-]*Model:[ \t]*[^<\s]/im), cls: () => 'derived', fill: () => 'Model: the model this thread runs on' },
  { key: 'Skills', name: 'Skills:', tpl: 'Skills: <role file and skills the thread loads first>', ok: line(/^[ \t>-]*Skills:[ \t]*[^<\s]/im), cls: () => 'derived', fill: () => 'Skills: your role file from docs/TEAMS.md' },
  { key: 'Done when', name: 'Done when:', tpl: 'Done when: <command and expected output, or the screenshot that proves it>', ok: line(/\bDone when:[ \t]*\n?[ \t]*[^<\s]/i), cls: () => 'recoverable', fill: () => 'Done when: the Acceptance line, proven by a command or screenshot' },
  { key: 'Stop when', name: 'Stop when:', tpl: 'Stop when: <rounds or attempts, never tokens>', ok: line(/\bStop when:[ \t]*\n?[ \t]*[^<\s]/i), cls: () => 'recoverable', fill: () => 'Stop when: 3 gate rounds without 5/5, then report to the coordinator' },
  { key: 'Start', name: 'Start: (read MEMORY.md first)', tpl: 'Start: read MEMORY.md first, then <the files this task needs>', ok: line(/^[ \t>-]*Start:[^\n]*MEMORY\.md/im), cls: () => 'derived', fill: () => 'Start: read MEMORY.md first' },
  // Companyxy 2026-11-12: finished threads stayed open and work lay twice. The thread lists the threads itself before it builds.
  { key: 'Threads', name: 'Threads: (list_threads checked, none open on this topic)', tpl: 'Threads: <list_threads checked: none open on this topic | continues <title of the open thread>>', ok: line(/^[ \t>-]*Threads:[ \t]*[^<\s][^\n]{8,}$/im), cls: () => 'recoverable', fill: () => 'Threads: call list_threads yourself and reuse an open thread of this topic' },
  { key: 'Prior art', strict: false, tpl: 'Prior art: <sources named: repo, path, URL, #n> -> copy | adapt | reuse | build, because <why>', ok: (p) => !needsPriorArt(p), cls: (p) => (gateRolePlain(p) ? 'derived' : 'recoverable'), fill: (p) => (gateRolePlain(p) ? 'Prior art: .claude/skills/operator/gate.md and the kit\'s checks -> adapt, because the gate rules exist' : 'Prior art: to find: the repo and docs first, sources named before you build') },
  { key: 'Gate', name: 'Gate: <Reviewer thread> before owner, or `Gate: n/a <why no owner-facing result>` (a builder, designer or animator brief at size M or L)', tpl: 'Gate: <Reviewer thread> before owner (M or L)', applies: needsGate, ok: line(GATE_LINE), cls: () => 'recoverable', fill: () => 'Gate: ask the coordinator (message_coordinator) for the Reviewer thread, then write `Gate: Reviewer · <what> before owner`' },
  { key: 'Sheet', name: 'Sheet: (approved cast sheet, docs/preproduction-workflow.md)', tpl: 'Sheet: <approved cast sheet .md, or `n/a <why no body, face or outfit job>`; Programmer or Animator on a game or story kit>', applies: needsSheet, ok: line(/^[ \t>-]*Sheet:[ \t]*[^<\n]*\.md\b/im), cls: () => 'judgment' },
  { key: 'Look-Lock', name: 'Look-Lock: (owner card of the look)', tpl: 'Look-Lock: <owner card link of the approved look (https or #cmsg_...); not needed with `Sheet: n/a`>', applies: needsSheet, ok: line(/^[ \t>-]*Look-Lock:[ \t]*[^<\n]*(https?:\/\/|#cmsg_?[A-Za-z0-9]{6,})/im), cls: () => 'judgment' },
  { key: 'Researcher', name: 'Researcher: (the task asks for research)', tpl: 'Researcher: <subagent and model, or the Researcher thread; research tasks only>', applies: (p) => ASKS_RESEARCH.test(p) && !/\bRole:[ \t]*Researcher\b/i.test(p), ok: line(/^[ \t>-]*Researcher:[ \t]*[^<\s]/im), cls: () => 'recoverable', fill: () => 'Researcher: ask the coordinator for a Researcher thread (message_coordinator) and go on meanwhile' },
  { key: 'Tester', strict: false, tpl: 'Tester: <Tester thread; size L Programmer only>', applies: (p) => /^[ \t>-]*Role:[ \t]*Programmer\b/im.test(p), ok: (p) => !needsTester(p), cls: () => 'judgment' },
]
export function missingLines(text) {
  const plain = text.replace(/[*_`]/g, '')
  return BRIEF_FIELDS.filter((f) => f.strict !== false && (f.applies?.(plain) ?? true) && !f.ok(plain)).map((f) => f.name)
}
// The same table sorted by who closes the gap. Acceptance and Done when are one datum: either satisfies both.
export function classify(text) {
  const plain = text.replace(/[*_`]/g, '')
  const out = { judgment: [], recoverable: [], derived: [] }
  const has = (k) => BRIEF_FIELDS.find((f) => f.key === k).ok(plain)
  for (const f of BRIEF_FIELDS) {
    // A line that is there but in the wrong format (`Item: PLAN.json item M29`) is a derived repair, never a gap.
    if (f.clean && f.ok(plain) && !f.clean(plain)) out.derived.push({ key: f.key, tpl: f.tpl, fill: f.fill(plain) })
    if (!(f.applies?.(plain) ?? true) || f.ok(plain) || (f.key === 'Acceptance' && has('Done when')) || (f.key === 'Done when' && has('Acceptance'))) continue
    const cls = f.cls(plain)
    out[cls].push({ key: f.key, tpl: f.tpl, fill: f.fill?.(plain) })
  }
  return out
}

// Kit and size checked against docs/TEAMS.md, not only their format (blind test 2026-10-27: "Kit: content",
// a video at size S, a Game Designer on a Ren'Py story, a Designer cutting a video).
export const kitRows = (teams) => section(teams, 'Kits', 'Models for tasks').split('\n').filter((l) => /^\| `/.test(l))
  .map((l) => { const c = cells(l); return { kit: c[1].match(/`([\w-]+)`/)[1], team: c[3], skipped: c[4] } })
// A Roster subsection whose heading names kits in backticks (`### 3D parts (kits `game`, `story`)`) holds roles that fit those kits only.
const sectionKits = (teams, name) => { const h = section(teams, 'Roster', 'Kits').split(/\n### /).slice(1).find((x) => x.includes(`| ${name} (`)); return h ? [...h.split('\n')[0].matchAll(/`([\w-]+)`/g)].map((m) => m[1]).filter((k) => kitRows(teams).some((r) => r.kit === k)) : [] }
const rosterOf = (teams, part) => section(teams, 'Roster', 'Kits').split(/\n### /).find((s) => s.startsWith(part)) ?? ''
// A role named in a Kits cell: one comma, semicolon or bracket item that is the role, maybe with words after ("Designer for renders", not "Game Designer").
const named = (cell, role) => cell.replace(/`/g, '').split(/[,;()]/).map((i) => i.trim().replace(/^(and|then|plus) /i, '').toLowerCase()).some((i) => i === role.toLowerCase() || i.startsWith(`${role.toLowerCase()} `))
// A Skipped item with a condition ("Marketer before the first playable", "Content Designer (unless ...)") skips nobody outright.
const skips = (cell, role) => cell.replace(/`/g, '').split(/[,;]/).map((i) => i.trim().replace(/^(and|then|plus) /i, ''))
  .some((i) => !/[(]|\b(before|unless|until|after)\b/i.test(i) && i.toLowerCase() === role.toLowerCase())
// The names docs/TEAMS.md lists: Roster roles (a table row `| Name ([`file.md`](...)) |`) and Kits (`| `kit` ...`). The one source for this
// guard and for scripts/brief.mjs.
export const rosterNames = (teams) => String(teams).split('\n').filter((l) => /^\| [A-Z][\w ]* \(\[`/.test(l)).map((l) => l.slice(2, l.indexOf(' (')))
export const kitNames = (teams) => (teams ? kitRows(teams).map((r) => r.kit) : [])

// The one answer to "which role may I name on this kit": a Roster role fits a kit by the same rule badTeam applies (a refusal lists these, so nobody guesses).
export function rolesForKit(teams, kit) {
  const row = kitRows(teams).find((r) => r.kit === String(kit).toLowerCase())
  if (!row) return []
  const media = ['video', 'social'].includes(row.kit)
  return rosterNames(teams).filter((n) => {
    const film = rosterOf(teams, 'Film').includes(`| ${n} (`)
    const social = rosterOf(teams, 'Social').includes(`| ${n} (`)
    const story = rosterOf(teams, 'Story').includes(`| ${n} (`)
    const only = sectionKits(teams, n)
    return ['Reviewer', 'Researcher'].includes(n) || (only.length ? only.includes(row.kit) : story ? row.kit === 'story' : social ? row.kit === 'social' : film ? media : media ? named(row.team, n) : !skips(row.skipped, n))
  })
}

// #453 left this gap: a brief may name any Role. It names a Roster role, or `Role: none` for a mini task (operator/briefs.md).
export function badRole(text, teams) {
  const names = rosterNames(teams)
  const plain = text.replace(/[*_`]/g, '')
  const role = names.length ? roleOf(plain, teams) : null
  if (!role) return null
  // roleOf matches a name by its start: `Programmers` or `Programmer-X` must not pass as the Programmer (a name ends at a space, `·`, `|`, `,` or `(`).
  const line = plain.match(/^[\s>-]*Role:[ \t]*([^\n]*)/m)?.[1].trim() ?? ''
  const exact = role.row && /^$|^[\s·|,(]/.test(line.slice(role.name.length))
  const kit = plain.match(/\bKit:[ \t]*([\w-]+)/i)?.[1]
  const onKit = kit ? rolesForKit(teams, kit) : []
  const pick = onKit.length ? `on the ${kit.toLowerCase()} kit pick one of ${onKit.join(', ')}` : `pick one of ${names.join(', ')}`
  return exact ? null : `Role: ${role.row ? line.split(/[\s·|,(]/)[0] : role.name} is no role in docs/TEAMS.md (Roster): ${pick}, or \`Role: none\` for a small task with no role`
}

// M48: a Reviewer brief may carry `Topic: <name>`; the names are the `## ` headings of the checklist file (the one source for this guard,
// scripts/brief.mjs and rule-guard's topic card).
export const topicNames = (checklists) => String(checklists).split('\n').filter((l) => /^## \S/.test(l)).map((l) => l.slice(3).trim())
export function badTopic(text, checklists) {
  const plain = text.replace(/[*_`]/g, '')
  const topic = plain.match(/^[ \t>-]*Topic:[ \t]*([^\n]*)/im)?.[1].trim()
  const names = topicNames(checklists)
  if (topic === undefined || !names.length) return null
  if (!/^[ \t>-]*Role:[ \t]*Reviewer\b/im.test(plain)) return `Topic: ${topic} belongs to a Reviewer brief only (${CHECKLISTS})`
  return names.some((n) => n.toLowerCase() === topic.toLowerCase()) ? null : `Topic: ${topic} is no topic in ${CHECKLISTS}: pick one of ${names.join(', ')}`
}

// Skill folders of claude-setup that get mistaken for kits.
const SKILL_NAMES = /^(game-3d|social-team|video-studio|storyteller|blender-body|media-editing|roblox|studio|twin|store|store-publish|market|sell|seo|legal|publish|scaffold|toolbox|ui-review|impeccable|operator)$/
export function badTeam(text, teams) {
  const plain = text.replace(/[*_`]/g, '')
  const rows = teams ? kitRows(teams) : []
  if (!rows.length) return null
  const kit = plain.match(/\bKit:[ \t]*([\w-]+)/i)?.[1].toLowerCase()
  const row = rows.find((r) => r.kit === kit)
  // A skill name is not a kit (2026-11-12: game-3d, social-team): the kit is what the task makes, the skill goes on the Skills: line.
  const skill = /^[a-z][\w-]*$/.test(kit) && kit !== 'none' && SKILL_NAMES.test(kit) ? ` (\`${kit}\` is a skill: put it on the Skills: line and pick the kit by what the task makes, e.g. game-3d is a game, social-team is social)` : ''
  if (!row) return `Kit: ${kit} is no kit in docs/TEAMS.md (Kits)${skill}: pick one of ${rows.map((r) => r.kit).join(', ')} by what the task makes (Spawn rule 1)`
  const size = plain.match(/\bSize:[ \t]*([SML])\b/i)?.[1].toUpperCase()
  if (['video', 'social'].includes(kit) && size === 'S') return `a ${kit} brief is size M (one video or post) or L (a batch, series or launch video), never S (docs/TEAMS.md, Spawn rule 2)`
  const role = roleOf(plain, teams)
  if (!role?.row) return null
  if (role.name === 'Planner' && size === 'S') return 'a Planner thread runs at size M or L only; size S starts the Programmer (docs/TEAMS.md, Sizes)'
  const film = rosterOf(teams, 'Film').includes(`| ${role.name} (`)
  const social = rosterOf(teams, 'Social').includes(`| ${role.name} (`)
  const story = rosterOf(teams, 'Story').includes(`| ${role.name} (`)
  const only = sectionKits(teams, role.name)
  const media = ['video', 'social'].includes(kit)
  const fits = ['Reviewer', 'Researcher'].includes(role.name) || (only.length ? only.includes(kit) : story ? kit === 'story' : social ? kit === 'social' : film ? media : media ? named(row.team, role.name) : !skips(row.skipped, role.name))
  return fits ? null : `the ${role.name} is not on the \`${kit}\` kit's team (docs/TEAMS.md, Kits: team "${row.team}", skipped "${row.skipped}"); pick one of ${rolesForKit(teams, kit).join(', ')}`
}

// A size M or L thread's title is `<Role> · <what>` (docs/TEAMS.md, Roster "Runs as"); test project 2026-10-27: a bee video thread
// started untitled by role. Size S needs no role title (yskills 2026-10-27).
export function badTitle(title, text, teams) {
  const plain = text.replace(/[*_`]/g, '')
  const role = teams && typeof title === 'string' && /\bSize:[ \t]*[ML]\b/i.test(plain) && roleOf(plain, teams)
  if (!role?.name) return null
  return new RegExp(`^\\s*${role.name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*·\\s*\\S`, 'i').test(title) ? null : role.name
}

// Persistent role threads, partly (research 2026-11-12; yskills picked "partly, per plan or PR"): a role thread is
// reused for the next job of the same plan or PR, so a start while that role has an open thread must say why it is new.
// A resolved or done thread is not reusable; a Tester at L and every Reviewer are always fresh.
// The board is the last full thread listing of the transcript (rule-guard's openThreads: any nesting, filtered listings skipped, threads resolved since dropped).
export const boardThreads = (transcript) => openThreads(toolCalls(String(transcript)))
export const openSameRole = (board, role) => board.filter((t) => new RegExp(`^\\s*${role.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*·`, 'i').test(t.title)).map((t) => t.title)
export function reuseBlock(text, teams, board) {
  const plain = text.replace(/[*_`]/g, '')
  const role = teams && board?.length && roleOf(plain, teams)
  if (!role?.row || role.name === 'Reviewer' || (role.name === 'Tester' && /\bSize:[ \t]*L\b/i.test(plain))) return null
  const open = openSameRole(board, role.name)
  if (!open.length || /^[ \t>-]*Reuse:[ \t]*none\b[^\n]*\([ \t]*[^)<\s][^)\n]*\)/im.test(plain)) return null
  return `${role.name} thread already open: "${open[0]}". Run list_threads again first (the board goes stale when threads resolve themselves); if it is still open, give the work to it with message_thread (same plan or PR; docs/TEAMS.md, Reuse rule), or add \`Reuse: none (<why: other plan or PR, long context, parallel read job>)\` to the brief and retry`
}

// unread: the boot files a thread start still needs (empty when read or when no transcript was given).
export function decide(tool, input = {}, dirs = [], unread = [], teams = '', checklists = '', board = []) {
  const kind = AGENT.test(tool) ? 'Agent' : THREAD_START.test(tool) ? 'thread' : null
  if (kind === 'thread' && unread.length) return { block: `team-guard: read the rules before starting a thread: ${unread.join(' and ')} (in ~/.claude/claude-setup/ or the claude-setup repo; docs/MAP.md, Start here). 2026-10-26 a coordinator skipped them and guessed every model. Read them, then retry.` }
  if (kind === 'thread' && !stamped(briefText(input))) return { block: 'team-guard: every thread brief starts with the stamp line `Role: <one role from docs/TEAMS.md Roster> · Kit: <kit> · Size: <S|M|L>` (operator/briefs.md); a small task with no role says `Role: none`. The thread loads its playbook from it. Add the line, then retry.' }
  if (kind === 'thread') {
    // One refusal lists every problem (companyxy 2026-11-12: one line per round cost an extra round per thread).
    const text = briefText(input)
    const found = []
    const unknown = badRole(text, teams)
    if (unknown) found.push(`${unknown}. Start the role the Roster names for this task (claude-setup docs/TEAMS.md, Roster)`)
    const team = badTeam(text, teams)
    if (team) found.push(`${team}. Look the task up in claude-setup docs/TEAMS.md (Spawn rule, Sizes, Kits) and fix the stamp line`)
    const topic = badTopic(text, checklists)
    if (topic) found.push(`${topic}. Use a topic the checklist file lists, or drop the line for a plain Reviewer`)
    const title = badTitle(input.title, text, teams)
    if (title) found.push(`a ${title} thread is titled \`${title} · <what>\` (claude-setup docs/TEAMS.md, Roster "Runs as"), e.g. "${title} · Bienen-Video"; fix the title`)
    const lines = missingLines(text)
    if (lines.length) found.push(`the brief misses ${lines.join(', ')} (claude-setup .claude/skills/operator/briefs.md, Every thread brief starts with)`)
    if (needsPriorArt(text)) found.push('add a line `Prior art: <the sources checked, named: owner/repo, path, URL, #PR> -> copy | adapt | reuse | build, because <why>` (a gesture like \"looked around\" fails; or `none, because <why nothing could exist>`, or `to find: <where the Researcher looks>`; CLAUDE.md, Work for the future)')
    if (needsTester(text)) found.push('a size L Programmer thread starts only after its Tester thread (claude-setup docs/TEAMS.md, Sizes): start `Tester · <app>` first, then put a line `Tester: <its thread id or title>` in this brief')
    const wrong = wrongModel(text, input.model, teams)
    if (wrong) found.push(`the ${wrong.role} runs on ${wrong.allowed.join(' or ')} (claude-setup docs/TEAMS.md, Roster), not ${wrong.tier}. Pass that model. For an exception the row names (e.g. "Opus writes the weekly plan") add \`Model: <tier> (<why>)\` to the brief; if yskills named this model, say "yskills named <model>"`)
    const reuse = reuseBlock(text, teams, board)
    if (reuse) found.push(reuse)
    if (found.length) return { block: `team-guard: ${found.length === 1 ? found[0] : `${found.length} problems in this brief: ${found.map((f, i) => `(${i + 1}) ${f}`).join(' ')}`}. Copy the fixed template claude-setup docs/templates/thread-brief.md, fill every line once, then retry.` }
  }
  const own = kind === 'Agent' && downgraded(input, dirs)
  if (own) return { block: `team-guard: the ${input.subagent_type} agent runs on ${own} (its agent file in claude-setup .claude/agents), not ${input.model}. Drop \`model\` or pass ${own}, then retry.` }
  if (!kind || String(input.model ?? '').trim()) return {}
  if (kind === 'Agent' && hasOwnModel(input.subagent_type, dirs)) return {}
  return { block: `team-guard: this ${kind === 'Agent' ? 'Agent call' : 'thread start'} has no \`model\`. Pass the model of the role's row in claude-setup docs/TEAMS.md (Roster; Agent: haiku, sonnet or opus; thread: the full id from the Models line), then retry.` }
}

if (process.argv[1] && import.meta.url.endsWith(process.argv[1].replace(/\\/g, '/').split('/').pop())) {
  const mode = process.argv[2]
  const home = process.env.CLAUDE_SETUP_HOME || homedir()
  const dir = join(home, '.claude', 'claude-setup')
  let raw = ''
  process.stdin.setEncoding('utf8')
  process.stdin.on('data', (c) => { raw += c })
  process.stdin.on('end', () => {
    try {
      const { tool_name: tool = '', tool_input: input, cwd = process.cwd(), transcript_path: transcript, session_id: session, model } = JSON.parse(raw || '{}')
      const mark = (kind) => join(dir, 'booted', `${String(session).replace(/\W/g, '')}.${kind}`)
      const say = (context) => process.stdout.write(JSON.stringify({ hookSpecificOutput: { hookEventName: 'SessionStart', additionalContext: context } }))
      if (mode === 'start') {
        // SessionStart names the session's model; rule-guard's brief check reads it before the first reply.
        if (session && typeof model === 'string' && model) writeFileSync(modelFile(session), model)
        if (process.env.CLAUDE_SETUP_BOOT_FETCH !== 'off') refresh(dir)
        sweep(join(dir, 'booted'))
        if (rulesLoaded(cwd, home)) return say(POINTER)
        const claude = text(join(dir, 'CLAUDE.md')).replace(/\r/g, '')
        const card = claude.includes(MARK) && rulesCard(claude)
        if (card && card.length < BOOT_MAX) { if (session) { mkdirSync(dirname(mark('rules')), { recursive: true }); writeFileSync(mark('rules'), '') } return say(card) }
        return say(`${bootCard(dir)}\n${POINTER}`)
      }
      if (process.env.CLAUDE_SETUP_TEAM_GUARD === 'off') return
      const read = transcript && existsSync(transcript) ? readBootFiles(transcript) : null
      // A card this session got at start counts as read.
      const need = (rulesLoaded(cwd, home) ? ['TEAMS.md'] : ['CLAUDE.md', 'TEAMS.md'])
        .filter((f) => !(session && f === 'CLAUDE.md' && existsSync(mark('rules'))))
      const unread = read ? need.filter((f) => !read.has(f)) : []
      const teams = THREAD_START.test(tool) ? text(join(cwd, 'docs', 'TEAMS.md')) || text(join(dir, 'docs', 'TEAMS.md')) : ''
      const checklists = THREAD_START.test(tool) ? text(join(cwd, CHECKLISTS)) || text(join(dir, CHECKLISTS)) : ''
      const board = THREAD_START.test(tool) && transcript ? boardThreads(text(transcript)) : []
      const out = decide(tool, input, [join(cwd, '.claude', 'agents'), join(home, '.claude', 'agents')], unread, teams, checklists, board)
      if (out.block) { process.stderr.write(out.block); process.exitCode = 2 }
    } catch {
      // A guard must never break a tool call.
    }
  })
}
