#!/usr/bin/env node
// Floor guard: fails a PR that lowers the bar instead of fixing the code. It reads the diff from
// the merge base to the working tree (untracked files included) and reports a skipped test, a
// deleted or renamed-away test (matched test by test, so an unrelated new test does not offset it),
// fewer assertions in a test that stayed, a new suppression or stub, and a lowered coverage threshold. Tightening is silent, loosening is loud.
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

const tracked = git(['diff', '--unified=0', '--no-color', '--no-ext-diff', '-M', mergeBase, '--'])
if (tracked === null) bail(`could not diff against ${mergeBase}`)
const untrackedList = git(['ls-files', '--others', '--exclude-standard'])
if (untrackedList === null) bail('could not list untracked files')
const untracked = untrackedList.split('\n').filter(Boolean).map((f) => {
  const d = git(['diff', '--no-index', '--unified=0', '--no-color', '--', '/dev/null', f], { diffExit: true })
  if (d === null) bail(`could not diff untracked file ${f}`)
  return d
}).join('\n')

// A rename (-M) shows only its edits, filed under the new path; a move too rewritten for git to see
// as a rename arrives as a delete plus a new file and is matched by assertion count below.
// `---`/`+++` are file headers only between a `diff` line and its first `@@`; inside a hunk every
// line is content (an added `++i` shows as `+++i`).
const added = [], removed = [], deleted = [], created = new Set(), renames = []
const pathOf = (s) => s.replace(/^[ab]\//, '')
let file = '', oldFile = '', renameFrom = '', inHeader = false, isNew = false
for (const line of `${tracked}\n${untracked}`.split('\n')) {
  if (line.startsWith('diff ')) { inHeader = true; isNew = false }
  else if (line.startsWith('@@')) inHeader = false
  else if (inHeader) {
    if (line.startsWith('new file mode')) isNew = true
    else if (line.startsWith('rename from ')) renameFrom = line.slice(12)
    else if (line.startsWith('rename to ')) renames.push({ from: renameFrom, to: line.slice(10) })
    else if (line.startsWith('--- ')) oldFile = pathOf(line.slice(4))
    else if (line.startsWith('+++ ')) {
      const next = pathOf(line.slice(4))
      file = next === '/dev/null' ? oldFile : next
      if (next === '/dev/null') deleted.push(file)
      else if (isNew) created.add(file)
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
for (const { from, to } of renames) if (isTest(from) && !isTest(to)) flag('test-deleted', from, `renamed to ${to}, out of the test pattern`)

// Tests are matched one by one. A test is a title line (`it('x'`, `test.only('x'`, `def test_x`,
// `func TestX`) and the assertion lines under it up to the next title; assertions above the first
// title belong to the file itself (title ''). Each test of a test file is read at the merge base and
// now. A test that kept its title may not lose assertions. A test that is gone (deleted, renamed,
// split, merged, moved) is covered only by new tests that carry its assertions: a new test with the
// same title anywhere, or the same assertion text. A new test with other assertions covers nothing,
// even when the count matches. What is not covered is reported by test name with the real count.
const TITLE = /\b(?:it|test)(?:\.\w+)*(?:\.each\([^)]*\))?\s*\(\s*(['"`])((?:\\.|(?!\1).)*)\1|^\s*(?:async\s+)?def\s+(test\w*)|^\s*func\s+(Test\w*)/
const unitsOf = (text) => {
  const units = new Map([['', []]])
  let cur = ''
  for (const raw of text.split('\n')) {
    const m = raw.match(TITLE)
    if (m) { cur = m[2] ?? m[3] ?? m[4]; if (!units.has(cur)) units.set(cur, []) }
    if (ASSERT.test(m ? raw.replace(m[0], '') : raw)) units.get(cur).push((m ? raw.replace(m[0], '') : raw).trim().replace(/\s+/g, ' '))
  }
  return units
}
const label = (title) => (title ? `test "${title}"` : 'top-level assertions')
const without = (texts, drop) => { const left = [...drop]; return texts.filter((t) => { const j = left.indexOf(t); if (j > -1) left.splice(j, 1); return j === -1 }) }

const renamedFrom = new Map(renames.map((r) => [r.to, r.from]))
const lost = [], fresh = []
for (const f of new Set([...added, ...removed].map((l) => l.file).concat(deleted))) {
  if (!isTest(f) || self.test(f)) continue
  const was = created.has(f) ? '' : git(['show', `${mergeBase}:${renamedFrom.get(f) ?? f}`])
  if (was === null) bail(`could not read ${f} at ${mergeBase}`)
  let now = ''
  if (!deleted.includes(f)) try { now = readFileSync(f, 'utf8') } catch { bail(`could not read ${f}`) }
  const before = unitsOf(was), after = unitsOf(now)
  if (deleted.includes(f) && [...before].every(([title, texts]) => !title && !texts.length)) flag('test-deleted', f, 'file deleted') // nothing to match it by
  for (const [title, texts] of before) {
    const kept = after.get(title)
    if (kept && !deleted.includes(f)) {
      const n = texts.length - kept.length
      if (n > 0) lost.push({ f, title, need: n, whole: false, texts: without(texts, kept) })
    } else if (title || texts.length) lost.push({ f, title, need: texts.length || 1, whole: true, total: texts.length, texts })
  }
  for (const [title, texts] of after) {
    const left = title ? (before.has(title) ? null : [...texts]) : without(texts, before.get(''))
    if (left && (title || left.length)) fresh.push({ title, left, used: false })
  }
}
// Same title first (a moved test may be reworded), then the same assertion text (renamed, split, merged).
const take = (g, from, text) => { from.left.splice(from.left.indexOf(text), 1); g.need--; g.covered++ }
for (const g of lost) {
  g.covered = 0
  for (const x of fresh) {
    if (!g.title || x.title !== g.title) continue
    for (const t of g.texts) if (g.need > 0 && x.left.includes(t)) take(g, x, t)
    while (g.need > 0 && x.left.length) take(g, x, x.left[0])
  }
}
for (const g of lost) {
  for (const t of g.texts) {
    const x = g.need > 0 && fresh.find((y) => y.left.includes(t))
    if (x) take(g, x, t)
  }
  if (g.whole && g.total === 0) { // no assertions to match: a same-named or another assertion-free new test stands in
    const x = fresh.find((y) => y.title === g.title) ?? fresh.find((y) => !y.used && !y.left.length)
    if (x) { x.used = true; g.need = 0 }
  }
}
for (const g of lost) {
  if (g.need <= 0) continue
  if (g.whole && g.covered === 0) flag('test-deleted', g.f, `${label(g.title)} is gone, no new test carries its ${g.total || 'no'} assertion(s)`)
  else flag('assertion-removed', g.f, `${label(g.title)}: ${g.need} fewer assertion line(s)`)
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
