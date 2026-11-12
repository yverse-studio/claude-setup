#!/usr/bin/env node
// PostToolUse hook: every tool call re-sends the whole context, so a long session pays for its
// size again on each call (cache reads were 98% of our usage). At WARN tokens of absolute context,
// tell Claude once to work leaner; at HANDOFF (a backstop only: the real handoff triggers are in
// docs/WORKFLOW.md, Handoff triggers), to check them, and again every REFIRE tokens after that.
// Silent otherwise; never blocks.
// Also the PostToolUse door of the plan check (M28, global/task-ledger.mjs): it runs on every tool call, so it records the verdict of an
// Agent call that ran the rendered plan-check brief. A new hook entry in settings would not reach a cached cloud image; this one does.
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

// The plan-check verdict: an Agent call only, through the ledger file that sits beside this guard (missing: nothing happens).
async function planDoor(payload) {
  if (!/^(Agent|Task)$/.test(payload.tool_name ?? '')) return ''
  try { return (await import('./task-ledger.mjs')).planCheckPost(payload).note ?? '' } catch (e) { return `Plan check: could not record (${String(e.message).slice(0, 80)}).` }
}

let raw = ''
process.stdin.setEncoding('utf8')
process.stdin.on('data', (c) => { raw += c })
process.stdin.on('end', async () => {
  try {
    const payload = JSON.parse(raw || '{}')
    const { session_id: id = 'unknown', transcript_path: path } = payload
    const door = await planDoor(payload)
    const say = (msg) => { const all = [door, msg].filter(Boolean).join('\n'); if (all) process.stdout.write(JSON.stringify({ hookSpecificOutput: { hookEventName: 'PostToolUse', additionalContext: all } })) }
    if (!path || !existsSync(path)) return say('')
    const stateFile = join(tmpdir(), `claude-context-guard-${String(id).replace(/[^\w-]/g, '')}.json`)
    const state = existsSync(stateFile) ? JSON.parse(readFileSync(stateFile, 'utf8')) : { fired: [] }
    const seen = usages(tail(path))
    const now = seen.at(-1)
    if (!now) return say('')
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
    say(msg)
  } catch {
    // A guard must never break a tool call.
  }
})
