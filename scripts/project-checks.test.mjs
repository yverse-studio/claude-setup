// The role checks in a new project's CI: scaffolded for both kinds, picked by changed files, a missing doc names its fix.
// Run: node --test scripts/project-checks.test.mjs
import assert from 'node:assert/strict'
import { execFileSync, spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, readdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { test } from 'node:test'
import { writeScaffold } from './new-project.mjs'
import { CHECKS, expectedScripts, plan } from '../.claude/skills/publish/templates/new-project/scripts/project-checks.mjs'
import { isPlayFile } from '../.claude/skills/publish/templates/new-game/scripts/playtest-check.mjs'

const SITE = ['design-check.mjs', 'copy-check.mjs', 'analytics-check.mjs']
const GAME = [...SITE, 'gdd-check.mjs', 'audio-check.mjs'] // plan() input; the playtest check is expected too but picks nothing itself
const names = (changed, available, playFile) => plan(changed, available, playFile).map((c) => c.name)

test('the template CI runs project-checks on every PR, for both kinds', () => {
  for (const kind of ['site', 'game']) {
    const dir = mkdtempSync(join(tmpdir(), `pc-${kind}-`))
    writeScaffold(dir, { name: 'probe', d1: false, kind })
    const ci = readFileSync(join(dir, '.github/workflows/ci.yml'), 'utf8')
    assert.match(ci, /github\.event_name == 'pull_request'\r?\n\s+run: node scripts\/project-checks\.mjs --base origin\/\$\{\{ github\.base_ref \}\}/)
    for (const s of ['project-checks.mjs', ...(kind === 'game' ? GAME : SITE)]) assert.ok(existsSync(join(dir, 'scripts', s)), `${kind} ships scripts/${s}`)
    assert.equal(existsSync(join(dir, 'scripts/gdd-check.mjs')), kind === 'game', 'only a game ships the game docs checks')
    assert.equal(existsSync(join(dir, 'scripts/audio-check.mjs')), kind === 'game')
    rmSync(dir, { recursive: true, force: true })
  }
})

test('plan: a site PR picks design, copy and tracking on UI files and nothing on a README', () => {
  assert.deepEqual(names(['src/index.js'], SITE), ['design', 'copy', 'analytics'])
  assert.deepEqual(names(['public/app.css'], SITE), ['design', 'copy', 'analytics'])
  assert.deepEqual(names(['README.md', 'src/commit.js', 'src/index.test.js', 'migrations/0002.sql'], SITE), [])
})

test('plan: editing a doc runs its own check', () => {
  assert.deepEqual(names(['design/COPY.md'], SITE), ['copy'])
  assert.deepEqual(names(['analytics/TRACKING.md'], SITE), ['analytics'])
  assert.deepEqual(names(['design/DESIGN.md'], SITE), ['design'])
})

test('plan: game docs follow play files; a look-only PR and a site skip them', () => {
  assert.deepEqual(names(['src/rules.ts'], GAME, isPlayFile), ['design', 'copy', 'analytics', 'gdd', 'audio'])
  assert.deepEqual(names(['design/GDD.md'], GAME, isPlayFile), ['gdd', 'audio'])
  assert.deepEqual(names(['src/style.css'], GAME, isPlayFile), ['design', 'copy', 'analytics'])
  assert.deepEqual(names(['assets/hit.ogg'], GAME, isPlayFile), ['audio'])
  assert.deepEqual(names(['src/rules.ts'], SITE), ['design', 'copy', 'analytics'], 'a site has no game scripts, so none are due')
})

// The pass-table: one row per kind of change, what runs for a site and for a game.
const TABLE = [
  ['backend-only src/ change', 'src/worker/api.ts', ['design', 'copy', 'analytics'], ['design', 'copy', 'analytics', 'gdd', 'audio']],
  ['test-only change', 'src/api.test.ts', [], []],
  ['README change', 'README.md', [], []],
  ['migration change', 'migrations/0002.sql', [], []],
  ['asset change', 'assets/hit.ogg', [], ['audio']],
  ['locale change', 'src/i18n/de.json', ['design', 'copy', 'analytics'], ['design', 'copy', 'analytics', 'gdd', 'audio']],
  ['public file change', 'public/logo.svg', ['design', 'copy', 'analytics'], ['design', 'copy', 'analytics']],
  ['play test file', 'test/game.mjs', [], ['gdd', 'audio']],
]
test('plan pass-table: which checks run for each kind of change', () => {
  for (const [what, file, site, game] of TABLE) {
    assert.deepEqual(names([file], SITE), site, `site: ${what}`)
    assert.deepEqual(names([file], GAME, isPlayFile), game, `game: ${what}`)
  }
})

test('every check with a doc names the fix for it', () => {
  const role = { design: 'Designer', copy: 'Content Designer', analytics: 'Analytics owner', gdd: 'Game Designer' } // as roles/*.md title them
  for (const c of CHECKS.filter((x) => x.doc)) {
    assert.match(c.fix, /claude-setup operator\/roles\/\w[\w-]*\.md/, c.name)
    assert.ok(c.fix.includes(`the ${role[c.name]} writes`), `${c.name} names the ${role[c.name]}`)
  }
})

const git = (cwd, ...args) => execFileSync('git', ['-c', 'user.name=t', '-c', 'user.email=t@t', '-c', 'commit.gpgsign=false', ...args], { cwd, stdio: 'pipe', encoding: 'utf8' })
// A scaffolded project with the scaffold committed on main, then a branch where `change` edits files.
function project(kind, change) {
  const dir = mkdtempSync(join(tmpdir(), `pc-run-${kind}-`))
  writeScaffold(dir, { name: 'probe', d1: false, kind })
  git(dir, 'init', '-q', '-b', 'main')
  git(dir, 'add', '-A')
  git(dir, 'commit', '-qm', 'scaffold')
  git(dir, 'update-ref', 'refs/remotes/origin/main', 'HEAD')
  git(dir, 'checkout', '-qb', 'pr')
  change(dir)
  git(dir, 'add', '-A')
  git(dir, 'commit', '-qm', 'change')
  return dir
}
const put = (dir, rel, text) => { mkdirSync(dirname(join(dir, rel)), { recursive: true }); writeFileSync(join(dir, rel), text) }
const run = (dir) => spawnSync(process.execPath, ['scripts/project-checks.mjs'], { cwd: dir, encoding: 'utf8' })

test('a site PR on UI without the docs fails with one fix line each, no stack trace', () => {
  const dir = project('site', (d) => put(d, 'src/index.js', '// changed\n'))
  const r = run(dir)
  assert.equal(r.status, 1)
  for (const doc of ['design/DESIGN.md', 'design/COPY.md', 'analytics/TRACKING.md']) assert.match(r.stderr, new RegExp(`${doc} is missing; the \\w+`))
  assert.doesNotMatch(r.stderr, /\bat file:|node:internal/)
  rmSync(dir, { recursive: true, force: true })
})

test('a README-only PR passes without running anything', () => {
  const dir = project('site', (d) => put(d, 'README.md', 'x\n'))
  const r = run(dir)
  assert.equal(r.status, 0)
  assert.match(r.stdout, /nothing to check/)
  rmSync(dir, { recursive: true, force: true })
})

test('a game PR that changes play fails on the GDD and runs the scaffold design placeholders through design-check', () => {
  const dir = project('game', (d) => put(d, 'src/rules.ts', 'export const x = 1\n'))
  const r = run(dir)
  assert.equal(r.status, 1)
  assert.match(r.stderr, /design\/GDD\.md is missing; the Game Designer writes it/)
  assert.match(r.stdout, /FAIL .*Direction cites 0 reference captures/)
  rmSync(dir, { recursive: true, force: true })
})

test('a silent game passes the sound check when only assets changed', () => {
  const dir = project('game', (d) => put(d, 'assets/note.txt', 'x\n'))
  const r = run(dir)
  assert.equal(r.status, 0, r.stderr)
  assert.match(r.stdout, /audio: ok/)
  rmSync(dir, { recursive: true, force: true })
})

test('the kind is declared in package.json by the scaffold', () => {
  for (const kind of ['site', 'game']) {
    const dir = mkdtempSync(join(tmpdir(), `pc-kind-${kind}-`))
    writeScaffold(dir, { name: 'probe', d1: false, kind })
    assert.equal(JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8')).claudeSetup.kind, kind)
    rmSync(dir, { recursive: true, force: true })
  }
})

test('expectedScripts follows the declared kind', () => {
  assert.deepEqual(expectedScripts('site'), SITE)
  assert.deepEqual(expectedScripts('game'), [...GAME, 'playtest-check.mjs'])
})

test('a deleted check script exits 2 instead of switching its check off, one at a time and all game ones at once', () => {
  const cases = [['site', ['design-check.mjs']], ['site', ['analytics-check.mjs']], ['game', ['audio-check.mjs']], ['game', ['gdd-check.mjs']], ['game', ['playtest-check.mjs']], ['game', ['gdd-check.mjs', 'audio-check.mjs', 'playtest-check.mjs']]]
  for (const [kind, gone] of cases) {
    const dir = project(kind, (d) => { for (const g of gone) rmSync(join(d, 'scripts', g)); put(d, 'src/rules.ts', 'export const x = 2\n') })
    const r = run(dir)
    assert.equal(r.status, 2, `${kind} without ${gone}`)
    for (const g of gone) assert.match(r.stderr, new RegExp(`${g}`))
    rmSync(dir, { recursive: true, force: true })
  }
})

test('a site with a stray game script does not run it', () => {
  const dir = project('site', (d) => { put(d, 'scripts/gdd-check.mjs', 'process.exit(1)\n'); put(d, 'README.md', 'x\n') })
  assert.equal(run(dir).status, 0)
  assert.doesNotMatch(run(dir).stdout, /gdd/)
  rmSync(dir, { recursive: true, force: true })
  const ui = project('site', (d) => { put(d, 'scripts/gdd-check.mjs', 'process.exit(1)\n'); put(d, 'src/rules.ts', 'x\n') })
  assert.doesNotMatch(run(ui).stderr, /gdd/)
  rmSync(ui, { recursive: true, force: true })
})

test('a missing or invalid kind exits 2 with the one-line fix', () => {
  for (const kind of [undefined, 'shop']) {
    const dir = project('site', (d) => {
      const pkg = JSON.parse(readFileSync(join(d, 'package.json'), 'utf8'))
      if (kind) pkg.claudeSetup = { kind }; else delete pkg.claudeSetup
      put(d, 'package.json', JSON.stringify(pkg))
      put(d, 'README.md', 'x\n')
    })
    const r = run(dir)
    assert.equal(r.status, 2, String(kind))
    assert.match(r.stderr, /package\.json has no claudeSetup\.kind/)
    rmSync(dir, { recursive: true, force: true })
  }
})
