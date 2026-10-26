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
