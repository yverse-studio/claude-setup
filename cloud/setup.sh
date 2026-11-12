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
# Our own cross-project skills (mods/setup-skills: core; mods/setup-domains: games, video, social, stores). Skills in a repo's .claude/skills/ do not load in
# project cloud threads (docs/RESEARCH.md); a user-scope plugin does. The marketplace is claude-setup itself, a private repo:
# if the setup script has no GitHub access, this step fails loudly and the rest still runs.
claude plugin marketplace add yverse-studio/claude-setup \
  && claude plugin install setup-skills@claude-setup-mods --scope user \
  && claude plugin install setup-domains@claude-setup-mods --scope user \
  || echo "claude-setup: could not add marketplace yverse-studio/claude-setup or install setup-skills / setup-domains (private repo, no access at setup time?)"
# A cache from an older image holds an old copy (2026-11-12: only `publish`, no design skills): pull the current one.
{ claude plugin marketplace update claude-setup-mods \
  && claude plugin update setup-skills@claude-setup-mods \
  && claude plugin update setup-domains@claude-setup-mods; } \
  || echo "claude-setup: could not update claude-setup-mods plugins (a stale cache stays)"
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
# run after every tool call so long threads get told to work leaner and, at the backstop, to check the handoff triggers.
mkdir -p "$HOME/.claude/claude-setup"
cat > "$HOME/.claude/claude-setup/context-guard.mjs" <<'GUARD'
#!/usr/bin/env node
// PostToolUse hook: every tool call re-sends the whole context, so a long session pays for its
// size again on each call (cache reads were 98% of our usage). At WARN tokens of absolute context,
// tell Claude once to work leaner; at HANDOFF (a backstop only: the real handoff triggers are in
// docs/WORKFLOW.md, Handoff triggers), to check them, and again every REFIRE tokens after that.
// Silent otherwise; never blocks.
import { closeSync, existsSync, openSync, readFileSync, readSync, statSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

// Sized for a 1M window (yskills 2026-11-03: the Animator handed off every ~30 min at 350k). A 200k
// window never gets here, auto-compact owns it, so these numbers only ever apply to 1M models.
const WARN = Number(process.env.CLAUDE_SETUP_CONTEXT_WARN) || 250_000
const HANDOFF = Number(process.env.CLAUDE_SETUP_CONTEXT_HANDOFF) || 700_000
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
    // first call hides the real size. Warn once at WARN, check the handoff triggers at HANDOFF, then again every REFIRE.
    const next = state.next ?? HANDOFF
    let msg = ''
    if (now >= next) {
      msg = `Context guard: this session's context is ${k(now)}. Check the three handoff triggers (docs/WORKFLOW.md, Handoff triggers): role change, quality loss (attempt-guard fired twice, the same approach repeated, a contradiction with an earlier step) or a finished milestone. None: keep working; write 10 lines of state into the checklist or PROGRESS.md and rely on compaction (the PreCompact guard keeps the state). One: finish the step, write the handoff file, stop. If you are only waiting, make no tool call and end the turn.`
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
# Compact guard: the same file as global/compact-guard.mjs (scripts/check.mjs keeps them equal);
# PreCompact: tells the compaction summary what to keep and saves a state note.
cat > "$HOME/.claude/claude-setup/compact-guard.mjs" <<'COMPACT'
#!/usr/bin/env node
// PreCompact hook: what a hook prints to stdout becomes instructions for the compaction summary.
// Tell it what to keep verbatim (the thread's Role/Kit/Size line, branch, PR, asks, decisions with
// reasons, the last error, files changed, Done-when) and what to drop, and save the same headings as a
// note in /mnt/project-files/<project>/handoff/ when the project is known. Never fails a compaction.
import { closeSync, constants, existsSync, lstatSync, mkdirSync, openSync, readSync, realpathSync, statSync, writeSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import { join, resolve, sep } from 'node:path'

const BASE = process.env.CLAUDE_SETUP_PROJECT_FILES || '/mnt/project-files'
const CHUNK = 256 * 1024

const INSTRUCTIONS = `Compaction summary: keep these verbatim, drop the rest.
Keep verbatim: the thread's "Role: ... · Kit: ... · Size: ..." line; the branch and the PR; the open asks of yskills and their status; every decision with its reason; the last error text verbatim; the files changed; the "Done when:" line.
Drop: logs, intermediate states, tool output.`

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

function extract(text) {
  const tools = []
  let lastPost = ''
  for (const line of text.split('\n')) {
    try {
      const content = JSON.parse(line).message?.content
      for (const b of Array.isArray(content) ? content : []) {
        if (b.type !== 'tool_use') continue
        tools.push(b.name)
        if (/post_message$/.test(b.name) && typeof b.input?.text === 'string') lastPost = b.input.text
      }
    } catch { continue } // the chunk's cut-off first line, or a blank
  }
  return { tools: tools.slice(-30), lastPost }
}

function branchOf(cwd) {
  try {
    if (!cwd || !existsSync(cwd)) return ''
    return execFileSync('git', ['-C', cwd, 'rev-parse', '--abbrev-ref', 'HEAD'], { encoding: 'utf8', timeout: 2000, stdio: ['ignore', 'pipe', 'ignore'] }).trim()
  } catch { return '' }
}

// The project folder named in cwd or in the transcript. Transcript text is untrusted (tool output, web
// pages), so the name is a plain word (no dots, no slashes) and the folder must resolve inside BASE.
function projectOf(cwd, text) {
  const re = new RegExp(`${BASE.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}/([A-Za-z0-9][\\w-]*)/`)
  const name = String(cwd).match(re)?.[1] || text.match(re)?.[1] || ''
  if (!name || !/^[A-Za-z0-9][\w-]*$/.test(name)) return ''
  return resolve(BASE, name).startsWith(resolve(BASE) + sep) ? name : ''
}

let raw = ''
process.stdin.setEncoding('utf8')
process.stdin.on('data', (c) => { raw += c })
process.stdin.on('end', () => {
  let out = INSTRUCTIONS
  try {
    const { session_id: id = 'unknown', transcript_path: path, trigger = 'auto', cwd = '' } = JSON.parse(raw || '{}')
    let text = ''
    try { if (path && existsSync(path)) text = tail(path) } catch (e) { out += `\n(transcript not read: ${e.message})` }
    const project = projectOf(cwd, text)
    const dir = project ? join(BASE, project) : ''
    if (dir && existsSync(dir)) {
      const { tools, lastPost } = extract(text)
      const short = String(id).replace(/[^\w-]/g, '').slice(0, 8) || 'unknown'
      const file = join(dir, 'handoff', `${new Date().toISOString().slice(0, 10)}-compact-${short}.md`)
      const note = [
        `# Compaction state (${trigger}, session ${short})`,
        '',
        '## Role / Kit / Size',
        '(copy the thread\'s "Role: · Kit: · Size:" line)',
        '',
        '## Branch and PR',
        branchOf(cwd) || '(branch unknown)',
        '',
        '## Open asks of yskills',
        '(none extracted)',
        '',
        '## Decisions with reasons',
        '(none extracted)',
        '',
        '## Last error',
        '(none extracted)',
        '',
        '## Files changed',
        '(see git status in the branch)',
        '',
        '## Done when',
        '(copy the brief\'s Done-when line)',
        '',
        '## Last 30 tool calls',
        tools.join(', ') || '(none)',
        '',
        '## Last post_message',
        lastPost || '(none)',
        '',
      ].join('\n')
      try {
        // The folder is shared with other threads: never follow a planted symlink, never overwrite.
        const handoff = join(dir, 'handoff')
        mkdirSync(handoff, { recursive: true })
        if (lstatSync(handoff).isSymbolicLink() || !realpathSync(handoff).startsWith(realpathSync(BASE) + sep)) throw new Error('handoff dir is a link or outside the base')
        const fd = openSync(file, constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | constants.O_NOFOLLOW, 0o644)
        try { writeSync(fd, note) } finally { closeSync(fd) }
        out += `\nState saved at ${file}.`
      } catch (e) { out += `\nState not saved (${e.message}); keep the headings above in the summary.` }
    }
  } catch {
    // A guard must never break a compaction.
  }
  process.stdout.write(`${out}\n`)
})
COMPACT
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
// a size M or L one with no `Prior art:` line (look for what exists and works first, yskills 2026-10-27),
// and one whose `model` is a tier its role's Roster row does not name (wrongModel).
// Blind test 2026-10-27 ("Kit: content", a video at S, a Game Designer on a story, briefs of one line): a
// thread start also needs a kit from the Kits table, a size that kit allows, a role on that kit's team
// (badTeam), and the brief block's Model, Skills, Done when, Stop when and Start lines (missingLines).
// CLAUDE_SETUP_TEAM_GUARD=off turns it off. It never breaks a tool call on its own errors.
import { execFileSync, spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readdirSync, readFileSync, renameSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { homedir, tmpdir } from 'node:os'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
// rule-guard sits beside this file (GUARD_FILES); without it only the model-tier check is skipped.
let roleOf = () => null
try { ({ roleOf } = await import('./rule-guard.mjs')) } catch { /* no rule-guard here */ }

export const POINTER = 'Team rule (claude-setup docs/TEAMS.md): route every task on its own (task picks the kit, not the project; then size S/M/L), call only the roles it needs, as thread or subagent as the roster says, and pass `model` from the role\'s row on every thread start and Agent call.'
export const PM_FILE = '.claude/skills/operator/roles/project-manager.md'
export const BOOT_FILES = ['CLAUDE.md', 'docs/TEAMS.md', 'docs/MAP.md', PM_FILE, 'config/persona.json']
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
// copy arrived whole and passes `node --check`; a guard added to GUARD_FILES later is installed the same way. A new hook entry still needs install.mjs or a rebuild.
export const GUARD_FILES = ['context-guard.mjs', 'compact-guard.mjs', 'attempt-guard.mjs', 'team-guard.mjs', 'rule-guard.mjs', 'gate-rounds.mjs']
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
export function refresh(dir, only = null) {
  const guards = GUARD_FILES.filter((f) => !only || only.includes(f)) // a guard missing on disk is fetched too: an image pasted before a guard existed never had it (2026-11-12)
  const boot = only ? [] : fetchAll(dir, BOOT_FILES, (f) => RAW + f, 2.5)
  const code = fetchAll(dir, guards, (f) => `${RAW}global/${f}`, 1.5)
  for (const { f, tmp, got, ok } of [...boot, ...code]) {
    const whole = got && (f.endsWith('.mjs') ? text(tmp).startsWith('#!/usr/bin/env node') && parses(tmp) : ok && (f !== 'CLAUDE.md' || text(tmp).includes(MARK)))
    if (whole) renameSync(tmp, join(dir, f))
    else rmSync(tmp, { force: true })
  }
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
const section = (t, from, to) => { const a = t.indexOf(`\n## ${from}`); const b = t.indexOf(`\n## ${to}`, a + 1); return a < 0 ? '' : t.slice(a + 1, b < 0 ? undefined : b).trim() }
const cells = (l) => l.split('|').map((c) => c.trim())

// Where no checkout loaded it, CLAUDE.md itself goes into context: nothing to remember to read (audit 2026-10-27).
export function rulesCard(claude) {
  return `Boot (claude-setup): no checkout loaded claude-setup's CLAUDE.md, so here it is, fresh from main. These are yskills' rules; follow them.\n\n${claude}`
}

// The coordinator's slice of docs/TEAMS.md (Spawn rule, Models line, Sizes, one line per role and kit):
// enough to start every thread with the right role and model; the rest of TEAMS.md and MAP.md only on demand.
// pm: roles/project-manager.md, whose "Text only" section (the repeats no hook can judge) closes the card.
export function coordinatorCard(teams, pm = '') {
  const roster = teams.split('\n').filter((l) => /^\| [A-Z][\w ]* \(\[`/.test(l)).map((l) => { const c = cells(l); return `- ${c[1].replace(/ \(\[.*$/, '')}: ${c[4]}; ${c[5]}` })
  const kits = section(teams, 'Kits', 'Models for tasks').split('\n').filter((l) => /^\| `/.test(l)).map((l) => { const c = cells(l); return `- ${c[1]}: ${c[3]}` })
  const sizes = section(teams, 'Sizes', 'Pipeline').split('\n').filter((l) => l.startsWith('|'))
  if (!roster.length || !kits.length) return ''
  return [
    'Coordinator card (claude-setup docs/TEAMS.md, fresh from main): you are the coordinator here. Route every task with it; read the full TEAMS.md, MAP.md or a role file only when a task needs a part this card lacks, and roles/project-manager.md (Session start) at your first start.',
    section(teams, 'Spawn rule', 'Sizes'), `## Sizes\n\n${sizes.join('\n')}`,
    `## Roster (role: runs as; model)\n\n${roster.join('\n')}`, `## Kits (team at size L)\n\n${kits.join('\n')}`,
    section(pm, 'Text only', 'Session start'),
  ].filter(Boolean).join('\n\n')
}

// The canary (yskills 2026-10-27: "how do I know it read everything?"): a line only this hook can write,
// because its hash comes from the rule files it just loaded. The coordinator's first reply opens with it
// (rule-guard blocks one without); no line in a new project means no guards there (docs/USING.md, step 4).
export function canary(dir) {
  const rules = ['CLAUDE.md', 'docs/TEAMS.md'].map((f) => text(join(dir, f))).join('\n')
  if (!rules.includes(MARK)) return null
  return `Luna · rules #${createHash('sha256').update(rules.replace(/\r/g, '')).digest('hex').slice(0, 7)} · guards: on`
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
export function needsPriorArt(text) {
  const plain = text.replace(/[*_`]/g, '')
  return /\bSize:[ \t]*[SML]\b/i.test(plain) &&!/^[ \t>-]*Prior art:[ \t]*[^<\s][^\n]{9,}$/im.test(plain)
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

// The brief block's must-have lines (operator/briefs.md). Blind test 2026-10-27: a fresh coordinator
// started threads with only a title and a guess, and nothing stopped it.
const BRIEF_LINES = [
  ['Model:', /^[ \t>-]*Model:[ \t]*[^<\s]/im],
  ['Skills:', /^[ \t>-]*Skills:[ \t]*[^<\s]/im],
  ['Done when:', /\bDone when:[ \t]*\n?[ \t]*[^<\s]/i],
  ['Stop when:', /\bStop when:[ \t]*\n?[ \t]*[^<\s]/i],
  ['Start: (read MEMORY.md first)', /^[ \t>-]*Start:[^\n]*MEMORY\.md/im],
  // Companyxy 2026-11-12: finished threads stayed open and work lay twice. The coordinator lists the threads before every start.
  ['Threads: (list_threads checked, none open on this topic)', /^[ \t>-]*Threads:[ \t]*[^<\s][^\n]{8,}$/im],
]
// A task that asks for research names its Researcher subagent (docs/TEAMS.md, Kits; yskills 2026-11-12:
// a Planner did the SOTA research itself). The brief block's own "No extra ... research" does not trigger it.
const ASKS_RESEARCH = /\b(SOTA|state of the art|research (on|about|into|what)|recherch\w*)\b/i
// Companyxy 2026-11-12 (point 3): about 20 fit rounds because bodies and outfits were built before cast sheets with measures and a
// look lock existed (docs/preproduction-workflow.md). A modelling job of a Programmer or Animator on a game or story kit names both.
const SHEET_LINES = [
  ['Sheet: (approved cast sheet, docs/preproduction-workflow.md)', /^[ \t>-]*Sheet:[ \t]*[^<\n]*\.md\b/im],
  ['Look-Lock: (owner card of the look)', /^[ \t>-]*Look-Lock:[ \t]*[^<\n]*(https?:\/\/|card)/im],
]
// Gate rounds 1 to 6 chased verbs and body words and every round found more. So there is no classifier: every Programmer or Animator brief
// on a game or story kit names its approved cast sheet and look lock, or declares in one line that it is no body, face or outfit job:
// `Sheet: n/a <why>` (10+ characters). A false "n/a" on a real modelling job is visible in the brief; a missing line is refused.
const needsSheet = (plain) => /^[ \t>-]*Role:[ \t]*(Programmer|Animator)\b/im.test(plain) && /\bKit:[ \t]*(game|story)\b/i.test(plain)
  && !/^[ \t>-]*Sheet:[ \t]*n\/a[ \t]+\S[^\n]{9,}$/im.test(plain)
// CompanyXY 2026-11-12 (yskills 13:23, point 5): gates were planned only after the owner complained. A builder, designer or animator brief
// at size M or L names the Reviewer thread that gates its work before the owner sees it; the gate roles themselves need no such line.
// A Gate line names a reviewer thread (`Gate: Reviewer · fit round 2 before owner`), or says in 10+ characters why the slice has no owner-facing
// result (`Gate: n/a no owner-facing result, a CI script only`); the same shape as `Sheet: n/a`. `none`, `later` or `skipped` do not count.
export const GATE_BUILDER_ROLES = '(?:Programmer|Designer|Animator|Game Designer|Content Designer|Sound Designer)'
export const GATE_LINE = /^[ \t>-]*Gate:[ \t]*(?:(?:Reviewer|Tester)\b[^\n]*\bbefore owner\b[^\n]*|n\/a[ \t]+\S[^\n]{9,})$/im
const needsGate = (plain) => new RegExp(`^[ \\t>-]*Role:[ \\t]*${GATE_BUILDER_ROLES}\\b`, 'im').test(plain) && /\bSize:[ \t]*[ML]\b/i.test(plain) && !GATE_LINE.test(plain)
export function missingLines(text) {
  const plain = text.replace(/[*_`]/g, '')
  const lines = BRIEF_LINES.filter(([, re]) => !re.test(plain)).map(([name]) => name)
  if (needsGate(plain)) lines.push('Gate: <Reviewer thread> before owner, or `Gate: n/a <why no owner-facing result>` (a builder, designer or animator brief at size M or L)')
  if (needsSheet(plain)) for (const [name, re] of SHEET_LINES) if (!re.test(plain)) lines.push(name)
  if (ASKS_RESEARCH.test(plain) && !/\bRole:[ \t]*Researcher\b/i.test(plain) && !/^[ \t>-]*Researcher:[ \t]*[^<\s]/im.test(plain)) lines.push('Researcher: (the task asks for research)')
  return lines
}

// Kit and size checked against docs/TEAMS.md, not only their format (blind test 2026-10-27: "Kit: content",
// a video at size S, a Game Designer on a Ren'Py story, a Designer cutting a video).
const kitRows = (teams) => section(teams, 'Kits', 'Models for tasks').split('\n').filter((l) => /^\| `/.test(l))
  .map((l) => { const c = cells(l); return { kit: c[1].match(/`([\w-]+)`/)[1], team: c[3], skipped: c[4] } })
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

// #453 left this gap: a brief may name any Role. It names a Roster role, or `Role: none` for a mini task (operator/briefs.md).
export function badRole(text, teams) {
  const names = rosterNames(teams)
  const plain = text.replace(/[*_`]/g, '')
  const role = names.length ? roleOf(plain, teams) : null
  if (!role) return null
  // roleOf matches a name by its start: `Programmers` or `Programmer-X` must not pass as the Programmer (a name ends at a space, `·`, `|`, `,` or `(`).
  const line = plain.match(/^[\s>-]*Role:[ \t]*([^\n]*)/m)?.[1].trim() ?? ''
  const exact = role.row && /^$|^[\s·|,(]/.test(line.slice(role.name.length))
  return exact ? null : `Role: ${role.row ? line.split(/[\s·|,(]/)[0] : role.name} is no role in docs/TEAMS.md (Roster): pick one of ${names.join(', ')}, or \`Role: none\` for a small task with no role`
}

// M48: a Reviewer brief may carry `Topic: <name>`; the names are the `## ` headings of the checklist file (the one source for this guard,
// scripts/brief.mjs and rule-guard's topic card).
export const CHECKLISTS = '.claude/skills/operator/checklists.md'
export const topicNames = (checklists) => String(checklists).split('\n').filter((l) => /^## \S/.test(l)).map((l) => l.slice(3).trim())
export function badTopic(text, checklists) {
  const plain = text.replace(/[*_`]/g, '')
  const topic = plain.match(/^[ \t>-]*Topic:[ \t]*([^\n]*)/im)?.[1].trim()
  const names = topicNames(checklists)
  if (topic === undefined || !names.length) return null
  if (!/^[ \t>-]*Role:[ \t]*Reviewer\b/im.test(plain)) return `Topic: ${topic} belongs to a Reviewer brief only (${CHECKLISTS})`
  return names.some((n) => n.toLowerCase() === topic.toLowerCase()) ? null : `Topic: ${topic} is no topic in ${CHECKLISTS}: pick one of ${names.join(', ')}`
}

export function badTeam(text, teams) {
  const plain = text.replace(/[*_`]/g, '')
  const rows = teams ? kitRows(teams) : []
  if (!rows.length) return null
  const kit = plain.match(/\bKit:[ \t]*([\w-]+)/i)?.[1].toLowerCase()
  const row = rows.find((r) => r.kit === kit)
  if (!row) return `Kit: ${kit} is no kit in docs/TEAMS.md (Kits): pick one of ${rows.map((r) => r.kit).join(', ')} by what the task makes (Spawn rule 1)`
  const size = plain.match(/\bSize:[ \t]*([SML])\b/i)?.[1].toUpperCase()
  if (['video', 'social'].includes(kit) && size === 'S') return `a ${kit} brief is size M (one video or post) or L (a batch, series or launch video), never S (docs/TEAMS.md, Spawn rule 2)`
  const role = roleOf(plain, teams)
  if (!role?.row) return null
  if (role.name === 'Planner' && size === 'S') return 'a Planner thread runs at size M or L only; size S starts the Programmer (docs/TEAMS.md, Sizes)'
  const film = rosterOf(teams, 'Film').includes(`| ${role.name} (`)
  const social = rosterOf(teams, 'Social').includes(`| ${role.name} (`)
  const media = ['video', 'social'].includes(kit)
  const fits = social ? kit === 'social' : film ? media : media ? named(row.team, role.name) : !skips(row.skipped, role.name)
  return fits ? null : `the ${role.name} is not on the \`${kit}\` kit's team (docs/TEAMS.md, Kits: team "${row.team}", skipped "${row.skipped}"); start the role that row names`
}

// A size M or L thread's title is `<Role> · <what>` (docs/TEAMS.md, Roster "Runs as"); test project 2026-10-27: a bee video thread
// started untitled by role. Size S needs no role title (yskills 2026-10-27).
export function badTitle(title, text, teams) {
  const plain = text.replace(/[*_`]/g, '')
  const role = teams && typeof title === 'string' && /\bSize:[ \t]*[ML]\b/i.test(plain) && roleOf(plain, teams)
  if (!role?.name) return null
  return new RegExp(`^\\s*${role.name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*·\\s*\\S`, 'i').test(title) ? null : role.name
}

// unread: the boot files a thread start still needs (empty when read or when no transcript was given).
export function decide(tool, input = {}, dirs = [], unread = [], teams = '', checklists = '') {
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
    if (needsPriorArt(text)) found.push('add a line `Prior art: <our repos, skills, plugins, public setups checked> -> copy | adapt | build, because <why>` (or `to find: <where the Researcher looks>`; CLAUDE.md, Work for the future)')
    if (needsTester(text)) found.push('a size L Programmer thread starts only after its Tester thread (claude-setup docs/TEAMS.md, Sizes): start `Tester · <app>` first, then put a line `Tester: <its thread id or title>` in this brief')
    const wrong = wrongModel(text, input.model, teams)
    if (wrong) found.push(`the ${wrong.role} runs on ${wrong.allowed.join(' or ')} (claude-setup docs/TEAMS.md, Roster), not ${wrong.tier}. Pass that model. For an exception the row names (e.g. "Opus writes the weekly plan") add \`Model: <tier> (<why>)\` to the brief; if yskills named this model, say "yskills named <model>"`)
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
      const { tool_name: tool = '', tool_input: input, cwd = process.cwd(), transcript_path: transcript, session_id: session, source, model } = JSON.parse(raw || '{}')
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
      if (mode === 'card') {
        // 2026-11-08: a spawned project thread runs with CLAUDE_CODE_CHILD_SESSION=1 and gets its role card from rule-guard; the coordinator (channel session) does not set it as far as its init event shows, so only the thread skips.
        if (process.env.CLAUDE_CODE_CHILD_SESSION === '1') return
        // The coordinator runs outside any repo (the project chat); a thread sits in a product repo and needs only its role card (rule-guard).
        if (rulesLoaded(cwd, home) || inRepo(cwd)) return
        // The project chat resumes its session each turn; it needs the card once, the first time hooks exist.
        if (source === 'resume' && session && existsSync(mark('teams'))) return
        // This hook runs beside `start`, so a cached cloud image would build the card with its old guard:
        // fetch main's team-guard (only it, to stay inside the hook's 5 s), and when the installed copy is
        // not the code running here, let it build the card; if it prints nothing, this one does.
        const self = join(dir, 'team-guard.mjs')
        if (process.env.CLAUDE_SETUP_BOOT_FETCH !== 'off' && existsSync(self)) {
          refresh(dir, ['team-guard.mjs'])
          if (text(self) !== text(fileURLToPath(import.meta.url))) {
            const env = { ...process.env, CLAUDE_SETUP_BOOT_FETCH: 'off' }
            const out = spawnSync(process.execPath, [self, 'card'], { input: raw, env, encoding: 'utf8', timeout: 2000 }).stdout
            if (out) return process.stdout.write(out)
          }
        }
        const card = coordinatorCard(text(join(dir, 'docs', 'TEAMS.md')), text(join(dir, PM_FILE)))
        if (!card || card.length >= BOOT_MAX) return
        const line = canary(dir)
        if (session) {
          mkdirSync(dirname(mark('teams')), { recursive: true }); writeFileSync(mark('teams'), '')
          if (line) writeFileSync(mark('canary'), line)
        }
        return say(line ? `${card}\n\nCanary: open your first reply in this session with this line, verbatim, so yskills sees the rules loaded: ${line}` : card)
      }
      if (process.env.CLAUDE_SETUP_TEAM_GUARD === 'off') return
      const read = transcript && existsSync(transcript) ? readBootFiles(transcript) : null
      // A card this session got at start counts as read.
      const need = (rulesLoaded(cwd, home) ? ['TEAMS.md'] : ['CLAUDE.md', 'TEAMS.md'])
        .filter((f) => !(session && existsSync(mark(f === 'CLAUDE.md' ? 'rules' : 'teams'))))
      const unread = read ? need.filter((f) => !read.has(f)) : []
      const teams = THREAD_START.test(tool) ? text(join(cwd, 'docs', 'TEAMS.md')) || text(join(dir, 'docs', 'TEAMS.md')) : ''
      const checklists = THREAD_START.test(tool) ? text(join(cwd, CHECKLISTS)) || text(join(dir, CHECKLISTS)) : ''
      const out = decide(tool, input, [join(cwd, '.claude', 'agents'), join(home, '.claude', 'agents')], unread, teams, checklists)
      if (out.block) { process.stderr.write(out.block); process.exitCode = 2 }
    } catch {
      // A guard must never break a tool call.
    }
  })
}
TEAM
# Git pre-push hook: the same file as global/git-hooks/pre-push (scripts/check.mjs keeps them equal).
# Every repo with scripts/pre-pr.mjs runs its CI pre-check before a push, so a red CI for a known check cannot happen.
mkdir -p "$HOME/.claude/claude-setup/git-hooks"
cat > "$HOME/.claude/claude-setup/git-hooks/pre-push" <<'PREPUSH'
#!/bin/sh
# Git pre-push hook for our own repos (install.mjs on the laptop, cloud/setup.sh in the cloud set core.hooksPath to this
# folder). A yverse-studio repo that ships scripts/pre-pr.mjs gets its CI pre-check before every push, on every machine,
# with or without Claude hooks (yskills 2026-11-08: laptop PRs only went red in CI). Other remotes and repos without the
# script are untouched; a repo's own .git/hooks/pre-push still runs afterwards. Skip once with PRE_PR_SKIP=1 (say why in the PR).
remote_url=$(git remote get-url origin 2>/dev/null)
case "$remote_url" in
  https://github.com/yverse-studio/*|git@github.com:yverse-studio/*|ssh://git@github.com/yverse-studio/*) ours=1 ;;
  *) ours= ;;
esac
if [ -n "$ours" ] && [ -z "$PRE_PR_SKIP" ] && [ -f scripts/pre-pr.mjs ]; then
  echo "pre-push: node scripts/pre-pr.mjs (what CI runs, tests included)"
  node scripts/pre-pr.mjs || { echo "pre-push: blocked, fix the failures above (PRE_PR_SKIP=1 to push anyway and say why in the PR)"; exit 1; }
fi
own="$(git rev-parse --git-common-dir 2>/dev/null)/hooks/pre-push"
if [ -x "$own" ]; then exec "$own" "$@"; fi
exit 0
PREPUSH
chmod +x "$HOME/.claude/claude-setup/git-hooks/pre-push"
if [ -z "$(git config --global --get core.hooksPath 2>/dev/null)" ] || [ "$(git config --global --get core.hooksPath)" = "$HOME/.claude/claude-setup/git-hooks" ]; then
  git config --global core.hooksPath "$HOME/.claude/claude-setup/git-hooks"
fi

# First copy of the boot files, so a session whose 3 s refresh fails still has them.
echo '{}' | node "$HOME/.claude/claude-setup/team-guard.mjs" start >/dev/null || echo "claude-setup: could not fetch the boot files"

# Permissions sync (docs/permissions.md): copies permissions (minus defaultMode, the thread keeps
# its own) and autoMode from main's global/settings.json into ~/.claude/settings.json. Run now and
# at every session start, so a merged change needs no environment rebuild. Never blocks.
# Gate round counter: the same file as global/gate-rounds.mjs (scripts/check.mjs keeps them equal); rule-guard calls it, threads run its CLI.
cat > "$HOME/.claude/claude-setup/gate-rounds.mjs" <<'GATE'
#!/usr/bin/env node
// Hard gate round counter (yskills 2026-11-12, vacation-game: a PR ran 11 gate rounds instead of 6, nothing counted, the
// coordinator released rounds itself, a gate asked to merge at 4.2). The one home of the rule is operator/gate.md (Rounds).
// The counter is a ledger file per asset (a PR or any named asset) in the project's shared folder, so a fresh thread goes on
// from it. rule-guard calls gateStep (PreToolUse) and gateBrief (UserPromptSubmit); this file is also the CLI threads use.
//   rounds 1-3: judged at 4.5 (4.8 when important)   rounds 4-6: only with a Fable director   round 7+: only with a card to yskills
// CLI: gate-rounds.mjs status|check|init|direct|card|picture|waive <asset> ...   (usage text below)
// Fail closed: a gate-shaped call whose check throws is refused. CLAUDE_SETUP_RULE_GUARD=off turns the hook (not the CLI) off.
import { execFileSync } from 'node:child_process'
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
const WRITERS = new Set(['rm', 'unlink', 'shred', 'mv', 'tee', 'truncate', 'dd', 'ln', 'install', 'touch', 'chmod', 'chown', 'rsync', 'cp', 'set-content', 'add-content', 'out-file', 'remove-item', 'new-item', 'copy-item', 'move-item', 'del', 'ri'])
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
const SETUP_VAR = /^CLAUDE_SETUP_[A-Z_]+=/
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

const GUARD_FILE = /\.claude[\\/]claude-setup[\\/](?:rule-guard|team-guard|gate-rounds)\.mjs$/
const CLI_VERBS = ['status', 'check', 'init', 'direct', 'card', 'picture', 'waive', 'merge', 'post']
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
function bashProblem(cmd, dir, ctx) {
  const { list, bad } = simpleCommands(cmd)
  if (bad && /\bgh\b|gate/.test(cmd)) return 'gate ledger: this command has unbalanced quotes and mentions gh or gate, so it cannot be read; write it plainly (gate.md, Rounds).'
  const dirRe = dir ? new RegExp(`${dir.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/\/+$/, '')}(?:/|$)`) : null
  const named = (w) => !/\s/.test(w) && (dirRe?.test(w) || /(?:project-files|\.claude\/claude-setup)\/gate(?:\/|$)/.test(w) || GUARD_FILE.test(w))
  const msg = 'gate ledger: the round counter is written only by gate-rounds.mjs (gate.md, Rounds), never by hand; the installed guards change only through a claude-setup PR.'
  if (list.some((s) => s.env) && list.some((s) => s.a0 === 'node' && s.args.some((a) => base(a) === 'gate-rounds.mjs'))) return 'gate ledger: CLAUDE_SETUP_* variables (the ledger dir, the guard switch) are not set in a call that runs the counter; they would point it at another ledger (gate.md, Rounds).'
  for (const s of list) {
    if (s.a0 === 'gh') { const r = ghProblem(s); if (r) return r }
    if (s.redirs.some((r) => !/\s/.test(r) && (named(r) || GUARD_FILE.test(r)))) return msg
    const script = s.a0 === 'node' ? s.args.find((a) => base(a) === 'gate-rounds.mjs') ?? s.args.find((a) => !a.startsWith('-')) : null
    if (script && base(script) === 'gate-rounds.mjs') {
      const at = s.args.indexOf(script)
      const verb = s.args[at + 1]
      if (!CLI_VERBS.includes(verb) || ['status', 'check'].includes(verb)) continue
      if (list.length !== 1 || /\$\(|`/.test(cmd)) return `gate ledger: "${verb}" runs as the only command of the call, without substitution, so its proof can be read (gate.md, Rounds).`
      const ref = s.args[s.args.indexOf('--ref') + 1]
      if (verb === 'init' && !(Number(s.args[s.args.indexOf('--round') + 1]) >= 1)) return 'gate ledger: init imports the rounds that already ran: --round <n> with n of 1 or more (gate.md, Rounds).'
      if (verb === 'direct' && !/fable/i.test(ctx.model ?? '')) return `gate ledger: only a Fable session records the director, this one runs on ${ctx.model ?? 'an unknown model'}. Ask the coordinator for a Fable thread (docs/TEAMS.md, Models line).`
      if (['card', 'picture', 'waive'].includes(verb) && !(ref && cardProof(ref, ctx.calls ?? []))) return `gate ledger: "${verb}" needs --ref <cmsg id> of a request_decision card this session posted (it was not found in this session).`
      if (verb === 'waive' && !(ctx.humanAfter?.(ref))) return 'gate ledger: waive needs yskills\' own answer on that card in this session; none arrived yet.'
      continue
    }
    const writes = WRITERS.has(s.a0.toLowerCase()) || (s.a0 === 'sed' && s.args.some((x) => /^-[a-zA-Z]*i|^--in-place/.test(x)))
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
export function gateStep(tool, input = {}, ctx = {}) {
  const dir = ctx.dir ?? ledgerDir()
  const file = String(input.file_path ?? '')
  if (/^(Write|Edit)$/.test(tool) && (file.includes('project-files/gate/') || (file.startsWith(`${dir}/`) && file.endsWith('.json')))) return 'gate ledger: the round counter is written only by gate-rounds.mjs (gate.md, Rounds), never by hand.'
  if (/^(Write|Edit|MultiEdit|NotebookEdit)$/.test(tool) && /\.claude[\\/]claude-setup[\\/](gate-rounds|rule-guard|team-guard)\.mjs$/.test(file)) return 'gate ledger: the installed guards are changed only through claude-setup (a PR), never in place.'
  if (tool === 'Bash' || tool === 'PowerShell') return bashProblem(String(input.command ?? ''), dir, ctx)
  if (tool === 'mcp__github__create_pull_request') {
    const text = `${input.title ?? ''}\n${input.body ?? ''}`
    return namesLook(text) && !pictureOk(text) ? `gate check: this PR names a hub, start screen, main menu or art/visual style but its body has no ${PICTURE_ASK}. A new one is shown to yskills as pictures with references from current games BEFORE the build; for work on an existing one write the "none, because" line.` : null
  }
  const asset = assetOf(input)
  if (!asset) return null
  if (MERGES.test(tool)) return mergeProblem(readLedger(dir, asset))
  if (!POSTS.test(tool)) return null
  const head = parseHeadline(input.body ?? input.comment ?? '')
  return head ? verdictProblem(dir, asset, head, ctx.dry) : null
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
  post --body-file <f>        count the verdict headline at the top of <f>, then post it with gh`
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
    if (l.rounds.length || !(n >= 1)) return fail('init: only for an asset without a ledger, with --round <n> (1 or more: the rounds that already ran)')
    return save({ ...l, rounds: Array.from({ length: n }, (_, i) => ({ n: i + 1, score: null, pass: false, at: 'imported' })) })
  }
  if (cmd === 'direct') {
    const plan = flag(rest, '--plan')
    if (lastRound(l) < FREE_ROUNDS) return fail(`direct: a director comes after round ${FREE_ROUNDS}, the ledger stands at ${lastRound(l)}`)
    if (!plan || read(plan).trim().length < 200) return fail('direct: --plan <file> with the Fable plan (goal, constraints, what changes, done-test) is required')
    return save({ ...l, director: { model: DIRECTOR, plan, round: lastRound(l), at: new Date().toISOString() } })
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
GATE

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
// conventional (Code), WebFetch in a cloud thread (Cloud threads: WebSearch, no Allow taps), a memory
// file write with a rule line (memory holds state only), and a reply that asks yskills for an Allow or a go, says "can't" with nothing tried, posts `Done:` without proof, or
// says nothing is open while the last thread board shows open threads, or asks him for something or names a
// thread without a clickable link (replyRule).
// stop: a thread that posted `Done:` resolves itself; a coordinator closes or nudges every finished
// thread on its last board and lists the board again when it is over two hours old (coordinatorCheck).
// prompt: a video link or a bare "stop" gets the matching CLAUDE.md line put next to the message, and
// the first message naming `Role: <role>` (the brief block, operator/briefs.md) gets that role's
// Roster row and playbook put into context, so a thread always knows what it is (yskills 2026-10-27).
// pre also refuses a headless Blender start while bl_server.py runs, and any Blender call before the session read
// NACHT-FIX-PLAN.md and the animator Fast loop (blenderServerBusy, blenderDocsMissing).
// pre also warns, never blocks, when a new PR in a repo with a PROGRESS.md leaves its `## Jetzt` block
// missing or untouched (docs/hq-rows.md, Jetzt block: HQ shows every project from that block).
// CLAUDE_SETUP_RULE_GUARD=off turns it off. It never breaks a tool call on its own errors.

import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { isIP } from 'node:net'
import { homedir, tmpdir } from 'node:os'
import { dirname, join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'

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

// The repeats yskills had to say most (audit 2026-10-27, docs/research/2026-10-27-repeats.md), as checks on a reply:
// asking him for an Allow or a go, "can't" with nothing tried, `Done:` with
// no proof, and "nothing open" while the board shows open or blocked threads.
const ASK_ALLOW = /\b(tap|press|click|hit|drück\w*|tipp\w*|klick\w*)\b[^.\n]{0,20}\b(allow|erlauben|zulassen)\b|\b(shall|should|can|may) i (go ahead|proceed|start|merge|push|continue)\b|\bwant me to\b|\b(soll|darf|kann) ich (das |es )?(jetzt )?(los|loslegen|anfangen|starten|mergen|pushen|weitermachen|machen)\b/i
const ASK_FIRST = /€|\b(money|geld|eur|euro|live key|stripe live|purchas\w*|kauf\w*|paid|bezahl\w*|kosten|ausgeb\w*|force-push\w*|rotat\w*|rotier\w*|e-?mail\w*|send mail|post(en|s)? public\w*|öffentlich\w*|delete (the )?live|database|datenbank\w*)\b/i
const CANT = /\b(i|we) (can['’]?t|cannot|am unable to|are unable to)\b|\b(ich kann|wir können) (das |es )?nicht\b/i
const TRIED = /^[\s>*_-]*(tried|versucht)\s*:/im
const DONE = /^[\s>*_]*Done:/m
// An ask of yskills (do, answer, approve, open) or a pointer to a thread carries a clickable link to the exact place:
// a thread link [title](#cmsg_…), a PR or page URL, [Project settings](#project-settings/<section>) (yskills 2026-11-10:
// "everything you want me to do or show with a link"). Home: docs/pc-claude-user.md (What still needs yskills' hands).
const NEEDS_YOU = /\b(du (musst|müsstest)(?![^.!?\n]{0,30}\b(nix|nichts|nicht)\b)|musst du|kannst du (bitte |mal |kurz )*(den |die |das )?\w+ (freigeben|erlauben|bestätigen|beantworten|hochladen|schicken|öffnen|reviewen|prüfen|verbinden)|bitte (tipp|klick|antwort|schau|gib|erlaub|freigeb|bestätig|prüf|check|lad|schick|öffne|verbind|wähl|approve|review)\w*|brauch\w* (ich )?(noch )?(von dir|dein\w*)|wartet? auf dich|waiting (on|for) you|you need to|you have to|can you (please )?(approve|allow|grant|answer|review|upload|send|open|connect|pick)|please (tap|click|answer|review|approve|allow|grant|open|connect|upload|send|pick|check)|needs? your (ok|approval|answer|review|allow|go|input)|siehe (den )?pr(?![\wäöüß])|see the pr\b)/i
const THREAD_REF = /\b(im|in( the| dem| den)?) ([\w-]+-)?thread\b(?!-)|\b[\w]+-thread\b(?!-)|\bthread\s*["„“'«]/i
const HAS_LINK = /https?:\/\/|\]\(#/
const NOTHING_OPEN = /\b(no blockers?|keine blocker|nothing (is )?(open|left|blocking|needed from you|needs you|waiting on you)|nichts (mehr )?(ist )?(offen|blockiert)|nothing else needs you)\b/i
// A memory line that reads as a rule: it opens with always/never/rule (not "immer noch", not "rule-guard")
// and has a must/should/use later; a line with a PR, issue or date is state, never a rule.
export const RULE_LINE = /^(?![^\n]*(\bPR \d|#\d|\d{4}-\d{2}))\s*[-*]?\s*(\*\*)?(always|never|immer(?! noch)|nie|niemals|rule|regel)(?=[:\s])[^\n]*\b(must|should|soll|muss|do|use|never|nie)\b/i
// board: the thread board, or a function that builds it; read only when a reply says nothing is open.
export function replyRule(text, attached = [], board = null) {
  if (ASK_ALLOW.test(text) && !ASK_FIRST.test(text)) return 'rule-guard: do not ask yskills for an Allow or a go (CLAUDE.md, Auto-run): pick the sensible default and do it; a refused call takes its fixed way around (docs/permissions.md, Layer 3). Only the ask-first items wait, and a choice is a request_decision card.'
  if (CANT.test(text) && !TRIED.test(text)) return 'rule-guard: "can\'t" needs every route tried first (CLAUDE.md, Never "can\'t"): another tool, a workflow with the org token, the laptop (RC), another approach. Try them; if it is still impossible, add a line `Tried: <route, route, route>` with the one step only his hands can do.'
  if ((NEEDS_YOU.test(text) || THREAD_REF.test(text)) && !HAS_LINK.test(text)) return 'rule-guard: this reply asks yskills for something or points at a thread without a link (docs/pc-claude-user.md, What still needs yskills\' hands). Give the exact place as a clickable link: a thread [title](#cmsg_…), the PR or page URL, [Project settings](#project-settings/<section>), or the connect link.'
  if (DONE.test(text) && !/https?:\/\//.test(text) && !(attached ?? []).length) return 'rule-guard: a `Done:` line carries its proof (CLAUDE.md, Honesty): the live link, the merged PR link or an attached screenshot or test output. Add it, then post.'
  const listed = NOTHING_OPEN.test(text) && (typeof board === 'function' ? board() : board)
  if (listed) {
    const open = [...listed.finished.filter((t) => !listed.told.has(t.id)), ...listed.blocked]
    if (open.length) return `rule-guard: you say nothing is open, but the board you listed shows ${open.length} open thread(s): ${open.slice(0, 5).map((t) => `"${t.title}" (${t.state})`).join(', ')}. Name what is really open, or close the finished ones first.`
  }
  return null
}

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

// No guessing (yskills 2026-11-03: "kein raten, immer fragen bis kein fog mehr da ist"): a reply that
// rests on an assumption names what was checked, or asks him on a card instead.
const GUESS = /\b(ich (nehme|denke|glaube|schätze|vermute)[^.\n]{0,12}\ban\b|vermutlich|wahrscheinlich|ich rate|i (assume|guess|suppose)|probably|presumably|my guess)\b/i
export const guessing = (text) => GUESS.test(text) && !REASON.test(text)

// No purchase without his explicit OK (yskills 2026-11-03): a browser or shell step to a checkout, cart,
// billing or upgrade page is blocked; his own app on a local host and a Stripe test session pass.
// A whole path segment only, so docs pages ("/docs/in-app-purchases", "/upgrade-guide") pass.
const BUY_PATH = /\/(checkout|cart|warenkorb|kasse|purchase|buy|kaufen|bestellen|place-order)(\/|$)/i
const BUY_HOST = /^(checkout\.stripe\.com|buy\.stripe\.com|www\.paypal\.com|pay\.google\.com)$/i
const BROWSER_STEP = /navigate|browser_batch|tabs_create|preview_start/
const DOCS_HOSTS = /^docs\.(stripe|github|paypal)\.com$/i // hosts that serve docs only
const DOCS_PATH_HOSTS = /^(developers\.cloudflare\.com|nuxt\.com|create\.roblox\.com|developer\.apple\.com|developers\.google\.com)$/i // docs under /docs only
const LOCAL_HOST = /^(localhost|.*\.(localhost|test|local))$/i
const isPurchase = (url) => {
  try {
    const u = new URL(url)
    const host = u.hostname.replace(/^\[|\]$/g, '').replace(/\.$/, '').toLowerCase()
    if (LOCAL_HOST.test(host) || (isIP(host) && privateIp(host))) return false // his own app on a loopback or private address
    if (host === 'checkout.stripe.com' && /^\/c\/pay\/cs_test_\w+$/.test(u.pathname)) return false // a Stripe test session
    if (DOCS_HOSTS.test(host) || (DOCS_PATH_HOSTS.test(host) && /^\/docs(\/|$)/.test(u.pathname))) return false // reading about checkout is no purchase
    return BUY_HOST.test(host) || BUY_PATH.test(u.pathname)
  } catch { return false }
}
const URL_TOKEN = /https?:\/\/[^\s"'\\<>]+|\b(?:[a-z0-9-]+\.)+[a-z]{2,}(?::\d+)?\/[^\s"'\\<>]*/gi // with scheme, or a bare host/path
export function purchaseUrl(tool, input = {}) {
  if (!BROWSER_STEP.test(tool) && !/^(Bash|PowerShell)$/.test(tool)) return null
  const tokens = JSON.stringify(input).match(URL_TOKEN) ?? []
  return tokens.map((t) => (/^https?:\/\//i.test(t) ? t : 'https://' + t)).find(isPurchase) ?? null
}

// A clean folder structure (yskills 2026-11-04): a folder with a `.layout.json` ({ "allow": [globs], "why": "..." })
// takes writes only at the paths its globs allow, relative to that folder. The nearest one up the tree applies.
const LAYOUT_DEPTH = 12
// A glob as a regex: ** spans folders, * and ? stay inside one name; dotfiles match like any name (path.matchesGlob skips them).
const globRe = (glob) => new RegExp(`^${glob.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*\*\/?|\*|\?/g, (m) => (m === '?' ? '[^/]' : m === '*' ? '[^/]*' : '.*'))}$`)
export function offLayout(file) {
  if (!file) return null
  let dir = dirname(file)
  for (let i = 0; i < LAYOUT_DEPTH; i++) {
    const spec = join(dir, '.layout.json')
    if (existsSync(spec)) {
      let layout
      try { layout = JSON.parse(readFileSync(spec, 'utf8')) } catch { return null } // a broken layout never blocks
      const rel = relative(dir, file).split(/[\\/]/).join('/')
      const allow = Array.isArray(layout.allow) ? layout.allow : []
      return rel === '.layout.json' || allow.some((g) => globRe(g).test(rel)) ? null : { rel, root: dir, why: String(layout.why ?? 'see the file') }
    }
    const up = dirname(dir)
    if (up === dir) return null
    dir = up
  }
  return null
}

// board: the thread board this session last listed (threadBoard), or a function that builds it, for claims that nothing is open.
export function decide(tool, input = {}, env = {}, published = [], board = null) {
  const buy = purchaseUrl(tool, input)
  if (buy) return `rule-guard: ${buy.slice(0, 80)} is a checkout or cart page (CLAUDE.md, Ask first): no purchase without yskills' explicit OK. Put item, price and total on a request_decision card; after his yes he places the order himself.`
  const off = /^(Write|Edit|NotebookEdit)$/.test(tool) && offLayout(String(input.file_path ?? input.notebook_path ?? ''))
  if (off) return `rule-guard: ${off.rel} is outside the agreed folder structure of ${off.root} (its .layout.json: ${off.why}). Put it where the layout says, or ask yskills on a card before a new folder.`
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
    if (guessing(text)) return 'rule-guard: this reply guesses ("probably", "vermutlich", "I assume") (CLAUDE.md, No fog). Look it up first (old notes, HANDOFF.md, lessons, the repo), then say what you checked; what is still open goes to yskills as one request_decision batch.'
    const lines = text.split('\n').filter((l) => l.trim()).length
    if (text.length > REPLY_MAX_CHARS || lines > REPLY_MAX_LINES) return `rule-guard: this reply has ${text.length} chars and ${lines} lines; the cap is ${REPLY_MAX_CHARS} and ${REPLY_MAX_LINES} (CLAUDE.md, Replies). Lead with the result in a few lines; put the rest in a file under /mnt/project-files/ and attach it.`
    const why = replyRule(text, input.attached_outputs, board)
    if (why) return why
  }
  if (/^(Write|Edit)$/.test(tool) && /[\\/]memory[\\/].*\.md$/i.test(String(input.file_path ?? ''))) {
    const rule = String(input.content ?? input.new_string ?? '').split('\n').find((l) => RULE_LINE.test(l))
    if (rule) return `rule-guard: memory holds state only (docs/MAP.md, Where a lesson goes): "${rule.trim().slice(0, 80)}" reads as a rule. Put it in its home in claude-setup through a PR and keep only a pointer here.`
  }
  const republish = input.file_path && !input.type_url && published.includes(input.file_path)
  const newArtifact = (tool === 'Artifact' && !input.url && !input.asset && !republish && [undefined, 'publish'].includes(input.action)) || tool === 'mcp__remote-devices__create_artifact'
  if (newArtifact && env.CLAUDE_SETUP_NEW_ARTIFACT !== 'yes') return 'rule-guard: the Company XY Artifact is the only Artifact there is (CLAUDE.md, Dashboard): no votes, galleries or one-off pages. Update it with its `url` (docs/hq-rows.md) or write a file under /mnt/project-files/. If yskills asked for a new one in his own words, say so in one line and retry with CLAUDE_SETUP_NEW_ARTIFACT=yes in the environment.'
  if (/^mcp__.*Claude_Browser__/.test(tool) && env.CLAUDE_SETUP_BROWSER !== 'app') return "rule-guard: your browser is yskills' Owner-Chrome on the laptop (CLAUDE.md, Tools; companyxy 2026-11-12: a Researcher opened the Claude app's browser instead). Load the `mcp__claude-in-chrome__*` tools with ToolSearch and use them for every web action; for a plain page use `node ~/.claude/claude-setup/rule-guard.mjs read <url>`. Only when yskills asked for the app browser in his own words: say so in one line and retry with CLAUDE_SETUP_BROWSER=app in the environment."
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
  const head = `rule-guard: you are the ${role.name} of this task, one role only (docs/TEAMS.md, Coordinator or thread). ${role.row} Write \`Role: ${role.name} · ${role.path ?? 'no playbook'}\` plus the skills you loaded as the first line of your first checklist, so yskills sees it.`
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

// Wires the receipt: only a thread whose role card was injected (roleContext wrote the role file) and only its own calls, not a subagent's.
function receiptBlock(tool, input, session, cwd, agentId, transcript) {
  if (tool !== 'mcp__hearthbot__post_message' || !session || agentId) return null
  const role = read(join(tmpdir(), `claude-setup-role-${String(session).replace(/\W/g, '')}`)).trim()
  if (!role) return null
  const t = transcript()
  if (!/reason=\\?"spawn/.test(t)) return null // a hooked project chat that was handed a brief is no thread (the canary covers it)
  const root = setupRoot(cwd)
  const rules = ['CLAUDE.md', 'docs/TEAMS.md'].map((f) => read(join(root, f))).join('\n')
  const brief = spawnPrompt('', t).replace(/<\/?(wake|message|thread|project|relay|coordinator-relay|cited|note|system-note)\b[^>]*>/g, '\n')
  const path = roleOf(brief, read(join(root, 'docs', 'TEAMS.md')))?.path
  // No checkout (only the boot copy): nothing can be checked, so the receipt says that instead of a false `none`.
  const status = existsSync(join(root, 'config', 'plugins.json')) ? skillStatus(wanted(root, path ? read(join(root, path)) : '', brief), { root, cwd }) : { loaded: [], missing: [], unknown: true }
  return receiptMissing(tool, input, threadReceipt(role, brief, t, rules, status), t) ?? (receiptSent(t) ? null : fallbackUnread(status, t))
}

// M48: a Reviewer brief with a valid `Topic:` is given that topic's checklist plus the Scored gates section of gate.md instead of the code playbook.
const mdSection = (text, heading) => { const a = text.indexOf(`\n## ${heading}`); if (a < 0) return ''; const b = text.indexOf('\n## ', a + 1); return text.slice(a + 1, b < 0 ? undefined : b).trim() }
export async function topicPlaybook(brief, root) {
  let guard
  try { guard = await import(new URL('./team-guard.mjs', import.meta.url)) } catch { return null }
  const plain = brief.replace(/[*_`]/g, '')
  const topic = plain.match(/^[ \t>-]*Topic:[ \t]*([^\n]*)/im)?.[1].trim()
  const checklists = read(join(root, guard.CHECKLISTS)) || fetchRaw(guard.CHECKLISTS)
  if (!topic || !/^[ \t>-]*Role:[ \t]*Reviewer\b/im.test(plain) || guard.badTopic(plain, checklists)) return null
  const name = guard.topicNames(checklists).find((n) => n.toLowerCase() === topic.toLowerCase())
  const scored = mdSection(read(join(root, '.claude/skills/operator/gate.md')) || fetchRaw('.claude/skills/operator/gate.md'), 'Scored gates')
  return { name, text: `Topic: ${name}. Your whole job is this checklist, scored by the rule below; judge only these rows.\n\n${mdSection(checklists, name)}\n\n${scored}` }
}

async function roleContext(prompt, cwd, session) {
  const once = join(tmpdir(), `claude-setup-role-${String(session).replace(/\W/g, '')}`)
  // Only a session's brief: a project wake that is not the spawn one quotes other threads' briefs.
  if (!session || existsSync(once) || (/<(wake|relay|coordinator-relay)\b/.test(prompt) && !/<(wake|relay)\b[^>]*reason="spawn"/.test(prompt))) return ''
  const root = setupRoot(cwd)
  const role = roleOf(prompt, read(join(root, 'docs', 'TEAMS.md')))
  if (!role) return ''
  writeFileSync(once, role.name)
  const topic = role.name === 'Reviewer' ? await topicPlaybook(prompt, root) : null
  if (topic) return roleCard({ ...role, path: `${'.claude/skills/operator/checklists.md'} (${topic.name}) and gate.md, Scored gates` }, topic.text)
  return roleCard(role, role.path ? read(join(root, role.path)) || fetchRaw(role.path) : '')
}

// The thread side of the team check (routing test 2026-10-27: a project chat may run without hooks, so a
// bad start can reach the thread). The spawn brief is checked against docs/TEAMS.md with team-guard's own
// rules; a bad one tells the thread to do no work and send the start back. Returns '' when it passes.
// The model this session runs on: the newest assistant entry's `message.model` in the transcript (the
// harness writes it on every reply; a tool input's `model` is not it), else the env the app sets.
// Unknown is null, and nothing is checked.
export function sessionModel(transcript = '', env = process.env) {
  let model = null
  for (const line of String(transcript).split('\n')) {
    if (!line.includes('"assistant"')) continue
    try { const e = JSON.parse(line); if (e.type === 'assistant' && typeof e.message?.model === 'string') model = e.message.model } catch { /* a cut line */ }
  }
  return model ?? env.ANTHROPIC_MODEL ?? null
}
// Gate roles grade work and need the gate rules (yskills 2026-11-04: "if you don't even get the gate right").
export const GATE_ROLES = /^(Tester|Reviewer|Security|Legal|Playtester|Hook Checker|Critic|Story Editor|Evaluator)$/i
export const GATE_PRIOR = /^[ \t>-]*Prior art:[^\n]*\bgate\.md\b/im

export async function briefCheck(prompt, cwd, model = null) {
  if (!/<(wake|relay)\b[^>]*reason=\\?"spawn/.test(prompt)) return ''
  let guard
  try { guard = await import(new URL('./team-guard.mjs', import.meta.url)) } catch { return '' }
  const teams = read(join(setupRoot(cwd), 'docs', 'TEAMS.md'))
  const brief = prompt.replace(/\\[nt]/g, '\n').replace(/<\/?(wake|message|thread|project|relay|coordinator-relay|cited|note|system-note)\b[^>]*>/g, '\n')
  const missing = guard.missingLines(brief)
  const why = !guard.stamped(brief) ? 'no `Role: · Kit: · Size:` stamp line'
    : guard.badTeam(brief, teams) ?? guard.badTopic(brief, read(join(setupRoot(cwd), guard.CHECKLISTS))) ?? (missing.length ? `brief lines missing: ${missing.join(', ')}` : null)
  if (why) return `Brief check (docs/TEAMS.md): this start breaks the team rules: ${why}. Do no work: send this reason and the corrected Role, Kit and Size to the coordinator (message_coordinator), then stop.`
  // The coordinator runs without hooks, so its model pick and gate brief are checked here, on the thread side.
  const wrong = model && guard.wrongModel(brief, model, teams)
  if (wrong) return `Model check (docs/TEAMS.md, Roster): this thread runs on ${wrong.tier}, but the ${wrong.role} runs on ${wrong.allowed.join(' or ')}. Do no work: tell the coordinator (message_coordinator) to restart it on that model, then stop.`
  const gate = roleOf(brief, teams)?.name
  if (gate && GATE_ROLES.test(gate) && !GATE_PRIOR.test(brief.replace(/[*_`]/g, ''))) return `Gate check (.claude/skills/operator/gate.md): a ${gate} brief names the gate rules in its \`Prior art:\` line (gate.md and the kit's checks). Do no work: ask the coordinator (message_coordinator) for the brief with them, then stop.`
  const role = guard.stamped(brief) && /\bSize:[ \t]*[ML]\b/i.test(brief.replace(/[*_`]/g, '')) && roleOf(brief, teams)?.name
  return role ? `Title check (docs/TEAMS.md, Roster "Runs as"): this thread's title starts with \`${role} · \`; if it does not, rename_thread to \`${role} · <what>\` first.` : ''
}

// Spawn rule 4 (proven 2026-11-08: the hook-less coordinator started a thread with no `model` and `Model: default`
// although yskills asked for a "Fable-Thread"; it ran on Sonnet). The thread compares the model the brief or the cited
// yskills text names with the one it runs on (latest assistant entry of the transcript, else CLAUDE_MODEL).
const TIER = /\b(?:claude-)?(fable|opus|sonnet|haiku)\b[\w.-]*/i
export function modelCheck(brief, transcript, envModel = process.env.CLAUDE_MODEL) {
  const named = brief.match(/^[ \t]*[*_`]*Model:?[*_`]*[ \t]*[*_`]*([^\n]*)/im)?.[1].match(TIER)
  const wanted = (named ?? [...brief.matchAll(/<cited\b[^>]*author=\\?"user\\?"[^>]*>([\s\S]*?)<\/cited>/g)].map((m) => m[1].match(TIER)).find(Boolean))?.[1]?.toLowerCase()
  let running = ''
  for (const line of transcript.split('\n')) {
    if (!line.includes('"assistant"')) continue
    try { const e = JSON.parse(line); if (e.type === 'assistant' && e.message?.model) running = e.message.model } catch { /* not JSON */ }
  }
  running = (running || envModel || '').toLowerCase()
  if (!wanted || !running || running.includes(wanted)) return ''
  return `Model check (docs/TEAMS.md, Spawn rule 4): the brief or yskills asks for ${wanted}, this thread runs on ${running}. Do no work: message_coordinator with Role, Kit, Size and \`model: ${wanted}\` for a restart, then stop.`
}

function modelOnce(brief, transcriptPath, session) {
  const once = join(tmpdir(), `claude-setup-model-${String(session).replace(/\W/g, '')}`)
  if (!session || existsSync(once) || !/<(wake|relay)\b[^>]*reason=\\?"spawn/.test(brief)) return ''
  const out = modelCheck(brief, transcriptPath && existsSync(transcriptPath) ? read(transcriptPath) : '')
  if (out) writeFileSync(once, '')
  return out
}

// Relay and first wake queue together and the hook fires once, on the second prompt (issue #335): the
// spawn brief is then the session's own spawn entries in the transcript, the relay (the brief) and the
// wake (the marker). Only a user entry that opens with the tag counts, so a chat that merely quotes a spawn is no thread.
export function spawnPrompt(prompt, transcript) {
  const found = []
  for (const line of transcript.split('\n')) {
    if (!/reason=\\?"spawn/.test(line)) continue
    try {
      const entry = JSON.parse(line)
      const content = entry.message?.content
      const text = typeof content === 'string' ? content : (content ?? []).map((c) => c?.text ?? '').join('\n')
      // A project thread's first entry starts with a <session-context> block, the spawn wake follows it
      // (2026-11-12: anchored at the entry's start, the lookup found no brief and no role card arrived).
      const body = text.replace(/^\s*<session-context\b[\s\S]*?<\/session-context[^>]*>\s*/, '')
      if (entry.type === 'user' && /^\s*<(wake|relay)\b[^>]*reason="spawn"/.test(body)) found.push(body)
    } catch { /* not a JSON line */ }
  }
  return found.length ? found.join('\n') : prompt
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

// The transcript's tool calls in order, each with its result text and time: [{ name, input, result, at }].
// Luna (yskills 2026-10-27: "a cute e-girl with lots of kaomoji, in every chat, project and thread"): the tone of
// every reply to him, nothing else. The canary line (team-guard.mjs) is the proof the rules loaded; the tone is a soft drift signal.
const PERSONA_FALLBACK = { name: 'Luna', description: '20, cute e-girl', personality: 'flirty, playful, German like him, at least one kaomoji per reply, e.g. (◕‿◕)', scenario: '', mes_example: '' }
// config/persona.json, a Character Card V2 (yskills edits it; team-guard keeps a fresh copy in ~/.claude/claude-setup), else the fallback.
export function persona(root) {
  let p = PERSONA_FALLBACK
  try { p = { ...p, ...JSON.parse(read(join(root, 'config', 'persona.json'))).data } } catch { /* no or broken file: fallback */ }
  const field = (v, max) => String(v ?? '').replace(/\{\{char\}\}/g, String(p.name).slice(0, 20)).replace(/\{\{user\}\}/g, 'yskills').replace(/<START>\s*/g, '').replace(/\s+/g, ' ').trim().slice(0, max)
  const examples = field(p.mes_example, 520)
  return `Persona: every reply to yskills (post_message, or your chat text where there is none) is ${field(p.name, 20)}: ${field(p.description, 200)} ${field(p.personality, 240)}. ${field(p.scenario, 200)}${examples ? ` Voice: ${examples}` : ''} Only replies to him: commits, PR bodies, code, docs, briefs and messages to other threads stay plain. Tone only: content, honesty, no yes-saying and the reply cap stay as they are; rule-guard blocks a reply with no kaomoji.`
}
const KAOMOJI = /[◕‿ω꒳ᴗ･˘ᵕ◡╹≧≦∀ヾﾉ✧♡☆✿ʕʔﾟ▽´`ツДᴥ¬▼□╯ᵔ｡]|\^[_ω.]?\^|[;>][_ω]?[<;]|\(\s*[TＴ][_ω.]?[TＴ]\s*\)|\b(uwu|owo)\b|(^|\s)(:3|;\))(\s|$)|m\(_ _\)m/i
// Nothing opens on yskills' screen while Claude works, unless he asked (yskills 2026-11-11: "ich will nicht das mir
// irgendwas in gesicht springt"). Screenshots and renders run headless. `# yskills asked` on the command lets it through.
// commandsOf: the commands of a shell line, split outside quotes; heredoc bodies are text, not commands.
const commandsOf = (cmd) => {
  const text = cmd.replace(/@(['"])[ \t]*\n[\s\S]*?\n\1@/g, "''").replace(/<<-?\s*(['"]?)([^\s'"<>;&|()]+)\1[^\n]*\n[\s\S]*?\n\s*\2(?=\s|\)|$)/g, '')
  const out = []
  let cur = ''
  let quote = ''
  for (let i = 0; i < text.length; i++) {
    const ch = text[i]
    if (quote === '"' && ch === '\\' && text[i + 1] === '"') { cur += '\\"'; i++; continue }
    if (quote) { if (ch === quote) quote = '' } else if (ch === '"' || ch === "'") quote = ch
    else if (ch === '#' && /(^|\s)$/.test(cur)) { while (i + 1 < text.length && text[i + 1] !== '\n') i++; continue }
    else if (';&|({\n'.includes(ch)) { out.push(cur); cur = ''; continue }
    cur += ch
  }
  return [...out, cur].map((c) => c.trim().replace(/^}\s+/, '').replace(/^\$[\w:]+\s*=\s*/, '')).filter(Boolean)
}
const WINDOW_APPS = /^(explorer|invoke-item|ii|xdg-open|notepad|mspaint|rundll32)$/
const BROWSERS = /^(chrome|google-chrome|chromium|chromium-browser|msedge|firefox|brave)$/
const flag = (args, re) => new RegExp(`(^|\\s)(${re})(\\s|$)`, 'i').test(args)
function opensOne(command, depth = 0) {
  const m = command.replace(/^(\w+=\S*\s+)+/, '').match(/^(?:"([^"]*)"|'([^']*)'|(\S+))\s*([\s\S]*)$/)
  if (!m || depth > 3) return false
  const exe = (m[1] ?? m[2] ?? m[3]).split(/[\\/]/).pop().replace(/\.exe$/i, '').toLowerCase()
  const args = m[4]
  const inner = (text) => commandsOf(text.trim().replace(/^(["'])([\s\S]*)\1$/, '$2')).some((c) => opensOne(c, depth + 1))
  // A wrapper's own flags and numbers come before the command it runs (`timeout 60`, `npx -y`, `xargs -I{}`).
  if (/^(npx|sudo|env|time|nohup|timeout|xargs|wsl)$/.test(exe)) return inner(args.replace(/^((-\S*|\d+\w?)\s+)+/, ''))
  if (exe === 'cmd' && /(^|\s)\/[ck]\s/i.test(args)) return inner(args.replace(/^[\s\S]*?\/[ck]\s+/i, ''))
  if (/^(powershell|pwsh|bash|sh|zsh)$/.test(exe) && /(^|\s)-(c|command)\s/i.test(args)) return inner(args.replace(/^[\s\S]*?-(c|command)\s+/i, ''))
  if (exe === 'node' && /laptop-job\.mjs\b[\s\S]*?\s--\s/.test(args)) return inner(args.replace(/^[\s\S]*?\s--\s+/, ''))
  if (/^(start-process|saps)$/.test(exe)) return !/-WindowStyle\s+Hidden|-NoNewWindow/i.test(args)
  if (exe === 'start') return !flag(args, '/b')
  if (WINDOW_APPS.test(exe)) return true
  if (BROWSERS.test(exe)) return !flag(args, '--headless(=\\S+)?|--version')
  if (exe === 'blender') return !flag(args.split(/\s--(\s|$)/)[0], '-b|--background|--version|-v|--help|-h|--command|-c')
  if (exe === 'playwright') return flag(args, '--headed|--ui|open|codegen|show-report|show-trace')
  if (/^(python\d?|py)$/.test(exe)) return /(^|\s)-m\s+webbrowser\b/.test(args)
  return false
}
export function opensWindow(tool, input = {}) {
  const cmd = tool === 'Bash' ? String(input.command ?? '') : ''
  if (!cmd || /#\s*yskills asked/i.test(cmd) || !commandsOf(cmd).some((c) => opensOne(c))) return null
  return "rule-guard: this opens a window on yskills' screen (docs/pc-claude-user.md, No windows): nothing pops up while Claude works unless he asked. Run it headless (Playwright or `--headless`, `blender -b`, `Start-Process -WindowStyle Hidden`), or, when he asked to see it, end the command with `# yskills asked`."
}
// The Archivist documents scripts and workflows; yskills' references are filed by the laptop lane, never by it
// (roles/archivist.md; yskills 2026-11-11). role: the session's role, as roleContext stored it. Only where a file
// lands counts: reading or backing up a reference folder is fine, and so is an index file (.md, .tsv, .json).
const REF_DIR = /(^|[\\/])(refs?|references?|referenzen|reference-images)([\\/]|$)/i
const INDEX_FILE = /\.(md|tsv|csv|json|txt)$/i
const DEST_FLAG = { cp: /^(-t|--target-directory)$/, mv: /^(-t|--target-directory)$/, tar: /^-C$/, unzip: /^-d$/, curl: /^(-\w*o|--output)$/, wget: /^(-O|-P)$/, 'expand-archive': /^-Destination(Path)?$/i, 'copy-item': /^-Destination$/i, 'move-item': /^-Destination$/i }
const FILE_VERBS = /^(mv|cp|rsync|move|copy|robocopy|ln|move-item|copy-item|tar|unzip|expand-archive|curl|wget)$/
const lands = (dest) => Boolean(dest) && !dest.includes('://') && !/backup/i.test(dest) && REF_DIR.test(dest) && !INDEX_FILE.test(dest)
function filesIntoRefs(command) {
  const words = (command.match(/"[^"]*"|'[^']*'|\S+/g) ?? []).map((t) => t.replace(/^["']|["']$/g, ''))
  const out = words.findIndex((t) => /^>>?$/.test(t))
  if (lands(out >= 0 ? words[out + 1] : (command.match(/(?:^|\s)>>?([^\s>&]+)/) ?? [])[1])) return true
  const at = /^(git|sudo)$/i.test(words[0] ?? '') ? 1 : 0
  const verb = (words[at] ?? '').toLowerCase()
  if (!FILE_VERBS.test(verb)) return false
  const args = words.slice(at + 1, out >= 0 ? out : undefined)
  const named = DEST_FLAG[verb] ? args.findIndex((t) => DEST_FLAG[verb].test(t)) : -1
  const plain = args.filter((t) => !t.startsWith('-') && !/^\/[A-Za-z]+(:\S*)?$/.test(t))
  const last = verb === 'robocopy' ? plain[1] : plain.at(-1)
  const dest = named >= 0 ? args[named + 1] : DEST_FLAG[verb] && !/-item$|^(cp|mv)$/.test(verb) ? '' : last
  return lands(dest) && (named >= 0 || verb === 'robocopy' || plain.length < 2 || plain.slice(0, -1).some((t) => !INDEX_FILE.test(t)))
}
export function archivistFiles(tool, input = {}, role = '') {
  if (String(role ?? '').trim() !== 'Archivist') return null
  const path = /^(Write|Edit|NotebookEdit)$/.test(tool) ? String(input.file_path ?? input.notebook_path ?? '') : ''
  const cmd = tool === 'Bash' ? String(input.command ?? '') : ''
  const files = (REF_DIR.test(path) && !INDEX_FILE.test(path)) || commandsOf(cmd).some(filesIntoRefs)
  return files ? 'rule-guard: the Archivist documents scripts, workflows and gate passes and keeps the indexes; it never files reference material (operator roles/archivist.md). Hand this to the coordinator in one line (message_coordinator): references go to the laptop lane. An index entry (.md, .tsv, .json) is fine.' : null
}
// A skill idea becomes a PR through the new-skill skill, never a saved account skill (a second rule source outside git,
// loaded in every thread of every project). The platform tool's card is a signal; saving it is the problem.
export function proposeSkillsBlocked(tool) {
  return /(^|__)propose_skills$/.test(tool) ? 'rule-guard: no propose_skills card (CLAUDE.md, How to work, Lessons stick; skill new-skill): a saved card becomes an account skill outside git, no PR, no gate, loaded in every thread of every project. Use the new-skill skill: check docs/MAP.md for an existing home, then batch the skill into the next claude-setup PR (or an unpushed patch in /mnt/project-files/<project>/batch/claude-setup/).' : null
}

export function kaomojiMissing(tool, input) {
  if (tool !== 'mcp__hearthbot__post_message' || KAOMOJI.test(String(input.text ?? ''))) return null
  return 'rule-guard: every reply to yskills is Luna and carries at least one kaomoji, e.g. (◕‿◕) or ٩(◕‿◕)۶ (his ask 2026-10-27; tone only, the content stays). Add one, then retry.'
}

// The coordinator's first reply opens with the canary line team-guard wrote at start (team-guard.mjs, canary).
export function canaryMissing(tool, input, line, transcript) {
  if (tool !== 'mcp__hearthbot__post_message' || !line.trim()) return null
  if (String(input.text ?? '').trimStart().startsWith(line.trim())) return null
  const t = transcript()
  if (/reason=\\?"spawn/.test(t)) return null // a thread is no project chat
  // Until one reply carried a canary and went out (a blocked try has a hook error as its result; a later rules hash still counts).
  if (toolCalls(t).some((c) => c.name === tool && c.result && !/rule-guard:|hook error/i.test(c.result) && String(c.input.text ?? '').trimStart().startsWith('Luna · rules #'))) return null
  return `rule-guard: your first reply in this session opens with the canary line, verbatim, so yskills sees the rules loaded (docs/USING.md, Start a project): ${line.trim()}`
}

// The thread's start receipt (yskills 2026-11-12: "every thread says its role loaded, with its skills, enforced by a hook, not just text").
// The line is built here from what the transcript really shows: the brief's Role/Kit/Size, the Skill tool calls so far, and a hash of
// the rule files (the same one as the coordinator canary). The model only copies it; a first reply without it is blocked once with the
// exact line. It proves the role card was injected and which skills were called, not that the model heeds them. Only a post_message
// is checked: a thread whose first visible act is a decision card shows no receipt there (accepted, documented in docs/MAP.md).
// The skills and agents a role names (the backticked words of its playbook's `Uses:` line, plus the brief's `Skills:` words),
// kept to names claude-setup really has: a skill folder, an agent file or a global plugin. A word that is none of those is prose.
function wanted(root, playbook, brief) {
  const ls = (d) => { try { return readdirSync(join(root, d)) } catch { return [] } }
  const known = new Set([...ls('.claude/skills'), ...ls('.claude/agents').map((f) => f.replace(/\.md$/, '')), ...[...read(join(root, 'config', 'plugins.json')).matchAll(/"id":\s*"([\w-]+)@/g)].map((m) => m[1])])
  const uses = playbook.match(/^[ \t>-]*\**Uses:?\**[^\n]*/m)?.[0] ?? ''
  const said = brief.replace(/[*_`]/g, '').match(/^[ \t>-]*Skills:([^\n]*)/m)?.[1] ?? ''
  return [...new Set([...[...uses.matchAll(/`([a-z0-9-]+)`/g)].map((m) => m[1]), ...said.split(/[^a-z0-9-]+/)])].filter((n) => known.has(n))
}

// Whether each name can really load in this thread (design skills were absent in project threads and nothing said so: the plugin cache
// kept an old copy). A skill or agent loads from the user's skills, an installed plugin or the checkout the thread runs in.
// `missing` names the claude-setup file to read instead. Pure fs, so a test can point it at a fake home.
export function skillStatus(names, { root, home = process.env.CLAUDE_SETUP_HOME || homedir(), cwd = process.cwd() } = {}) {
  let plugins = []
  try { plugins = Object.values(JSON.parse(read(join(home, '.claude', 'plugins', 'installed_plugins.json'))).plugins ?? {}).flat().map((p) => p.installPath) } catch { /* no plugins installed */ }
  const bases = [join(home, '.claude'), join(cwd, '.claude'), ...plugins].filter(Boolean)
  const found = (n) => bases.some((b) => existsSync(join(b, 'skills', n, 'SKILL.md')) || existsSync(join(b, 'agents', `${n}.md`)) || existsSync(join(b, n, 'skills', n, 'SKILL.md')))
  const fallback = (n) => [`.claude/skills/${n}/SKILL.md`, `.claude/agents/${n}.md`].find((f) => existsSync(join(root, f))) ?? null
  const loaded = names.filter(found)
  return { loaded, missing: names.filter((n) => !found(n)).map((n) => ({ name: n, path: fallback(n) })) }
}
export function missingNote({ missing, unknown }) {
  if (unknown) return 'missing: unknown (no claude-setup checkout here; add_repo yverse-studio/claude-setup and read your role skills from it)'
  if (!missing.length) return 'missing: none'
  const files = missing.filter((m) => m.path), bare = missing.filter((m) => !m.path)
  return `missing: ${missing.map((m) => m.name).join(', ')} (${[files.length && `read ${files.map((m) => m.path).join(', ')} instead`, bare.length && `no file for ${bare.map((m) => m.name).join(', ')}`].filter(Boolean).join('; ')})`
}
// A thread that says a skill is missing must have read the file it uses instead (a Read or a shell command naming it) before its first reply.
export function fallbackUnread(status, transcript) {
  const calls = toolCalls(transcript)
  const todo = status.missing.map((m) => m.path).filter((f) => f && !calls.some((c) => String(c.input.file_path ?? c.input.command ?? '').includes(f)))
  return todo.length ? `rule-guard: a skill your role names cannot load here, so read what stands in for it before your first reply, then say so in it (receipt line: missing): ${todo.join(', ')} of claude-setup (CLAUDE.md, Never "can't").` : null
}

export function threadReceipt(role, brief, transcript, rules, status = { loaded: [], missing: [] }) {
  const tag = (k) => brief.replace(/[*_`]/g, '').match(new RegExp(`${k}:[ \\t]*([A-Za-z0-9-]+)`))?.[1] ?? '?'
  const skills = [...new Set(toolCalls(transcript).filter((c) => c.name === 'Skill').map((c) => String(c.input.skill ?? '')).filter(Boolean))]
  const hash = rules.includes(MARK) ? createHash('sha256').update(rules.replace(/\r/g, '')).digest('hex').slice(0, 7) : 'none'
  const item = brief.replace(/[*_`]/g, '').match(/\bItem:[ \t]*(M\d+|new)/)?.[1] ?? '?' // the coordinator's Masterplan id (roles/project-manager.md, Masterplan)
  return `Thread · ${role} · ${tag('Kit')} · ${tag('Size')} · item ${item} · skills: ${skills.join(', ') || 'none'} · rules #${hash} · ${missingNote(status)}`
}

// Until one reply carried a receipt and went out (a blocked try has a hook error as its result).
const receiptSent = (transcript) => toolCalls(transcript).some((c) => c.name === 'mcp__hearthbot__post_message' && c.result && !/rule-guard:|hook error/i.test(c.result) && String(c.input.text ?? '').trimStart().startsWith('Thread · '))

export function receiptMissing(tool, input, line, transcript) {
  if (tool !== 'mcp__hearthbot__post_message' || !line) return null
  if (String(input.text ?? '').trimStart().startsWith(line)) return null
  if (receiptSent(transcript)) return null
  return `rule-guard: a thread's first reply opens with its start receipt, verbatim, so yskills sees the role loaded (CLAUDE.md, Teams): ${line}`
}

export function toolCalls(transcript) {
  const calls = []
  const byId = new Map()
  for (const line of transcript.split('\n')) {
    if (!line.includes('"tool_')) continue
    try {
      const row = JSON.parse(line)
      for (const c of row.message?.content ?? []) {
        if (c?.type === 'tool_use') { const call = { name: c.name, input: c.input ?? {}, result: '', at: Date.parse(row.timestamp ?? '') || 0 }; calls.push(call); byId.set(c.id, call) }
        if (c?.type === 'tool_result' && byId.has(c.tool_use_id)) byId.get(c.tool_use_id).result = typeof c.content === 'string' ? c.content : (c.content ?? []).map((x) => x?.text ?? '').join('\n')
      }
    } catch { continue } // a line that is not JSON
  }
  return calls
}

// Jetzt block (docs/hq-rows.md): HQ shows a project from the `## Jetzt` block of its PROGRESS.md, kept current in the PRs the
// project makes anyway. A new PR whose repo has a PROGRESS.md gets a warning (no block) when the block is missing or the PR leaves the file untouched.
export function jetztWarning(tool, input = {}, cwd = process.cwd()) {
  if (tool !== 'mcp__github__create_pull_request') return null
  try {
    const git = (...a) => execFileSync('git', ['-C', cwd, ...a], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim()
    if (!git('remote', 'get-url', 'origin').toLowerCase().replace(/(\.git)?\/?$/, '').endsWith(`/${input.owner}/${input.repo}`.toLowerCase())) return null
    const progress = join(git('rev-parse', '--show-toplevel'), 'PROGRESS.md')
    if (!existsSync(progress)) return null
    if (!/^## Jetzt[ \t]*$/m.test(read(progress))) return 'rule-guard (warning): PROGRESS.md has no `## Jetzt` block, so HQ shows this project as "kein Status" (docs/hq-rows.md, Jetzt block). Add Ziel / Offen / Wartet auf dich / Stand to this PR.'
    const base = input.base ?? 'main'
    const changed = git('diff', '--name-only', `origin/${base}...${input.head ?? 'HEAD'}`).split('\n')
    return changed.includes('PROGRESS.md') ? null : 'rule-guard (warning): this PR leaves PROGRESS.md untouched. If the open points or what waits on yskills changed, update `## Jetzt` and its `Stand:` here (docs/hq-rows.md, Jetzt block); if nothing changed, go on.'
  } catch { return null }
}

// Every object with a thread_id and a state in a listing (list_threads, list_thread_sessions), whatever the nesting.
function threadRows(text) {
  const rows = []
  const walk = (v) => { if (Array.isArray(v)) v.forEach(walk); else if (v && typeof v === 'object') { if ((v.thread_id ?? v.id) && v.state) rows.push({ ...v, thread_id: v.thread_id ?? v.id }); Object.values(v).forEach(walk) } }
  for (const m of text.matchAll(/\{[\s\S]*\}/g)) { try { walk(JSON.parse(m[0])) } catch { /* not JSON */ } }
  return rows
}

// The board the session listed last: finished threads still open (done, review_ready, failed, stopped and
// not resolved), blocked ones, when it was listed, and the threads messaged since.
const LIST = /list_thread(_session)?s$/
// review_ready counts once it sat 30 minutes: before that the gate is still on it.
const FINISHED_STATES = new Set(['done', 'failed', 'stopped', 'completed'])
const REVIEW_IDLE = 30 * 60 * 1000
export function threadBoard(calls) {
  // A filtered listing (one state, a since) is no board; the last full one is.
  const i = calls.findLastIndex((c) => LIST.test(c.name) && c.result && !c.input.state && !c.input.since && !c.input.cursor)
  if (i < 0) return null
  const rows = threadRows(calls[i].result)
  const told = new Set(calls.slice(i + 1).filter((c) => /(message_thread|set_thread_resolved)$/.test(c.name)).map((c) => c.input.thread_id ?? c.input.thread))
  const pick = (t) => ({ id: t.thread_id, title: String(t.title ?? t.thread_id).slice(0, 60), state: t.state })
  return {
    at: calls[i].at,
    finished: rows.filter((t) => !t.resolved && (FINISHED_STATES.has(t.state) || (t.state === 'review_ready' && calls[i].at - Date.parse(t.last_activity_at ?? '') > REVIEW_IDLE))).map(pick),
    blocked: rows.filter((t) => t.state === 'blocked' && !t.resolved).map(pick),
    told,
  }
}

// The coordinator (yskills 2026-10-27: "coordinators look after their threads"): before it stops, every
// finished thread on its last board is resolved or told to resolve, and the board is at most two hours old.
export const BOARD_MAX_AGE = 2 * 3600 * 1000
export function coordinatorCheck(transcript, now = Date.now()) {
  if (/reason=\\?"spawn/.test(transcript) || !transcript.includes('mcp__hearthbot__')) return null // a thread, or no project session
  const calls = toolCalls(transcript)
  const board = threadBoard(calls)
  if (!board) return null // this session never listed its threads (no list tool)
  const left = board.finished.filter((t) => !board.told.has(t.id))
  if (left.length) return `rule-guard: ${left.length} finished thread(s) on your board are still open: ${left.slice(0, 6).map((t) => `"${t.title}" (${t.state}, ${t.id})`).join(', ')}. Resolve each (set_thread_resolved with its thread_id where your tool takes one) or message_thread it to resolve itself or say what it still waits on. Then stop.`
  if (now - board.at > BOARD_MAX_AGE) return 'rule-guard: your thread board is over two hours old. List the threads again (list_thread_sessions or list_threads) and close or nudge every finished one before you stop.'
  return null
}

// Blender (yskills 2026-11-03: "no progress lost"): one Blender slot on the laptop. A headless start while the persistent
// bl_server.py runs is refused (cxy-repo tools/scenekit/NIGHT-CHAIN.md, Persistent Blender), and no Blender call goes out before
// the session read the night fix plan and the animator's Fast loop (operator/roles/animator.md).
const BLENDER_EXE = String.raw`(?:"[^"\n]*[\\/]blender(?:\.exe)?"|'[^'\n]*[\\/]blender(?:\.exe)?'|(?:[^\s"';&|]*[\\/])?blender(?:\.exe)?|["']?(?:%BL\w*%|\$\{?(?:env:)?BL\w*\}?)["']?)`
const BLENDER_RUN = new RegExp(String.raw`(?:^|[;&|(\n\x60]|\s--\s|\b(?:then|do|else|exec|nohup|start|time|xargs|Start-Process(?:\s+-FilePath)?|timeout\s+\S+)\s)\s*(?:&\s*)?${BLENDER_EXE}(?=\s|$)`, 'i')
const HEADLESS = /(?:^|[\s'",])(?:-b|--background)(?=[\s'",]|$)/
const BL_SERVER_PROC = /blender(?:\.exe)?["']?\s.*bl_server\.py/i
export const BLENDER_DOCS = [['projects/games/companyxy/ch01/NACHT-FIX-PLAN.md (cloud: /mnt/project-files/NACHT-FIX-PLAN.md)', /NACHT-FIX-PLAN\.md$/i], ['claude-setup/.claude/skills/operator/roles/animator.md (Fast loop)', /operator[\\/]roles[\\/]animator\.md$/i]]
const shellCommand = (tool, input) => (/^(Bash|PowerShell)$/.test(tool) ? String(input.command ?? '') : '')
export const blenderStart = (command) => BLENDER_RUN.exec(command)
export function blenderCall(tool, input = {}) {
  return /^mcp__Blender__/.test(tool) || Boolean(blenderStart(shellCommand(tool, input)))
}
// procs: the running processes' command lines, one per line (or a function that lists them; only called for a headless start).
export function blenderServerBusy(tool, input = {}, procs = '') {
  const command = shellCommand(tool, input)
  const start = blenderStart(command)
  if (!start || /bl_server\.py/i.test(command) || !HEADLESS.test(command.slice(start.index + start[0].length))) return null
  const running = String(typeof procs === 'function' ? procs() : procs).split('\n').some((l) => BL_SERVER_PROC.test(l))
  if (!running) return null
  return 'rule-guard: bl_server.py läuft schon und hält den einzigen Blender-Slot. Kein zweites `blender -b`: leg einen Job (*.py mit `result`-dict) in _archive/research/wild_life_notes/tools/bl_jobs oder nimm tools/submit_strip.sh <slot>. Siehe GitHub/cxy-repo/tools/scenekit/NIGHT-CHAIN.md, "Persistent Blender".'
}
// transcript: the session's transcript text (or a function returning it); a Read tool call of each doc counts.
export function blenderDocsMissing(tool, input = {}, transcript = '') {
  if (!blenderCall(tool, input)) return null
  const reads = toolCalls(typeof transcript === 'function' ? transcript() : transcript).filter((c) => c.name === 'Read').map((c) => String(c.input.file_path ?? '').replace(/\\/g, '/'))
  const missing = BLENDER_DOCS.filter(([, path]) => !reads.some((f) => path.test(f)))
  if (!missing.length) return null
  return `rule-guard: vor dem ersten Blender-Aufruf dieser Session erst lesen (Read): ${missing.map(([name]) => name).join(' und ')}. Dann nochmal.`
}
// Companyxy 2026-11-12 (point 8): a garment is downloaded only after `clothes_dupe.py <url or id>` said NEW for that source
// (docs/clothing-pipeline.md, Reuse first). transcript: the session's transcript text (or a function returning it).
const GARMENT_SOURCE = /https?:\/\/(?:[^\s"'/]*\.)?(?:sketchfab\.com|booth\.pm|fab\.com|cgtrader\.com|blenderkit\.com|blendkit\.com)[^\s"']*/gi
const DOWNLOAD = /\b(curl|wget|Invoke-WebRequest|iwr|Start-BitsTransfer|yt-dlp|aria2c)\b/i
export function dupeCheckMissing(tool, input = {}, transcript = '') {
  const command = shellCommand(tool, input)
  if (!command || !DOWNLOAD.test(command)) return null
  const urls = command.match(GARMENT_SOURCE) ?? []
  if (!urls.length) return null
  const ran = (c) => /clothes_dupe\.py/.test(c)
  const idOf = (u) => { const last = u.replace(/[?#].*$/, '').replace(/\/(download|files?)\/?$/i, '').split('/').filter(Boolean).pop() ?? u; const tail = last.split('-').pop(); return tail.length >= 8 ? tail : last }   // sketchfab: name-<uid>
  const earlier = toolCalls(typeof transcript === 'function' ? transcript() : transcript).map((c) => String(c.input?.command ?? '')).filter(ran)
  const before = command.split(/&&|;|\|/).filter(ran).join(' ')
  const unchecked = urls.filter((u) => !(earlier.concat(before).some((c) => c.includes(idOf(u)))))
  if (!unchecked.length) return null
  return `rule-guard: before a garment download run \`python tools/laptop/clothes_dupe.py ${unchecked[0].slice(0, 90)}\` and read HAVE or NEW (docs/clothing-pipeline.md, Reuse first; companyxy 2026-11-12: garments came twice). HAVE: refit the item you have. NEW: run this command again after it.`
}
const listProcs = () => {
  if (process.env.CLAUDE_SETUP_PROCS !== undefined) return process.env.CLAUDE_SETUP_PROCS // tests: a fake process list
  try {
    return process.platform === 'win32'
      ? execFileSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', '(Get-CimInstance Win32_Process -Property CommandLine).CommandLine'], { encoding: 'utf8', timeout: 3500, windowsHide: true })
      : execFileSync('ps', ['-eo', 'args'], { encoding: 'utf8', timeout: 3500 })
  } catch { return '' }
}
// A subagent's own tool calls live next to the session transcript: <session>/subagents/agent-<id>.jsonl.
const agentTranscript = (transcriptPath, agentId) => (transcriptPath && agentId ? join(transcriptPath.replace(/\.jsonl$/, ''), 'subagents', `agent-${String(agentId).replace(/[^\w-]/g, '')}.jsonl`) : '')


// Gate round counter (global/gate-rounds.mjs, operator/gate.md Rounds): a gate post, a merge, a ledger write or a director/card record is
// checked against the asset's ledger. Fail closed: a check that throws refuses the call (research 2026-11-12: a crashing hook does not block).
const humanAfter = (transcript, ref) => {
  const id = String(ref).match(/cmsg_\w+/)?.[0]
  const rows = transcript.split('\n').map((l) => { try { return JSON.parse(l) } catch { return null } }).filter(Boolean)
  const at = rows.findIndex((r) => id && JSON.stringify(r.message?.content ?? '').includes(id))
  const human = (r) => r.type === 'user' && !(Array.isArray(r.message?.content) && r.message.content.some((c) => c?.type === 'tool_result')) && /<message\b[^>]*\bfrom=\\?"human\\?"[^>]*\btrust=\\?"principal\\?"/.test(JSON.stringify(r.message?.content ?? ''))
  return at >= 0 && rows.slice(at + 1).some(human)
}
// A cached cloud image can lack the counter (its pasted setup predates it) and its start hook, the old team-guard, never fetches it
// (each session restarts from the cache): the first call that needs it installs it with the refresh that now sits in this dir (2026-11-12).
async function loadCounter() {
  const url = new URL('./gate-rounds.mjs', import.meta.url)
  try { return await import(url) } catch (e) {
    if (e?.code !== 'ERR_MODULE_NOT_FOUND') throw e
    const { refresh } = await import(new URL('./team-guard.mjs', import.meta.url))
    refresh(dirname(fileURLToPath(import.meta.url)), ['gate-rounds.mjs'])
    return import(url)
  }
}
export async function gateBlock(tool, input, transcript, model, dry = false) {
  if (!/^(Write|Edit|MultiEdit|NotebookEdit|Bash|PowerShell)$|^mcp__github__/.test(tool)) return null
  let mod
  try { mod = await loadCounter() } catch (e) {
    // Fail closed for gate-shaped calls: a missing or broken counter must not open the gate.
    const shaped = /^mcp__github__(merge_pull_request|enable_pr_auto_merge)$/.test(tool) || /\bgh\s+pr\s+merge\b/.test(String(input?.command ?? '')) || /gate-rounds|\bGate\b[^\n]*\bround\s+\d/i.test(JSON.stringify(input))
    return shaped ? `rule-guard: the gate round counter (gate-rounds.mjs) could not load (${String(e.message).slice(0, 60)}); gate posts, merges and ledger calls are refused until it is installed (operator/gate.md, Rounds).` : null
  }
  try {
    const t = transcript()
    const why = mod.gateStep(tool, input, { model, dry, calls: /gate-rounds\.mjs/.test(JSON.stringify(input)) ? toolCalls(t) : [], humanAfter: (ref) => humanAfter(t, ref) })
    return why ? `rule-guard: ${why}` : null
  } catch (e) { return `rule-guard: gate ledger check failed (${String(e.message).slice(0, 80)}); refused, fail closed (operator/gate.md, Rounds).` }
}
// The start proof of a thread names the guard version it runs and any guard file that is missing (plan M47).
async function guardLine() {
  try { return (await import(new URL('./team-guard.mjs', import.meta.url))).guardVersion(dirname(fileURLToPath(import.meta.url))) } catch { return '' }
}
export async function gateBriefContext(brief, model) {
  try { return (await loadCounter()).gateBrief(brief, { model }) } catch { return '' }
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
    process.stdin.on('end', async () => {
      try {
        if (process.env.CLAUDE_SETUP_RULE_GUARD === 'off') return
        const { tool_name: tool = '', tool_input: input = {}, prompt = '', cwd = process.cwd(), session_id: session, transcript_path: transcriptPath, agent_id: agentId } = JSON.parse(raw || '{}')
        if (mode === 'prompt') {
          const briefOnce = join(tmpdir(), `claude-setup-brief-${String(session).replace(/\W/g, '')}`)
          const spawned = /reason=\\?"spawn/.test(prompt)
          const lookup = session && !spawned && !existsSync(briefOnce) && transcriptPath && existsSync(transcriptPath)
          const brief = lookup ? spawnPrompt(prompt, read(transcriptPath)) : prompt
          if (session && (spawned || (lookup && brief !== prompt))) writeFileSync(briefOnce, '')
          const model = sessionModel(transcriptPath && existsSync(transcriptPath) ? read(transcriptPath) : '') ?? (read(join(tmpdir(), `claude-setup-model-${String(session).replace(/[^A-Za-z0-9]/g, '')}`)).trim() || null)
          const context = [await briefCheck(brief, cwd, model), spawned || (lookup && brief !== prompt) ? await gateBriefContext(brief, model) : '', spawned ? await guardLine() : '', modelOnce(brief, transcriptPath, session), await roleContext(brief, cwd, session), promptContext(prompt), persona(setupRoot(cwd))].filter(Boolean).join('\n')
          if (context) process.stdout.write(JSON.stringify({ hookSpecificOutput: { hookEventName: 'UserPromptSubmit', additionalContext: context } }))
          return
        }
        if (mode === 'stop') {
          const transcript = !JSON.parse(raw || '{}').stop_hook_active && transcriptPath && existsSync(transcriptPath) ? read(transcriptPath) : ''
          const why = transcript ? unresolved(transcript) ?? coordinatorCheck(transcript) : null
          if (why) process.stdout.write(JSON.stringify({ decision: 'block', reason: why }))
          return
        }
        if (mode !== 'pre') return
        const shipped = join(tmpdir(), `claude-setup-artifacts-${String(session).replace(/\W/g, '')}`)
        const transcript = () => (transcriptPath && existsSync(transcriptPath) ? read(transcriptPath) : '')
        const sessionTranscript = () => [transcriptPath, agentTranscript(transcriptPath, agentId)].filter((p) => p && existsSync(p)).map(read).join('\n')
        let block = (await gateBlock(tool, input ?? {}, transcript, sessionModel(transcript()), true))
          ?? decide(tool, input ?? {}, process.env, session ? read(shipped).split('\n') : [], () => threadBoard(toolCalls(transcript())))
          ?? canaryMissing(tool, input ?? {}, session ? read(join(process.env.CLAUDE_SETUP_HOME || homedir(), '.claude', 'claude-setup', 'booted', `${String(session).replace(/\W/g, '')}.canary`)) : '', transcript)
          ?? receiptBlock(tool, input ?? {}, session, cwd, agentId, transcript)
          ?? proposeSkillsBlocked(tool)
          ?? opensWindow(tool, input ?? {})
          ?? archivistFiles(tool, input ?? {}, session ? read(join(tmpdir(), `claude-setup-role-${String(session).replace(/\W/g, '')}`)) : '')
          ?? kaomojiMissing(tool, input ?? {})
          ?? dupeCheckMissing(tool, input ?? {}, sessionTranscript)
          ?? blenderServerBusy(tool, input ?? {}, listProcs)
          ?? blenderDocsMissing(tool, input ?? {}, sessionTranscript)
          ?? (grillMissing(tool, input ?? {}, transcript) ? 'rule-guard: a Planner at size M or L grills first (CLAUDE.md, No fog; operator SKILL.md, Grill first): post the real-moment question (when it comes from his life) and up to 2 request_decision cards (goal, taste), each with your recommended answer, then write the plan on the answers (or the recommendations while he is away).' : null)
        if (!block) block = await gateBlock(tool, input ?? {}, transcript, sessionModel(transcript()), false) // commit the round only now: no other guard refused the post
        if (!block && session && tool === 'Artifact' && input?.url && input.file_path) writeFileSync(shipped, `${input.file_path}\n`, { flag: 'a' })
        if (block) { process.stderr.write(block); process.exitCode = 2 }
        else {
          const note = jetztWarning(tool, input ?? {}, cwd)
          if (note) process.stdout.write(JSON.stringify({ hookSpecificOutput: { hookEventName: 'PreToolUse', additionalContext: note } }))
        }
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
s.hooks.PreCompact = (s.hooks.PreCompact || []).filter((h) => !JSON.stringify(h).includes("compact-guard.mjs"))
s.hooks.PreCompact.push({ hooks: [{ type: "command", command: `node "${require("os").homedir()}/.claude/claude-setup/compact-guard.mjs"`, timeout: 10 }] })
for (const [event, mode] of [["PreToolUse", "pre"], ["PostToolUse", "ok"], ["PostToolUseFailure", "fail"]]) {
  s.hooks[event] = (s.hooks[event] || []).filter((h) => !JSON.stringify(h).includes("attempt-guard.mjs"))
  s.hooks[event].push({ matcher: "Bash|mcp__.*", hooks: [{ type: "command", command: `node "${require("os").homedir()}/.claude/claude-setup/attempt-guard.mjs" ${mode}`, timeout: 5 }] })
}
const team = (mode) => ({ type: "command", command: `node "${require("os").homedir()}/.claude/claude-setup/team-guard.mjs" ${mode}`, timeout: 5 })
const teamHooks = [["SessionStart", "startup|clear|compact", "start"], ["SessionStart", "startup|clear|compact|resume", "card"], ["PreToolUse", "Agent|Task|mcp__.*start_thread.*|mcp__.*create_session", "pre"]]
for (const event of new Set(teamHooks.map(([e]) => e))) s.hooks[event] = (s.hooks[event] || []).filter((h) => !JSON.stringify(h).includes("team-brief.mjs") && !JSON.stringify(h).includes("team-guard.mjs"))
for (const [event, matcher, mode] of teamHooks) s.hooks[event].push({ matcher, hooks: [team(mode)] })
const rule = (mode) => ({ type: "command", command: `node "${require("os").homedir()}/.claude/claude-setup/rule-guard.mjs" ${mode}`, timeout: 5 })
for (const [event, matcher, mode] of [["PreToolUse", "Bash|PowerShell|Write|Edit|Artifact|WebFetch|mcp__github__.*|mcp__hearthbot__post_message|mcp__remote-devices__create_artifact|mcp__Blender__.*|mcp__.*Claude_Browser__.*|mcp__.*(navigate|browser_batch|tabs_create.*|preview_start)|propose_skills|mcp__.*propose_skills", "pre"], ["UserPromptSubmit", "", "prompt"], ["Stop", "", "stop"]]) {
  s.hooks[event] = (s.hooks[event] || []).filter((h) => !JSON.stringify(h).includes("rule-guard.mjs"))
  s.hooks[event].push({ ...(matcher ? { matcher } : {}), hooks: [rule(mode)] })
}
s.hooks.SessionStart = s.hooks.SessionStart.filter((h) => !JSON.stringify(h).includes("permissions-sync.sh"))
s.hooks.SessionStart.push({ matcher: "startup|clear|compact", hooks: [{ type: "command", command: `bash "${require("os").homedir()}/.claude/claude-setup/permissions-sync.sh"`, timeout: 10 }] })
fs.writeFileSync(p, JSON.stringify(s, null, 2))
' || echo "claude-setup: could not add the context, attempt guard, team guard, rule guard and permissions sync hooks"
