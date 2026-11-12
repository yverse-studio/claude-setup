// Rule budget (cleanup/PLAN.md step 2, yskills 2026-11-12): the prose rules of this setup only shrink. A "rule line" is a
// paragraph or list item with never / must / always / "no ... without". One that carries `[guard: ...]` naming an existing
// file (test, hook, script) is enforced and not counted. config/rule-budget.json freezes the unguarded count per file;
// a file may stay or fall, never grow. Raise a count only on purpose: `node scripts/rule-budget.mjs --freeze`.
// Used by scripts/check.mjs (so pre-pr and CI run it); the Monday audit reads the number this prints.
import { existsSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { blocks } from './dup-rules.mjs'

const RULE = /\b(never|must|always)\b|\bno\b[^.]*\bwithout\b/i
const GUARD = /\[guard:([^\]]*)\]/
const PATH = /[\w./-]+\.(?:mjs|json|py|yml)\b/g

// files: [[path, text]]; fileExists(path): does a guard's file exist.
export function measure(files, fileExists) {
  const perFile = {}
  const badGuards = []
  for (const [f, text] of files) {
    for (const b of blocks(text)) {
      if (!RULE.test(b) || /^#/.test(b)) continue
      const guard = b.match(GUARD)?.[1]
      const paths = guard?.match(PATH) ?? []
      const missing = paths.filter((p) => !fileExists(p) && !fileExists(`global/${p.replace(/^global\//, '')}`))
      if (guard && paths.length && !missing.length) continue
      if (guard && missing.length) badGuards.push(`${f}: [guard: ${guard.trim()}] names ${missing.join(', ')}, which does not exist`)
      perFile[f] = (perFile[f] ?? 0) + 1
    }
  }
  return { total: Object.values(perFile).reduce((a, n) => a + n, 0), perFile, badGuards }
}

export function compare(m, baseline) {
  const out = [...m.badGuards]
  for (const [f, n] of Object.entries(m.perFile)) {
    const was = baseline.perFile?.[f] ?? 0
    if (n > was) out.push(`${f}: ${n - was} new prose rule line(s) (${n}, budget ${was}); give each a \`[guard: test|hook <existing file>]\` and its test, or drop one elsewhere (docs/MAP.md, Checks)`)
  }
  return out
}

const here = dirname(dirname(fileURLToPath(import.meta.url)))
const walk = (root, d) => readdirSync(join(root, d)).flatMap((n) => {
  const rel = `${d}/${n}`
  return statSync(join(root, rel)).isDirectory() ? walk(root, rel) : rel.endsWith('.md') ? [rel] : []
})
// The files whose prose counts: CLAUDE.md, docs (not research, archive, proposals), the operator skill (not templates).
export const budgetFiles = (root = here) => ['CLAUDE.md', ...walk(root, 'docs').filter((f) => !/^docs\/(research|archive|proposals)\//.test(f)), ...walk(root, '.claude/skills/operator').filter((f) => !f.includes('/templates/'))]
export const measureRepo = (root = here) => measure(budgetFiles(root).map((f) => [f, readFileSync(join(root, f), 'utf8')]), (p) => existsSync(join(root, p)))
export const BASELINE = join(here, 'config/rule-budget.json')

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const m = measureRepo()
  if (process.argv.includes('--freeze')) {
    writeFileSync(BASELINE, `${JSON.stringify({ total: m.total, perFile: m.perFile }, null, 2)}\n`)
    console.log(`rule budget frozen: ${m.total} unguarded rule lines in ${Object.keys(m.perFile).length} files`)
  } else {
    const baseline = existsSync(BASELINE) ? JSON.parse(readFileSync(BASELINE, 'utf8')) : { perFile: {} }
    const problems = compare(m, baseline)
    console.log(`rule budget: ${m.total} unguarded rule lines (baseline ${baseline.total ?? 'none'}) in ${Object.keys(m.perFile).length} files`)
    if (problems.length) { console.error(problems.map((p) => `x ${p}`).join('\n')); process.exit(1) }
  }
}
