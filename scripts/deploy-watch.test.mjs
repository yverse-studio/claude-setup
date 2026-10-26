import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { liveCommit, verdict, issueAction, readProjects, issueTitle, watch } from './deploy-watch.mjs'

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
  assert.equal(verdict({ reached: false, live: null, head: B, headAt: '2026-10-26T09:00:00Z' }, NOW), 'unreachable')
  assert.equal(verdict({ live: A, head: B, headAt: undefined }, NOW), 'drift', 'an unreadable HEAD date cannot hide drift')
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
  writeFileSync(join(dir, 'evil.json'), '{ "name": "evil.example.com/x" }')
  writeFileSync(join(dir, 'evil2.json'), '{ "name": "ok", "repo": "../../orgs" }')
  const byName = Object.fromEntries(readProjects(dir).map((p) => [p.name, p]))
  assert.deepEqual(Object.keys(byName).sort(), ['ideaworld', 'social'])
  assert.equal(byName.ideaworld.repo, 'yverse-studio/ydeas-world')
  assert.equal(byName.social.url, 'https://social.yverse.workers.dev')
  assert.equal(issueTitle('social'), 'deploy-drift: social')
})

// A fake GitHub: issues created with or without their label, every write recorded.
function fakeGitHub({ head = B, headAt = '2026-10-26T09:00:00Z', dropLabels = false } = {}) {
  const issues = []
  const writes = []
  const gh = async (path, method = 'GET', body) => {
    if (method !== 'GET') writes.push(`${method} ${path}`)
    if (path.startsWith('repos/yverse-studio/claude-setup/issues?')) return issues.filter((i) => i.state === 'open')
    if (path === 'plant') { issues.push({ number: issues.length + 1, title: body, state: 'open', user: { login: 'someone' } }); return {} }
    if (path === 'repos/yverse-studio/social') return { default_branch: 'main' }
    if (path === 'repos/yverse-studio/social/commits/main') return { sha: head, commit: { committer: { date: headAt } } }
    if (path === 'repos/yverse-studio/claude-setup/issues' && method === 'POST') {
      const i = { number: issues.length + 1, title: body.title, state: 'open', user: { login: 'github-actions[bot]' }, labels: dropLabels ? [] : body.labels }
      issues.push(i)
      return i
    }
    const m = path.match(/issues\/(\d+)$/)
    if (m && method === 'PATCH') { issues[m[1] - 1].state = body.state; return {} }
    return {}
  }
  return { gh, issues, writes }
}
const social = [{ name: 'social', repo: 'yverse-studio/social', url: 'https://social.yverse.workers.dev' }]
const serving = (sha) => async () => ({ reached: true, body: JSON.stringify({ commit: sha }) })
const run = (f, live) => watch({ gh: f.gh, live, projects: social, self: 'yverse-studio/claude-setup', now: NOW, log: () => {} })

test('watch opens one drift issue and does not open a second, even when the label was dropped', async () => {
  const f = fakeGitHub({ dropLabels: true })
  await run(f, serving(A))
  await run(f, serving(A))
  assert.equal(f.writes.filter((w) => w === 'POST repos/yverse-studio/claude-setup/issues').length, 1)
  assert.equal(f.issues.length, 1)
})

test('watch closes the issue when live catches up, and leaves a fresh HEAD alone', async () => {
  const f = fakeGitHub()
  await run(f, serving(A))
  await run(f, serving(B))
  assert.equal(f.issues[0].state, 'closed')
  const fresh = fakeGitHub({ headAt: '2026-10-26T11:55:00Z' })
  await run(fresh, serving(A))
  assert.deepEqual(fresh.writes, [])
})

test('watch fails loudly when every project errors (an expired token must not look green)', async () => {
  const f = fakeGitHub()
  const broken = async (path, ...rest) => { if (path.startsWith('repos/yverse-studio/social')) throw new Error('401'); return f.gh(path, ...rest) }
  await assert.rejects(watch({ gh: broken, live: serving(A), projects: social, self: 'yverse-studio/claude-setup', now: NOW, log: () => {} }), /every project failed/)
})

test('an issue with the same title from someone else does not mute the alert', async () => {
  const f = fakeGitHub()
  await f.gh('plant', 'GET', 'deploy-drift: social')
  await run(f, serving(A))
  assert.equal(f.writes.filter((w) => w === 'POST repos/yverse-studio/claude-setup/issues').length, 1)
})
