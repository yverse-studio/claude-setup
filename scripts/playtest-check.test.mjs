// The playtest check: each rule fails on a violation, an honest PR and ordinary non-play changes pass.
// Run: node --test scripts/playtest-check.test.mjs
import assert from 'node:assert/strict'
import { execFileSync, spawnSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'
import { AREAS, checkReport, isPlayFile } from '../.claude/skills/publish/templates/new-game/scripts/playtest-check.mjs'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const script = join(root, '.claude/skills/publish/templates/new-game/scripts/playtest-check.mjs')
const template = readFileSync(join(root, '.claude/skills/operator/templates/playtest-report.md'), 'utf8')
const git = (cwd, ...args) => execFileSync('git', ['-c', 'user.name=t', '-c', 'user.email=t@t', '-c', 'commit.gpgsign=false', ...args], { cwd, stdio: 'pipe', encoding: 'utf8' })
const put = (cwd, rel, text = 'x\n') => { mkdirSync(dirname(join(cwd, rel)), { recursive: true }); writeFileSync(join(cwd, rel), text) }

const report = (sha, edit = (s) => s) => edit(`# Playtest: Garden, 2026-10-18
Preview: https://pr-5-garden.yverse.workers.dev
Commit: ${sha}
## Verdicts
| Area | Verdict | Evidence |
|---|---|---|
${AREAS.map((a) => `| ${a} | pass | 00:12 the first kill, shots/${a.replaceAll(' ', '-')}.png |`).join('\n')}
Not checked:
- real touch hardware
`)
const exists = () => true

// A repo with a base commit on main, then a branch where `change` edits the tree; `change` gets the repo's
// directory and the base sha and may commit itself. Returns the exit code and output.
function run(change, { message = 'feat: change' } = {}) {
  const dir = mkdtempSync(join(tmpdir(), 'pt-'))
  try {
    git(dir, 'init', '-q', '-b', 'main')
    put(dir, 'src/rules.ts'); put(dir, 'src/rules.test.ts'); put(dir, 'src/index.js'); put(dir, 'src/style.css'); put(dir, 'design/GDD.md')
    git(dir, 'add', '-A'); git(dir, 'commit', '-qm', 'base')
    git(dir, 'checkout', '-qb', 'work')
    change(dir)
    git(dir, 'add', '-A'); git(dir, 'commit', '-qm', message, '--allow-empty')
    const r = spawnSync('node', [script, '--base', 'main'], { cwd: dir, encoding: 'utf8' })
    return { code: r.status, out: r.stdout + r.stderr }
  } finally { rmSync(dir, { recursive: true, force: true }) }
}
const withReport = (dir, edit) => {
  put(dir, 'src/rules.ts', 'changed\n')
  git(dir, 'add', '-A'); git(dir, 'commit', '-qm', 'feat: play change')
  const sha = git(dir, 'rev-parse', '--short', 'HEAD').trim()
  put(dir, 'design/playtests/2026-10-18-abc.md', report(sha, edit))
  for (const a of AREAS) put(dir, `design/playtests/shots/${a.replaceAll(' ', '-')}.png`)
  return sha
}

test('what counts as a play file', () => {
  for (const f of ['src/rules.ts', 'src/hooks.ts', 'src/platform.ts', 'src/main.ts', 'design/GDD.md', 'test/game.mjs']) assert.ok(isPlayFile(f), f)
  for (const f of ['src/rules.test.ts', 'src/index.js', 'src/style.css', 'design/DESIGN.md', 'assets/a.png', 'README.md', 'design/playtests/x.md']) assert.ok(!isPlayFile(f), f)
})

test('a complete report passes', () => assert.deepEqual(checkReport(report('abc1234'), exists), []))
test('the shipped template fails until it is filled in and names every area', () => {
  assert.ok(checkReport(template, exists).length > 0)
  for (const a of AREAS) assert.ok(template.includes(`| ${a} |`), a)
})
test('a missing preview or commit line fails', () => {
  assert.match(checkReport(report('abc1234', (s) => s.replace(/Preview:.*\n/, '')), exists).join(), /Preview/)
  assert.match(checkReport(report('abc1234', (s) => s.replace(/Commit:.*\n/, '')), exists).join(), /Commit/)
})
test('a missing area row fails', () => assert.match(checkReport(report('abc1234', (s) => s.replace(/\| Ad hooks.*\n/, '')), exists).join(), /no verdict row "Ad hooks"/))
test('a verdict that is not pass or fail fails', () => assert.match(checkReport(report('abc1234', (s) => s.replace('| Full run | pass', '| Full run | ok')), exists).join(), /Full run: verdict must be pass or fail/))
test('a fail verdict fails the check', () => assert.match(checkReport(report('abc1234', (s) => s.replace('| Full run | pass', '| Full run | fail')), exists).join(), /Full run: verdict is fail/))
test('evidence without a time fails', () => assert.match(checkReport(report('abc1234', (s) => s.replace('00:12 the first kill', 'the first kill')), exists).join(), /First 30 seconds: evidence has no time/))
test('evidence without a file, or a file that is missing, fails', () => {
  assert.match(checkReport(report('abc1234', (s) => s.replace('shots/Touch-390.png', 'a screenshot')), exists).join(), /Touch 390: evidence names no png/)
  assert.match(checkReport(report('abc1234'), () => false).join(), /does not exist/)
})
test('a left placeholder fails, a tag in backticks does not', () => {
  assert.match(checkReport(report('abc1234', (s) => s.replace('Garden', '<game>')), exists).join(), /placeholder/)
  assert.deepEqual(checkReport(report('abc1234', (s) => s + '\nThe `<canvas>` stayed blank.\n'), exists), [])
})
test('a report without Not checked fails', () => assert.match(checkReport(report('abc1234', (s) => s.replace(/Not checked:[\s\S]*/, '')), exists).join(), /Not checked/))

test('a PR with no play file needs no report', () => {
  const r = run((d) => { put(d, 'src/style.css', 'b\n'); put(d, 'src/rules.test.ts', 'more\n'); put(d, 'src/index.js', 'w\n') })
  assert.equal(r.code, 0, r.out)
})
test('a play file without a report fails', () => {
  const r = run((d) => put(d, 'src/rules.ts', 'changed\n'))
  assert.equal(r.code, 1)
  assert.match(r.out, /no design\/playtests/)
})
test('a play file with a good report passes', () => {
  const r = run((d) => withReport(d))
  assert.equal(r.code, 0, r.out)
})
test('a play change after the played commit makes the report stale', () => {
  const r = run((d) => { withReport(d); git(d, 'add', '-A'); git(d, 'commit', '-qm', 'docs: report'); put(d, 'src/hooks.ts', 'later\n') })
  assert.equal(r.code, 1)
  assert.match(r.out, /src\/hooks\.ts changed after the played commit/)
})
test('a report naming a commit outside the history fails', () => {
  const r = run((d) => withReport(d, (s) => s.replace(/Commit: .*/, 'Commit: deadbee')))
  assert.equal(r.code, 1)
  assert.match(r.out, /not in this PR's history/)
})
test('a missing evidence file fails the CLI', () => {
  const r = run((d) => { withReport(d); rmSync(join(d, 'design/playtests/shots/Ad-hooks.png')) })
  assert.equal(r.code, 1)
  assert.match(r.out, /Ad hooks: evidence file .* does not exist/)
})
test('a playtest-ok commit waives the report and prints the reason', () => {
  const r = run((d) => put(d, 'src/rules.ts', 'changed\n'), { message: 'fix: typo\n\nplaytest-ok: renames a constant, no behaviour change' })
  assert.equal(r.code, 0, r.out)
  assert.match(r.out, /waived \(playtest-ok: renames a constant/)
})
test('an empty playtest-ok does not waive', () => {
  const r = run((d) => put(d, 'src/rules.ts', 'changed\n'), { message: 'fix: x\n\nplaytest-ok:' })
  assert.equal(r.code, 1)
})
test('outside a git repo, or with an unknown base, it exits 2 not 0', () => {
  const dir = mkdtempSync(join(tmpdir(), 'pt-'))
  try { assert.equal(spawnSync('node', [script], { cwd: dir, encoding: 'utf8' }).status, 2) } finally { rmSync(dir, { recursive: true, force: true }) }
  const repo = mkdtempSync(join(tmpdir(), 'pt-'))
  try {
    git(repo, 'init', '-q', '-b', 'main'); put(repo, 'a.txt'); git(repo, 'add', '-A'); git(repo, 'commit', '-qm', 'base')
    assert.equal(spawnSync('node', [script, '--base', 'origin/nope'], { cwd: repo, encoding: 'utf8' }).status, 2)
  } finally { rmSync(repo, { recursive: true, force: true }) }
})

test('ordinary evidence lines pass (the pass-table)', () => {
  for (const ev of ['1:05 first hit, a.webm', '10:30 night 3 ends ([clip](clips/run.webm))', '00:04 menu, shots/menu.JPG', '00:59 died to bats (a.jpeg) and again 01:02 (b.png)', '02:10 ad frozen, `s.png`']) {
    assert.deepEqual(checkReport(report('abc1234', (s) => s.replace(/\| Full run \| pass \|.*\n/, `| Full run | PASS | ${ev} |\n`)), exists), [], ev)
  }
})
