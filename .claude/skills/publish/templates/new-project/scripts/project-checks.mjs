#!/usr/bin/env node
// Role checks in the project's own CI, so a PR fails here before the gate looks at it. It runs the
// check scripts that new-project copied next to it, and only those that apply to the files the PR
// changed: design, copy and tracking plan when UI or text changed (a site and a game both), the game
// design and sound docs when play changed (a game only: its gdd-check.mjs and audio-check.mjs ship
// with kind "game"). A doc that does not exist yet fails with the one-line fix, not a stack trace.
// The rules stay in the scripts (claude-setup: ui-review, game-3d, market skills); a silent game is
// exempt inside audio-check.mjs. The playtest report has its own CI step.
// Exit 0 ok, 1 a check failed, 2 could not run (never read 2 as 0).
// Usage: node scripts/project-checks.mjs [--base <ref>]   (default origin/main)
import { execFileSync, spawnSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const ROLES = 'claude-setup operator/roles'

const isUi = (f) => (/^(src|public)\//.test(f) && !/\.test\./.test(f) && f !== 'src/commit.js') || f === 'index.html'
const isPlay = (f, playFile) => playFile(f) || f.startsWith('assets/')

export const CHECKS = [
  { name: 'design', script: 'design-check.mjs', doc: 'design/DESIGN.md', fix: `the Designer writes it first (${ROLES}/designer.md, Art direction first)`, when: (f) => isUi(f) || f.startsWith('design/reference/') || f === 'design/DESIGN.md' },
  { name: 'copy', script: 'copy-check.mjs', args: ['design/COPY.md'], doc: 'design/COPY.md', fix: `the Content Designer writes it from operator/templates/copy-deck.md (${ROLES}/content-designer.md)`, when: (f) => isUi(f) || f === 'design/COPY.md' },
  { name: 'analytics', script: 'analytics-check.mjs', args: ['analytics/TRACKING.md'], doc: 'analytics/TRACKING.md', fix: `the Analytics owner writes it from operator/templates/tracking-plan.md (${ROLES}/analytics.md)`, when: (f) => isUi(f) || f === 'analytics/TRACKING.md' },
  { name: 'gdd', script: 'gdd-check.mjs', args: ['design/GDD.md'], doc: 'design/GDD.md', fix: `the Game Designer writes it from operator/templates/game-design.md before the build (${ROLES}/game-designer.md)`, when: (f, playFile) => playFile(f) },
  { name: 'audio', script: 'audio-check.mjs', when: (f, playFile) => isPlay(f, playFile) || f === 'design/AUDIO.md' }, // no doc test: the script lets a silent game pass
]

// changed: the PR's files. available: script names next to this one. playFile: the game's own rule (playtest-check.mjs).
export function plan(changed, available, playFile = () => false) {
  return CHECKS.filter((c) => available.includes(c.script) && changed.some((f) => c.when(f, playFile)))
}

const lines = (s) => s.split('\n').filter(Boolean)
const git = (args) => {
  try { return execFileSync('git', ['-c', 'core.quotepath=off', ...args], { encoding: 'utf8', maxBuffer: 1 << 26, stdio: ['ignore', 'pipe', 'pipe'] }) } catch { return null }
}
const bail = (msg) => { console.error(`project-checks: ${msg}`); process.exit(2) }

async function main() {
  const i = process.argv.indexOf('--base')
  const base = i > -1 ? process.argv[i + 1] : 'origin/main'
  const top = git(['rev-parse', '--show-toplevel'])?.trim()
  if (!top) bail('not inside a git work tree')
  process.chdir(top)
  const mergeBase = git(['merge-base', base, 'HEAD'])?.trim()
  if (!mergeBase) bail(`no merge base against ${base} (shallow clone? use fetch-depth: 0)`)
  const tracked = git(['diff', '--name-only', '--no-renames', mergeBase, '--'])
  const untracked = git(['ls-files', '--others', '--exclude-standard'])
  if (tracked === null || untracked === null) bail('could not list the changed files')
  const changed = [...new Set([...lines(tracked), ...lines(untracked)])]

  const playFile = existsSync(join(here, 'playtest-check.mjs')) ? (await import('./playtest-check.mjs')).isPlayFile : undefined
  const due = plan(changed, ['design-check.mjs', 'copy-check.mjs', 'analytics-check.mjs', 'gdd-check.mjs', 'audio-check.mjs'].filter((s) => existsSync(join(here, s))), playFile)
  if (!due.length) return console.log('project-checks: no UI, text or play file changed, nothing to check')

  let failed = 0
  for (const c of due) {
    if (c.doc && !existsSync(c.doc)) {
      console.error(`project-checks: ${c.name}: ${c.doc} is missing; ${c.fix}`)
      failed++
      continue
    }
    const run = spawnSync(process.execPath, [join(here, c.script), ...(c.args ?? [])], { encoding: 'utf8' })
    if (run.error || run.status === null) bail(`${c.name}: could not run ${c.script}`)
    process.stdout.write(run.stdout)
    process.stderr.write(run.stderr)
    if (run.status !== 0) failed++
  }
  if (failed) {
    console.error(`project-checks: ${failed} of ${due.length} failing (${due.map((c) => c.name).join(', ')})`)
    process.exit(1)
  }
  console.log(`project-checks: ${due.map((c) => c.name).join(', ')} ok`)
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) await main()
