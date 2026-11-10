import { test } from 'node:test'
import assert from 'node:assert/strict'
import { logLines, latestBuild, recentLines, openBuilds, scrub, validBranch, isProduction, pickTrigger, triggerBuild, commandClass } from './build-logs.mjs'

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

test('validBranch takes git refs only and the production branch is refused', () => {
  assert.equal(validBranch('claude/project-thread-1ei5r9'), true)
  for (const bad of ['', undefined, 'a b', 'x;rm', '../x', '-x', 'a..b', '$(id)']) assert.equal(validBranch(bad), false, String(bad))
  assert.equal(isProduction('main'), true)
  assert.equal(isProduction('release', { branch_includes: ['release'] }), true)
  assert.equal(isProduction('claude/x', { branch_includes: ['main'] }), false)
})

const prod = { trigger_uuid: 'p', trigger_name: 'production', branch_includes: ['main'], deploy_command: 'npx wrangler deploy' }
const prev = { trigger_uuid: 'v', trigger_name: 'preview', branch_includes: ['*'], deploy_command: 'npx wrangler versions upload' }
const fakeCf = (triggers, calls = []) => async (path, method = 'GET', body) => { calls.push([method, path, body]); return { json: { result: path.endsWith('/triggers') ? triggers : { build_uuid: 'b1' } } } }

test('pickTrigger takes the one preview trigger and refuses none, two or a production-only list', () => {
  assert.equal(pickTrigger([prod, prev]).trigger_name, 'preview')
  assert.throws(() => pickTrigger([prod]), /exactly one preview trigger/)
  assert.throws(() => pickTrigger([]), /exactly one preview trigger/)
  assert.throws(() => pickTrigger([prev, { ...prev, trigger_name: 'other' }]), /exactly one preview trigger/)
  assert.throws(() => pickTrigger([{ ...prev, branch_includes: ['main'] }]), /exactly one preview trigger/) // versions upload but it builds main: not a preview trigger
  assert.throws(() => pickTrigger([{ ...prev, deploy_command: 'npx wrangler versions deploy' }]), /exactly one preview trigger/)
  assert.throws(() => pickTrigger([{ ...prev, deploy_command: '' }]), /exactly one preview trigger/) // no positive preview signal: refused
})

test('triggerBuild posts the branch to the preview trigger and follows the returned build id until it stops', async () => {
  const calls = []
  const seen = []
  const getBuild = async (uuid) => { seen.push(uuid); return seen.length < 3 ? { status: 'running' } : { status: 'stopped', build_outcome: 'success' } }
  const r = await triggerBuild(fakeCf([prod, prev], calls), 'w', 'claude/x', getBuild, async () => {})
  assert.deepEqual(r, { uuid: 'b1', finished: true, outcome: 'success' })
  assert.deepEqual(calls.find((c) => c[0] === 'POST'), ['POST', '/builds/triggers/v/builds', { branch: 'claude/x' }])
  assert.deepEqual(seen, ['b1', 'b1', 'b1'])
})

test('triggerBuild throws on an invalid or production branch and posts nothing', async () => {
  const calls = []
  await assert.rejects(() => triggerBuild(fakeCf([prev], calls), 'w', 'a b', async () => null, async () => {}), /not a plain git branch/)
  await assert.rejects(() => triggerBuild(fakeCf([prev], calls), 'w', 'main', async () => null, async () => {}), /production branch/)
  assert.equal(calls.some((c) => c[0] === 'POST'), false)
})

test('triggerBuild reports a build that never appears or never stops as not finished', async () => {
  const never = await triggerBuild(fakeCf([prev]), 'w', 'claude/x', async () => undefined, async () => {}, 60000)
  assert.equal(never.finished, false)
  const slow = await triggerBuild(fakeCf([prev]), 'w', 'claude/x', async () => ({ status: 'running' }), async () => {}, 60000)
  assert.equal(slow.finished, false)
})

test('the refusal names the trigger fields and a command class, never the raw command', () => {
  const secretish = { ...prod, deploy_command: 'npx wrangler deploy --var X=1', build_command: 'npm ci', root_directory: '/' }
  let message = ''
  try { pickTrigger([secretish]) } catch (e) { message = e.message }
  assert.match(message, /fields \[[^\]]*branch_includes[^\]]*\]/)
  assert.match(message, /command deploy/)
  assert.doesNotMatch(message, /--var|X=1/)
  assert.equal(commandClass('npx wrangler versions upload'), 'preview')
  assert.equal(commandClass(''), 'none')
  assert.equal(commandClass('npx wrangler versions upload && npx wrangler versions deploy'), 'deploy') // a chained gradual deploy is a deploy
  assert.equal(commandClass('npx wrangler versions upload; npx wrangler deploy'), 'deploy')
  assert.equal(commandClass('npm run deploy:preview'), 'preview')
  assert.equal(commandClass('npx wrangler versions upload'), 'preview')
})

test('triggerBuild refuses a branch the production trigger builds, even if it is not called main', async () => {
  const calls = []
  const odd = { ...prod, branch_includes: ['release'] }
  await assert.rejects(() => triggerBuild(fakeCf([odd, prev], calls), 'w', 'release', async () => null, async () => {}), /production branch/)
  assert.equal(calls.some((c) => c[0] === 'POST'), false)
})
