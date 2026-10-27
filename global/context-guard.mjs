#!/usr/bin/env node
// PostToolUse hook: every tool call re-sends the whole context, so a long session pays for its
// size again on each call (cache reads were 98% of our usage). At WARN tokens of absolute context,
// tell Claude once to work leaner; at HANDOFF, to wrap up and leave the rest to a fresh session,
// and again every REFIRE tokens after that. Silent otherwise; never blocks.
// The limits follow the task: the spawn brief's `Size: S|M|L` (docs/TEAMS.md) picks a row of
// LIMITS, and a brief line `Handoff: at <N>k` (operator briefs.md) overrides the hand-off. Why not
// one number or auto-compaction: docs/research/2026-10-27-context-handoff.md.
import { closeSync, existsSync, openSync, readFileSync, readSync, realpathSync, statSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

// An S task that grows big is stuck, so it stops early; an L task loses the most state in a hand-off.
// L stays under half the 1M window. An unknown size gets M.
export const LIMITS = { S: [200_000, 250_000], M: [250_000, 350_000], L: [350_000, 500_000] }
const MAX = 800_000 // a brief may raise the hand-off, but not to where the harness compacts on its own
const REFIRE = 50_000 // after the hand-off, nag again every further REFIRE tokens
const CHUNK = 256 * 1024

const HEAD = 512 * 1024 // the spawn brief is near the start of the transcript

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

function slice(path, fromEnd, max) {
  const fd = openSync(path, 'r')
  try {
    const len = statSync(path).size
    const n = Math.min(max, len)
    const buf = Buffer.alloc(n)
    readSync(fd, buf, 0, n, fromEnd ? len - n : 0)
    return buf.toString('utf8')
  } finally { closeSync(fd) }
}

// Text the user, coordinator or harness wrote (not tool output, which can quote any brief).
function prompts(text) {
  const out = []
  for (const line of text.split('\n')) {
    try {
      const d = JSON.parse(line)
      if (d.type !== 'user') continue
      const c = d.message?.content
      if (typeof c === 'string') out.push(c)
      else if (Array.isArray(c)) for (const b of c) if (b?.type === 'text') out.push(b.text)
    } catch {
      // the head chunk's cut-off last line
    }
  }
  return out
}

// [warn, handoff] for this session: env first, then the brief, then M.
export function limits(head, env = process.env) {
  let size = 'M'
  let handoff = 0
  for (const t of prompts(head)) {
    const s = t.match(/Kit:[^·\n]*·\s*Size:\s*([SML])\b/)
    if (s) { size = s[1]; const h = t.match(/Handoff:\s*at\s*(\d{3})k\b/i); if (h) handoff = Math.min(Number(h[1]) * 1000, MAX); break }
  }
  let [warn, hand] = LIMITS[size]
  if (handoff) { hand = handoff; warn = Math.max(Math.min(warn, handoff - 100_000), Math.round(handoff * 0.6)) }
  return { size, warn: Number(env.CLAUDE_SETUP_CONTEXT_WARN) || warn, handoff: Number(env.CLAUDE_SETUP_CONTEXT_HANDOFF) || hand }
}

// Run as the hook; tests import limits() without reading stdin.
// Real paths on both sides, so a symlinked ~/.claude still runs it.
const isMain = () => {
  try { return realpathSync(process.argv[1]) === realpathSync(fileURLToPath(import.meta.url)) } catch { return false }
}
if (isMain()) run()

function run() {
  let raw = ''
  process.stdin.setEncoding('utf8')
  process.stdin.on('data', (c) => { raw += c })
  process.stdin.on('end', () => {
    try {
      const { session_id: id = 'unknown', transcript_path: path } = JSON.parse(raw || '{}')
      if (!path || !existsSync(path)) return
      const stateFile = join(tmpdir(), `claude-context-guard-${String(id).replace(/[^\w-]/g, '')}.json`)
      const state = existsSync(stateFile) ? JSON.parse(readFileSync(stateFile, 'utf8')) : { fired: [] }
      // The state file sits in a shared tmp dir and its size goes into Claude's context: trust only S, M or L.
    const c = state.limits
    if (!(c && LIMITS[c.size] && Number.isFinite(c.warn) && Number.isFinite(c.handoff))) state.limits = limits(slice(path, false, HEAD))
      const { warn: WARN, handoff: HANDOFF, size: SIZE } = state.limits
      const seen = usages(slice(path, true, CHUNK))
      const now = seen.at(-1)
      if (!now) return
      const k = (n) => `${Math.round(n / 1000)}k`
      // Absolute floors: a cold start already carries ~100k+ in project threads, so growth since the
      // first call hides the real size. Warn once at WARN, hand off at HANDOFF, then again every REFIRE.
      const next = state.next ?? HANDOFF
      let msg = ''
      if (now >= next) {
        msg = `Context guard: this session's context is ${k(now)} tokens (hand-off for a size ${SIZE} task: ${k(HANDOFF)}) and every tool call re-reads all of it. Finish the current step, write the state to a hand-off file (/mnt/project-files/<project>/handoff/<date>-<topic>.md, or PROGRESS.md on the PC) and the PR, reply with its path, and leave further work to a fresh session or thread instead of continuing here.`
        state.next = Math.max(next, Math.floor(now / REFIRE) * REFIRE) + REFIRE
        state.fired.push('warn', 'handoff')
      } else if (now >= WARN && !state.fired.includes('warn')) {
        msg = `Context guard: this session's context is ${k(now)} tokens (hand-off for a size ${SIZE} task at ${k(HANDOFF)}) and every tool call re-reads all of it. Batch independent calls, trim command output (tail, head, --quiet), and hand big reads or searches to a subagent that returns only the answer.`
        state.fired.push('warn')
      }
      writeFileSync(stateFile, JSON.stringify(state))
      if (msg) process.stdout.write(JSON.stringify({ hookSpecificOutput: { hookEventName: 'PostToolUse', additionalContext: msg } }))
    } catch {
      // A guard must never break a tool call.
    }
  })
}
