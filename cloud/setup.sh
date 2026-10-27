#!/usr/bin/env bash
# Setup script for Claude cloud environments (project threads).
# cloud/bootstrap.sh (pasted once into Project settings > Cloud environment > Setup script) runs it. It installs the global
# plugins from config/plugins.json at user scope (minus those marked "cloud": false), so they load in every thread, whichever
# repo the thread runs in. scripts/check.mjs fails if this list drifts from config/plugins.json.
set -u

claude plugin marketplace add anthropics/claude-plugins-official || echo "claude-setup: marketplace anthropics/claude-plugins-official failed"
for id in \
  superpowers@claude-plugins-official \
  frontend-design@claude-plugins-official \
  security-guidance@claude-plugins-official \
  playwright@claude-plugins-official \
  commit-commands@claude-plugins-official
do
  claude plugin install "$id" --scope user || echo "claude-setup: could not install $id"
done
# Retired plugins (config/plugins.json "retired") load their skill listing into every session: remove
# them when an older copy of this script left them behind.
for id in code-review chrome-devtools-mcp code-simplifier feature-dev claude-md-management claude-code-setup; do
  claude plugin uninstall "$id@claude-plugins-official" --scope user >/dev/null 2>&1 || true
done

# Meant to give built-in subagents Sonnet instead of the parent's model; in a claude.ai project
# thread it did not (tested 2026-10-26), so the team guard below makes every Agent call name its
# `model`. Kept for plain sessions. Same key as global/settings.json.
node -e '
const fs = require("fs"), p = require("os").homedir() + "/.claude/settings.json"
let s = {}; if (fs.existsSync(p)) s = JSON.parse(fs.readFileSync(p, "utf8"))
s.env = { ...(s.env || {}), CLAUDE_CODE_SUBAGENT_MODEL: "sonnet" }
fs.mkdirSync(require("path").dirname(p), { recursive: true }); fs.writeFileSync(p, JSON.stringify(s, null, 2))
' || echo "claude-setup: could not set CLAUDE_CODE_SUBAGENT_MODEL"

# Context guard: the same file as global/context-guard.mjs (scripts/check.mjs keeps them equal),
# run after every tool call so long threads get told to work leaner and then to hand off.
mkdir -p "$HOME/.claude/claude-setup"
cat > "$HOME/.claude/claude-setup/context-guard.mjs" <<'GUARD'
#!/usr/bin/env node
// PostToolUse hook: every tool call re-sends the whole context, so a long session pays for its
// size again on each call (cache reads were 98% of our usage). At WARN tokens of absolute context,
// tell Claude once to work leaner; at HANDOFF, to wrap up and leave the rest to a fresh session,
// and again every REFIRE tokens after that. Silent otherwise; never blocks.
import { closeSync, existsSync, openSync, readFileSync, readSync, statSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const WARN = Number(process.env.CLAUDE_SETUP_CONTEXT_WARN) || 250_000
const HANDOFF = Number(process.env.CLAUDE_SETUP_CONTEXT_HANDOFF) || 350_000
const REFIRE = 50_000 // after the hand-off, nag again every further REFIRE tokens
const CHUNK = 256 * 1024

const size = (u) => (u.input_tokens || 0) + (u.cache_read_input_tokens || 0) + (u.cache_creation_input_tokens || 0)

function usages(text) {
  const out = []
  for (const line of text.split('\n')) {
    try {
      const u = JSON.parse(line).message?.usage
      if (u) out.push(size(u))
    } catch {} // the chunk's cut-off first or last line
  }
  return out.filter((n) => n > 0)
}

function tail(path) {
  const fd = openSync(path, 'r')
  try {
    const len = statSync(path).size
    const n = Math.min(CHUNK, len)
    const buf = Buffer.alloc(n)
    readSync(fd, buf, 0, n, len - n)
    return buf.toString('utf8')
  } finally { closeSync(fd) }
}

let raw = ''
process.stdin.setEncoding('utf8')
process.stdin.on('data', (c) => { raw += c })
process.stdin.on('end', () => {
  try {
    const { session_id: id = 'unknown', transcript_path: path } = JSON.parse(raw || '{}')
    if (!path || !existsSync(path)) return
    const stateFile = join(tmpdir(), `claude-context-guard-${String(id).replace(/[^\w-]/g, '')}.json`)
    const state = existsSync(stateFile) ? JSON.parse(readFileSync(stateFile, 'utf8')) : { fired: [] }
    const seen = usages(tail(path))
    const now = seen.at(-1)
    if (!now) return
    const k = (n) => `${Math.round(n / 1000)}k`
    // Absolute floors: a cold start already carries ~100k+ in project threads, so growth since the
    // first call hides the real size. Warn once at WARN, hand off at HANDOFF, then again every REFIRE.
    const next = state.next ?? HANDOFF
    let msg = ''
    if (now >= next) {
      msg = `Context guard: this session's context is ${k(now)} tokens and every tool call re-reads all of it. Finish the current step, write the state (PROGRESS.md, the PR or the thread's reply), and leave further work to a fresh session or thread instead of continuing here.`
      state.next = Math.max(next, Math.floor(now / REFIRE) * REFIRE) + REFIRE
      state.fired.push('warn', 'handoff')
    } else if (now >= WARN && !state.fired.includes('warn')) {
      msg = `Context guard: this session's context is ${k(now)} tokens and every tool call re-reads all of it. Batch independent calls, trim command output (tail, head, --quiet), and hand big reads or searches to a subagent that returns only the answer.`
      state.fired.push('warn')
    }
    writeFileSync(stateFile, JSON.stringify(state))
    if (msg) process.stdout.write(JSON.stringify({ hookSpecificOutput: { hookEventName: 'PostToolUse', additionalContext: msg } }))
  } catch {
    // A guard must never break a tool call.
  }
})
GUARD
# Attempt guard: the same file as global/attempt-guard.mjs (scripts/check.mjs keeps them equal);
# three failed rounds of one command get a reminder, five are blocked until PROGRESS.md has a diagnosis.
cat > "$HOME/.claude/claude-setup/attempt-guard.mjs" <<'ATTEMPT'
#!/usr/bin/env node
// Loop breaker. Usage: attempt-guard.mjs pre|ok|fail (one hook entry each: PreToolUse,
// PostToolUse, PostToolUseFailure). A round is one failed run of the same command (Bash) or the
// same tool call (MCP) in a session; a success of it resets the count. At DIAGNOSE the next result
// carries a reminder, at BLOCK the call is refused (exit 2) until PROGRESS.md has a
// "## Diagnosis" heading and was saved after the stall, at STOP it is refused for good.
// CLAUDE_SETUP_ATTEMPT_GUARD=off turns it off. It never breaks a tool call on its own errors.
import { createHash } from 'node:crypto'
import { existsSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'

const num = (v, d) => Number(v) || d
const DIAGNOSE = num(process.env.CLAUDE_SETUP_ATTEMPT_DIAGNOSE, 3)
const BLOCK = num(process.env.CLAUDE_SETUP_ATTEMPT_BLOCK, 5)
const STOP = num(process.env.CLAUDE_SETUP_ATTEMPT_STOP, 8)
// Read-only commands fail on "no match" all the time; that is not a round.
const READ_ONLY = /^(cd|ls|cat|head|tail|grep|rg|find|diff|test|\[|echo|pwd|which|stat|wc|git|gh|curl|sleep)\b/

const hash = (t) => createHash('sha1').update(t).digest('hex').slice(0, 12)

export function keyOf(tool, input = {}) {
  if (tool === 'Bash') {
    // "cd app && git add . && npm test" is a run of "npm test": read-only parts do not count.
    const parts = String(input.command ?? '').split(/&&|\|\||;|\|/).map((x) => x.trim().replace(/\s+/g, ' ')).filter((x) => x && !READ_ONLY.test(x))
    if (!parts.length) return null
    return `Bash:${hash(parts.join(' && ').replace(/\d+/g, '#'))}`
  }
  if (tool.startsWith('mcp__')) return `${tool}:${hash(JSON.stringify(input).replace(/\d+/g, '#'))}`
  return null
}

// PROGRESS.md of the working folder or of a parent (the hook's cwd can be a subfolder).
export function diagnosed(cwd, since) {
  for (let dir = cwd, i = 0; i < 4; i++, dir = dirname(dir)) {
    const file = join(dir, 'PROGRESS.md')
    if (existsSync(file)) return statSync(file).mtimeMs > since && /^## Diagnosis/m.test(readFileSync(file, 'utf8'))
  }
  return false
}

// Missing or corrupt state starts over.
function readState(file) {
  try { return JSON.parse(readFileSync(file, 'utf8')) } catch { return {} }
}

function decide(mode, state, key, cwd, now = Date.now()) {
  const e = state[key] ?? { fails: 0 }
  if (mode === 'ok') { delete state[key]; return {} }
  if (mode === 'fail') {
    e.fails += 1
    if (e.fails === BLOCK) e.stalledAt = now
    state[key] = e
    if (e.fails === DIAGNOSE) return { context: `Attempt guard: round ${e.fails} on this command. Stop patching. Write what is wrong, the cause and why the last fixes failed under "## Diagnosis" in PROGRESS.md before the next try; at round ${BLOCK} this command is blocked until you have.` }
    return {}
  }
  if (e.fails >= STOP) return { block: `Attempt guard: ${e.fails} failed rounds on this command. Hand off: a fresh thread with a better brief, or a Card to yskills (change the approach: use an existing asset or generator instead of hand-modelling, cut scope, or stop).` }
  if (e.fails >= BLOCK && !diagnosed(cwd, e.stalledAt ?? 0)) return { block: `Attempt guard: ${e.fails} failed rounds on this command. Write a "## Diagnosis" section in PROGRESS.md (what is wrong, the cause, why the last fixes failed), then try once more. ${STOP - e.fails} rounds left before a hand-off.` }
  return {}
}

export { decide }

if (process.argv[1] && import.meta.url.endsWith(process.argv[1].replace(/\\/g, '/').split('/').pop())) {
  let raw = ''
  process.stdin.setEncoding('utf8')
  process.stdin.on('data', (c) => { raw += c })
  process.stdin.on('end', () => {
    try {
      if (process.env.CLAUDE_SETUP_ATTEMPT_GUARD === 'off') return
      const mode = process.argv[2]
      const { session_id: id = 'unknown', cwd = process.cwd(), tool_name: tool = '', tool_input: input } = JSON.parse(raw || '{}')
      const key = keyOf(tool, input)
      if (!key) return
      const stateFile = join(tmpdir(), `claude-attempt-guard-${String(id).replace(/[^\w-]/g, '')}.json`)
      const state = readState(stateFile)
      const out = decide(mode, state, key, cwd)
      if (mode !== 'pre') writeFileSync(stateFile, JSON.stringify(state))
      if (out.block) { process.stderr.write(out.block); process.exitCode = 2 }
      else if (out.context) process.stdout.write(JSON.stringify({ hookSpecificOutput: { hookEventName: 'PostToolUseFailure', additionalContext: out.context } }))
    } catch {
      // A guard must never break a tool call.
    }
  })
}
ATTEMPT

# Team guard: the same file as global/team-guard.mjs (scripts/check.mjs keeps them equal): at
# session start a fresh copy of CLAUDE.md, docs/TEAMS.md and docs/MAP.md from main in
# ~/.claude/claude-setup/ plus the boot card where no checkout loaded CLAUDE.md, a block on a
# thread start before TEAMS.md was read, and a block on Agent calls and thread starts without
# `model` (a subagent of an Opus thread inherits Opus; CLAUDE_CODE_SUBAGENT_MODEL did not stop it
# in a project thread, tested 2026-10-26).
cat > "$HOME/.claude/claude-setup/team-guard.mjs" <<'TEAM'
#!/usr/bin/env node
// Team guard. Usage: team-guard.mjs start|card|pre (hook entries SessionStart, SessionStart, PreToolUse).
// Without a claude-setup checkout, start puts CLAUDE.md itself and card the coordinator card (Spawn
// rule, Models line, Sizes, Roster and Kits, one line each) into context; each counts as read.
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
// a size M or L one with no `Prior art:` line (look for what exists and works first, yskills 2026-10-27).
// CLAUDE_SETUP_TEAM_GUARD=off turns it off. It never breaks a tool call on its own errors.
import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, readdirSync, readFileSync, renameSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { dirname, join } from 'node:path'

export const POINTER = 'Team rule (claude-setup docs/TEAMS.md): route every task on its own (task picks the kit, not the project; then size S/M/L), call only the roles it needs, as thread or subagent as the roster says, and pass `model` from the role\'s row on every thread start and Agent call.'
export const BOOT_FILES = ['CLAUDE.md', 'docs/TEAMS.md', 'docs/MAP.md']
const RAW = 'https://raw.githubusercontent.com/yverse-studio/claude-setup/main/'
const MARK = '# Working for yskills' // first line of claude-setup's CLAUDE.md

const THREAD_START = /^mcp__.*(start_thread|create_session)/
const AGENT = /^(Agent|Task)$/

const text = (file) => { try { return readFileSync(file, 'utf8') } catch { return '' } }

// claude-setup's CLAUDE.md loads on its own: a checkout at cwd or a parent of it, or install.mjs's block in ~/.claude/CLAUDE.md (laptop).
export function rulesLoaded(cwd, home) {
  const files = [join(home, '.claude', 'CLAUDE.md')]
  for (let d = cwd; ; d = dirname(d)) { files.push(join(d, 'CLAUDE.md')); if (dirname(d) === d) break }
  return files.some((f) => text(f).includes(MARK))
}

// One curl for all files (it honours HTTPS_PROXY). A failed or cut-off run replaces nothing; a file
// replaces the copy only when it arrived whole. The .new names carry the pid, so two starts never share one.
// The guards update themselves the same way (yskills 2026-10-27: a rule change on main must reach
// every session without a cloud rebuild): an installed guard is replaced by main's copy when that
// copy arrived whole and passes `node --check`. A new hook entry still needs install.mjs or a rebuild.
export const GUARD_FILES = ['context-guard.mjs', 'attempt-guard.mjs', 'team-guard.mjs', 'rule-guard.mjs']
const parses = (f) => { try { execFileSync(process.execPath, ['--check', f], { stdio: 'ignore', timeout: 2000 }); return true } catch { return false } }
// Two downloads, so a guard missing on main (renamed, or not merged yet) never costs the boot files,
// and each keeps its own time limit inside the hook's 5 s.
function fetchAll(dir, files, url, seconds) {
  const tmp = (f) => join(dir, `${f}.${process.pid}.new`)
  if (!files.length) return []
  const args = ['-fsSL', '--max-time', String(seconds), '--create-dirs']
  for (const f of files) args.push('-o', tmp(f), url(f))
  let ok = true
  try { execFileSync('curl', args, { stdio: 'ignore', timeout: seconds * 1000 + 500 }) } catch { ok = false }
  // curl -f writes nothing for a missing file; a cut-off run (ok false) keeps a guard only if it still parses.
  return files.map((f) => ({ f, tmp: tmp(f), got: existsSync(tmp(f)) && statSync(tmp(f)).size > 0, ok }))
}
export function refresh(dir) {
  const guards = GUARD_FILES.filter((f) => existsSync(join(dir, f)))
  const boot = fetchAll(dir, BOOT_FILES, (f) => RAW + f, 2.5)
  const code = fetchAll(dir, guards, (f) => `${RAW}global/${f}`, 1.5)
  for (const { f, tmp, got, ok } of [...boot, ...code]) {
    const whole = got && (f.endsWith('.mjs') ? text(tmp).startsWith('#!/usr/bin/env node') && parses(tmp) : ok && (f !== 'CLAUDE.md' || text(tmp).includes(MARK)))
    if (whole) renameSync(tmp, join(dir, f))
    else rmSync(tmp, { force: true })
  }
}

export const BOOT_MAX = 9800 // hook context over 10,000 characters is cut to a preview; scripts/check.mjs keeps both cards under this
const section = (t, from, to) => { const a = t.indexOf(`\n## ${from}`); const b = t.indexOf(`\n## ${to}`, a + 1); return a < 0 ? '' : t.slice(a + 1, b < 0 ? undefined : b).trim() }
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
  ].join('\n\n')
}

export function inRepo(cwd) {
  for (let d = cwd; ; d = dirname(d)) { if (existsSync(join(d, '.git'))) return true; if (dirname(d) === d) return false }
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

export function hasOwnModel(type, dirs) {
  if (!type || !/^[\w.-]+$/.test(type)) return false
  return dirs.some((d) => {
    const file = join(d, `${type}.md`)
    return existsSync(file) && /^model:\s*\S+/m.test(readFileSync(file, 'utf8').split(/^---\s*$/m)[1] ?? '')
  })
}

// The brief block's first line (operator/briefs.md): Role, Kit and Size, so the thread knows what it is (yskills 2026-10-27).
export function stamped(text) {
  const plain = text.replace(/[*_`]/g, '')
  return /^[ \t>-]*Role:[ \t]*\S/im.test(plain) && /\bKit:[ \t]*\S/i.test(plain) && /\bSize:[ \t]*[SML]\b/i.test(plain)
}

export function needsPriorArt(text) {
  const plain = text.replace(/[*_`]/g, '')
  return /\bSize:[ \t]*[ML]\b/i.test(plain) && !/^[ \t>-]*Prior art:[ \t]*[^<\s][^\n]{9,}$/im.test(plain)
}

const briefText = (input) => Object.values(input).filter((v) => typeof v === 'string').join('\n')
export function needsTester(text) {
  const plain = text.replace(/[*_`]/g, '')
  const isL = /^[ \t]*role:[^\n]*\bprogrammer\b/im.test(plain) && /\bsize:[ \t]*L\b/i.test(plain)
  const named = plain.match(/^[ \t]*tester:[ \t]*(\S[^\n]*)$/im)?.[1].trim()
  return isL && !(named && !/^(<.*>|none|n\/a|-+|tbd)$/i.test(named))
}

// unread: the boot files a thread start still needs (empty when read or when no transcript was given).
export function decide(tool, input = {}, dirs = [], unread = []) {
  const kind = AGENT.test(tool) ? 'Agent' : THREAD_START.test(tool) ? 'thread' : null
  if (kind === 'thread' && unread.length) return { block: `team-guard: read the rules before starting a thread: ${unread.join(' and ')} (in ~/.claude/claude-setup/ or the claude-setup repo; docs/MAP.md, Start here). 2026-10-26 a coordinator skipped them and guessed every model. Read them, then retry.` }
  if (kind === 'thread' && !stamped(briefText(input))) return { block: 'team-guard: every thread brief starts with the stamp line `Role: <one role from docs/TEAMS.md Roster> · Kit: <kit> · Size: <S|M|L>` (operator/briefs.md); a small task with no role says `Role: none`. The thread loads its playbook from it. Add the line, then retry.' }
  if (kind === 'thread' && needsPriorArt(briefText(input))) return { block: 'team-guard: a size M or L brief names what already exists before anything is built (CLAUDE.md, Work for the future): add a line `Prior art: <our repos, skills, plugins, public setups checked> -> copy | adapt | build, because <why>` (or `to find: <where the Researcher looks>`), then retry.' }
  if (kind === 'thread' && needsTester(briefText(input))) return { block: 'team-guard: a size L Programmer thread starts only after its Tester thread (claude-setup docs/TEAMS.md, Sizes). Start `Tester · <app>` first, then put a line `Tester: <its thread id or title>` in this brief and retry.' }
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
      const { tool_name: tool = '', tool_input: input, cwd = process.cwd(), transcript_path: transcript, session_id: session } = JSON.parse(raw || '{}')
      const mark = (kind) => join(dir, 'booted', `${String(session).replace(/\W/g, '')}.${kind}`)
      const say = (context) => process.stdout.write(JSON.stringify({ hookSpecificOutput: { hookEventName: 'SessionStart', additionalContext: context } }))
      if (mode === 'start') {
        if (process.env.CLAUDE_SETUP_BOOT_FETCH !== 'off') refresh(dir)
        sweep(join(dir, 'booted'))
        if (rulesLoaded(cwd, home)) return say(POINTER)
        const claude = text(join(dir, 'CLAUDE.md')).replace(/\r/g, '')
        const card = claude.includes(MARK) && rulesCard(claude)
        if (card && card.length < BOOT_MAX) { if (session) { mkdirSync(dirname(mark('rules')), { recursive: true }); writeFileSync(mark('rules'), '') } return say(card) }
        return say(`${bootCard(dir)}\n${POINTER}`)
      }
      if (mode === 'card') {
        // The coordinator runs outside any repo (the project chat); a thread sits in a product repo and needs only its role card (rule-guard).
        if (rulesLoaded(cwd, home) || inRepo(cwd)) return
        const card = coordinatorCard(text(join(dir, 'docs', 'TEAMS.md')))
        if (!card || card.length >= BOOT_MAX) return
        if (session) { mkdirSync(dirname(mark('teams')), { recursive: true }); writeFileSync(mark('teams'), '') }
        return say(card)
      }
      if (process.env.CLAUDE_SETUP_TEAM_GUARD === 'off') return
      const read = transcript && existsSync(transcript) ? readBootFiles(transcript) : null
      // A card this session got at start counts as read.
      const need = (rulesLoaded(cwd, home) ? ['TEAMS.md'] : ['CLAUDE.md', 'TEAMS.md'])
        .filter((f) => !(session && existsSync(mark(f === 'CLAUDE.md' ? 'rules' : 'teams'))))
      const unread = read ? need.filter((f) => !read.has(f)) : []
      const out = decide(tool, input, [join(cwd, '.claude', 'agents'), join(home, '.claude', 'agents')], unread)
      if (out.block) { process.stderr.write(out.block); process.exitCode = 2 }
    } catch {
      // A guard must never break a tool call.
    }
  })
}
TEAM
# First copy of the boot files, so a session whose 3 s refresh fails still has them.
echo '{}' | node "$HOME/.claude/claude-setup/team-guard.mjs" start >/dev/null || echo "claude-setup: could not fetch the boot files"

# Permissions sync (docs/permissions.md): copies permissions (minus defaultMode, the thread keeps
# its own) and autoMode from main's global/settings.json into ~/.claude/settings.json. Run now and
# at every session start, so a merged change needs no environment rebuild. Never blocks.
# Rule guard: the same file as global/rule-guard.mjs (scripts/check.mjs keeps them equal): CLAUDE.md
# rules that were text only become checks on tool calls and notes on yskills' messages.
cat > "$HOME/.claude/claude-setup/rule-guard.mjs" <<'RULE'
#!/usr/bin/env node
// Rule guard. Usage: rule-guard.mjs pre|prompt|stop (hook entries PreToolUse, UserPromptSubmit, Stop),
// or rule-guard.mjs read <url> [max chars] to read a whole web page as text without an Allow prompt.
// Turns CLAUDE.md rules that were text only into checks (audit 2026-10-27: 17 of 20 rules had no
// guard and were skipped whenever CLAUDE.md did not load).
// pre: refuses (exit 2) a review request or assignee for yskills on a PR (No GitHub mails), a
// `Card:` text reply where the real card tool exists (Cards), a thread reply over the length cap
// (Replies), a new Artifact besides the Company XY one (Dashboard), a commit message that is not
// conventional (Code), and WebFetch in a cloud thread (Cloud threads: WebSearch, no Allow taps).
// prompt: a video link or a bare "stop" gets the matching CLAUDE.md line put next to the message, and
// the first message naming `Role: <role>` (the brief block, operator/briefs.md) gets that role's
// Roster row and playbook put into context, so a thread always knows what it is (yskills 2026-10-27).
// CLAUDE_SETUP_RULE_GUARD=off turns it off. It never breaks a tool call on its own errors.

import { execFileSync } from 'node:child_process'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { homedir, tmpdir } from 'node:os'
import { dirname, join } from 'node:path'

const OWNER = 'yskills'
const MARK = '# Working for yskills' // first line of claude-setup's CLAUDE.md
const RAW = 'https://raw.githubusercontent.com/yverse-studio/claude-setup/main/'
const CARD_MAX = 9000 // under the 10,000-char cap on hook context
export const REPLY_MAX_CHARS = 1500
export const REPLY_MAX_LINES = 15
const CONVENTIONAL = /^(feat|fix|docs|chore|refactor|test|perf|ci|build|style|revert)(\([^)]*\))?!?: \S/

const names = (v) => (Array.isArray(v) ? v : typeof v === 'string' ? v.split(/[\s,]+/) : []).map((s) => String(s).toLowerCase())

// The subject lines of every `git commit` in a Bash command: `-m "..."`, `-am '...'`, `-m word`, or
// `-m "$(cat <<'EOF' ...`. Only a real git commit counts: one that starts a command (after a separator),
// never "git commit" inside an echo, a grep or `git merge --no-commit`. Empty when there is nothing to check.
const COMMIT = /(?:^|&&|\|\||[;|(\n])\s*(?:(?:then|do|else)\s+)?(?:\w+=\S*\s+)*git(?:\s+-[Cc]\s+\S+)*\s+commit\b(?=([^\n]*))/g
export function commitSubjects(command) {
  const out = []
  for (const m of command.matchAll(COMMIT)) {
    const rest = m[1]
    if (/--amend\b.*--no-edit|\s-[cC]\s|--reuse-message|--fixup|--squash|\s-F\s|--file\b/.test(rest)) continue
    const here = rest.match(/(?:\s-[a-zA-Z]*m|--message)[ =]?\s*["']?\$\(cat\s*<<-?\s*'?(\w+)'?/)
    if (here) {
      const eol = command.indexOf('\n', m.index + m[0].length)
      const after = eol < 0 ? '' : command.slice(eol + 1)
      const line = after.split('\n').find((l) => l.trim())
      if (line && line.trim() !== here[1]) out.push(line.trim())
      continue
    }
    const msg = rest.match(/(?:\s-[a-zA-Z]*m|\s--message)(?:\s+|=|(?=["']))(?:(["'])([\s\S]*?)\1|([^\s"';&|]+))/)
    if (msg) out.push((msg[2] ?? msg[3]).split('\n')[0].trim())
  }
  return out
}

// yskills, as a reviewer or assignee in a gh command; never the bot account yskills-claude.
const GH_ASK = /\bgh\s+(pr|issue)\b[^\n]*(?:--(?:add-)?(?:reviewer|assignee)|\s-[ra])[ =]["']?(?:[^\s"']*,)?yskills(?=[,\s"']|$)/i

// published: the file paths this session already published to an existing Artifact (republishing by
// the same file_path without `url` is how the Artifact tool updates it).
// A reply that opens by agreeing must carry its reason (yskills 2026-10-27: "how do I enforce that you are no yes-man").
const YES = /^(du hast (völlig |total |absolut )?recht|stimmt|genau|richtig|(ja,? )?klar|you'?re (totally |absolutely )?right|you are right|agreed|absolutely|exactly|right)(,.*)?$/i
const REASON = /\b(weil|denn|da ich|geprüft|getestet|laut|because|checked|tested)\b/i
// Only an opening sentence that is nothing but agreement counts; "Genau das ist fertig" or "Stimmt nicht" do not.
export const bareAgreement = (text) => YES.test(text.replace(/^[\s*_>]+/, '').split(/[.!?\n]/)[0].trim()) && !REASON.test(text)

// Grill first (CLAUDE.md): a Planner at size M or L posts at least one grill card before it writes the plan or opens a PR.
// Role, size and "just do it" are read from the spawn brief only, never from files the thread read later.
export function grillMissing(tool, input, transcript) {
  const writesPlan = (/^(Write|Edit)$/.test(tool) && /(^|[\\/])PLAN\.md$/.test(String(input.file_path ?? ''))) || tool === 'mcp__github__create_pull_request'
  if (!writesPlan) return false
  const text = transcript()
  const brief = text.split('\n').find((l) => /reason=\\?"spawn/.test(l))?.replace(/[*_`]|\\[nt]/g, ' ')
  if (!brief || !/Role:\s*Planner\b/i.test(brief) || !/Size:\s*[ML]\b/i.test(brief)) return false
  if (/just do it|mach (es )?einfach|einfach machen|kein grill/i.test(brief)) return false
  return !/"name":"mcp__[^"]*(request_decision|ask_decision)"/.test(text)
}

export function decide(tool, input = {}, env = {}, published = []) {
  if (/^mcp__github__/.test(tool) || tool === 'Bash') {
    const ask = tool === 'Bash'
      ? GH_ASK.test(input.command ?? '')
      : [...names(input.reviewers), ...names(input.assignees)].includes(OWNER)
    if (ask) return `rule-guard: never request a review from or assign ${OWNER} (CLAUDE.md, No GitHub mails): every one sends him a mail. Keep the attribution block, drop reviewers/assignees, and go on.`
  }
  if (tool === 'Bash') {
    const subject = commitSubjects(input.command ?? '').find((t) => !/^(Merge|Revert) /.test(t) && !CONVENTIONAL.test(t))
    if (subject !== undefined) return `rule-guard: commit subject "${subject.slice(0, 60)}" is not a conventional commit (CLAUDE.md, Code): start with feat|fix|docs|chore|refactor|test|perf|ci: and say what changed for the user.`
  }
  if (tool === 'mcp__hearthbot__post_message') {
    const text = String(input.text ?? '')
    if (/^[\s>*_]*Card:/m.test(text)) return 'rule-guard: a decision is a real card here (CLAUDE.md, Cards): post it with request_decision (question, 2-4 options, one recommended), not as "Card:" text.'
    if (bareAgreement(text)) return 'rule-guard: this reply agrees without a reason (CLAUDE.md, Co-founder). Check the claim first (repo, a source, a test), then say agree, disagree or "partly, because ..." with what you checked.'
    const lines = text.split('\n').filter((l) => l.trim()).length
    if (text.length > REPLY_MAX_CHARS || lines > REPLY_MAX_LINES) return `rule-guard: this reply has ${text.length} chars and ${lines} lines; the cap is ${REPLY_MAX_CHARS} and ${REPLY_MAX_LINES} (CLAUDE.md, Replies). Lead with the result in a few lines; put the rest in a file under /mnt/project-files/ and attach it.`
  }
  const republish = input.file_path && !input.type_url && published.includes(input.file_path)
  const newArtifact = (tool === 'Artifact' && !input.url && !input.asset && !republish && [undefined, 'publish'].includes(input.action)) || tool === 'mcp__remote-devices__create_artifact'
  if (newArtifact && env.CLAUDE_SETUP_NEW_ARTIFACT !== 'yes') return 'rule-guard: the Company XY Artifact is the only Artifact there is (CLAUDE.md, Dashboard): no votes, galleries or one-off pages. Update it with its `url` (docs/hq-rows.md) or write a file under /mnt/project-files/. If yskills asked for a new one in his own words, say so in one line and retry with CLAUDE_SETUP_NEW_ARTIFACT=yes in the environment.'
  if (tool === 'WebFetch' && env.CLAUDE_CODE_REMOTE === 'true') return `rule-guard: in a cloud thread every WebFetch makes yskills press Allow (CLAUDE.md, Cloud threads). Read the whole page without a prompt: node ~/.claude/claude-setup/rule-guard.mjs read '${String(input.url ?? '<url>').replace(/'/g, '')}' (plain text, first ${PAGE_MAX} chars; add a number for more). For a video run the watch skill.`
  return null
}

// read: a whole web page as plain text through curl (it honours the cloud proxy and needs no Allow;
// yskills 2026-10-27: "you should read whole pages without asking me").
export const PAGE_MAX = 40000
// Public pages only: no localhost, private, link-local (cloud metadata) or bare-IP hosts.
export function privateHost(url) {
  let host
  try { host = new URL(url).hostname.replace(/^\[|\]$/g, '').replace(/\.$/, '').toLowerCase() } catch { return true }
  return /^(localhost|.*\.local|.*\.internal|metadata(\..*)?)$/.test(host) || /^[\d.]+$/.test(host) || host.includes(':') || privateIp(host)
}
// An address curl actually connected to: loopback, RFC 1918, link-local, CGNAT, ULA.
export const privateIp = (raw) => {
  const ip = raw.replace(/^::(ffff:(0:)?)?(?=\d+\.)/i, '') // IPv4-mapped or -compatible IPv6
  return /^(127\.|10\.|192\.168\.|169\.254\.|172\.(1[6-9]|2\d|3[01])\.|100\.(6[4-9]|[7-9]\d|1[01]\d|12[0-7])\.|0\.)/.test(ip) || /^(::1?$|f[cd]|fe[89ab]|fec|fed|fee|fef|::ffff:|64:ff9b:)/i.test(ip)
}

// Follows up to 5 redirects by hand so every hop's host is checked; refuses a page served from a private address.
function fetchPage(url) {
  for (let hop = 0; hop < 6; hop++) {
    if (privateHost(url)) throw new Error(`refused: ${url} is a local or private address; read only public pages`)
    // A proxy is forced (NO_PROXY ignored) or switched off, so remote_ip is checked whenever curl went direct.
    const proxy = /^https:/i.test(url) ? process.env.HTTPS_PROXY || process.env.https_proxy : process.env.http_proxy || process.env.HTTP_PROXY
    const route = proxy ? ['-x', proxy, '--noproxy', ''] : ['--noproxy', '*']
    const out = execFileSync('curl', ['-sS', '--proto', '=http,https', '--max-time', '20', '-A', 'Mozilla/5.0', ...route, '-w', '\n%{http_code} %{remote_ip} %{redirect_url}', url], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 })
    const cut = out.lastIndexOf('\n')
    const [code, ip, next] = out.slice(cut + 1).split(' ')
    // Through a proxy (the cloud) remote_ip is the proxy's own, and the proxy's allow list decides; without one, check it.
    if (!proxy && privateIp(ip ?? '')) throw new Error(`refused: ${url} resolved to a private address`)
    if (/^3/.test(code) && next) { url = next; continue }
    if (!/^2/.test(code)) throw new Error(`HTTP ${code}`)
    return out.slice(0, cut)
  }
  throw new Error('too many redirects')
}
export function pageText(html) {
  return html.replace(/<(script|style|noscript|svg|head)\b[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<(br|\/p|\/div|\/h\d|\/li|\/tr)\b[^>]*>/gi, '\n').replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'")
    .replace(/[ \t]+/g, ' ').replace(/\s*\n\s*/g, '\n').replace(/\n{3,}/g, '\n\n').trim()
}

const VIDEO = /\b(instagram\.com|tiktok\.com|youtube\.com|youtu\.be)\/\S+|\.(mp4|mov|webm)\b/i
export function promptContext(prompt = '') {
  const notes = []
  if (VIDEO.test(prompt)) notes.push('rule-guard: this message has a video. CLAUDE.md, Videos: run watch.py of the watch skill first (plain, no WebSearch in its place), then a verdict per video.')
  const said = (prompt.match(/<message[^>]*trigger="true"[^>]*>([\s\S]*?)<\/message>/)?.[1] ?? prompt).trim()
  if (/^\W*(stop+|stopp+|pause|halt)\W*$/i.test(said)) notes.push('rule-guard: yskills said stop. Stop at once, do not argue, say in one line what was left half done (CLAUDE.md, How to work).')
  return notes.join('\n')
}

// The role a brief names (`Role: Programmer · Kit: setup · Size: M`) and its Roster row in TEAMS.md.
export function roleOf(prompt, teams) {
  const line = prompt.replace(/[*_`]/g, '').match(/^[\s>-]*Role:[ \t]*([^\n]*)/m)?.[1].trim()
  if (!line || /^(none|n\/a|tbd|-)\b/i.test(line)) return null
  const rows = teams.split('\n').filter((l) => /^\| [A-Z][\w ]* \(\[`/.test(l))
  const named = (r) => r.slice(2, r.indexOf(' (')).toLowerCase()
  const row = rows.filter((r) => line.toLowerCase().startsWith(named(r))).sort((x, y) => named(y).length - named(x).length)[0]
  if (!row) return { name: line.split(/[·|,]/)[0].trim(), path: null, row: null }
  // Only a playbook path of the shape every Roster link has: nothing outside .claude/skills/<skill>/roles/.
  const link = row.match(/\]\(\.\.\/(\.claude\/skills\/[a-z0-9-]+\/roles\/[a-z0-9-]+\.md)\)/)?.[1] ?? null
  const cells = row.split('|').map((c) => c.trim())
  return { name: cells[1].slice(0, cells[1].indexOf(' (')), path: link, row: `Job: ${cells[2]}. Runs as: ${cells[4]}. Model: ${cells[5]}.` }
}

export function roleCard(role, playbook) {
  if (!role.row) return `rule-guard: the brief names Role: ${role.name}, which is not in the Roster of claude-setup docs/TEAMS.md. Ask the coordinator which role you are (message_coordinator) before any work.`
  const head = `rule-guard: you are the ${role.name} of this task, one role only (docs/TEAMS.md, Coordinator or thread). ${role.row}`
  if (playbook && head.length + playbook.length < CARD_MAX) return `${head} Your playbook, ${role.path}, follows; work by it.\n\n${playbook}`
  if (!role.path) return `${head} Your playbook is linked in that Roster row of claude-setup docs/TEAMS.md; Read it before any other work.`
  return `${head} Before any other work, Read your playbook ${role.path} of claude-setup${playbook ? '' : ' (add_repo it if it is not here)'}.`
}

const read = (f) => { try { return readFileSync(f, 'utf8') } catch { return '' } }

// claude-setup's root: a checkout at cwd or a parent, else the boot copy team-guard keeps in ~/.claude/claude-setup.
function setupRoot(cwd) {
  for (let d = cwd; ; d = dirname(d)) {
    for (const r of [d, join(d, 'claude-setup')]) if (existsSync(join(r, 'docs', 'TEAMS.md')) && read(join(r, 'CLAUDE.md')).startsWith(MARK)) return r
    if (dirname(d) === d) break
  }
  return join(homedir(), '.claude', 'claude-setup')
}
const fetchRaw = (path) => { try { return execFileSync('curl', ['-fsSL', '--max-time', '3', RAW + path], { encoding: 'utf8', timeout: 4000 }) } catch { return '' } }

function roleContext(prompt, cwd, session) {
  const once = join(tmpdir(), `claude-setup-role-${String(session).replace(/\W/g, '')}`)
  // Only a session's brief: a project wake that is not the spawn one quotes other threads' briefs.
  if (!session || existsSync(once) || (/<(wake|relay|coordinator-relay)\b/.test(prompt) && !/<(wake|relay)\b[^>]*reason="spawn"/.test(prompt))) return ''
  const root = setupRoot(cwd)
  const role = roleOf(prompt, read(join(root, 'docs', 'TEAMS.md')))
  if (!role) return ''
  writeFileSync(once, role.name)
  return roleCard(role, role.path ? read(join(root, role.path)) || fetchRaw(role.path) : '')
}

// A thread that posted its result (`Done:`) or its hand-off path is finished: it resolves itself before
// it stops (yskills 2026-10-27: handed-off threads stayed open; the coordinator cannot resolve another
// thread from its tools). Returns the reason to keep going, or null.
const FINISHED = /^\s*\**Done:|\/handoff\/[\w.-]+\.md/m
export function unresolved(transcript) {
  if (!/reason=\\?"spawn/.test(transcript)) return null // only a thread (spawned by the coordinator) resolves itself
  let finished = false
  for (const line of transcript.split('\n')) {
    if (!line.includes('"tool_use"')) continue
    try {
      for (const c of JSON.parse(line).message?.content ?? []) {
        if (c?.type !== 'tool_use') continue
        if (/post_message$/.test(c.name)) finished = FINISHED.test(String(c.input?.text ?? ''))
        // Only a result that ends the work counts: any real tool call after it means the thread went on.
        else if (!/^mcp__hearthbot__(update_progress_checklist|react|unreact|no_reply_needed)$/.test(c.name)) finished = false
      }
    } catch { continue } // a line that is not JSON
  }
  return finished ? 'rule-guard: this thread posted its Done: line or its hand-off, so it is finished: call set_thread_resolved (resolved: true) as the last step (CLAUDE.md, one thread per plan or PR, closed when done). If yskills still owes an answer, say so in one line instead and stop.' : null
}

if (process.argv[1] && import.meta.url.endsWith(process.argv[1].replace(/\\/g, '/').split('/').pop())) {
  const mode = process.argv[2]
  if (mode === 'read') {
    const [url, max = PAGE_MAX] = process.argv.slice(3)
    if (!/^https?:\/\//.test(url ?? '')) { console.error('usage: rule-guard.mjs read <http(s) url> [max chars]'); process.exit(1) }
    try {
      const html = fetchPage(url)
      process.stdout.write(`${pageText(html).slice(0, Number(max) || PAGE_MAX)}\n`, () => process.exit(0))
    } catch (e) { console.error(`could not read ${url}: ${e.message}`); process.exit(1) }
  } else {
    let raw = ''
    process.stdin.setEncoding('utf8')
    process.stdin.on('data', (c) => { raw += c })
    process.stdin.on('end', () => {
      try {
        if (process.env.CLAUDE_SETUP_RULE_GUARD === 'off') return
        const { tool_name: tool = '', tool_input: input = {}, prompt = '', cwd = process.cwd(), session_id: session, transcript_path: transcriptPath } = JSON.parse(raw || '{}')
        if (mode === 'prompt') {
          const context = [roleContext(prompt, cwd, session), promptContext(prompt)].filter(Boolean).join('\n')
          if (context) process.stdout.write(JSON.stringify({ hookSpecificOutput: { hookEventName: 'UserPromptSubmit', additionalContext: context } }))
          return
        }
        if (mode === 'stop') {
          const why = !JSON.parse(raw || '{}').stop_hook_active && transcriptPath && existsSync(transcriptPath) ? unresolved(read(transcriptPath)) : null
          if (why) process.stdout.write(JSON.stringify({ decision: 'block', reason: why }))
          return
        }
        if (mode !== 'pre') return
        const shipped = join(tmpdir(), `claude-setup-artifacts-${String(session).replace(/\W/g, '')}`)
        const transcript = () => (transcriptPath && existsSync(transcriptPath) ? read(transcriptPath) : '')
        const block = decide(tool, input ?? {}, process.env, session ? read(shipped).split('\n') : [])
          ?? (grillMissing(tool, input ?? {}, transcript) ? 'rule-guard: a Planner at size M or L grills first (CLAUDE.md, Grill first; operator SKILL.md): post 3-5 sharp questions as request_decision cards, each with your recommended answer, then write the plan on the answers (or the recommendations while he is away).' : null)
        if (!block && session && tool === 'Artifact' && input?.url && input.file_path) writeFileSync(shipped, `${input.file_path}\n`, { flag: 'a' })
        if (block) { process.stderr.write(block); process.exitCode = 2 }
      } catch {
        // A guard must never break a tool call.
      }
    })
  }
}
RULE

cat > "$HOME/.claude/claude-setup/permissions-sync.sh" <<'SYNC'
#!/usr/bin/env bash
f="$(mktemp)" && curl -fsSL --max-time 8 -o "$f" https://raw.githubusercontent.com/yverse-studio/claude-setup/main/global/settings.json && node -e '
const fs = require("fs"), p = require("os").homedir() + "/.claude/settings.json"
const ours = JSON.parse(fs.readFileSync(process.argv[1], "utf8"))
const s = fs.existsSync(p) ? JSON.parse(fs.readFileSync(p, "utf8")) : {}
const { defaultMode, ...perms } = ours.permissions || {}
s.permissions = { ...(s.permissions || {}), ...perms }
if (ours.autoMode) s.autoMode = ours.autoMode
fs.writeFileSync(p, JSON.stringify(s, null, 2))
' "$f"
rm -f "$f"
exit 0
SYNC
bash "$HOME/.claude/claude-setup/permissions-sync.sh" || echo "claude-setup: could not sync permissions"

node -e '
const fs = require("fs"), p = require("os").homedir() + "/.claude/settings.json"
const s = fs.existsSync(p) ? JSON.parse(fs.readFileSync(p, "utf8")) : {}
const cmd = `node "${require("os").homedir()}/.claude/claude-setup/context-guard.mjs"`
s.hooks = s.hooks || {}
s.hooks.PostToolUse = (s.hooks.PostToolUse || []).filter((h) => !JSON.stringify(h).includes("context-guard.mjs"))
s.hooks.PostToolUse.push({ matcher: "*", hooks: [{ type: "command", command: cmd, timeout: 5 }] })
for (const [event, mode] of [["PreToolUse", "pre"], ["PostToolUse", "ok"], ["PostToolUseFailure", "fail"]]) {
  s.hooks[event] = (s.hooks[event] || []).filter((h) => !JSON.stringify(h).includes("attempt-guard.mjs"))
  s.hooks[event].push({ matcher: "Bash|mcp__.*", hooks: [{ type: "command", command: `node "${require("os").homedir()}/.claude/claude-setup/attempt-guard.mjs" ${mode}`, timeout: 5 }] })
}
const team = (mode) => ({ type: "command", command: `node "${require("os").homedir()}/.claude/claude-setup/team-guard.mjs" ${mode}`, timeout: 5 })
const teamHooks = [["SessionStart", "startup|clear|compact", "start"], ["SessionStart", "startup|clear|compact", "card"], ["PreToolUse", "Agent|Task|mcp__.*start_thread.*|mcp__.*create_session", "pre"]]
for (const event of new Set(teamHooks.map(([e]) => e))) s.hooks[event] = (s.hooks[event] || []).filter((h) => !JSON.stringify(h).includes("team-brief.mjs") && !JSON.stringify(h).includes("team-guard.mjs"))
for (const [event, matcher, mode] of teamHooks) s.hooks[event].push({ matcher, hooks: [team(mode)] })
const rule = (mode) => ({ type: "command", command: `node "${require("os").homedir()}/.claude/claude-setup/rule-guard.mjs" ${mode}`, timeout: 5 })
for (const [event, matcher, mode] of [["PreToolUse", "Bash|Write|Edit|Artifact|WebFetch|mcp__github__.*|mcp__hearthbot__post_message|mcp__remote-devices__create_artifact", "pre"], ["UserPromptSubmit", "", "prompt"], ["Stop", "", "stop"]]) {
  s.hooks[event] = (s.hooks[event] || []).filter((h) => !JSON.stringify(h).includes("rule-guard.mjs"))
  s.hooks[event].push({ ...(matcher ? { matcher } : {}), hooks: [rule(mode)] })
}
s.hooks.SessionStart = s.hooks.SessionStart.filter((h) => !JSON.stringify(h).includes("permissions-sync.sh"))
s.hooks.SessionStart.push({ matcher: "startup|clear|compact", hooks: [{ type: "command", command: `bash "${require("os").homedir()}/.claude/claude-setup/permissions-sync.sh"`, timeout: 10 }] })
fs.writeFileSync(p, JSON.stringify(s, null, 2))
' || echo "claude-setup: could not add the context, attempt guard, team guard, rule guard and permissions sync hooks"
