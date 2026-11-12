// Keeps hard-coded laptop paths out of this repo (docs/laptop-folders.md, "Path holders"). Red on any tracked text file with
// a drive path, a Users\Claude home path, %USERPROFILE%\Documents, Documents\<folder> or an entry of dead_names in
// config/paths.json. Say a path by name (config/paths.json) or relative to STUDIO_ROOT instead.
// Exempt: docs/archive/**, a line carrying the marker `path-lint: fixture` (test data), and the two files that must
// spell the patterns: config/paths.json (the dead names) and this file.
// Run: node --test scripts/paths-lint.test.mjs
import assert from 'node:assert/strict'
import { execFileSync, spawnSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'
import { deadNames, studioPath, studioRoot } from './paths.mjs'

const root = join(fileURLToPath(import.meta.url), '..', '..')
const MARKER = 'path-lint: fixture'
const SELF = new Set(['config/paths.json', 'scripts/paths-lint.test.mjs'])
const DRIVE = /(^|[^A-Za-z0-9])[A-Z]:[\\/]{1,2}[A-Za-z0-9_.%$-]{2,}/
const OTHER = [/Users[\\/]+Claude/, /USERPROFILE[^\n]{0,3}[\\/]+Documents/, /Documents[\\/]+[A-Za-z_.]/]

export const violation = (line) => {
  if (line.includes(MARKER)) return null
  if (DRIVE.test(line) || OTHER.some((r) => r.test(line))) return 'laptop path'
  const dead = deadNames.find((d) => line.includes(d) || line.includes(d.replaceAll('\\', '/')))
  return dead ? `dead name ${dead}` : null
}

test('the patterns catch what they should and leave ordinary text alone', () => {
  for (const bad of ['C:\\Users\\x\\a.txt', 'in "C:/Program Files/Blender"', 'r"C:\\\\twin\\\\f.mp4"', 'cd %USERPROFILE%\\Documents', 'see Documents\\START.md',
    'old GameAssetLibrary name', 'GitHub/_worktrees/x'.replace('GitHub/_', 'GitHub\\_')]) assert.ok(violation(bad), bad)
  for (const ok of ['https://example.com/a', 'regex I:\\s+(-?[\\d.]+) LUFS', "'on: x\\njobs:\\n  a:\\n'", 'HKCU:\\System\\Foo', 'lib/characters/CH_<name>/',
    '%ProgramFiles%\\Blender Foundation', 'C:\\ *', `x ${MARKER} C:\\Users\\Claude\\a`, 'runs-on: ubuntu', 'see Documents folder']) assert.equal(violation(ok), null, ok)
})

test('no tracked file carries a hard-coded laptop path', () => {
  const files = execFileSync('git', ['ls-files', '-z'], { cwd: root, encoding: 'utf8' }).split('\0').filter(Boolean)
  const hits = []
  for (const f of files) {
    if (f.startsWith('docs/archive/') || SELF.has(f)) continue
    let text
    try { text = readFileSync(join(root, f), 'utf8') } catch { continue }
    if (text.includes('\0')) continue
    text.split('\n').forEach((line, i) => { const v = violation(line); if (v) hits.push(`${f}:${i + 1} ${v}`) })
  }
  assert.deepEqual(hits, [], `say it by name (config/paths.json) or relative to STUDIO_ROOT:\n${hits.join('\n')}`)
})

test('the resolver stops without STUDIO_ROOT and builds paths from the table', () => {
  assert.throws(() => studioRoot({}), /set STUDIO_ROOT/)
  const old = process.env.STUDIO_ROOT
  process.env.STUDIO_ROOT = '/studio-test'
  try {
    assert.equal(studioPath('companyxy', 'ch01'), join('/studio-test', 'projects', 'games', 'companyxy', 'ch01'))
    assert.throws(() => studioPath('nope'), /unknown path name/)
  } finally {
    if (old === undefined) delete process.env.STUDIO_ROOT; else process.env.STUDIO_ROOT = old
  }
})

test('the Python resolver agrees with the JavaScript one and also stops without STUDIO_ROOT', () => {
  // Windows: `python` and `python3` resolve to the Store alias, the launcher is `py -3` (2026-11-12), and it needs SystemRoot.
  const win = process.platform === 'win32'
  const [py, pre] = win ? ['py', ['-3']] : ['python3', []]
  const base = win ? { PATH: process.env.PATH, SystemRoot: process.env.SystemRoot, LOCALAPPDATA: process.env.LOCALAPPDATA } : { PATH: process.env.PATH }
  const run = (env) => spawnSync(py, [...pre, '-I', '-c', `import sys; sys.path.insert(0, 'scripts'); import paths; print(paths.path('companyxy', 'ch01'))`],
    { cwd: root, encoding: 'utf8', env: { ...base, ...env } })
  assert.notEqual(run({}).status, 0)
  assert.match(run({}).stderr, /set STUDIO_ROOT/)
  const ok = run({ STUDIO_ROOT: '/studio-test' })
  assert.equal(ok.stdout.trim(), join('/studio-test', 'projects', 'games', 'companyxy', 'ch01'))
})
