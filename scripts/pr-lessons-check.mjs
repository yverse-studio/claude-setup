// Checks a PR body for the Lessons: line (docs/MAP.md, Where a lesson goes): either the repo paths
// of the homes that changed, or "none, because <why the next thread would not repeat it>".
// Usage: node scripts/pr-lessons-check.mjs [body-file]   (no file: reads stdin)
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const PATH = String.raw`[\w./-]+/?[\w.-]*\.\w+(?:\s*\([^)\n]+\))?` // any repo path with an extension: a doc, a hook, a test
const PATHS = new RegExp(`^Lessons: ${PATH}(?:\\s*,\\s*${PATH})*\\s*$`)
const NONE = /^Lessons: none, because .{10,}$/
export const MESSAGE = 'PR body needs a line `Lessons: <path to the home that changed>` or `Lessons: none, because <why the next thread would not repeat it>` (docs/MAP.md, Where a lesson goes)'

export function checkLessons(body) {
  return body.split(/\r?\n/).some((l) => PATHS.test(l) || NONE.test(l.trimEnd()))
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const body = readFileSync(process.argv[2] ?? 0, 'utf8')
  if (!checkLessons(body)) { console.error(MESSAGE); process.exit(1) }
}
