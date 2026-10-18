// The floor guard: each move that lowers the bar fails, an honest change passes.
// Run: node --test scripts/floor-guard.test.mjs
import assert from 'node:assert/strict'
import { execFileSync, spawnSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'

const guard = join(dirname(fileURLToPath(import.meta.url)), '..', '.claude/skills/publish/templates/new-project/scripts/floor-guard.mjs')
const git = (cwd, ...args) => execFileSync('git', ['-c', 'user.name=t', '-c', 'user.email=t@t', '-c', 'commit.gpgsign=false', ...args], { cwd, stdio: 'pipe' })
const put = (cwd, rel, text) => { mkdirSync(dirname(join(cwd, rel)), { recursive: true }); writeFileSync(join(cwd, rel), text) }

const BASE = {
  'src/sum.test.mjs': "import { test } from 'node:test'\ntest('adds', () => {\n  assert.equal(sum(1, 2), 3)\n  assert.equal(sum(2, 2), 4)\n})\n",
  'test/bot.mjs': 'assert.ok(wins >= 3)\nassert.ok(avgNight >= 5)\n',
  'vitest.config.ts': 'export default { test: { coverage: { thresholds: { lines: 80 } } } }\n',
  'src/sum.mjs': 'export const sum = (a, b) => a + b\n',
}

// Builds a repo with a base commit on main, then a branch where `change` edits the tree.
function run(change, { commitMessage = 'fix: change', base = 'main', files = BASE } = {}) {
  const dir = mkdtempSync(join(tmpdir(), 'floor-'))
  try {
    git(dir, 'init', '-q', '-b', 'main')
    for (const [rel, text] of Object.entries(files)) put(dir, rel, text)
    git(dir, 'add', '-A'); git(dir, 'commit', '-qm', 'base')
    git(dir, 'checkout', '-qb', 'work')
    change(dir)
    git(dir, 'add', '-A'); git(dir, 'commit', '-qm', commitMessage, '--allow-empty')
    const r = spawnSync('node', [guard, '--base', base], { cwd: dir, encoding: 'utf8' })
    return { code: r.status, out: r.stdout + r.stderr }
  } finally { rmSync(dir, { recursive: true, force: true }) }
}

const fails = (rule, change, files) => {
  const r = run(change, files ? { files: { ...BASE, ...files } } : {})
  assert.equal(r.code, 1, r.out)
  assert.match(r.out, new RegExp(`\\[${rule}\\]`))
}

test('a skipped test fails', () => fails('test-skipped', (d) => put(d, 'src/sum.test.mjs', BASE['src/sum.test.mjs'].replace("test('adds'", "test.skip('adds'"))))
test('a left-in .only fails', () => fails('test-skipped', (d) => put(d, 'src/sum.test.mjs', BASE['src/sum.test.mjs'].replace("test('adds'", "test.only('adds'"))))
test('a deleted test file fails', () => fails('test-deleted', (d) => rmSync(join(d, 'src/sum.test.mjs'))))
test('an assertion removed from a test that stayed fails', () => fails('assertion-removed', (d) => put(d, 'src/sum.test.mjs', BASE['src/sum.test.mjs'].replace("  assert.equal(sum(2, 2), 4)\n", ''))))
test('an assertion removed from test/bot.mjs fails (the Igelgarten case)', () => fails('assertion-removed', (d) => put(d, 'test/bot.mjs', 'assert.ok(wins >= 3)\n')))
test('@ts-ignore fails', () => fails('silenced-checker', (d) => put(d, 'src/sum.mjs', '// @ts-ignore\nexport const sum = (a, b) => a + b\n')))
test('eslint-disable fails', () => fails('silenced-checker', (d) => put(d, 'src/sum.mjs', '/* eslint-disable */\nexport const sum = (a, b) => a + b\n')))
test('@ts-expect-error without a reason fails', () => fails('silenced-checker', (d) => put(d, 'src/sum.mjs', '// @ts-expect-error\nexport const sum = (a, b) => a + b\n')))
test('a "not implemented" stub fails', () => fails('unfinished-work', (d) => put(d, 'src/new.mjs', 'export const f = () => { throw new Error("Not implemented") }\n')))
test('an empty catch fails', () => fails('unfinished-work', (d) => put(d, 'src/new.mjs', 'try { go() } catch {}\n')))
test('editing a role check script fails', () => fails('checker-changed', (d) => put(d, 'scripts/design-check.mjs', 'export {}\n'), { 'scripts/design-check.mjs': 'export const a = 1\nexport const b = 2\n' }))
test('deleting a role check script fails', () => fails('checker-changed', (d) => rmSync(join(d, 'scripts/gdd-check.mjs')), { 'scripts/gdd-check.mjs': 'export const a = 1\n' }))
test('removing the role-check CI step fails', () => fails('checker-changed', (d) => put(d, '.github/workflows/ci.yml', 'steps:\n  - run: npm test\n'), { '.github/workflows/ci.yml': 'steps:\n  - run: npm test\n  - run: node scripts/project-checks.mjs --base origin/main\n' }))
test('a floor-ok commit waives an edited role check script (the refresh path)', () => {
  const r = run((d) => put(d, 'scripts/design-check.mjs', 'export {}\n'), { commitMessage: 'chore: refresh checks\n\nfloor-ok: refreshed from claude-setup main', files: { ...BASE, 'scripts/design-check.mjs': 'export const a = 1\n' } })
  assert.equal(r.code, 0, r.out)
})
test('adding a new role check script and keeping the CI step passes', () => {
  const r = run((d) => { put(d, 'scripts/audio-check.mjs', 'export const a = 1\n'); put(d, '.github/workflows/ci.yml', 'steps:\n  - run: node scripts/project-checks.mjs --base origin/main\n  - run: npm test\n') }, { files: { ...BASE, '.github/workflows/ci.yml': 'steps:\n  - run: node scripts/project-checks.mjs --base origin/main\n' } })
  assert.equal(r.code, 0, r.out)
})
test('a lowered coverage threshold fails', () => fails('threshold-lowered', (d) => put(d, 'vitest.config.ts', BASE['vitest.config.ts'].replace('80', '60'))))
test('a skip in an untracked, uncommitted file fails', () => {
  const dir = mkdtempSync(join(tmpdir(), 'floor-'))
  try {
    git(dir, 'init', '-q', '-b', 'main'); put(dir, 'a.txt', 'x'); git(dir, 'add', '-A'); git(dir, 'commit', '-qm', 'base')
    put(dir, 'new.test.mjs', "test.skip('x', () => {})\n")
    const r = spawnSync('node', [guard, '--base', 'main'], { cwd: dir, encoding: 'utf8' })
    assert.equal(r.status, 1, r.stdout + r.stderr)
  } finally { rmSync(dir, { recursive: true, force: true }) }
})

test('an honest change passes: code fixed, a test added, an assertion reworded', () => {
  const r = run((d) => {
    put(d, 'src/sum.mjs', 'export const sum = (a, b) => Number(a) + Number(b)\n')
    put(d, 'src/sum.test.mjs', BASE['src/sum.test.mjs'].replace('sum(1, 2), 3', 'sum("1", 2), 3') + 'assert.equal(sum(0, 0), 0)\n')
  })
  assert.equal(r.code, 0, r.out)
})
test('tightening passes: a raised threshold, a removed suppression, a removed skip', () => {
  const r = run((d) => put(d, 'vitest.config.ts', BASE['vitest.config.ts'].replace('80', '90')))
  assert.equal(r.code, 0, r.out)
  const r2 = run((d) => put(d, 'src/sum.mjs', 'export const sum = (a, b) => a + b\n'), { files: { ...BASE, 'src/sum.mjs': '// @ts-ignore\nexport const sum = (a, b) => a + b\n' } })
  assert.equal(r2.code, 0, r2.out)
})
test('a floor-ok commit message waives the findings and prints them', () => {
  const r = run((d) => rmSync(join(d, 'src/sum.test.mjs')), { commitMessage: 'test: drop sum test\n\nfloor-ok: sum moved to the shared lib, tested there' })
  assert.equal(r.code, 0, r.out)
  assert.match(r.out, /waived by "floor-ok: sum moved/)
  assert.match(r.out, /\[test-deleted\]/)
})
test('an empty floor-ok reason does not waive', () => {
  const r = run((d) => rmSync(join(d, 'src/sum.test.mjs')), { commitMessage: 'test: drop\n\nfloor-ok:' })
  assert.equal(r.code, 1, r.out)
})
test('no merge base exits 2, never 0', () => {
  const r = run((d) => put(d, 'x.txt', 'x'), { base: 'origin/main' })
  assert.equal(r.code, 2, r.out)
})
test('outside a git repo exits 2', () => {
  const dir = mkdtempSync(join(tmpdir(), 'floor-'))
  try { assert.equal(spawnSync('node', [guard], { cwd: dir, encoding: 'utf8', env: { ...process.env, GIT_CEILING_DIRECTORIES: tmpdir() } }).status, 2) }
  finally { rmSync(dir, { recursive: true, force: true }) }
})
