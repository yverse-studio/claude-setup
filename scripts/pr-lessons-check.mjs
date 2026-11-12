// Checks a PR body for the Lessons: line (docs/MAP.md, Where a lesson goes): either the repo paths
// of the homes that changed, or "none, because <why the next thread would not repeat it>"; and for the
// Prior art: line (yskills 2026-10-27, CLAUDE.md Work for the future): what already exists was checked
// (our repos, skills, plugins, public setups) and the decision copy, adapt or build, with its reason.
// Usage: PR_TITLE=<title> node scripts/pr-lessons-check.mjs [body-file]   (no file: reads stdin)
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const PATH = String.raw`[\w./-]+/?[\w.-]*\.\w+(?:\s*\([^)\n]+\))?` // any repo path with an extension: a doc, a hook, a test
const PATHS = new RegExp(`^Lessons: ${PATH}(?:\\s*,\\s*${PATH})*\\s*$`)
const NONE = /^Lessons: none, because .{10,}$/
export const MESSAGE = 'PR body needs a line `Lessons: <path to the home that changed>` or `Lessons: none, because <why the next thread would not repeat it>` (docs/MAP.md, Where a lesson goes)'

// Same rule as global/team-guard.mjs priorArtOk (one corpus tests both): a named source and a decision, 20+ characters.
const PRIOR_SOURCE = /https?:\/\/\S+|[\w.-]+\/[\w.-]+|#\d+|\b[\w-]+\.(?:md|mjs|json|ts|js|yml|sh)\b|`[^`\n]{3,}`/
const PRIOR_DECISION = /\b(cop(y|ied)|adapt(ed|s)?|reuse[ds]?|buil[dt]|extend(ed|s)?|reverse-engineer\w*)\b/i
const PRIOR = { test: (l) => /^Prior art: /.test(l) && l.length >= 32 && PRIOR_SOURCE.test(l) && PRIOR_DECISION.test(l) }
const PRIOR_NONE = /^Prior art: none, because .{10,}$/
export const PRIOR_MESSAGE = 'PR body needs a line `Prior art: <what exists that was checked: our repos, skills, plugins, public setups> -> copy | adapt | build, because <why>` or `Prior art: none, because <why nothing could exist>` (CLAUDE.md, Work for the future)'

export function checkPriorArt(body) {
  return body.split(/\r?\n/).some((l) => PRIOR.test(l.trimEnd()) || PRIOR_NONE.test(l.trimEnd()))
}

export function checkLessons(body) {
  return body.split(/\r?\n/).some((l) => PATHS.test(l) || NONE.test(l.trimEnd()))
}

// yskills 2026-11-03: every miss becomes an automatic check, and a gate checks the numbers and looks at the real render.
// A fix PR's Lessons: line names a test, check, guard or lint file (or "none, because"); a scored asset PR links its frames.
const CHECK_PATH = /^Lessons: .*([\w-]+\.test\.\w+|check\w*\.\w+|[\w-]*guard\.\w+|lint\w*\.\w+)/
export const FIX_MESSAGE = 'a fix PR turns its miss into a check: the Lessons: line names the test, check, guard or lint file that now catches it, or says "none, because <why no check can>" (CLAUDE.md, Lessons stick)'
export function checkFixHasCheck(title, body) {
  if (!/^fix(\([^)]*\))?!?:/i.test(String(title ?? '').trim())) return true
  return body.split(/\r?\n/).some((l) => CHECK_PATH.test(l) || NONE.test(l.trimEnd()))
}
const ASSET = /\b(render\w*|frames?|scenes?|clips?|poses?|strip|garments?|rig|figur\w*)\b/i
// A PR about the gate rule itself trips ASSET too (2026-11-08, #379): it says `Render: none, because <no asset in this PR>`, as Lessons: does.
const RENDER = /^Render: (.*(https?:\/\/\S+|[\w./-]+\.(png|jpe?g|webp|gif|mp4|webm))|none, because .{10,})/im
export const RENDER_MESSAGE = 'a scored asset PR (render, scene, clip, pose, figure) needs a line `Render: <link or path to the real frames the gate looked at>` (gate.md, Asset PRs), or `Render: none, because <no asset changed>`: numbers alone are no pass'
export function checkRender(body) {
  return !(/\b[0-5]\/5\b/.test(body) && ASSET.test(body)) || RENDER.test(body)
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const body = readFileSync(process.argv[2] ?? 0, 'utf8')
  const missing = [!checkLessons(body) && MESSAGE, !checkPriorArt(body) && PRIOR_MESSAGE, !checkFixHasCheck(process.env.PR_TITLE, body) && FIX_MESSAGE, !checkRender(body) && RENDER_MESSAGE].filter(Boolean)
  if (missing.length) { console.error(missing.join('\n')); process.exit(1) }
}
