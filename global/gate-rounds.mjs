#!/usr/bin/env node
// Hard gate round counter (yskills 2026-11-12, vacation-game: a PR ran 11 gate rounds instead of 6, nothing counted, the
// coordinator released rounds itself, a gate asked to merge at 4.2). The one home of the rule is operator/gate.md (Rounds).
// The counter is a ledger file per asset (a PR or any named asset) in the project's shared folder, so a fresh thread goes on
// from it. rule-guard calls gateStep (PreToolUse) and gateBrief (UserPromptSubmit); this file is also the CLI threads use.
//   rounds 1-3: judged at 4.5 (4.8 when important)   rounds 4-6: only with a Fable director   round 7+: only with a card to yskills
// CLI: gate-rounds.mjs status|check|record|init|direct|card|picture|waive <asset> ...   (usage text below)
// Fail closed: a gate-shaped call whose check throws is refused. CLAUDE_SETUP_RULE_GUARD=off turns the hook (not the CLI) off.
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'

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
const fileOf = (dir, asset) => join(dir, `${String(asset).replace(/[^\w.-]+/g, '_')}.json`)
const blank = (asset) => ({ asset, rounds: [], important: false, passed: false, director: null, card: null, picture: null, waived: null })

export function readLedger(dir, asset) {
  try { return { ...blank(asset), ...JSON.parse(readFileSync(fileOf(dir, asset), 'utf8')) } } catch { return blank(asset) }
}
export function writeLedger(dir, ledger) {
  mkdirSync(dir, { recursive: true })
  const f = fileOf(dir, ledger.asset)
  writeFileSync(`${f}.${process.pid}.tmp`, `${JSON.stringify(ledger, null, 2)}\n`)
  renameSync(`${f}.${process.pid}.tmp`, f)
}
export const lastRound = (l) => l.rounds.at(-1)?.n ?? 0

// "Gate 4.2/5 (L, round 3) [important]" or "Gate 5/5 (S, round 1)" or "Gate fail, round 2".
export function parseHeadline(text) {
  const line = String(text).split('\n').find((l) => /\bGate\b/i.test(l) && /\bround\s+\d+/i.test(l))
  if (!line) return null
  const score = line.match(/\bGate\s+(\d(?:[.,]\d+)?)\s*\/\s*5/i)?.[1]
  return { round: Number(line.match(/\bround\s+(\d+)/i)[1]), score: score === undefined ? null : Number(score.replace(',', '.')), important: /\b(important|risky|wichtig)\b/i.test(line) }
}

// null = the round may happen; else the reason. A round after a PASS needs nothing: a mergeable version exists.
export function roundProblem(l, round) {
  const last = lastRound(l)
  if (!Number.isInteger(round) || round < 1) return `round "${round}" is not a number`
  if (round > last + 1) return `round ${round} skips ahead: ${l.asset} stands at round ${last} in its ledger. Rounds count up by one per asset and never start over, a fresh thread goes on from the ledger (gate.md, Rounds).`
  if (round < last) return `round ${round} is behind the ledger (${l.asset} stands at round ${last}): the count belongs to the asset, never restarts (gate.md, Rounds).`
  if (l.passed || round <= FREE_ROUNDS) return null
  if (round <= DIRECTED_ROUNDS && !l.director) return `round ${round} of ${l.asset} needs a Fable director: rounds 1 to ${FREE_ROUNDS} are done without a pass. Ask the coordinator for a Fable thread; it runs "node ~/.claude/claude-setup/gate-rounds.mjs direct ${l.asset} --plan <file>" (only a Fable session can record it). Rounds 4 to 6 follow its plan (gate.md, Rounds).`
  if (round > DIRECTED_ROUNDS && !(l.card && round <= l.card.round + CARD_ROUNDS)) return `round ${round} of ${l.asset} needs a card to yskills: ${DIRECTED_ROUNDS} rounds ran without a pass. Post ONE request_decision (what it does, why it fails, 2-3 ideas, one recommended), then "node ~/.claude/claude-setup/gate-rounds.mjs card ${l.asset} --ref <the card's cmsg id>" (gate.md, Rounds).`
  return null
}

export function recordRound(l, { round, score, important }, at = new Date().toISOString()) {
  const imp = l.important || !!important
  const pass = score !== null && (score >= 5 || score >= threshold(imp))
  const rounds = [...l.rounds.filter((r) => r.n !== round), { n: round, score, pass, at }]
  return { ...l, important: imp, rounds, passed: l.passed || pass }
}

export function mergeProblem(l) {
  if (!l.rounds.length || l.passed || l.waived) return null
  const r = l.rounds.at(-1)
  return `${l.asset}: the last gate round (${r.n}) scored ${r.score ?? 'no score'}, under ${threshold(l.important)}: no merge below the threshold, no exception. Fix it (next round ${r.n + 1}), or put ONE card to yskills; only his answer on it frees a merge (gate-rounds.mjs waive).`
}

// ---- picture card: a new hub, start screen or style is shown as pictures from current games before anything is built.
const NEW_LOOK = /\b(hub|start ?screen|startbildschirm|title ?screen|titelbildschirm|main ?menu|hauptmen[üu]|art ?style|visual ?style|new (look|style)|neuer? (stil|look)|stil)\b/i
export const needsPicture = (text) => NEW_LOOK.test(String(text))
const PICTURE_LINE = /^[ \t>*_-]*Picture card:[ \t*_`]*(?:\[[^\]]*\]\()?(#?cmsg_\w+|https?:\/\/[^\s)]+)/im
export const pictureRef = (text) => String(text).match(PICTURE_LINE)?.[1] ?? null

const num = (brief, key) => { const m = String(brief).replace(/[*_`]/g, '').match(new RegExp(`^[ \\t>-]*${key}:[ \\t]*([^\\n]*)`, 'im')); return m ? m[1].trim() : null }

// Thread side (UserPromptSubmit): the spawn brief's Round / Asset / Picture card lines against the ledger. '' = fine.
export function gateBrief(brief, { model = null, dir = ledgerDir() } = {}) {
  const roundText = num(brief, 'Round')
  const asset = num(brief, 'Asset')
  const out = []
  if (roundText !== null || /\bgate round\b/i.test(brief)) {
    const round = Number(roundText?.match(/^\d+/)?.[0])
    if (!roundText || !round) out.push('a gate-round brief needs a `Round: <n>` line')
    else if (!asset) out.push('`Round:` needs an `Asset: <owner/repo#pr | name>` line, the count belongs to the asset')
    else {
      const l = readLedger(dir, asset)
      const why = l.rounds.length ? roundProblem(l, round) : round > 1 ? `${asset} has no ledger: import its history first with "gate-rounds.mjs init ${asset} --round ${round - 1}"` : null
      // The Fable thread that becomes the director is the one start allowed to name a directed round before the director exists.
      const directorStart = /fable/i.test(model ?? '') && round > FREE_ROUNDS && round <= DIRECTED_ROUNDS && round === lastRound(l) + 1 && !l.director && !l.passed
      if (why && !directorStart) out.push(why)
    }
  }
  if (needsPicture(brief) && !pictureRef(brief)) out.push('a new hub, start screen or style needs a `Picture card: <link>` line: pictures with references from current games go to yskills as a card before anything is built (gate.md, Picture card first)')
  return out.length ? `Gate check (.claude/skills/operator/gate.md, Rounds): ${out.join('; ')}. Do no work: send this reason to the coordinator (message_coordinator), then stop.` : ''
}

// ---- proofs the hook reads from the session's transcript
const cmsg = /#?(cmsg_\w+)/
export function cardProof(ref, calls) {
  const id = String(ref).match(cmsg)?.[1]
  return !!id && calls.some((c) => /request_decision|post_widget/.test(c.name) && c.result.includes(id))
}

// PreToolUse. ctx: { dir, model, calls (the session's tool calls), humanAfter(ref) }. Returns a reason or null; records a passing round.
export function gateStep(tool, input = {}, ctx = {}) {
  const dir = ctx.dir ?? ledgerDir()
  const asset = input.owner && input.repo ? `${input.owner}/${input.repo}#${input.pullNumber ?? input.issue_number ?? input.pull_number ?? ''}` : null
  if (/^(Write|Edit)$/.test(tool) && /[\\/]gate[\\/][^\\/]+\.json$/.test(String(input.file_path ?? ''))) return 'gate ledger: the round counter is written only by gate-rounds.mjs (gate.md, Rounds), never by hand.'
  if (tool === 'Bash') {
    const cmd = String(input.command ?? '')
    const cli = cmd.match(/gate-rounds\.mjs\s+(direct|card|picture|waive)\s+(\S+)(?:.*--ref\s+(\S+))?/)
    if (!cli && /gate[\\/][^\s'"]+\.json/.test(cmd) && !/gate-rounds\.mjs/.test(cmd) && /(>|\btee\b|\bsed\s+-i|\bmv\b|\bcp\b|\brm\b|node\s+-e|python)/.test(cmd)) return 'gate ledger: the round counter is written only by gate-rounds.mjs (gate.md, Rounds), never by hand.'
    if (!cli) return null
    const [, verb, , ref] = cli
    if (verb === 'direct' && !/fable/i.test(ctx.model ?? '')) return `gate ledger: only a Fable session records the director, this one runs on ${ctx.model ?? 'an unknown model'}. Ask the coordinator for a Fable thread (docs/TEAMS.md, Models line).`
    if (verb !== 'direct' && !(ref && cardProof(ref, ctx.calls ?? []))) return `gate ledger: "${verb}" needs --ref <cmsg id> of a request_decision card this session posted (it was not found in this session).`
    if (verb === 'waive' && !(ctx.humanAfter?.(ref))) return 'gate ledger: waive needs yskills\' own answer on that card in this session; none arrived yet.'
    return null
  }
  if (tool === 'mcp__github__create_pull_request') {
    const text = `${input.title ?? ''}\n${input.body ?? ''}`
    return needsPicture(text) && !pictureRef(text) ? 'gate check: this PR introduces a hub, start screen or style but its body has no `Picture card: <link>` line. Pictures with references from current games go to yskills as a card BEFORE the build (gate.md, Picture card first).' : null
  }
  if (!asset || asset.endsWith('#')) return null
  if (tool === 'mcp__github__merge_pull_request') return mergeProblem(readLedger(dir, asset))
  if (!/^mcp__github__(add_issue_comment|pull_request_review_write|update_pull_request)$/.test(tool)) return null
  const head = parseHeadline(input.body ?? '')
  if (!head) return null
  const l = readLedger(dir, asset)
  const bad = roundProblem(l, head.round)
  if (bad) return `gate round counter: ${bad}`
  writeLedger(dir, recordRound(l, head))
  return null
}

// ---- CLI
const USAGE = `usage: gate-rounds.mjs <cmd> <asset> [...]   asset = owner/repo#pr or a name
  status                      print the ledger
  check <round>               exit 2 with the reason if that round may not run
  record <round> <score> [--important]
  init --round <n>            import the rounds that ran before the ledger existed (once)
  direct --plan <file>        record the Fable director (the hook allows it only from a Fable session)
  card --ref <cmsg id>        record the card to yskills (the hook checks this session posted it)
  picture --ref <cmsg id>     record the picture card for a new hub, start screen or style
  waive --ref <cmsg id>       yskills answered the card: a below-threshold version may merge`
const flag = (args, name) => { const i = args.indexOf(name); return i < 0 ? null : args[i + 1] }

export function cli(argv, env = process.env) {
  const [cmd, asset, ...rest] = argv
  if (!cmd || !asset) return { code: 1, text: USAGE }
  const dir = ledgerDir(env)
  const l = readLedger(dir, asset)
  const save = (n) => { writeLedger(dir, n); return { code: 0, text: JSON.stringify(n) } }
  const fail = (t) => ({ code: 2, text: t })
  if (cmd === 'status') return { code: 0, text: JSON.stringify(l, null, 2) }
  if (cmd === 'check') return roundProblem(l, Number(rest[0])) ? fail(roundProblem(l, Number(rest[0]))) : { code: 0, text: 'ok' }
  if (cmd === 'record') {
    const bad = roundProblem(l, Number(rest[0]))
    return bad ? fail(bad) : save(recordRound(l, { round: Number(rest[0]), score: Number(rest[1]), important: rest.includes('--important') }))
  }
  if (cmd === 'init') {
    const n = Number(flag(rest, '--round'))
    if (l.rounds.length || !(n >= 0)) return fail('init: only for an asset without a ledger, with --round <n>')
    return save({ ...l, rounds: Array.from({ length: n }, (_, i) => ({ n: i + 1, score: null, pass: false, at: 'imported' })) })
  }
  if (cmd === 'direct') {
    const plan = flag(rest, '--plan')
    if (lastRound(l) < FREE_ROUNDS) return fail(`direct: a director comes after round ${FREE_ROUNDS}, the ledger stands at ${lastRound(l)}`)
    if (!plan || read(plan).trim().length < 200) return fail('direct: --plan <file> with the Fable plan (goal, constraints, what changes, done-test) is required')
    return save({ ...l, director: { model: DIRECTOR, plan, round: lastRound(l), at: new Date().toISOString() } })
  }
  const ref = flag(rest, '--ref')
  if (!ref || !cmsg.test(ref)) return fail(`${cmd}: --ref <cmsg id> is required`)
  const at = new Date().toISOString()
  if (cmd === 'card') return save({ ...l, card: { ref, round: Math.max(lastRound(l), DIRECTED_ROUNDS), at } })
  if (cmd === 'picture') return save({ ...l, picture: { ref, at } })
  if (cmd === 'waive') return save({ ...l, waived: { ref, at } })
  return { code: 1, text: USAGE }
}

if (process.argv[1] && import.meta.url.endsWith(process.argv[1].replace(/\\/g, '/').split('/').pop())) {
  const { code, text } = cli(process.argv.slice(2))
  ;(code ? process.stderr : process.stdout).write(`${text}\n`)
  process.exitCode = code
}
