#!/usr/bin/env node
// Hard gate round counter (yskills 2026-11-12, vacation-game: a PR ran 11 gate rounds instead of 6, nothing counted, the
// coordinator released rounds itself, a gate asked to merge at 4.2). The one home of the rule is operator/gate.md (Rounds).
// The counter is a ledger file per asset (a PR or any named asset) in the project's shared folder, so a fresh thread goes on
// from it. rule-guard calls gateStep (PreToolUse) and gateBrief (UserPromptSubmit); this file is also the CLI threads use.
//   rounds 1-3: judged at 4.5 (4.8 when important)   rounds 4-6: only with a Fable director   round 7+: only with a card to yskills
// CLI: gate-rounds.mjs status|check|init|direct|card|picture|waive <asset> ...   (usage text below)
// Fail closed: a gate-shaped call whose check throws is refused. CLAUDE_SETUP_RULE_GUARD=off turns the hook (not the CLI) off.
import { existsSync, mkdirSync, readdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
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
const fileOf = (dir, asset) => join(dir, `${String(asset).toLowerCase().replace(/[^\w.-]+/g, '_')}.json`) // one key for the CLI, the brief check and the hook
const blank = (asset) => ({ asset, rounds: [], important: false, passed: false, director: null, card: null, picture: null, waived: null })

// A missing file is a new asset; a file that exists but does not parse throws (never a silent reset of the counter).
export function readLedger(dir, asset) {
  const f = fileOf(dir, asset)
  if (!existsSync(f)) return blank(asset)
  return { ...blank(asset), ...JSON.parse(readFileSync(f, 'utf8')) }
}
const ledgersOfPr = (dir, n) => { try { return readdirSync(dir).filter((f) => f.endsWith(`_${n}.json`)).map((f) => JSON.parse(readFileSync(join(dir, f), 'utf8'))) } catch (e) { if (e.code === 'ENOENT') return []; throw e } }
export function writeLedger(dir, ledger) {
  mkdirSync(dir, { recursive: true })
  const f = fileOf(dir, ledger.asset)
  writeFileSync(`${f}.${process.pid}.tmp`, `${JSON.stringify(ledger, null, 2)}\n`)
  renameSync(`${f}.${process.pid}.tmp`, f)
}
export const lastRound = (l) => l.rounds.at(-1)?.n ?? 0

// "Gate 4.2/5 (L, round 3) [important]" or "Gate 5/5 (S, round 1)" or "Gate fail, round 2".
// Only a line that STARTS with "Gate <score>/5", "Gate fail" or "Gate pass" is a verdict; "the gate flagged ... round 1" is talk.
const HEADLINE = /^[\s>*_#-]*Gate\s+(?:(\d(?:[.,]\d+)?)\s*\/\s*5|fail(?:ed)?|pass(?:ed)?)\b[^\n]*?\b(?:round|runde)\s+(\d+)/i
export function parseHeadline(text) {
  const m = String(text).split('\n').map((l) => ({ l, m: l.match(HEADLINE) })).find((x) => x.m)
  if (!m) return null
  return { round: Number(m.m[2]), score: m.m[1] === undefined ? null : Number(m.m[1].replace(',', '.')), important: /\b(important|risky|wichtig)\b/i.test(m.l) }
}
const lastPass = (l) => !!l.rounds.at(-1)?.pass
const firstPass = (l) => l.rounds.find((r) => r.pass)?.n ?? null
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
  if (!l.rounds.length || lastPass(l) || l.waived) return null
  const r = l.rounds.at(-1)
  return `${l.asset}: the last gate round (${r.n}) scored ${r.score ?? 'no score'}, under ${threshold(l.important)}: no merge below the threshold, no exception. Fix it (next round ${r.n + 1}), or put ONE card to yskills; only his answer on it frees a merge (gate-rounds.mjs waive).`
}

// ---- picture card: a new hub, start screen or style is shown as pictures from current games before anything is built.
// Only a NEW one: "new hub", "neuer Startbildschirm", "redesign the main menu"; "fix: main menu button", "push to Docker Hub" and "keep the art style" pass.
const THING = '(?:hub|start ?screen|startbildschirm|title ?screen|titelbildschirm|main ?menu|hauptmen[üu]|art ?style|visual ?style|style|stil|look)'
const NEW_LOOK = new RegExp(`\\b(?:new|neu(?:e|er|es|en)?|redesign(?:ed)?|rebuild|invent(?:ed)?)\\s+(?:\\w+\\s+){0,2}${THING}\\b|\\bredesign\\s+(?:the\\s+)?${THING}\\b`, 'i')
export const needsPicture = (text) => NEW_LOOK.test(String(text).replace(/docker hub|github hub/gi, ''))
const PICTURE_LINE = /^[ \t>*_-]*Picture card:[ \t*_`]*(?:\[[^\]]*\]\()?(#?cmsg_\w+|https?:\/\/[^\s)]*cmsg_\w+[^\s)]*)/im
export const pictureRef = (text) => String(text).match(PICTURE_LINE)?.[1] ?? null // a real card id, not any URL

const num = (brief, key) => { const m = String(brief).replace(/[*_`]/g, '').match(new RegExp(`^[ \\t>-]*${key}:[ \\t]*([^\\n]*)`, 'im')); return m ? m[1].trim() : null }

// Thread side (UserPromptSubmit): the spawn brief's Round / Asset / Picture card lines against the ledger. '' = fine.
export function gateBrief(brief, { model = null, dir = ledgerDir() } = {}) {
  const roundText = num(brief, 'Round')
  const asset = num(brief, 'Asset')?.toLowerCase()
  const out = []
  if (roundText !== null || /\bgate round\b/i.test(brief)) {
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
  if (needsPicture(brief) && !pictureRef(brief)) out.push('a new hub, start screen or style needs a `Picture card: <link>` line: pictures with references from current games go to yskills as a card before anything is built (gate.md, Picture card first)')
  return out.length ? `Gate check (.claude/skills/operator/gate.md, Rounds): ${out.join('; ')}. Do no work: send this reason to the coordinator (message_coordinator), then stop.` : ''
}

// ---- proofs the hook reads from the session's transcript
const cmsg = /#?(cmsg_\w+)/
export function cardProof(ref, calls) {
  const id = String(ref).match(cmsg)?.[1]
  return !!id && calls.some((c) => /request_decision|post_widget/.test(c.name) && c.result.includes(id))
}

const POSTS = /^mcp__github__(add_issue_comment|pull_request_review_write|update_pull_request|add_reply_to_pull_request_comment|add_comment_to_pending_review)$/
const MERGES = /^mcp__github__(merge_pull_request|enable_pr_auto_merge)$/
const assetOf = (input) => {
  const pr = Number(input.pullNumber ?? input.issue_number ?? input.pull_number)
  return input.owner && input.repo && Number.isInteger(pr) && pr > 0 ? `${String(input.owner).toLowerCase()}/${String(input.repo).toLowerCase()}#${pr}` : null
}

// PreToolUse. ctx: { dir, model, calls (the session's tool calls), humanAfter(ref), dry }. Returns a reason or null. dry: check only; the
// hook runs it first and commits (dry false) only when no other guard refused, so a refused post is never counted.
export function gateStep(tool, input = {}, ctx = {}) {
  const dir = ctx.dir ?? ledgerDir()
  const file = String(input.file_path ?? '')
  if (/^(Write|Edit)$/.test(tool) && (file.includes('project-files/gate/') || (file.startsWith(`${dir}/`) && file.endsWith('.json')))) return 'gate ledger: the round counter is written only by gate-rounds.mjs (gate.md, Rounds), never by hand.'
  if (/^(Write|Edit|MultiEdit|NotebookEdit)$/.test(tool) && /\.claude[\\/]claude-setup[\\/](gate-rounds|rule-guard|team-guard)\.mjs$/.test(file)) return 'gate ledger: the installed guards are changed only through claude-setup (a PR), never in place.'
  if (tool === 'Bash' || tool === 'PowerShell') {
    const cmd = String(input.command ?? '')
    // gh pr merge goes through the same ledger as the merge tool.
    if (/\bgh\s+pr\s+merge\b/.test(cmd)) {
      const url = cmd.match(/github\.com\/([\w.-]+\/[\w.-]+)\/pull\/(\d+)/)
      const n = url?.[2] ?? cmd.match(/\bmerge\s+(?:-\S+(?:\s+(?![\d-])\S+)?\s+)*(\d+)/)?.[1]
      const repo = url?.[1] ?? cmd.match(/(?:-R|--repo)[ =]\s*(?:[\w.-]+\/)?([\w.-]+\/[\w.-]+)/)?.[1]
      if (!n) return 'gate ledger: "gh pr merge" needs the PR number in the command (a number, or the PR URL), so its ledger can be checked (gate.md, Rounds).'
      const ledgers = repo ? [readLedger(dir, `${repo.toLowerCase()}#${n}`)] : ledgersOfPr(dir, n)
      const why = ledgers.map(mergeProblem).find(Boolean)
      if (why) return why // no early success: the gate-file checks below still run
    }
    if (!/gate-rounds|project-files[\\/]gate|[\\/]claude-setup[\\/](?:gate\b|rule-guard|team-guard)/.test(cmd) && !cmd.includes(dir)) return null
    // One plain command in one known form: no pipes, chains, substitution, redirects, node -e or imports (a parser differential is a bypass).
    const plain = /^\s*node\s+[\w~./-]*gate-rounds\.mjs\s+(status|check|init|direct|card|picture|waive)\s+[\w./#-]+(?:\s+(?:--(?:plan|ref|round)\s+[\w./#:@-]+|[\w.]+))*\s*$/.exec(cmd)
    if (!plain) return 'gate ledger: run the round counter only as one plain command, "node ~/.claude/claude-setup/gate-rounds.mjs <status|check|init|direct|card|picture|waive> <asset> [--plan f|--ref id|--round n]", and never touch the gate files another way (gate.md, Rounds).'
    const verb = plain[1]
    const ref = cmd.match(/--ref\s+(\S+)/)?.[1]
    if (verb === 'direct' && !/fable/i.test(ctx.model ?? '')) return `gate ledger: only a Fable session records the director, this one runs on ${ctx.model ?? 'an unknown model'}. Ask the coordinator for a Fable thread (docs/TEAMS.md, Models line).`
    if (['card', 'picture', 'waive'].includes(verb) && !(ref && cardProof(ref, ctx.calls ?? []))) return `gate ledger: "${verb}" needs --ref <cmsg id> of a request_decision card this session posted (it was not found in this session).`
    if (verb === 'waive' && !(ctx.humanAfter?.(ref))) return 'gate ledger: waive needs yskills\' own answer on that card in this session; none arrived yet.'
    return null
  }
  if (tool === 'mcp__github__create_pull_request') {
    const text = `${input.title ?? ''}\n${input.body ?? ''}`
    return needsPicture(text) && !pictureRef(text) ? 'gate check: this PR introduces a hub, start screen or style but its body has no `Picture card: <link>` line. Pictures with references from current games go to yskills as a card BEFORE the build (gate.md, Picture card first).' : null
  }
  const asset = assetOf(input)
  if (!asset) return null
  if (MERGES.test(tool)) return mergeProblem(readLedger(dir, asset))
  if (!POSTS.test(tool)) return null
  const head = parseHeadline(input.body ?? input.comment ?? '')
  if (!head) return null
  const l = readLedger(dir, asset)
  const bad = roundProblem(l, head.round)
  if (bad) return `gate round counter: ${bad}`
  const same = l.rounds.find((r) => r.n === head.round)
  if (same && same.score !== head.score) return `gate round counter: round ${head.round} of ${asset} is already in the ledger with score ${same.score ?? 'none'}; a round is scored once (gate.md, Rounds). The next verdict is round ${head.round + 1}.`
  if (!ctx.dry) writeLedger(dir, recordRound(l, head))
  return null
}

// ---- CLI
const USAGE = `usage: gate-rounds.mjs <cmd> <asset> [...]   asset = owner/repo#pr or a name
  status                      print the ledger
  check <round>               exit 2 with the reason if that round may not run
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
  let l
  try { l = readLedger(dir, asset) } catch (e) { return { code: 2, text: `the ledger of ${asset} is unreadable (${e.message}); not reset, ask the coordinator` } }
  const save = (n) => { writeLedger(dir, n); return { code: 0, text: JSON.stringify(n) } }
  const fail = (t) => ({ code: 2, text: t })
  if (cmd === 'status') return { code: 0, text: JSON.stringify(l, null, 2) }
  if (cmd === 'check') return roundProblem(l, Number(rest[0])) ? fail(roundProblem(l, Number(rest[0]))) : { code: 0, text: 'ok' }
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
