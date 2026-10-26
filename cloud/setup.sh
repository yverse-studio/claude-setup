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

# Team guard: the same file as global/team-guard.mjs (scripts/check.mjs keeps them equal): a
# pointer to docs/TEAMS.md at session start, and a block on Agent calls and thread starts without
# `model` (a subagent of an Opus thread inherits Opus; CLAUDE_CODE_SUBAGENT_MODEL did not stop it
# in a project thread, tested 2026-10-26).
cat > "$HOME/.claude/claude-setup/team-guard.mjs" <<'TEAM'
#!/usr/bin/env node
// Team guard. Usage: team-guard.mjs start|pre (hook entries SessionStart and PreToolUse).
// start: puts a one-line pointer to claude-setup's docs/TEAMS.md into every new session.
// pre: refuses (exit 2) an Agent call or a thread start without `model`, because without it a
// thread gets the project default and a subagent inherits its parent (yskills, 2026-10-26: every
// thread and subagent ran on Opus). An Agent call whose subagent_type has an agent file with its own
// `model:` passes. It also refuses a thread start whose brief is a size L Programmer with no
// `Tester:` line (incident 2026-10-26: an L app ran without a Tester, docs/TEAMS.md Sizes: the
// Tester thread starts first and the Programmer brief names it). CLAUDE_SETUP_TEAM_GUARD=off turns it off. It never breaks a tool call on its own
// errors.
import { existsSync, readFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'

export const POINTER = 'Team rule (claude-setup docs/TEAMS.md): route every task on its own (task picks the kit, not the project; then size S/M/L), call only the roles it needs, as thread or subagent as the roster says, and pass `model` from the role\'s row on every thread start and Agent call.'

const THREAD_START = /^mcp__.*(start_thread|create_session)/
const AGENT = /^(Agent|Task)$/

export function hasOwnModel(type, dirs) {
  if (!type || !/^[\w.-]+$/.test(type)) return false
  return dirs.some((d) => {
    const file = join(d, `${type}.md`)
    return existsSync(file) && /^model:\s*\S+/m.test(readFileSync(file, 'utf8').split(/^---\s*$/m)[1] ?? '')
  })
}

const briefText = (input) => Object.values(input).filter((v) => typeof v === 'string').join('\n')
export function needsTester(text) {
  const plain = text.replace(/[*_`]/g, '')
  const isL = /^[ \t]*role:[^\n]*\bprogrammer\b/im.test(plain) && /\bsize:[ \t]*L\b/i.test(plain)
  const named = plain.match(/^[ \t]*tester:[ \t]*(\S[^\n]*)$/im)?.[1].trim()
  return isL && !(named && !/^(<.*>|none|n\/a|-+|tbd)$/i.test(named))
}

export function decide(tool, input = {}, dirs = []) {
  const kind = AGENT.test(tool) ? 'Agent' : THREAD_START.test(tool) ? 'thread' : null
  if (kind === 'thread' && needsTester(briefText(input))) return { block: 'team-guard: a size L Programmer thread starts only after its Tester thread (claude-setup docs/TEAMS.md, Sizes). Start `Tester · <app>` first, then put a line `Tester: <its thread id or title>` in this brief and retry.' }
  if (!kind || String(input.model ?? '').trim()) return {}
  if (kind === 'Agent' && hasOwnModel(input.subagent_type, dirs)) return {}
  return { block: `team-guard: this ${kind === 'Agent' ? 'Agent call' : 'thread start'} has no \`model\`. Pass the model of the role's row in claude-setup docs/TEAMS.md (Roster; Agent: haiku, sonnet or opus; thread: the full id from the Models line), then retry.` }
}

if (process.argv[1] && import.meta.url.endsWith(process.argv[1].replace(/\\/g, '/').split('/').pop())) {
  const mode = process.argv[2]
  if (mode === 'start') {
    process.stdout.write(JSON.stringify({ hookSpecificOutput: { hookEventName: 'SessionStart', additionalContext: POINTER } }))
  } else {
    let raw = ''
    process.stdin.setEncoding('utf8')
    process.stdin.on('data', (c) => { raw += c })
    process.stdin.on('end', () => {
      try {
        if (process.env.CLAUDE_SETUP_TEAM_GUARD === 'off') return
        const { tool_name: tool = '', tool_input: input, cwd = process.cwd() } = JSON.parse(raw || '{}')
        const out = decide(tool, input, [join(cwd, '.claude', 'agents'), join(homedir(), '.claude', 'agents')])
        if (out.block) { process.stderr.write(out.block); process.exitCode = 2 }
      } catch {
        // A guard must never break a tool call.
      }
    })
  }
}
TEAM

# Permissions sync (docs/permissions.md): copies permissions (minus defaultMode, the thread keeps
# its own) and autoMode from main's global/settings.json into ~/.claude/settings.json. Run now and
# at every session start, so a merged change needs no environment rebuild. Never blocks.
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
for (const [event, matcher, mode] of [["SessionStart", "startup|clear|compact", "start"], ["PreToolUse", "Agent|Task|mcp__.*start_thread.*|mcp__.*create_session", "pre"]]) {
  s.hooks[event] = (s.hooks[event] || []).filter((h) => !JSON.stringify(h).includes("team-brief.mjs") && !JSON.stringify(h).includes("team-guard.mjs"))
  s.hooks[event].push({ matcher, hooks: [team(mode)] })
}
s.hooks.SessionStart = s.hooks.SessionStart.filter((h) => !JSON.stringify(h).includes("permissions-sync.sh"))
s.hooks.SessionStart.push({ matcher: "startup|clear|compact", hooks: [{ type: "command", command: `bash "${require("os").homedir()}/.claude/claude-setup/permissions-sync.sh"`, timeout: 10 }] })
fs.writeFileSync(p, JSON.stringify(s, null, 2))
' || echo "claude-setup: could not add the context, attempt guard, team guard and permissions sync hooks"
