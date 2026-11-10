#!/usr/bin/env node
// The one pre-PR check: runs exactly what .github/workflows/ci.yml runs on a pull request, so a push
// from any machine (cloud thread with hooks, laptop without) fails here and not in CI
// (yskills 2026-11-08: 9 PRs went red in CI for things CI had always checked).
// Usage: node scripts/pre-pr.mjs [--base origin/main] [--body <file> --title <PR title>] [--quick]
//   --body <file>  the PR body to check (Prior art: and Lessons: lines); without it the body check
//                  is reported as still open, never as passed. It needs --title too: a `fix:` title
//                  also needs a check file in its Lessons: line, and CI reads the title (2026-11-11: #417 went red on that).
//   --quick        skip the node test line (the git pre-push hook uses it; CI still runs the tests).
import { execFileSync, spawnSync } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const args = process.argv.slice(2)
const opt = (name) => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : undefined }
const base = opt('--base') ?? 'origin/main'
const body = opt('--body')
const title = opt('--title')
const quick = args.includes('--quick')

// The CI steps this mirrors, read from the workflow so the two cannot drift.
export function ciSteps(yml) {
  const lines = yml.split('\n')
  const tests = lines.find((l) => /^\s*- run: node --test /.test(l))?.replace(/^\s*- run: /, '')
  return {
    check: 'node scripts/check.mjs',
    floor: `node .claude/skills/publish/templates/new-project/scripts/floor-guard.mjs --base ${base}`,
    body: 'node scripts/pr-lessons-check.mjs <body>',
    tests,
  }
}

const results = []
function step(name, cmd, argv, env = {}) {
  const r = spawnSync(cmd, argv, { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], env: { ...process.env, ...env } })
  const ok = r.status === 0
  results.push([name, ok])
  const tail = `${r.stdout ?? ''}${r.stderr ?? ''}`.trim().split('\n').slice(-6).join('\n  ')
  console.log(`${ok ? 'ok ' : 'FAIL'} ${name}${tail ? `\n  ${tail}` : ''}`)
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const steps = ciSteps(readFileSync(join(root, '.github/workflows/ci.yml'), 'utf8'))
  try { execFileSync('git', ['rev-parse', '--verify', '-q', base], { cwd: root, stdio: 'ignore' }) } catch {
    console.log(`note: ${base} not found locally, fetching`)
    spawnSync('git', ['fetch', '-q', 'origin', base.replace(/^origin\//, '')], { cwd: root, stdio: 'inherit' })
  }
  step('check.mjs', 'node', ['scripts/check.mjs'])
  step('floor-guard', 'node', ['.claude/skills/publish/templates/new-project/scripts/floor-guard.mjs', '--base', base])
  if (body && title === undefined) { results.push(['PR body', false]); console.log('FAIL PR body: pass --title "<PR title>" too; CI checks the title (a fix: PR needs a test, check, guard or lint file in its Lessons: line)') }
  else if (body) step('PR body (Prior art:, Lessons:, fix check)', 'node', ['scripts/pr-lessons-check.mjs', body], { PR_TITLE: title })
  else { results.push(['PR body', null]); console.log('open PR body: not checked here; run again with --body <file> --title "<title>" before the PR opens (Prior art: ... -> copy|adapt|build, because ...; Lessons: <repo path>)') }
  if (!quick && steps.tests) { const [cmd, ...argv] = steps.tests.split(/\s+/); step('tests (CI line)', cmd, argv) }
  const failed = results.filter(([, ok]) => ok === false)
  console.log(failed.length ? `pre-pr: ${failed.length} failing: ${failed.map(([n]) => n).join(', ')}. Fix the code, not the check.` : 'pre-pr: clean (CI runs the same steps)')
  process.exit(failed.length ? 1 : 0)
}
