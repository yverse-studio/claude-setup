#!/usr/bin/env node
// Floor guard: fails a PR that lowers the bar instead of fixing the code. It reads the diff from
// the merge base to the working tree (untracked files included) and reports a skipped test, a
// deleted test file, fewer assertions in a test file that stayed, a new suppression or stub, and
// a lowered coverage threshold, an edited or deleted role check script (scripts/*-check.mjs) a changed claudeSetup.kind, or an edited or removed role-check CI step. Tightening is silent, loosening is loud.
// Exit 0 clean, 1 violation, 2 could not run (never read 2 as 0).
// Escape hatch: a commit message in the PR with `floor-ok: <reason>` waives the findings; they
// are still printed with the reason.
// Usage: node scripts/floor-guard.mjs [--base <ref>]   (default origin/main)
// Adapted from addyosmani/agent-skills, floor-guard.md (MIT, see THIRD_PARTY.md in claude-setup).
import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'

const i = process.argv.indexOf('--base')
const base = i > -1 ? process.argv[i + 1] : 'origin/main'

// `git diff --no-index` exits 1 when the sides differ (a new file), so that output is kept.
// Any other failure is null, and null never reads as clean.
const git = (args, { diffExit = false } = {}) => {
  try { return execFileSync('git', ['-c', 'core.quotepath=off', ...args], { encoding: 'utf8', maxBuffer: 1 << 28, stdio: ['ignore', 'pipe', 'pipe'] }) }
  catch (e) { return diffExit && e.status === 1 && typeof e.stdout === 'string' ? e.stdout : null }
}
const bail = (msg) => { console.error(`floor-guard: ${msg}`); process.exit(2) }

const top = git(['rev-parse', '--show-toplevel'])?.trim()
if (!top) bail('not inside a git work tree')
process.chdir(top)
const mergeBase = git(['merge-base', base, 'HEAD'])?.trim()
if (!mergeBase) bail(`no merge base against ${base} (shallow clone? use fetch-depth: 0)`)

const tracked = git(['diff', '--unified=0', '--no-color', '--no-ext-diff', '--no-renames', mergeBase, '--'])
if (tracked === null) bail(`could not diff against ${mergeBase}`)
const untrackedList = git(['ls-files', '--others', '--exclude-standard'])
if (untrackedList === null) bail('could not list untracked files')
const untracked = untrackedList.split('\n').filter(Boolean).map((f) => {
  const d = git(['diff', '--no-index', '--unified=0', '--no-color', '--', '/dev/null', f], { diffExit: true })
  if (d === null) bail(`could not diff untracked file ${f}`)
  return d
}).join('\n')

// `---`/`+++` are file headers only between a `diff` line and its first `@@`; inside a hunk every
// line is content (an added `++i` shows as `+++i`).
const added = [], removed = [], deleted = []
const pathOf = (s) => s.replace(/^[ab]\//, '')
let file = '', oldFile = '', inHeader = false
for (const line of `${tracked}\n${untracked}`.split('\n')) {
  if (line.startsWith('diff ')) inHeader = true
  else if (line.startsWith('@@')) inHeader = false
  else if (inHeader) {
    if (line.startsWith('--- ')) oldFile = pathOf(line.slice(4))
    else if (line.startsWith('+++ ')) {
      const next = pathOf(line.slice(4))
      file = next === '/dev/null' ? oldFile : next
      if (next === '/dev/null') deleted.push(file)
    }
  } else if (line.startsWith('+')) added.push({ file, text: line.slice(1) })
  else if (line.startsWith('-')) removed.push({ file, text: line.slice(1) })
}

const CODE = /\.(m?[jt]sx?|cjs|vue|svelte|py|go|rs|rb|java|kt|cs|php|luau?)$/
const isTest = (f) => /\.(test|spec)\.|_test\.|(^|\/)test_|(^|\/)(tests?|__tests__)\//.test(f)
const isConfig = (f) => /(vitest|jest|vite|c8|nyc|playwright)[^/]*\.(m?[jt]s|json|cjs)$|(^|\/)package\.json$|\.c8rc|\.nycrc/.test(f)
const self = /(^|\/)floor-guard(\.test)?\.mjs$/ // holds the patterns as text

const SUPPRESSION = /@ts-ignore|@ts-nocheck|eslint-disable|biome-ignore|#\s*noqa|#\s*type:\s*ignore|istanbul ignore|c8 ignore|nosemgrep|gitleaks:allow|Stryker disable/
const TS_EXPECT_BARE = /@ts-expect-error\s*(\*\/)?\s*$/
const STUB = /throw new (Error|NotImplemented\w*)\([^)]*not implemented|catch\s*(\(\w*\))?\s*\{\s*\}/i
const SKIP = /\b(it|test|describe|suite|context)\.(skip|todo|only|fixme)\b|\b(x(it|describe|test)|fit|fdescribe)\(|@pytest\.mark\.skip|\bt\.Skip\(|\.skipTest\(/
const ASSERT = /\b(expect|assert\w*|should)\b/
const THRESHOLD = /["']?(lines|branches|functions|statements|threshold|minScore|minCoverage|coverage\w*)["']?\s*[:=]\s*(\d+(?:\.\d+)?)/

const findings = []
const flag = (rule, f, text) => findings.push({ rule, file: f, text: text.trim().slice(0, 120) })

for (const { file: f, text } of added) {
  if (self.test(f)) continue
  if (CODE.test(f) || isConfig(f)) {
    if (SUPPRESSION.test(text)) flag('silenced-checker', f, text)
    else if (TS_EXPECT_BARE.test(text)) flag('silenced-checker', f, `${text.trim()}  (@ts-expect-error needs a reason)`)
    if (STUB.test(text)) flag('unfinished-work', f, text)
    if (SKIP.test(text)) flag('test-skipped', f, text)
  }
}
for (const f of deleted) if (isTest(f)) flag('test-deleted', f, 'file deleted')

// The role checks guard themselves: editing or deleting one, or dropping the CI step that runs them, lowers the bar.
const ROLE_CHECK = /^scripts\/(project-checks|design-check|copy-check|analytics-check|gdd-check|audio-check|playtest-check)\.mjs$/
for (const f of new Set([...deleted, ...removed.map((l) => l.file)])) if (ROLE_CHECK.test(f)) flag('checker-changed', f, deleted.includes(f) ? 'file deleted' : 'lines removed from a role check script')
// The kind switch and the CI step that runs the checks are guarded the same way: any change to either flags.
for (const r of removed) if (/(^|\/)package\.json$/.test(r.file) && /"kind"\s*:/.test(r.text)) flag('checker-changed', r.file, `claudeSetup.kind changed: ${r.text}`)
const stepBlock = (text) => {
  const lines = text.split('\n'), start = lines.findIndex((l) => /^\s*- name:.*role checks/.test(l))
  if (start < 0) return null
  const indent = lines[start].match(/^\s*/)[0].length
  const end = lines.findIndex((l, i) => i > start && l.trim() && (l.match(/^\s*/)[0].length <= indent))
  return lines.slice(start, end < 0 ? undefined : end).map((l) => l.trimEnd()).join('\n')
}
for (const f of new Set([...added, ...removed].map((l) => l.file).concat(deleted))) {
  if (!/^\.github\/workflows\/.+\.ya?ml$/.test(f)) continue
  const before = git(['show', `${mergeBase}:${f}`]), oldStep = before === null ? null : stepBlock(before)
  if (oldStep === null) continue
  let now = null
  try { now = readFileSync(f, 'utf8') } catch { /* deleted */ }
  if (now === null || stepBlock(now) !== oldStep) flag('checker-changed', f, 'the "role checks" CI step was changed or removed')
}

const count = (lines, f) => lines.filter((l) => l.file === f && ASSERT.test(l.text)).length
for (const f of new Set(removed.map((l) => l.file))) {
  if (!isTest(f) || deleted.includes(f) || self.test(f)) continue
  const lost = count(removed, f) - count(added, f)
  if (lost > 0) flag('assertion-removed', f, `${lost} fewer assertion line(s)`)
}

// A coverage/threshold number that went down in a config file (same key, same file).
for (const r of removed) {
  if (!isConfig(r.file)) continue
  const before = r.text.match(THRESHOLD)
  const after = added.find((a) => a.file === r.file && a.text.match(THRESHOLD)?.[1] === before?.[1])?.text.match(THRESHOLD)
  if (before && after && Number(after[2]) < Number(before[2])) flag('threshold-lowered', r.file, `${before[1]}: ${before[2]} -> ${after[2]}`)
}

if (findings.length === 0) { console.log('floor-guard: clean'); process.exit(0) }

const log = git(['log', '--format=%B', `${mergeBase}..HEAD`])
if (log === null) bail('could not read the commit messages')
const waiver = log.match(/^floor-ok:[ \t]*(\S.*)$/m)
const report = findings.map((f) => `  [${f.rule}] ${f.file}: ${f.text}`).join('\n')
if (waiver) {
  console.log(`floor-guard: ${findings.length} finding(s) waived by "floor-ok: ${waiver[1].trim()}"\n${report}`)
  process.exit(0)
}
console.error(`floor-guard: ${findings.length} move(s) that lower the bar:\n${report}`)
console.error('\nFix the code, not the check. If the change is right, say why in a commit message of this PR: "floor-ok: <reason>".')
process.exit(1)
