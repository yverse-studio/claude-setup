import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { liveCommit, verdict, issueAction, readProjects, issueTitle } from './deploy-watch.mjs'

const A = 'a'.repeat(40)
const B = 'b'.repeat(40)
const NOW = Date.parse('2026-10-26T12:00:00Z')

test('liveCommit reads a full sha and nothing else', () => {
  assert.equal(liveCommit(JSON.stringify({ commit: A, db: true })), A)
  assert.equal(liveCommit(JSON.stringify({ commit: 'dev' })), null)
  assert.equal(liveCommit('<!DOCTYPE html>'), null)
  assert.equal(liveCommit('{"error":true}'), null)
})

test('verdict: same commit is ok, an old HEAD that live lacks is drift, a fresh one is building', () => {
  assert.equal(verdict({ live: A, head: A, headAt: '2026-10-26T09:00:00Z' }, NOW), 'ok')
  assert.equal(verdict({ live: A, head: B, headAt: '2026-10-26T11:44:00Z' }, NOW), 'drift')
  assert.equal(verdict({ live: A, head: B, headAt: '2026-10-26T11:50:00Z' }, NOW), 'building')
  assert.equal(verdict({ live: null, head: B, headAt: '2026-10-26T09:00:00Z' }, NOW), 'unwatched')
})

test('issueAction opens once, closes on recovery, leaves building and unwatched alone', () => {
  assert.equal(issueAction('drift', undefined), 'open')
  assert.equal(issueAction('drift', { number: 1 }), null)
  assert.equal(issueAction('ok', { number: 1 }), 'close')
  assert.equal(issueAction('ok', undefined), null)
  assert.equal(issueAction('building', { number: 1 }), null)
  assert.equal(issueAction('unwatched', { number: 1 }), null)
})

test('readProjects maps repo and url and skips private repos without a Worker', () => {
  const dir = mkdtempSync(join(tmpdir(), 'dw-'))
  writeFileSync(join(dir, 'social.json'), '{ "name": "social", "d1": true, "org": "yverse-studio" }')
  writeFileSync(join(dir, 'ideaworld.json'), '{ "name": "ideaworld", "repo": "ydeas-world" }')
  writeFileSync(join(dir, 'spiel.json'), '{ "name": "spiel", "kind": "repo" }')
  writeFileSync(join(dir, 'README.md'), '# not a project')
  const byName = Object.fromEntries(readProjects(dir).map((p) => [p.name, p]))
  assert.deepEqual(Object.keys(byName).sort(), ['ideaworld', 'social'])
  assert.equal(byName.ideaworld.repo, 'yverse-studio/ydeas-world')
  assert.equal(byName.social.url, 'https://social.yverse.workers.dev')
  assert.equal(issueTitle('social'), 'deploy-drift: social')
})
