import { test } from 'node:test'
import assert from 'node:assert/strict'
import { logLines, latestBuild, recentLines, openBuilds, scrub } from './build-logs.mjs'

test('logLines keeps the tail and reads [time, text] pairs and plain strings', () => {
  const json = { result: { lines: [['t1', 'one'], ['t2', 'two'], 'three'] } }
  assert.deepEqual(logLines(json, 2), ['two', 'three'])
  assert.deepEqual(logLines(null), [])
})

test('logLines hides ids and token-like strings', () => {
  const json = { result: { lines: [['t', 'hook 764d0fbf-4683-4d83-8d3c-16b144363ff2 worker 2e53788183964d888ce090f30ea2ea32']] } }
  assert.deepEqual(logLines(json), ['hook *** worker ***'])
})

test('latestBuild picks the newest by created_on', () => {
  const builds = [{ build_uuid: 'a', created_on: '2026-10-08T20:01:00Z' }, { build_uuid: 'b', created_on: '2026-10-08T20:05:00Z' }]
  assert.equal(latestBuild(builds).build_uuid, 'b')
  assert.equal(latestBuild([]), null)
})

test('scrub hides secret-looking pairs, URL credentials and bearer headers', () => {
  assert.equal(scrub('STRIPE_SECRET_KEY=sk_test_abc api_key: "x y"'), 'STRIPE_SECRET_KEY=*** api_key: ***')
  assert.equal(scrub('fetch https://user:pa55@example.com/x'), 'fetch https://***@example.com/x')
  assert.equal(scrub('Authorization: Bearer abc.def'), 'Authorization: *** ***')
  assert.equal(scrub('npm run build ok'), 'npm run build ok')
})

test('scrub hides vendor tokens and flag or keyword values after a space', () => {
  assert.equal(scrub('key sk_live_51Habcdefghijklmnopqrst and whsec_abc1 and xoxb-12-ab'), 'key *** and *** and ***')
  assert.equal(scrub('AKIAABCDEFGHIJKLMNOP github_pat_11abc ghp_abc'), '*** *** ***')
  assert.equal(scrub('npx wrangler --api-token abcdef1234567890 deploy'), 'npx wrangler --api-token *** deploy')
  assert.equal(scrub('--secret abcdef1234'), '--secret ***')
  assert.equal(scrub('npm warn config token abc123'), 'npm warn config token ***')
  assert.equal(scrub('password abc'), 'password ***')
})

test('recentLines lists builds newest first and scrubs user-chosen branch names', () => {
  const lines = recentLines([
    { created_on: '2026-10-26T10:00:00Z', status: 'stopped', build_outcome: 'success', build_trigger_metadata: { branch: 'main', commit_hash: 'abcdef123456' } },
    { created_on: '2026-10-26T11:00:00Z', status: 'queued', build_outcome: null, build_trigger_metadata: { branch: 'x-sk_live_51Habcdefghijklmnopqrst', commit_hash: '1234567890' } },
  ])
  assert.equal(lines.length, 2)
  assert.equal(lines[0], '[build-logs] recent: 2026-10-26T11:00:00Z queued/null x-*** 1234567')
  assert.equal(lines[1], '[build-logs] recent: 2026-10-26T10:00:00Z stopped/success main abcdef1')
  assert.deepEqual(recentLines(undefined), [])
})

test('openBuilds keeps only unfinished builds older than the limit', () => {
  const now = Date.parse('2026-10-26T12:00:00Z')
  const builds = [
    { created_on: '2026-10-26T11:00:00Z', status: 'queued' },
    { created_on: '2026-10-26T11:55:00Z', status: 'queued' },
    { created_on: '2026-10-26T10:00:00Z', status: 'stopped' },
  ]
  assert.deepEqual(openBuilds(builds, now), [builds[0]])
  assert.deepEqual(openBuilds(undefined, now), [])
})
