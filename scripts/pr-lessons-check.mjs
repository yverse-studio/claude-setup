// Checks a PR body for the Lessons: line (docs/MAP.md, Where a lesson goes): either the repo paths
// of the homes that changed, or "none, because <why the next thread would not repeat it>"; and for the
// Prior art: line (yskills 2026-10-27, CLAUDE.md Work for the future): what already exists was checked
// (our repos, skills, plugins, public setups) and the decision copy, adapt or build, with its reason.
// Usage: node scripts/pr-lessons-check.mjs [body-file]   (no file: reads stdin)
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const PATH = String.raw`[\w./-]+/?[\w.-]*\.\w+(?:\s*\([^)\n]+\))?` // any repo path with an extension: a doc, a hook, a test
const PATHS = new RegExp(`^Lessons: ${PATH}(?:\\s*,\\s*${PATH})*\\s*$`)
const NONE = /^Lessons: none, because .{10,}$/
export const MESSAGE = 'PR body needs a line `Lessons: <path to the home that changed>` or `Lessons: none, because <why the next thread would not repeat it>` (docs/MAP.md, Where a lesson goes)'

const PRIOR = /^Prior art: (?=.*\b(cop(y|ied)|adapt(ed)?|reuse[ds]?|buil[dt]|extend(ed|s)?)\b).{20,}$/i
const PRIOR_NONE = /^Prior art: none, because .{10,}$/
export const PRIOR_MESSAGE = 'PR body needs a line `Prior art: <what exists that was checked: our repos, skills, plugins, public setups> -> copy | adapt | build, because <why>` or `Prior art: none, because <why nothing could exist>` (CLAUDE.md, Work for the future)'

export function checkPriorArt(body) {
  return body.split(/\r?\n/).some((l) => PRIOR.test(l.trimEnd()) || PRIOR_NONE.test(l.trimEnd()))
}

export function checkLessons(body) {
  return body.split(/\r?\n/).some((l) => PATHS.test(l) || NONE.test(l.trimEnd()))
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const body = readFileSync(process.argv[2] ?? 0, 'utf8')
  const missing = [!checkLessons(body) && MESSAGE, !checkPriorArt(body) && PRIOR_MESSAGE].filter(Boolean)
  if (missing.length) { console.error(missing.join('\n')); process.exit(1) }
}
