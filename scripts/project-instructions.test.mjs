import { test } from 'node:test'
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { fill } from './project-instructions.mjs'

const cases = {
  'claude-setup': { text: fill('claude-setup'), repo: 'yverse-studio/claude-setup' },
  'a registered project': { text: fill('yland', { about: 'a land game' }), repo: 'yverse-studio/yland' },
  'an unknown name with flags': { text: fill('nope', { about: 'x', kind: 'game', repo: 'acme/nope' }), repo: 'acme/nope' },
}

for (const [label, { text, repo }] of Object.entries(cases)) {
  test(`${label}: short, filled, points at the right places`, () => {
    assert.ok(text.split('\n').filter((l) => l.trim()).length < 15)
    assert.doesNotMatch(text, /\{\{/)
    for (const s of ['add_repo', 'docs/MAP.md', 'docs/TEAMS.md', 'project-memory.md', 'LESSONS.md', repo]) assert.ok(text.includes(s), s)
  })
  test(`${label}: no rule words`, () => {
    for (const w of ['Models:', 'never ', 'always ', 'merge']) assert.ok(!text.toLowerCase().includes(w.toLowerCase()), w)
  })
}

test('setup says it is the repo itself; kinds come from the file or the flag', () => {
  assert.match(cases['claude-setup'].text, /claude-setup itself/)
  assert.match(cases['claude-setup'].text, /kind: setup/)
  assert.match(cases['a registered project'].text, /kind: site/)
  assert.match(cases['an unknown name with flags'].text, /kind: game/)
})

test('no name, a path-like name or a flag without a value print usage and exit 1', () => {
  for (const args of [[], ['../README'], ['Yland'], ['yland', '--about']]) {
    const r = spawnSync('node', ['scripts/project-instructions.mjs', ...args], { encoding: 'utf8' })
    assert.equal(r.status, 1, args.join(' '))
    assert.match(r.stderr, /usage/)
  }
  assert.throws(() => fill('../README'), /lowercase/)
})

test('a name without projects/<name>.json warns on stderr but still prints', () => {
  const r = spawnSync('node', ['scripts/project-instructions.mjs', 'nope', '--about', 'x'], { encoding: 'utf8' })
  assert.equal(r.status, 0)
  assert.match(r.stderr, /no projects\/nope\.json/)
  assert.match(r.stdout, /yverse-studio\/nope/)
})

test('kind and org come from the project file', () => {
  assert.match(fill('companyxy-spiel'), /kind: repo/)
  assert.match(fill('igelgarten'), /kind: game/)
})

test('--repo none and --repo new say where lessons go without a product repo', () => {
  const none = fill('social-media-manager', { about: 'the brand accounts', kind: 'social', repo: 'none' })
  assert.match(none, /no repo of its own/)
  assert.doesNotMatch(none, /repo none|LESSONS\.md\b.*none/)
  const fresh = fill('new-game', { about: 'a new game', kind: 'game', repo: 'new' })
  assert.match(fresh, /does not exist yet/)
  assert.doesNotMatch(fresh, /repo new\)/)
  for (const t of [none, fresh]) assert.ok(t.split('\n').filter((l) => l.trim()).length < 15)
})

