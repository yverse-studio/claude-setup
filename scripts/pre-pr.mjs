#!/usr/bin/env node
// The one pre-PR check: runs exactly what .github/workflows/ci.yml runs on a pull request, so a push
// from any machine (cloud thread with hooks, laptop without) fails here and not in CI
// (yskills 2026-11-08: 9 PRs went red in CI for things CI had always checked).
// Usage: node scripts/pre-pr.mjs [--base origin/main] [--body <file>] [--quick]
//   --body <file>  the PR body to check (Prior art: and Lessons: lines); without it the body check
//                  is reported as still open, never as passed.
//   --quick        skip the node test line (the git pre-push hook uses it; CI still runs the tests).
import { execFileSync, spawnSync } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const args = process.argv.slice(2)
const opt = (name) => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : undefined }
const base = opt('--base') ?? 'origin/main'
const body = opt('--body')
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

// Companyxy 2026-11-12 (point 11): 25 checks were already red on main and blocked a doc patch. When anything fails, check.mjs
// also runs on a clean copy of the base: a red base is fixed first, as its own PR, before the feature goes on.
export function diagnoseRed({ failed, baseOk }) {
  if (!failed.length) return null
  if (baseOk === false) return `main is red too (scripts/check.mjs fails on ${base} itself): fix main first, as its own small PR, then rebase this branch. Do not push this change on top of a red main.`
  if (baseOk === null) return `could not check main (no worktree); run node scripts/check.mjs on a fresh ${base} before blaming your branch.`
  return 'main is green: the failures are your branch\'s.'
}
// Runs the failing steps' own commands on a clean copy of the base (check.mjs always, the CI test line when the tests failed).
export function baseCheckOk(failed = [], run = spawnSync) {
  const dir = join(tmpdir(), `pre-pr-base-${process.pid}`)
  try {
    execFileSync('git', ['worktree', 'add', '--detach', '-q', dir, base], { cwd: root, stdio: 'ignore' })
    const cmds = [['node', ['scripts/check.mjs']]]
    if (failed.includes('tests (CI line)')) {
      const tests = ciSteps(readFileSync(join(dir, '.github/workflows/ci.yml'), 'utf8')).tests
      if (tests) { const [cmd, ...argv] = tests.split(/\s+/); cmds.push([cmd, argv]) }
    }
    return cmds.every(([cmd, argv]) => run(cmd, argv, { cwd: dir, stdio: 'ignore' }).status === 0)
  } catch { return null } finally { spawnSync('git', ['worktree', 'remove', '--force', dir], { cwd: root, stdio: 'ignore' }) }
}

const results = []
function step(name, cmd, argv) {
  const r = spawnSync(cmd, argv, { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] })
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
  step('paths-lint (no hard-coded laptop paths)', 'node', ['--test', 'scripts/paths-lint.test.mjs'])
  step('floor-guard', 'node', ['.claude/skills/publish/templates/new-project/scripts/floor-guard.mjs', '--base', base])
  if (body) step('PR body (Prior art:, Lessons:)', 'node', ['scripts/pr-lessons-check.mjs', body])
  else { results.push(['PR body', null]); console.log('open PR body: not checked here; run again with --body <file> before gh pr create (Prior art: ... -> copy|adapt|build, because ...; Lessons: <repo path>)') }
  if (!quick && steps.tests) { const [cmd, ...argv] = steps.tests.split(/\s+/); step('tests (CI line)', cmd, argv) }
  const failed = results.filter(([, ok]) => ok === false)
  if (failed.length) console.log(diagnoseRed({ failed: failed.map(([n]) => n), baseOk: baseCheckOk(failed.map(([n]) => n)) }))
  console.log(failed.length ? `pre-pr: ${failed.length} failing: ${failed.map(([n]) => n).join(', ')}. Fix the code, not the check.` : 'pre-pr: clean (CI runs the same steps)')
  process.exit(failed.length ? 1 : 0)
}
