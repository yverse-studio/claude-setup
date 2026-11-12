#!/usr/bin/env node
// Hard gate round counter (yskills 2026-11-12, vacation-game: a PR ran 11 gate rounds instead of 6, nothing counted, the
// coordinator released rounds itself, a gate asked to merge at 4.2). The one home of the rule is operator/gate.md (Rounds).
// The counter is a ledger file per asset (a PR or any named asset) in the project's shared folder, so a fresh thread goes on
// from it. rule-guard calls gateStep (PreToolUse) and gateBrief (UserPromptSubmit); this file is also the CLI threads use.
//   rounds 1-3: judged at 4.5 (4.8 when important)   rounds 4-6: only with a Fable director   round 7+: only with a card to yskills
// CLI: gate-rounds.mjs status|check|init|direct|card|picture|waive <asset> ...   (usage text below)
// Fail closed: a gate-shaped call whose check throws is refused. CLAUDE_SETUP_RULE_GUARD=off turns the hook (not the CLI) off.
import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, renameSync, unlinkSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { basename, join, normalize, posix } from 'node:path'

export const THRESHOLD = 4.5
export const IMPORTANT_THRESHOLD = 4.8
export const FREE_ROUNDS = 3 // rounds 1-3 need nothing
export const DIRECTED_ROUNDS = 6 // rounds 4-6 need a Fable director; 7+ need a card
export const CARD_ROUNDS = 3 // a card to yskills opens three more rounds
export const DIRECTOR = 'fable' // the tier; the id is in docs/TEAMS.md (Models line)

const read = (f) => { try { return readFileSync(f, 'utf8') } catch { return '' } }
export const threshold = (important) => (important ? IMPORTANT_THRESHOLD : THRESHOLD)

export function ledgerDir(env = process.env) {
  if (env.CLAUDE_SETUP_GATE_DIR) return env.CLAUDE_SETUP_GATE_DIR
  return existsSync('/mnt/project-files') ? '/mnt/project-files/gate' : join(env.CLAUDE_SETUP_HOME || homedir(), '.claude', 'claude-setup', 'gate')
}
const fileOf = (dir, asset) => join(dir, `${String(asset).toLowerCase().replace(/#0+(?=\d)/, '#').replace(/[^\w.-]+/g, '_')}.json`) // one key for the CLI, the brief check and the hook
const blank = (asset) => ({ asset, rounds: [], important: false, passed: false, director: null, card: null, picture: null, waived: null })

// A missing file is a new asset; a file that exists but does not parse throws (never a silent reset of the counter).
export function readLedger(dir, asset) {
  const f = fileOf(dir, asset)
  if (!existsSync(f)) return blank(asset)
  return { ...blank(asset), ...JSON.parse(readFileSync(f, 'utf8')) }
}
export function writeLedger(dir, ledger) {
  mkdirSync(dir, { recursive: true })
  const f = fileOf(dir, ledger.asset)
  writeFileSync(`${f}.${process.pid}.tmp`, `${JSON.stringify(ledger, null, 2)}\n`)
  renameSync(`${f}.${process.pid}.tmp`, f)
}
export const lastRound = (l) => l.rounds.at(-1)?.n ?? 0

// ---- who sent a transcript row (M53, gate round 11 of #474): the text says who wrote it, the origin says who delivered it. A thread can
// schedule its own prompt (CronCreate, ScheduleWakeup, send_later); the harness then writes that text as an isMeta user row, word for word.
// Nothing a thread can schedule or type carries the projects server's origin. One definition each; rule-guard and task-ledger use these.
// A scheduled or notification-driven row: a cron or wakeup (turnOrigin scheduled, wakeupSource), or a send_later notification (live 2026-11-12:
// turnOrigin task_notification, origin task-notification with no projects-relay subkind). None of them is a person or the coordinator.
export const selfScheduled = (r) => r?.turnOrigin === 'scheduled' || r?.turnOrigin === 'task_notification' || !!r?.wakeupSource
  || (r?.origin?.kind === 'task-notification' && r.origin.subkind !== 'projects-relay')
export const fromProjects = (r) => {
  const o = r?.type === 'attachment' ? r.attachment?.origin : r?.origin
  return o?.kind === 'task-notification' && o?.subkind === 'projects-relay' && !selfScheduled(r)
}
// yskills' "stop", "stopp", "pause", "halt" (the stop note of the prompt hook, and no answer to a card).
// yskills' own message: the app writes it with origin {kind: 'human'} (real row, M53 slice 2: a tap on a card, scripts/fixtures/m53/real-human-rows.jsonl).
// A thread's scheduled prompt carries none; the scheduled markers veto even a row that claims it.
export const fromHuman = (r) => r?.type === 'user' && r.origin?.kind === 'human' && r.turnOrigin === 'human' && !selfScheduled(r)
export const STOP_WORD = /^\W*(stop+|stopp+|pause|halt)\W*$/i

// ---- grants (security review 2026-11-12, finding 1): the proofs for init, direct, card, picture and waive are read by the hook, and the
// CLI refuses those verbs without the short grant the hook leaves after it checked them. A call that bypasses the hook (a copy of this
// file, node -e, an import) reaches the CLI without a grant and is refused there too, so the filename in argv is no longer the lock.
export const GRANTED = ['init', 'direct', 'card', 'picture', 'waive', 'record']
// A named asset is plain word characters: no slash, space or #, so it cannot spell a PR ledger (owner/repo#n and "owner/repo n" share one file key).
export const namedProblem = (asset) => /^[\w.-]+$/.test(String(asset)) && !/_\d+$/.test(String(asset)) ? null : 'record: only a plain named asset (letters, digits, - . _; not ending in _<number>, no owner/repo#n); a PR verdict goes through "post" or the comment tool (gate.md, Rounds)'
const grantRef = (verb, rest, ref) => verb === 'init' ? rest[rest.indexOf('--round') + 1] : verb === 'direct' ? rest[rest.indexOf('--plan') + 1] : verb === 'record' ? rest[rest.indexOf('--body-file') + 1] : ref
export const GRANT_SECONDS = 120
const grantFile = (dir, verb, asset) => join(dir, 'grants', `${verb}.${basename(fileOf(dir, asset))}`)
// The hook reads the command before the shell expands it, the CLI after: both sides key the grant on the same form (gate round 1 of the #450 re-land).
export const grantKey = (ref, home = homedir()) => { const v = String(ref ?? '').trim().replace(/^(['"])(.*)\1$/, '$2'); return v ? normalize(v.replace(/^(?:~|\$HOME|\$\{HOME\})(?=\/|$)/, home)) : '' }
// A record grant also carries the sha256 of the body the hook read (security review 2026-11-12, round 2, finding 2): the path alone let a body be
// swapped between the hook and the CLI. The CLI hashes the one read it counts; a record grant without a digest opens nothing.
export const digest = (text) => createHash('sha256').update(String(text)).digest('hex')
export function issueGrant(dir, verb, asset, ref, now = Date.now(), body = null) {
  mkdirSync(join(dir, 'grants'), { recursive: true })
  writeFileSync(grantFile(dir, verb, asset), `${JSON.stringify({ verb, asset: String(asset).toLowerCase(), ref: grantKey(ref), exp: now + GRANT_SECONDS * 1000, ...(body === null ? {} : { sha: digest(body) }) })}\n`)
}
export function takeGrant(dir, verb, asset, ref, now = Date.now(), body = null) {
  const f = grantFile(dir, verb, asset)
  let g
  try { g = JSON.parse(readFileSync(f, 'utf8')) } catch { return false }
  try { unlinkSync(f) } catch { /* already taken */ }
  const sameBody = verb !== 'record' ? true : typeof g.sha === 'string' && body !== null && g.sha === digest(body)
  return g.exp > now && g.verb === verb && g.asset === String(asset).toLowerCase() && g.ref === grantKey(ref) && sameBody
}

// ---- who may post a verdict (finding 2): a verdict is counted only from a gate session (a gate role: Tester, Reviewer, Evaluator, Critic ...) or when the
// headline came out of a fresh reviewer subagent of this session (gate.md: S and M run in the author thread with one fresh code-reviewer).
// A Programmer that types its own "Gate 5/5" has neither, so it can neither pass nor merge itself.
const norm = (t) => String(t).replace(/[*_`#>\s]+/g, ' ').trim().toLowerCase()
export const GATE_ROLE = /^(tester|reviewer|security|legal|playtester|hook checker|critic|story editor|evaluator)$/i // the list of rule-guard's GATE_ROLES (a test keeps them equal); exact Roster name from the role stamp, never a prefix (security review 2026-11-12)
// Real reviewer agents only (an invented subagent_type does not vouch), the verdict must open the reviewer's own result, and the prompt the
// builder gave it must not already contain that verdict (security review 2026-11-12, finding 2: a self-attested proof).
const REVIEWER = /^(code-reviewer|evaluator|security-reviewer|typescript-reviewer|vue-reviewer|database-reviewer|design-critic|legal-reviewer|red-team)$/
export function reviewerProof(body, calls = []) {
  const line = norm(String(body).split('\n').find((l) => l.trim()) ?? '')
  const lead = (t) => norm(String(t).split('\n').find((l) => l.trim()) ?? '')
  return !!line && calls.some((c) => /^(Agent|Task)$/.test(c.name) && REVIEWER.test(String(c.input?.subagent_type ?? '')) && (lead(c.result) === line || (c.report && lead(c.report) === line)) && !norm(c.input?.prompt ?? '').includes(line))
}
export function authorProblem(body, ctx = {}) {
  if (GATE_ROLE.test(ctx.role ?? '') || reviewerProof(body, ctx.calls ?? [])) return null
  return `gate verdict: a verdict counts only from a gate session (a gate role: Tester, Reviewer, Critic ..., docs/TEAMS.md) or when its headline came out of a fresh reviewer subagent of this session (code-reviewer or evaluator). This session is ${ctx.role ? `the ${String(ctx.role).slice(0, 30)}` : 'not a gate role'} and no reviewer subagent returned this headline, so a builder cannot pass or merge its own work (gate.md, Rounds).`
}

// "Gate 4.2/5 (L, round 3) [important]" or "Gate 5/5 (S, round 1)" or "Gate fail, round 2".
// Only a line that STARTS with "Gate <score>/5", "Gate fail" or "Gate pass" is a verdict; "the gate flagged ... round 1" is talk.
const HEADLINE = /^[\s*_#-]*Gate\s+(?:(\d(?:[.,]\d+)?)\s*\/\s*5|(fail(?:ed)?)|(pass(?:ed)?))\b(?:[^\n]*?\b(?:round|runde)\s+(\d+))?/i
// A verdict opens the post (the first non-empty line, never a quoted older one); without a number it is the next round (parseHeadline's round null).
export function parseHeadline(text) {
  const line = String(text).split('\n').find((l) => l.trim())
  const m = line?.match(HEADLINE)
  if (!m) return null
  const score = m[1] !== undefined ? Number(m[1].replace(',', '.')) : m[3] ? 5 : null
  return { round: m[4] === undefined ? null : Number(m[4]), score, important: /\b(important|risky|wichtig)\b/i.test(line) }
}
const lastPass = (l) => !!l.rounds.at(-1)?.pass
// The first round of the passing run that ends the ledger: polish rounds count from there, not from an older pass.
const firstPass = (l) => { let n = null; for (const r of [...l.rounds].reverse()) { if (!r.pass) break; n = r.n } return n }
export const POLISH_ROUNDS = 2 // after a PASS at most 2 more rounds toward 5/5 (gate.md, Scored gates)

// null = the round may happen; else the reason. A round right after a passing round needs no director or card (a mergeable
// version exists), for 2 rounds; a round after a fall-back below the threshold is a normal round again.
export function roundProblem(l, round) {
  const last = lastRound(l)
  if (!Number.isInteger(round) || round < 1) return `round "${round}" is not a number`
  if (round > last + 1) return `round ${round} skips ahead: ${l.asset} stands at round ${last} in its ledger. Rounds count up by one per asset and never start over, a fresh thread goes on from the ledger (gate.md, Rounds).`
  if (round < last) return `round ${round} is behind the ledger (${l.asset} stands at round ${last}): the count belongs to the asset, never restarts (gate.md, Rounds).`
  if (lastPass(l) && round <= (firstPass(l) ?? 0) + POLISH_ROUNDS) return null
  if (round <= FREE_ROUNDS) return null
  if (round <= DIRECTED_ROUNDS && !l.director) return `round ${round} of ${l.asset} needs a Fable director: rounds 1 to ${FREE_ROUNDS} are done without a pass. Ask the coordinator for a Fable thread; it runs "node ~/.claude/claude-setup/gate-rounds.mjs direct ${l.asset} --plan <file>" (only a Fable session can record it). Rounds 4 to 6 follow its plan (gate.md, Rounds).`
  if (round > DIRECTED_ROUNDS && !(l.card && round <= l.card.round + CARD_ROUNDS)) return `round ${round} of ${l.asset} needs a card to yskills: ${DIRECTED_ROUNDS} rounds ran without a pass. Post ONE request_decision (what it does, why it fails, 2-3 ideas, one recommended), then "node ~/.claude/claude-setup/gate-rounds.mjs card ${l.asset} --ref <the card's cmsg id>" (gate.md, Rounds).`
  return null
}

export function recordRound(l, { round, score, important }, at = new Date().toISOString()) {
  const imp = l.important || !!important
  const pass = score !== null && (score >= 5 || score >= threshold(imp))
  const rounds = [...l.rounds.filter((r) => r.n !== round), { n: round, score, pass, at }]
  return { ...l, important: imp, rounds, passed: rounds.some((r) => r.pass) }
}

export function mergeProblem(l) {
  if (l.waived) return null
  if (!l.rounds.length) return `${l.asset}: no gate round is counted for this PR, so it cannot merge (a merge cannot be taken back). The gate posts its verdict first, as "Gate <score>/5 (<size>, round <n>)" with the comment tool; then the merge works (gate.md, Rounds).`
  if (lastPass(l)) return null
  const r = l.rounds.at(-1)
  return `${l.asset}: the last gate round (${r.n}) scored ${r.score ?? 'no score'}, under ${threshold(l.important)}: no merge below the threshold, no exception. Fix it (next round ${r.n + 1}), or put ONE card to yskills; only his answer on it frees a merge (gate-rounds.mjs waive).`
}

// ---- picture card: a hub, start screen, main menu or art/visual style is shown as pictures from current games before anything is built. The hook does not
// guess whether a text means a NEW one: a text that names one at all carries a `Picture card:` line (the card link, or `none, because <reason>`).
const THING = /\b(?:hubs?|start[\s_-]*(?:screens?|bildschirm\w*)|(?:title|titel)[\s_-]*(?:screens?|bildschirm\w*)|main[\s_-]*menus?|haupt[\s_-]*men(?:ü|ue|u)\w*|art[\s_-]*styles?|visual[\s_-]*styles?|(?:kunst|grafik|art)[\s_-]*stil\w*|visuell\w*[\s_-]+stil\w*)(?![\p{L}\d])/iu
export const namesLook = (text) => THING.test(String(text).replace(/docker[\s_-]*hub|github[\s_-]*hub|hub\.docker\.com/gi, ''))
const PICTURE_LINE = /^[ \t>*_-]*Picture card:[ \t*_`]*(?:\[[^\]]*\]\()?(#?cmsg_\w+|https?:\/\/[^\s)]*cmsg_\w+[^\s)]*)/im
const PICTURE_NONE = /^[ \t>*_-]*Picture card:[ \t*_`]*none,[ \t]*because[ \t]+(?![<.\s])\S/im
export const pictureRef = (text) => String(text).match(PICTURE_LINE)?.[1] ?? null // a real card id, not any URL
export const pictureOk = (text) => !!pictureRef(text) || PICTURE_NONE.test(String(text))
const PICTURE_ASK = 'a `Picture card: <cmsg link>` line, or `Picture card: none, because <reason>` (gate.md, Picture card first)'

const num = (brief, key) => { const m = String(brief).replace(/[*_`]/g, '').match(new RegExp(`^[ \\t>-]*${key}:[ \\t]*([^\\n]*)`, 'im')); return m ? m[1].trim() : null }

// Thread side (UserPromptSubmit): the spawn brief's Round / Asset / Picture card lines against the ledger. '' = fine.
export function gateBrief(brief, { model = null, dir = ledgerDir() } = {}) {
  const roundText = num(brief, 'Round')
  const asset = num(brief, 'Asset')?.toLowerCase() ?? null
  const out = []
  if (roundText !== null) { // an Asset: line alone is fine
    const round = Number(roundText?.match(/^\d+/)?.[0])
    if (!roundText || !round) out.push('a gate-round brief needs a `Round: <n>` line')
    else if (!asset) out.push('`Round:` needs an `Asset: <owner/repo#pr | name>` line, the count belongs to the asset')
    else {
      const l = readLedger(dir, asset)
      const why = l.rounds.length ? roundProblem(l, round) : round > 1 ? `${asset} has no ledger: import its history first with "gate-rounds.mjs init ${asset} --round ${round - 1}"` : null
      // The Fable thread that becomes the director is the one start allowed to name a directed round before the director exists.
      const directorStart = /fable/i.test(model ?? '') && round > FREE_ROUNDS && round <= DIRECTED_ROUNDS && round === lastRound(l) + 1 && !l.director && !lastPass(l)
      if (why && !directorStart) out.push(why)
    }
  }
  const block = out.length ? `Gate check (.claude/skills/operator/gate.md, Rounds): ${out.join('; ')}. Do no work: send this reason to the coordinator (message_coordinator), then stop.` : ''
  // The picture rule never stops a thread: the brief names a hub, start screen, main menu or art/visual style without the line, so the thread decides which it is.
  const note = namesLook(brief) && !pictureOk(brief) ? `Picture check (gate.md, Picture card first): this brief names a hub, start screen, main menu or art/visual style without ${PICTURE_ASK}. If it introduces a new one, do no work and tell the coordinator (message_coordinator); if it works on an existing one, go on and say so in your first reply.` : ''
  return [block, note].filter(Boolean).join('\n')
}

// ---- proofs the hook reads from the session's transcript
const cmsg = /#?(cmsg_\w+)/
export function cardProof(ref, calls) {
  const id = String(ref).match(cmsg)?.[1]
  return !!id && calls.some((c) => /request_decision|post_widget/.test(c.name) && c.result.includes(id))
}

function verdictProblem(dir, asset, head, dry) {
  const l = readLedger(dir, asset)
  const round = head.round ?? lastRound(l) + 1
  const bad = roundProblem(l, round)
  if (bad) return `gate round counter: ${bad}`
  const same = l.rounds.find((r) => r.n === round)
  if (same && same.score !== head.score) return `gate round counter: round ${round} of ${asset} is already in the ledger with score ${same.score ?? 'none'}; a round is scored once (gate.md, Rounds). The next verdict is round ${round + 1}.`
  if (!dry) writeLedger(dir, recordRound(l, { ...head, round }))
  return null
}
// ---- Bash, decided by command position (Fable director, gate round 4: regexes over the raw string cannot tell a command from quoted
// text, and each fix moved the line). One small tokenizer gives argv lists; text inside quotes, a commit message or an echo is data.
const base = (p) => String(p).split(/[\\/]/).pop().replace(/\.exe$/i, '')
const WRAPPERS = new Set(['env', 'command', 'sudo', 'time', 'nohup', 'exec', 'builtin'])
const WRITERS = new Set(['rm', 'unlink', 'shred', 'mv', 'tee', 'truncate', 'dd', 'ln', 'install', 'touch', 'chmod', 'chown', 'rsync', 'cp', 'curl', 'wget', 'patch', 'split', 'unzip', 'set-content', 'add-content', 'out-file', 'remove-item', 'new-item', 'copy-item', 'move-item', 'del', 'ri'])
const SHELLS = new Set(['bash', 'sh', 'zsh', 'dash'])

export function parseShell(text, depth = 0) {
  const cmds = []
  let bad = false, argv = [], redirs = [], word = '', has = false, mode = null // mode: the next word is a redirect target ('redir') or noise ('drop')
  const pending = [] // heredoc delimiters waiting for the next newline
  let own = null // the heredoc body of the command being read, filled in by reference when the newline comes
  let herestr = null // <<< word: input of the command, read as code when a shell runs it
  const flush = () => { if (has) { if (mode === 'redir') redirs.push(word); else if (mode === 'here') herestr = word; else if (mode === 'amp') { if (!/^\d*-?$/.test(word)) redirs.push(word) } else if (mode !== 'drop') argv.push(word); mode = null }; word = ''; has = false }
  const end = () => { flush(); if (argv.length || redirs.length) cmds.push({ argv, redirs, ...(herestr === null ? {} : { body: herestr }), ...(own ? { ref: own } : {}) }); own = null; argv = []; redirs = []; mode = null; herestr = null }
  const inner = (t) => { if (depth < 4 && t.trim()) { const r = parseShell(t, depth + 1); cmds.push(...r.cmds); bad ||= r.bad } }
  const close = (i) => { // the matching ) of a $( ): parens in a heredoc body do not count
    let d = 0, here = []
    for (let j = i; j < text.length; j++) {
      if (text[j] === '\n' && here.length) { for (const h of here.splice(0)) { for (;;) { const e = text.indexOf('\n', j + 1); const line = text.slice(j + 1, e < 0 ? text.length : e); j = e < 0 ? text.length : e; if (line.trim() === h || e < 0) break } } continue }
      const m = text[j] === '<' && text.slice(j).match(/^<<-?\s*(['"]?)([\w-]+)\1/)
      if (m && text[j - 1] !== '<') { here.push(m[2]); j += m[0].length - 1; continue }
      if (text[j] === '(') d++; else if (text[j] === ')' && --d === 0) return j
    }
    return -1
  }
  const tick = (i) => text.indexOf('`', i + 1)
  for (let i = 0; i < text.length; i++) {
    const c = text[i]
    if (c === "'") { const j = text.indexOf("'", i + 1); if (j < 0) { bad = true; break } word += text.slice(i + 1, j); has = true; i = j; continue }
    if (c === '"') {
      has = true
      let j = i + 1
      for (; j < text.length && text[j] !== '"'; j++) {
        if (text[j] === '\\') { word += text[j + 1] ?? ''; j++; continue }
        if (text[j] === '$' && text[j + 1] === '(') { const k = close(j + 1); if (k < 0) { bad = true; break } word += text.slice(j, k + 1); inner(text.slice(j + 2, k)); j = k; continue }
        if (text[j] === '`') { const k = tick(j); if (k < 0) { bad = true; break } word += text.slice(j, k + 1); inner(text.slice(j + 1, k)); j = k; continue }
        word += text[j]
      }
      if (bad || j >= text.length) { bad = true; break }
      i = j; continue
    }
    if (c === '$' && text[i + 1] === '{') { const k = text.indexOf('}', i); if (k > 0) { word += text.slice(i, k + 1); has = true; inner(text.slice(i + 2, k)); i = k; continue } }
    if (c === '\\' && text[i + 1] === '\n') { i++; continue }
    if (c === '\\') { word += text[i + 1] ?? ''; has = true; i++; continue }
    if (c === '$' && text[i + 1] === '(') { const k = close(i + 1); if (k < 0) { bad = true; break } word += text.slice(i, k + 1); has = true; inner(text.slice(i + 2, k)); i = k; continue }
    if (c === '`') { const k = tick(i); if (k < 0) { bad = true; break } word += text.slice(i, k + 1); has = true; inner(text.slice(i + 1, k)); i = k; continue }
    if (c === '#' && !has) { while (i < text.length && text[i] !== '\n') i++; i--; continue }
    if (c === '\n') {
      end()
      for (const { d, own: o } of pending.splice(0)) { // a heredoc body is data: skip to its delimiter line
        let j = i + 1, body = ''
        while (j < text.length) { const e = text.indexOf('\n', j); const line = text.slice(j, e < 0 ? text.length : e); j = e < 0 ? text.length : e + 1; if (line.trim() === d) break; body += `${line}\n` }
        o.body += body // read as code only when a shell runs it
        i = j - 1
      }
      continue
    }
    if (c === '<') {
      flush()
      if (text[i + 1] === '<' && text[i + 2] === '<') { mode = 'here'; i += 2; continue }
      if (text[i + 1] === '<') {
        let j = i + 2
        if (text[j] === '-') j++
        while (text[j] === ' ') j++
        let d = ''
        for (; j < text.length && !/[\s;|&<>)]/.test(text[j]); j++) if (!"'\"\\".includes(text[j])) d += text[j]
        if (d) { own ??= { body: '' }; pending.push({ d, own }) }
        i = j - 1; continue
      }
      mode = 'drop'; continue
    }
    if (c === '>') {
      if (has && /^\d+$/.test(word)) { word = ''; has = false } else flush()
      if (text[i + 1] === '>') i++
      if (text[i + 1] === '&') { mode = 'amp'; i++ } else { if (text[i + 1] === '|') i++; mode = 'redir' }
      continue
    }
    if (c === '&' && text[i + 1] === '>') continue
    if ((c === '{' || c === '}') && has) { word += c; continue } // gh api repos/{owner}/{repo}: a brace inside a word is the word
    if (';|&(){}'.includes(c)) { if (c === '&' || c === '|') { while (text[i + 1] === c) i++ } end(); continue }
    if (/\s/.test(c)) { flush(); continue }
    word += c; has = true
  }
  end()
  return { cmds, bad }
}

const KEYWORDS = new Set(['if', 'then', 'else', 'elif', 'do', 'while', 'until', '!'])
const LONG_VALUE = new Set(['--signal', '--kill-after', '--user', '--group', '--host', '--prompt', '--chdir', '--close-from', '--role', '--type', '--unset', '--other-user', '--login-class'])
// getopt: in a short cluster the first value-taking letter ends it; the value is the rest of the word, or the next word when nothing follows
const needsValue = (f, opts) => { if (!/^-[A-Za-z]/.test(f)) return false; for (let k = 1; k < f.length; k++) if (opts.includes(f[k])) return k === f.length - 1; return false }
const WRAP_VALUE = { sudo: 'ugCDRThprtU', env: 'uCS' } // one-letter options of a wrapper that take a value
const SETUP_VAR = /^(?:CLAUDE_SETUP_[A-Z_]+|HOME|USERPROFILE)=/ // HOME moves the CLI's default ledger dir just like the CLAUDE_SETUP_* ones
function simple(c) {
  let a = [...c.argv], env = false
  for (;;) {
    while (a.length && /^[A-Za-z_]\w*=/.test(a[0])) { env ||= SETUP_VAR.test(a[0]); a.shift() }
    const w = a.length ? base(a[0]) : ''
    if (KEYWORDS.has(w)) { a.shift(); continue }
    if (WRAPPERS.has(w)) { a.shift(); while (a.length && (a[0].startsWith('-') || /^[A-Za-z_]\w*=/.test(a[0]))) { env ||= SETUP_VAR.test(a[0]); const f = a.shift(); if (needsValue(f, WRAP_VALUE[w] ?? '') || LONG_VALUE.has(f)) a.shift() } continue }
    if (w === 'timeout' || w === 'nice') { // own flags (some take a value), timeout also its duration
      a.shift()
      while (a.length && a[0].startsWith('-')) { const v = /^-[ksn]$/.test(a[0]) || LONG_VALUE.has(a[0]) || a[0] === '--adjustment'; a.shift(); if (v) a.shift() }
      if (w === 'timeout') a.shift()
      continue
    }
    break
  }
  if (a.length && ['export', 'declare', 'typeset'].includes(base(a[0]))) env ||= a.some((x) => SETUP_VAR.test(x))
  return { a0: a.length ? base(a[0]) : '', args: a.slice(1), redirs: c.redirs, env, body: c.body ?? c.ref?.body }
}
// Every simple command of the text, also what sits in $( ), backticks and bash -c '...'.
export function simpleCommands(text, depth = 0) {
  const { cmds, bad: unread } = parseShell(text)
  const list = []
  let bad = unread
  for (const c of cmds) {
    const s = simple(c)
    list.push(s)
    const i = s.args.findIndex((a) => /^-[a-zA-Z]*c$/.test(a))
    if (SHELLS.has(s.a0) && s.body && i < 0 && depth < 3) { const r = simpleCommands(s.body, depth + 1); list.push(...r.list); bad ||= r.bad }
    if (s.a0 === 'eval' && depth < 3) { const r = simpleCommands(s.args.join(' '), depth + 1); list.push(...r.list); bad ||= r.bad }
    if (SHELLS.has(s.a0) && i >= 0 && s.args[i + 1] !== undefined && depth < 3) { const r = simpleCommands(s.args[i + 1], depth + 1); list.push(...r.list); bad ||= r.bad }
  }
  return { list, bad }
}

const GUARD_FILE = /\.claude[\\/]claude-setup[\\/](?:rule-guard|team-guard|gate-rounds|task-ledger|card-render)\.mjs$/
const CLI_VERBS = ['status', 'check', 'init', 'direct', 'card', 'picture', 'waive', 'merge', 'post', 'record']
const MERGE_DOOR = /pulls\/[^\s/]*\/merge|mergePullRequest|enablePullRequestAutoMerge/

// gh decided by command position only: a merge goes through the counter. Comments are never read here: a verdict posted through plain gh
// is not counted, so it can never lead to a merge (the comment tool or `post` counts it).
function ghProblem(s) {
  const w = [] // the subcommand words: flags and the value of -R/--repo dropped
  for (let j = 0; j < s.args.length; j++) { const x = s.args[j]; if (/^(-R|--repo)$/.test(x)) j++; else if (!x.startsWith('-')) w.push(x) }
  const merge = (w[0] === 'pr' && w[1] === 'merge') || (w[0] === 'api' && s.args.some((a) => MERGE_DOOR.test(a)))
  return merge ? 'gate ledger: a merge goes through the counter (gate.md, Rounds): the merge tool mcp__github__merge_pull_request, or "node ~/.claude/claude-setup/gate-rounds.mjs merge <owner/repo#n> [--squash|--merge|--rebase] [--auto] [--delete-branch]". It refuses a PR without a counted pass.' : null
}

// The literal ledger or guard path only: a word that holds the ledger dir (or .claude/claude-setup/gate, project-files/gate) or an installed
// guard file, as a redirect target or an argument of a writer. Shell tricks around it are a named Limit (gate.md, Rounds).
// The session stamps the guards write in the temp dir: the role (who may post a verdict, hands-off) and the brief lock.
const STAMP = /claude-setup-(?:role|spawnrole|badbrief|model|brief|artifacts)-/
// The session transcripts (M53): every origin proof reads them, so a thread never writes one by hand.
const TRANSCRIPT = /\.claude[\\/]projects[\\/](?:.*[\\/])?[^\\/]*\.jsonl$/
// A path compared lexically (security review 2026-11-12, round 2, finding 1): .., ./ and // collapse and backslashes read as slashes, so
// <dir>/x/../ledger.json is the ledger. A NAME= prefix of a word is kept.
const lexical = (p) => posix.normalize(String(p).replace(/\\/g, '/'))
const lexicalWord = (w) => { const m = String(w).match(/^([-\w]*=)?([\s\S]*)$/); return `${m[1] ?? ''}${lexical(m[2])}` }
// What may name the counter file without being the counter (finding 3): plain reads only. find, awk and sed (as a script) can run code or write
// a copy, so they are out; git and sed stay for the checkout's own work, but only in their safe forms below, and no read writes through a redirect.
const READ_ONLY = new Set(['cat', 'grep', 'rg', 'ls', 'head', 'tail', 'wc', 'diff', 'stat', 'file', 'less', 'echo', 'printf', 'test', 'cd'])
const EXEC_ARG = /^(?:-exec(?:dir)?|-ok(?:dir)?|-delete|-fprint\w*|--in-place\S*|--pre(?:-glob)?(?:=.*)?|--output(?:=.*)?|--ext-diff|--textconv|--(?:log|LOG)-file(?:=.*)?|--compile|--open-files-in-pager(?:=.*)?|-O\S*)$/
const GIT_SAFE = new Set(['add', 'commit', 'diff', 'log', 'show', 'status', 'blame', 'ls-files', 'rev-parse', 'checkout', 'restore', 'grep']) // the subcommand must be the first word: no -c, no -C
const SED_FLAGS = /^-(?:[nEr]+i?|i)$/ // no -e, -f, --expression or a backup suffix: the script is the first plain word
const SED_SCRIPT = /^(?:\d+(?:,(?:\d+|\$))?p|s(.)(?:(?!\1)[^\\]|\\.)*\1(?:(?!\1)[^\\]|\\.)*\1[gIpimM0-9]*)$/ // Np, N,Mp or a plain s///flags: no w, e or r command
function readsOnly(s) {
  const c = base(s.a0).toLowerCase()
  if (s.redirs.some((r) => r !== '/dev/null') || s.args.some((a) => EXEC_ARG.test(a))) return false
  if (c === 'git') return GIT_SAFE.has(s.args[0])
  if (c === 'sed') { const plain = s.args.filter((a) => !a.startsWith('-') || a === '-'); return s.args.filter((a) => a.startsWith('-')).every((a) => SED_FLAGS.test(a)) && SED_SCRIPT.test(plain[0] ?? '') }
  if (c === 'less') return !s.args.some((a) => /^-[a-zA-Z]*[oO]/.test(a))
  if (c === 'file') return !s.args.some((a) => /^-[a-zA-Z]*C/.test(a))
  return READ_ONLY.has(c)
}
// `node <script>` whose first non-flag argument is gate-rounds.mjs, with no flag that runs other code first.
const isCounterCall = (s) => s.a0 === 'node' && !s.args.some((a) => /^(-e|-p|--eval|--print|--import|-r|--require|--input-type|--loader|--experimental-loader)/.test(a)) && base(s.args.find((a) => !a.startsWith('-')) ?? '') === 'gate-rounds.mjs'
function bashProblem(cmd, dir, ctx) {
  const { list, bad } = simpleCommands(cmd)
  if (bad && /\bgh\b|gate/.test(cmd)) return 'gate ledger: this command has unbalanced quotes and mentions gh or gate, so it cannot be read; write it plainly (gate.md, Rounds).'
  // Only the ledger itself is protected: the dir, a file directly in it and grants/. Files below gate/<asset>/ (images, PLAN-REVIEW.md) are free (transition rule 6).
  const dirRe = dir ? new RegExp(`^(?:[-\\w]*=)?${lexical(dir).replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/\/+$/, '')}(?:/(?:grants(?:/.*)?|[^/]*))?$`) : null
  // each word is tested as typed and with its .., ./ and // collapsed (finding 1): <dir>/x/../ledger.json names the ledger
  const named = (w) => !/\s/.test(w) && [w, lexicalWord(w)].some((x) => STAMP.test(x) || dirRe?.test(x) || /^(?:[-\w]*=)?(?:.*\/)?(?:project-files|\.claude\/claude-setup)\/gate(?:\/(?:grants(?:\/.*)?|[^/]*))?$/.test(x) || GUARD_FILE.test(x) || TRANSCRIPT.test(x))
  const msg = 'gate ledger: the round counter is written only by gate-rounds.mjs (gate.md, Rounds), never by hand; the installed guards change only through a claude-setup PR, and a session transcript (~/.claude/projects/**/*.jsonl) is never written by hand (M53).'
  if (list.some((s) => s.env) && list.some((s) => s.a0 === 'node' && s.args.some((a) => base(a) === 'gate-rounds.mjs'))) return 'gate ledger: CLAUDE_SETUP_* variables (the ledger dir, the guard switch) are not set in a call that runs the counter; they would point it at another ledger (gate.md, Rounds).'
  // Finding 1: the counter is run as `node <path>/gate-rounds.mjs <verb>` and nothing else. Any other command that names the file and is
  // not a plain read (a copy, node -e, an import, a symlink) is refused, so the proofs cannot be walked around by renaming the script.
  if (/gate-rounds\.mjs/.test(cmd) && !list.every((s) => isCounterCall(s) || readsOnly(s))) return 'gate ledger: gate-rounds.mjs is run only as "node ~/.claude/claude-setup/gate-rounds.mjs <verb> <asset> ..." (gate.md, Rounds); copying it, importing it or running it through node -e is refused, because the proofs live in this hook and in the CLI.'
  for (const s of list) {
    if (s.a0 === 'gh') { const r = ghProblem(s); if (r) return r }
    if (s.redirs.some((r) => !/\s/.test(r) && (named(r) || GUARD_FILE.test(r)))) return msg
    const script = s.a0 === 'node' ? s.args.find((a) => base(a) === 'gate-rounds.mjs') ?? s.args.find((a) => !a.startsWith('-')) : null
    if (script && base(script) === 'gate-rounds.mjs') {
      const at = s.args.indexOf(script)
      const verb = s.args[at + 1]
      if (!CLI_VERBS.includes(verb) || ['status', 'check'].includes(verb)) continue
      // Round 2, finding 4 of the review: only the installed copy is the counter. A file of that name in a checkout or /tmp can be edited, and merge needs no grant.
      if (!GUARD_FILE.test(script)) return `gate ledger: "${verb}" runs only from the installed copy, "node ~/.claude/claude-setup/gate-rounds.mjs ${verb} ..."; a file of that name anywhere else is not the counter (gate.md, Rounds).`
      if (verb === 'merge') { const why = mergeProblem(readLedger(dir, s.args[at + 2])); if (why) return why } // the hook checks the pass itself, not only the CLI
      if (list.length !== 1 || /\$\(|`/.test(cmd)) return `gate ledger: "${verb}" runs as the only command of the call, without substitution, so its proof can be read (gate.md, Rounds).`
      const ref = s.args[s.args.indexOf('--ref') + 1]
      if (verb === 'init' && !(Number(s.args[s.args.indexOf('--round') + 1]) >= 1)) return 'gate ledger: init imports the rounds that already ran: --round <n> with n of 1 or more (gate.md, Rounds).'
      if (verb === 'direct' && !/fable/i.test(ctx.model ?? '')) return `gate ledger: only a Fable session records the director, this one runs on ${ctx.model ?? 'an unknown model'}. Ask the coordinator for a Fable thread (docs/TEAMS.md, Models line).`
      if (['card', 'picture', 'waive'].includes(verb) && !(ref && cardProof(ref, ctx.calls ?? []))) return `gate ledger: "${verb}" needs --ref <cmsg id> of a request_decision card this session posted (it was not found in this session).`
      if (verb === 'waive' && !(ctx.humanAfter?.(ref))) return 'gate ledger: waive needs yskills\' tap on the FIRST option of that card in this session (the card lists the option that frees the gate first); none arrived yet, or he tapped another option.'
      if (verb === 'record' && namedProblem(s.args[at + 2])) return namedProblem(s.args[at + 2])
      let body = null // the content this check read: a record grant carries its digest (finding 2)
      if (verb === 'post' || verb === 'record') {
        body = read(grantKey(s.args[s.args.indexOf('--body-file') + 1] ?? ''))
        const why = authorProblem(body, ctx)
        if (why) return why
      }
      if (!ctx.dry && GRANTED.includes(verb)) issueGrant(dir, verb, s.args[at + 2], grantRef(verb, s.args, ref), Date.now(), verb === 'record' ? body : null)
      continue
    }
    const writes = WRITERS.has(s.a0.toLowerCase()) || (s.a0 === 'sort' && s.args.some((x) => /^-[a-zA-Z]*o|^--output/.test(x))) || (s.a0 === 'perl' && s.args.some((x) => /^-[a-zA-Z]*i/.test(x))) || (s.a0 === 'sed' && s.args.some((x) => /^-[a-zA-Z]*i|^--in-place/.test(x)))
    const toCp = /^(cp|copy-item|rsync)$/i.test(s.a0) && !s.args.some((x) => /^-[a-zA-Z]*t|^--t/.test(x)) // only the destination is written
    if (writes && (toCp ? s.args.slice(-1) : s.args).some(named)) return msg
  }
  return null
}

const POSTS = /^mcp__github__(add_issue_comment|pull_request_review_write|update_pull_request|add_reply_to_pull_request_comment|add_comment_to_pending_review)$/
const MERGES = /^mcp__github__(merge_pull_request|enable_pr_auto_merge)$/
const assetOf = (input) => {
  const pr = Number(input.pullNumber ?? input.issue_number ?? input.pull_number)
  return input.owner && input.repo && Number.isInteger(pr) && pr > 0 ? `${String(input.owner).toLowerCase()}/${String(input.repo).toLowerCase()}#${pr}` : null
}

// PreToolUse. ctx: { dir, model, calls (the session's tool calls), humanAfter(ref), dry }. Returns a reason or null. dry: check only; the
// hook runs it first and commits (dry false) only when no other guard refused, so a refused post is never counted.
// A Write or Edit target that is the ledger: a file directly in the ledger dir (or the project-files/gate folder) or under grants/.
// The path is read lexically first (finding 1): <dir>/x/../ledger.json, <dir>/./l.json and <dir>//l.json are the ledger, not a file below x/.
const ledgerFile = (file, dir) => {
  const f = lexical(file)
  return [dir, '/mnt/project-files/gate'].some((d) => {
    const root = `${lexical(d).replace(/\/+$/, '')}/`
    const rel = f.startsWith(root) ? f.slice(root.length) : f.includes('project-files/gate/') ? f.split('project-files/gate/').pop() : null
    return rel !== null && (!rel.includes('/') || rel.startsWith('grants/'))
  })
}
export function gateStep(tool, input = {}, ctx = {}) {
  const dir = ctx.dir ?? ledgerDir()
  const file = String(input.file_path ?? '')
  if (/^(Write|Edit|MultiEdit|NotebookEdit)$/.test(tool) && STAMP.test(file)) return 'gate ledger: the role stamp and the brief lock of a session are written only by the hooks (security review 2026-11-12), never by hand.'
  const target = file || String(input.notebook_path ?? '')
  if (/^(Write|Edit|MultiEdit|NotebookEdit)$/.test(tool) && TRANSCRIPT.test(lexical(target))) return 'gate ledger: a session transcript (~/.claude/projects/**/*.jsonl) is never written by hand: the origin proofs of the role lock, waive and approve read it (M53, plan section 7).'
  if (/^(Write|Edit|MultiEdit|NotebookEdit)$/.test(tool) && ledgerFile(file, dir)) return 'gate ledger: the round counter is written only by gate-rounds.mjs (gate.md, Rounds), never by hand; a verdict the hook missed is counted by its gate role with "gate-rounds.mjs record <name> --body-file <f>" (a PR: "gate-rounds.mjs post <owner/repo#n> --body-file <f>").'
  if (/^(Write|Edit|MultiEdit|NotebookEdit)$/.test(tool) && /\.claude[\\/]claude-setup[\\/](gate-rounds|task-ledger|card-render|rule-guard|team-guard)\.mjs$/.test(file)) return 'gate ledger: the installed guards are changed only through claude-setup (a PR), never in place.'
  if (tool === 'Bash' || tool === 'PowerShell') return bashProblem(String(input.command ?? ''), dir, ctx)
  if (tool === 'mcp__github__create_pull_request') {
    const text = `${input.title ?? ''}\n${input.body ?? ''}`
    return namesLook(text) && !pictureOk(text) ? `gate check: this PR names a hub, start screen, main menu or art/visual style but its body has no ${PICTURE_ASK}. A new one is shown to yskills as pictures with references from current games BEFORE the build; for work on an existing one write the "none, because" line.` : null
  }
  const asset = assetOf(input)
  if (!asset) return null
  if (MERGES.test(tool)) return mergeProblem(readLedger(dir, asset))
  if (!POSTS.test(tool)) return null
  const text = input.body ?? input.comment ?? ''
  const head = parseHeadline(text)
  if (!head) return null
  return authorProblem(text, ctx) ?? verdictProblem(dir, asset, head, ctx.dry)
}

// ---- CLI
const USAGE = `usage: gate-rounds.mjs <cmd> <asset> [...]   asset = owner/repo#pr or a name
  status                      print the ledger
  check <round>               exit 2 with the reason if that round may not run
  init --round <n>            import the rounds that ran before the ledger existed (once)
  direct --plan <file>        record the Fable director (the hook allows it only from a Fable session)
  card --ref <cmsg id>        record the card to yskills (the hook checks this session posted it)
  picture --ref <cmsg id>     record the picture card for a new hub, start screen or style
  waive --ref <cmsg id>       yskills answered the card: a below-threshold version may merge
  merge [--squash|--merge|--rebase] [--auto] [--delete-branch]   merge owner/repo#n if its last round passed (runs gh)
  post --body-file <f>        count the verdict headline at the top of <f>, then post it with gh
  record --body-file <f>      count the verdict headline at the top of <f> for a named asset (no PR, no gh): a video, an image set`
const flag = (args, name) => { const i = args.indexOf(name); return i < 0 ? null : args[i + 1] }

export function cli(argv, env = process.env) {
  const [cmd, asset, ...rest] = argv
  if (!cmd || !asset) return { code: 1, text: USAGE }
  const dir = ledgerDir(env)
  let l
  try { l = readLedger(dir, asset) } catch (e) { return { code: 2, text: `the ledger of ${asset} is unreadable (${e.message}); not reset, ask the coordinator` } }
  const save = (n) => { writeLedger(dir, n); return { code: 0, text: JSON.stringify(n) } }
  const fail = (t) => ({ code: 2, text: t })
  if (cmd === 'status') return { code: 0, text: JSON.stringify(l, null, 2) }
  if (cmd === 'check') return roundProblem(l, Number(rest[0])) ? fail(roundProblem(l, Number(rest[0]))) : { code: 0, text: 'ok' }
  const bodyText = cmd === 'record' ? read(flag(rest, '--body-file') ?? '') : null // read once: this text is hashed for the grant and then counted
  if (GRANTED.includes(cmd)) {
    const key = cmd === 'init' ? flag(rest, '--round') : cmd === 'direct' ? flag(rest, '--plan') : cmd === 'record' ? flag(rest, '--body-file') : flag(rest, '--ref')
    if (!takeGrant(dir, cmd, asset, key, Date.now(), bodyText)) return fail(`${cmd}: refused: the hook (global/rule-guard.mjs) checks the proof for this verb and leaves a short grant; none was found for this call (a record body that changed after the hook read it counts as none). Run it as "node ~/.claude/claude-setup/gate-rounds.mjs ${cmd} <asset> ..." in a session where the hook is on (gate.md, Rounds).`)
  }
  if (cmd === 'init') {
    const n = Number(flag(rest, '--round'))
    if (l.rounds.length || !(n >= 1)) return fail('init: only for an asset without a ledger, with --round <n> (1 or more: the rounds that already ran)')
    return save({ ...l, rounds: Array.from({ length: n }, (_, i) => ({ n: i + 1, score: null, pass: false, at: 'imported' })) })
  }
  if (cmd === 'direct') {
    const plan = flag(rest, '--plan')
    if (lastRound(l) < FREE_ROUNDS) return fail(`direct: a director comes after round ${FREE_ROUNDS}, the ledger stands at ${lastRound(l)}`)
    if (!plan || read(plan).trim().length < 200) return fail('direct: --plan <file> with the Fable plan (goal, constraints, what changes, done-test) is required')
    return save({ ...l, director: { model: DIRECTOR, plan, round: lastRound(l), at: new Date().toISOString() } })
  }
  if (cmd === 'record') {
    if (namedProblem(asset)) return fail(namedProblem(asset))
    const file = flag(rest, '--body-file')
    const head = file ? parseHeadline(bodyText) : null
    if (!head) return fail('record: --body-file <f> must start with the verdict headline "Gate <score>/5 (<size>, round <n>)"')
    const bad = verdictProblem(dir, asset, head, false)
    return bad ? fail(bad) : { code: 0, text: `recorded: ${asset} stands at round ${lastRound(readLedger(dir, asset))}` }
  }
  if (cmd === 'merge' || cmd === 'post') {
    const m = String(asset).match(/^([\w.-]+\/[\w.-]+)#(\d+)$/)
    if (!m) return fail(`${cmd}: the asset must be owner/repo#n`)
    try {
      if (cmd === 'merge') {
        const why = mergeProblem(l)
        if (why) return fail(why)
        const kinds = ['--squash', '--merge', '--rebase']
        const flags = rest
        if (flags.some((f) => ![...kinds, '--auto', '--delete-branch'].includes(f)) || flags.filter((f) => kinds.includes(f)).length > 1) return fail('merge: only one of --squash --merge --rebase, plus --auto and --delete-branch')
        execFileSync('gh', ['pr', 'merge', m[2], '-R', m[1], ...(flags.some((f) => kinds.includes(f)) ? [] : ['--squash']), ...flags], { stdio: 'inherit', env })
        return { code: 0, text: flags.includes('--auto') ? 'auto-merge enabled' : 'merged' }
      }
      const file = flag(rest, '--body-file')
      const head = file ? parseHeadline(read(file)) : null
      if (!head) return fail('post: --body-file <f> must start with the verdict headline "Gate <score>/5 (<size>, round <n>)"')
      const bad = verdictProblem(dir, asset, head, true)
      if (bad) return fail(bad)
      execFileSync('gh', ['pr', 'comment', m[2], '-R', m[1], '--body-file', file], { stdio: 'inherit', env })
      verdictProblem(dir, asset, head, false) // counted only once it is on the PR
      return { code: 0, text: 'posted' }
    } catch (e) { return fail(`${cmd}: gh failed (${String(e.message).slice(0, 120)})`) }
  }
  const ref = flag(rest, '--ref')
  if (!ref || !cmsg.test(ref)) return fail(`${cmd}: --ref <cmsg id> is required`)
  const at = new Date().toISOString()
  if ([l.card?.ref, l.picture?.ref].includes(ref) && cmd !== 'waive') return fail(`${cmd}: ${ref} is already recorded as another card of this asset; one card, one purpose`)
  if (cmd === 'card') return save({ ...l, card: { ref, round: lastRound(l), at } })
  if (cmd === 'picture') return save({ ...l, picture: { ref, at } })
  if (cmd === 'waive' && ref !== l.card?.ref) return fail('waive: --ref must be the card recorded with `card` for this asset (yskills answered that one)')
  if (cmd === 'waive') return save({ ...l, waived: { ref, at } })
  return { code: 1, text: USAGE }
}

if (process.argv[1] && import.meta.url.endsWith(process.argv[1].replace(/\\/g, '/').split('/').pop())) {
  const { code, text } = cli(process.argv.slice(2))
  ;(code ? process.stderr : process.stdout).write(`${text}\n`)
  process.exitCode = code
}
