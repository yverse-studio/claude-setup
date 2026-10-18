#!/usr/bin/env node
// Playtest check: a PR that changes how the game plays must carry a playtest report for the
// build it ships (roles/playtester.md). Play files = rules, hooks and ads in src/, the GDD and
// the bot. The newest design/playtests/*.md changed in the PR must name the preview and a commit
// no play file changed after, give pass/fail for all seven areas with a time and an existing
// file as evidence, hold no pass-through fail, no template placeholder, and end with Not checked.
// Escape hatch: a commit message in the PR with `playtest-ok: <reason>` waives a missing report, the
// reason is printed; it never waives a report that holds a fail row.
// Exit 0 ok, 1 violation, 2 could not run (never read 2 as 0).
// Usage: node scripts/playtest-check.mjs [--base <ref>]   (default origin/main)
import { execFileSync } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

export const AREAS = ['First 30 seconds', 'Full run', 'Death and restart', 'Ad hooks', 'Touch 390', 'Keyboard 1440', 'GDD promises']
const NOT_PLAY = new Set(['src/index.js']) // the Worker entry, not the game
export const isPlayFile = (f) =>
  (/^src\/.+\.(ts|js|mjs|json)$/.test(f) && !/\.test\./.test(f) && !NOT_PLAY.has(f)) || f === 'design/GDD.md' || f === 'test/game.mjs'
export const isReport = (f) => /^design\/playtests\/[^/]+\.md$/.test(f)

const TIME = /\b\d{1,2}:\d{2}\b/
const MEDIA = /[\w./-]+\.(?:png|jpe?g|webm)\b/i

// md: the report text. fileExists(rel): does a path relative to the report's folder exist.
export function checkReport(md, fileExists) {
  const errors = []
  if (!/^Preview:\s*https:\/\/\S+/m.test(md)) errors.push('no "Preview: https://..." line')
  if (!/^Commit:\s*[0-9a-f]{7,40}\s*$/m.test(md)) errors.push('no "Commit: <sha>" line')
  for (const m of md.replace(/`[^`\n]*`/g, '').matchAll(/<[^<>\n]+>/g)) errors.push(`template placeholder left: ${m[0].slice(0, 40)}`)
  const rows = new Map(md.split('\n').filter((l) => /^\s*\|/.test(l)).map((l) => l.split('|').slice(1, -1).map((c) => c.trim())).map((c) => [c[0], c]))
  for (const area of AREAS) {
    const row = rows.get(area)
    if (!row) { errors.push(`no verdict row "${area}"`); continue }
    const [, verdict = '', evidence = ''] = row
    if (!/^(pass|fail)$/i.test(verdict)) errors.push(`${area}: verdict must be pass or fail, got "${verdict.slice(0, 20)}"`)
    else if (/^fail$/i.test(verdict)) errors.push(`${area}: verdict is fail; fix the build and play it again for a new report`)
    if (!TIME.test(evidence)) errors.push(`${area}: evidence has no time (mm:ss)`)
    const file = evidence.match(MEDIA)?.[0]
    if (!file) errors.push(`${area}: evidence names no png, jpg or webm`)
    else if (!fileExists(file)) errors.push(`${area}: evidence file ${file} does not exist`)
  }
  if (!/^Not checked:/m.test(md)) errors.push('no "Not checked:" list')
  return errors
}

export const failRows = (md) => AREAS.filter((a) => md.split('\n').some((l) => /^\s*\|/.test(l) && l.split('|')[1]?.trim() === a && /^fail$/i.test(l.split('|')[2]?.trim() ?? '')))

const git = (args) => {
  try { return execFileSync('git', ['-c', 'core.quotepath=off', ...args], { encoding: 'utf8', maxBuffer: 1 << 26, stdio: ['ignore', 'pipe', 'pipe'] }) } catch { return null }
}
const lines = (s) => s.split('\n').filter(Boolean)
const bail = (msg) => { console.error(`playtest-check: ${msg}`); process.exit(2) }
const fail = (errors) => { for (const e of errors) console.error(`playtest-check: ${e}`); process.exit(1) }

function main() {
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
  if (!changed.some(isPlayFile)) return console.log('playtest-check: no play file changed, no report needed')

  const waiver = lines(git(['log', '--format=%B', `${mergeBase}..HEAD`]) ?? '').find((l) => /^playtest-ok:\s*\S/.test(l))
  const report = changed.filter(isReport).filter((f) => existsSync(f)).sort().at(-1)
  if (waiver && report) {
    const failed = failRows(readFileSync(report, 'utf8'))
    if (failed.length) fail([`${report}: ${failed.join(', ')} is fail; playtest-ok does not waive a failing row`])
  }
  if (waiver) return console.log(`playtest-check: waived (${waiver.trim()}); the gate judges the reason`)

  if (!report) fail(['a play file changed but the PR has no design/playtests/<date>-<sha>.md (roles/playtester.md)'])
  const md = readFileSync(report, 'utf8')
  const errors = checkReport(md, (rel) => existsSync(join(dirname(report), rel)))
  const sha = md.match(/^Commit:\s*([0-9a-f]{7,40})\s*$/m)?.[1]
  if (sha) {
    // the PR's own commits after the played one; commits that came in from the base branch do not count
    const later = git(['log', '--no-merges', '--format=', '--name-only', `${sha}..HEAD`, `^${base}`, '--'])
    if (git(['merge-base', '--is-ancestor', sha, 'HEAD']) === null) errors.push(`Commit ${sha} is not in this PR's history`)
    else if (later === null) errors.push(`could not diff against ${sha}`)
    else for (const f of lines(later).filter(isPlayFile)) errors.push(`${f} changed after the played commit ${sha}; play the new build`)
  }
  if (errors.length) fail(errors.map((e) => `${report}: ${e}`))
  console.log(`playtest-check: ${report} ok`)
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) main()
