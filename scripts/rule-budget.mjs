// Rule budget (cleanup/PLAN.md step 2, yskills 2026-11-12): the prose rules of this setup only shrink. A "rule line" is a
// paragraph or list item with never / must / always / "no ... without". One that carries `[guard: ...]` naming an existing
// file (test, hook, script) is enforced and not counted. config/rule-budget.json freezes the unguarded count per file;
// a file may stay or fall, never grow, and a fall must be frozen so it cannot be refilled. Raise a count only on purpose: `node scripts/rule-budget.mjs --freeze`.
// A fall must be a real cut: the count of lines with any prohibition wording (WIDE) has to fall with it, so rewording never/must/always away fails.
// Used by scripts/check.mjs (so pre-pr and CI run it); the Monday audit reads the number this prints.
import { existsSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { blocks } from './dup-rules.mjs'

const RULE = /\b(never|must|always)\b|\bno\b[^.]*\bwithout\b/i
// A prohibition in any wording (only, not, stay out ...): a rule reworded to dodge RULE still shows here. Lines are not
// counted as rules for this; it only proves a fall in the budget is a real cut (the wide count must fall with it).
const WIDE = /\b(never|must|always|only|not|no|don'?t|doesn'?t|cannot|can'?t|without|stay(s)? out|forbid\w*|banned?|instead of)\b/i
const GUARD = /\[guard:([^\]]*)\]/

// Same reading as check.mjs (Rule enforcement): deny|ask name a rule in global/settings.json, test|hook a .mjs file; a bare path is a file.
// guardOk(kind, target): does that guard exist.
const parseGuard = (g) => {
  const m = g.trim().match(/^(deny|ask|test|hook)\s+(.+)$/)
  if (!m) return { kind: 'file', target: g.trim().split(/[\s,]/)[0] }
  return { kind: m[1], target: /^(deny|ask)$/.test(m[1]) ? m[2].trim() : m[2].split(/[\s,]/)[0] }
}

// files: [[path, text]]. Returns the unguarded rule lines per file and the guard tags that name nothing.
export function measure(files, guardOk) {
  const perFile = {}
  const wide = {}
  const badGuards = []
  for (const [f, text] of files) {
    for (const b of blocks(text)) {
      if (/^#/.test(b)) continue
      const g = b.match(GUARD)?.[1]
      const isRule = RULE.test(b)
      let guarded = false
      if (g !== undefined) {
        const { kind, target } = parseGuard(g)
        if (/^(deny|ask)$/.test(kind) || /\.mjs$/.test(target)) {
          guarded = guardOk(kind, target)
          if (!guarded && isRule) badGuards.push(`${f}: [guard: ${g.trim()}] names ${target}, which does not exist`)
        }
      }
      if (guarded) continue
      if (WIDE.test(b)) wide[f] = (wide[f] ?? 0) + 1
      if (!isRule) continue
      perFile[f] = (perFile[f] ?? 0) + 1
    }
  }
  return { total: Object.values(perFile).reduce((a, n) => a + n, 0), perFile, wide, badGuards }
}

export function compare(m, baseline) {
  const out = [...m.badGuards]
  for (const f of new Set([...Object.keys(m.perFile), ...Object.keys(baseline.perFile ?? {})])) {
    const n = m.perFile[f] ?? 0
    const was = baseline.perFile?.[f] ?? 0
    const wideFall = (baseline.wide?.[f]) === undefined ? Infinity : baseline.wide[f] - (m.wide?.[f] ?? 0)
    if (n < was && wideFall < was - n) out.push(`${f}: fell to ${n} from ${was} but the lines with any prohibition wording fell only ${wideFall} (need ${was - n}): rewording is not a cut; delete the line, move it to its one home, or guard it`)
    else if (n < was) out.push(`${f}: fell to ${n} from ${was}; lock the gain in, run \`node scripts/rule-budget.mjs --freeze\` (else a new rule fits in the gap)`)
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
export const measureRepo = (root = here) => {
  const perm = JSON.parse(readFileSync(join(root, 'global/settings.json'), 'utf8')).permissions ?? {}
  const guardOk = (kind, target) => kind === 'deny' ? (perm.deny ?? []).includes(target) : kind === 'ask' ? (perm.ask ?? []).includes(target) : existsSync(join(root, target))
  return measure(budgetFiles(root).map((f) => [f, readFileSync(join(root, f), 'utf8')]), guardOk)
}
export const BASELINE = join(here, 'config/rule-budget.json')

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const m = measureRepo()
  if (process.argv.includes('--freeze')) {
    writeFileSync(BASELINE, `${JSON.stringify({ perFile: m.perFile, wide: m.wide }, null, 2)}\n`)
    console.log(`rule budget frozen: ${m.total} unguarded rule lines in ${Object.keys(m.perFile).length} files`)
  } else {
    const baseline = existsSync(BASELINE) ? JSON.parse(readFileSync(BASELINE, 'utf8')) : { perFile: {} }
    const problems = compare(m, baseline)
    console.log(`rule budget: ${m.total} unguarded rule lines (baseline ${Object.values(baseline.perFile).reduce((a, n) => a + n, 0)}) in ${Object.keys(m.perFile).length} files`)
    if (problems.length) { console.error(problems.map((p) => `x ${p}`).join('\n')); process.exit(1) }
  }
}
