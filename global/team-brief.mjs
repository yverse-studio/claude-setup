#!/usr/bin/env node
// SessionStart hook: prints the Spawn rule of claude-setup's docs/TEAMS.md into every new session,
// so no coordinator or thread starts work without it (yskills, 2026-10-26: threads played several
// roles and all ran on the default model). Reads the file live, so the text never drifts, but only
// from a checkout whose git remote is yverse-studio/claude-setup: another repo's docs/TEAMS.md must
// not put its text into the session. No such checkout: it prints a pointer. Never blocks.
import { existsSync, readFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { dirname, join } from 'node:path'

const POINTER = 'Before starting or asking for any thread, add_repo yverse-studio/claude-setup and read docs/TEAMS.md (Spawn rule): one role per thread titled "<Role> · <topic>", only the coordinator starts threads, every start and subagent names its model from the role\'s row.'

function isClaudeSetup(dir) {
  const git = join(dir, '.git', 'config')
  return existsSync(git) && /url\s*=\s*\S*[/:]yverse-studio\/claude-setup(?:\.git)?\s*$/m.test(readFileSync(git, 'utf8'))
}

function spawnRule() {
  const cwd = process.cwd()
  const dirs = [process.env.CLAUDE_PROJECT_DIR, cwd, join(cwd, 'claude-setup'), join(dirname(cwd), 'claude-setup'),
    '/home/user/claude-setup', join(homedir(), 'claude-setup'), join(homedir(), 'Documents', 'GitHub', 'claude-setup')]
  for (const d of dirs) {
    const f = d && join(d, 'docs', 'TEAMS.md')
    if (!f || !existsSync(f) || !isClaudeSetup(d)) continue
    const section = readFileSync(f, 'utf8').match(/^## Spawn rule\r?\n([\s\S]*?)(?=^## )/m)?.[1]?.trim()
    if (section) return `claude-setup team rule (docs/TEAMS.md, Spawn rule; the team tables there give each role's model):\n${section}`
  }
  return POINTER
}

try {
  process.stdout.write(JSON.stringify({ hookSpecificOutput: { hookEventName: 'SessionStart', additionalContext: spawnRule() } }))
} catch {
  // A hook must never break a session start.
}
