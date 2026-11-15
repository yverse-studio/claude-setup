// #419 point 3: a Windows clone (core.symlinks=false) holds a symlink as a text file with the target path.
// Run: node --test scripts/link-target.test.mjs
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { cpSync, existsSync, lstatSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, readlinkSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'
import { resolveLink } from './link-target.mjs'

function tree(t) {
  const d = mkdtempSync(join(tmpdir(), 'link-target-'))
  t.after(() => rmSync(d, { recursive: true, force: true }))
  mkdirSync(join(d, 'src/skill'), { recursive: true })
  writeFileSync(join(d, 'src/skill/SKILL.md'), '# s')
  mkdirSync(join(d, 'mods/skills'), { recursive: true })
  return d
}

test('a real symlink and a real folder come back unchanged (the filesystem resolves them)', (t) => {
  const d = tree(t)
  try { symlinkSync('../../src/skill', join(d, 'mods/skills/real')) } catch { return t.skip('this system refuses symlinks (Windows without the right)') }
  assert.equal(resolveLink(join(d, 'mods/skills/real')), join(d, 'mods/skills/real'))
  assert.equal(resolveLink(join(d, 'src/skill')), join(d, 'src/skill'))
  assert.ok(existsSync(join(resolveLink(join(d, 'mods/skills/real')), 'SKILL.md')))
})

test('a text file holding the relative target (core.symlinks=false) resolves like the symlink', (t) => {
  const d = tree(t)
  writeFileSync(join(d, 'mods/skills/flat'), '../../src/skill')
  assert.equal(resolveLink(join(d, 'mods/skills/flat')), join(d, 'src/skill'))
})

test('a big file is no link, even when its trimmed text is an existing path', (t) => {
  const d = tree(t)
  writeFileSync(join(d, 'mods/skills/big'), `../../src/skill${' '.repeat(600)}`)
  assert.equal(resolveLink(join(d, 'mods/skills/big')), join(d, 'mods/skills/big'))
})

test('a text file that is no path to anything stays itself, so the caller reports it', (t) => {
  const d = tree(t)
  writeFileSync(join(d, 'mods/skills/junk'), 'not a link\nat all')
  writeFileSync(join(d, 'mods/skills/gone'), '../../src/nothing')
  assert.equal(resolveLink(join(d, 'mods/skills/junk')), join(d, 'mods/skills/junk'))
  assert.equal(resolveLink(join(d, 'mods/skills/gone')), join(d, 'mods/skills/gone'))
})

test('check.mjs passes on a copy whose mods skill links are text files (core.symlinks=false), and fails on a broken one', (t) => {
  const repo = join(fileURLToPath(import.meta.url), '..', '..')
  const d = mkdtempSync(join(tmpdir(), 'link-check-'))
  t.after(() => rmSync(d, { recursive: true, force: true }))
  cpSync(repo, d, { recursive: true, verbatimSymlinks: true, filter: (s) => !/[\\/](\.git|node_modules)([\\/]|$)/.test(s) })
  const dir = join(d, 'mods/setup-domains/skills')
  const names = readdirSync(dir)
  for (const n of names) { const at = join(dir, n); const target = lstatSync(at).isSymbolicLink() ? readlinkSync(at) : readFileSync(at, 'utf8').trim(); rmSync(at); writeFileSync(at, target) }
  const run = () => spawnSync(process.execPath, [join(d, 'scripts/check.mjs')], { encoding: 'utf8' })
  const ok = run()
  assert.equal(ok.status, 0, ok.stdout + ok.stderr)
  writeFileSync(join(dir, names[0]), '../../../.claude/skills/no-such-skill')
  const bad = run()
  assert.equal(bad.status, 1)
  assert.match(bad.stdout + bad.stderr, new RegExp(`${names[0]}: SKILL.md does not resolve`))
})
