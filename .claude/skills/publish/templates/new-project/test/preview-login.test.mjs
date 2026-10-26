import { test } from 'node:test'
import assert from 'node:assert/strict'
import { previewLogin, isPreviewHost, verifyJourneyToken } from '../src/preview-login.js'

const NAME = 'demo'
const REPO = 'yverse-studio/demo'
const HOST = 'abc-demo.me.workers.dev'
const NOW = Date.parse('2026-10-26T12:00:00Z')
const ALGO = { name: 'RSASSA-PKCS1-v1_5', modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: 'SHA-256' }
const b64u = (buf) => Buffer.from(buf).toString('base64url')
const text = (o) => b64u(new TextEncoder().encode(JSON.stringify(o)))

const good = await crypto.subtle.generateKey(ALGO, true, ['sign', 'verify'])
const other = await crypto.subtle.generateKey(ALGO, true, ['sign', 'verify'])
const jwk = { ...(await crypto.subtle.exportKey('jwk', good.publicKey)), kid: 'k1' }
const fetchJwks = async () => Response.json({ keys: [jwk] })

const claims = (over = {}) => ({
  iss: 'https://token.actions.githubusercontent.com', aud: HOST, exp: NOW / 1000 + 300, iat: NOW / 1000 - 5,
  repository: REPO, repository_owner: 'yverse-studio', job_workflow_ref: `${REPO}/.github/workflows/journey.yml@refs/heads/main`,
  ref: 'refs/heads/main', event_name: 'pull_request_target', runner_environment: 'github-hosted', ...over,
})
async function token(over = {}, { key = good.privateKey, header = { alg: 'RS256', kid: 'k1' } } = {}) {
  const body = `${text(header)}.${text(claims(over))}`
  return `${body}.${b64u(await crypto.subtle.sign('RSASSA-PKCS1-v1_5', key, new TextEncoder().encode(body)))}`
}
const verify = (t, over = {}) => verifyJourneyToken(t, { audience: HOST, repo: REPO, branch: 'main', fetchJwks, now: NOW, ...over })

async function call(host, { bearer, method = 'POST' } = {}) {
  const log = []
  const req = new Request(`https://${host}/api/test-login`, { method, headers: bearer ? { authorization: `Bearer ${bearer}` } : {} })
  const res = await previewLogin(req, {}, { name: NAME, repo: REPO, fetchJwks, now: NOW, seed: async () => log.push('seed'), signIn: async () => (log.push('in'), Response.json({ ok: true })) })
  return { res, log }
}

test('preview hosts are told apart from the live host', () => {
  assert.equal(isPreviewHost('abc-demo.me.workers.dev', NAME), true)
  assert.equal(isPreviewHost('demo.me.workers.dev', NAME), false)
  assert.equal(isPreviewHost('abc-demo.evil.com', NAME), false)
  assert.equal(isPreviewHost('abc-other.me.workers.dev', NAME), false)
  assert.equal(isPreviewHost('anime-filter.me.workers.dev', 'anime-filter'), false)
  assert.equal(isPreviewHost('x-anime-filter.me.workers.dev', 'anime-filter'), true)
})

test('the journey job of this repo on the default branch is accepted', async () => {
  assert.equal(await verify(await token()), true)
})

test('every claim that pins the job is enforced', async () => {
  for (const over of [
    { aud: 'xyz-demo.me.workers.dev' }, { aud: [HOST] }, { exp: NOW / 1000 - 1 }, { iat: NOW / 1000 + 3600 }, { nbf: NOW / 1000 + 3600 },
    { iss: 'https://evil.example' }, { repository: 'yverse-studio/other' }, { repository_owner: 'someone' },
    { job_workflow_ref: `${REPO}/.github/workflows/other.yml@refs/heads/main` },
    { job_workflow_ref: `${REPO}/.github/workflows/journey.yml@refs/heads/feature` }, { ref: 'refs/heads/feature' },
    { event_name: 'push' }, { event_name: 'workflow_dispatch' }, { runner_environment: 'self-hosted' },
  ]) assert.equal(await verify(await token(over)), false, JSON.stringify(over))
})

test('a token signed by another key, with another algorithm, or malformed is refused', async () => {
  assert.equal(await verify(await token({}, { key: other.privateKey })), false)
  assert.equal(await verify(await token({}, { header: { alg: 'none', kid: 'k1' } })), false)
  assert.equal(await verify(await token({}, { header: { alg: 'RS256', kid: 'unknown' } }), { now: NOW + 3600e3 }), false)
  for (const bad of ['', 'a.b', 'a.b.c.d', 'not-a-jwt']) assert.equal(await verify(bad), false)
  assert.equal(await verify(`${(await token()).slice(0, -3)}AAA`), false)
})

test('on a preview with a valid token it seeds, then signs in', async () => {
  const { res, log } = await call(HOST, { bearer: await token() })
  assert.equal(res.status, 200)
  assert.deepEqual(log, ['seed', 'in'])
})

test('a missing or wrong token is refused and seeds nothing', async () => {
  for (const bearer of [undefined, 'nope', await token({ repository: 'yverse-studio/other' })]) {
    const { res, log } = await call(HOST, { bearer })
    assert.equal(res.status, 403)
    assert.deepEqual(log, [])
  }
})

test('the live host and other methods never answer, even with a valid token', async () => {
  const bearer = await token({ aud: 'demo.me.workers.dev' })
  const live = await call('demo.me.workers.dev', { bearer })
  assert.equal(live.res, null)
  assert.deepEqual(live.log, [])
  assert.equal((await call(HOST, { bearer: await token(), method: 'GET' })).res, null)
})

test('an unknown key id refetches GitHub keys, but at most once a minute', async () => {
  let fetches = 0
  const counting = async () => (fetches++, fetchJwks())
  const later = NOW + 3 * 3600e3
  const unknown = await token({}, { header: { alg: 'RS256', kid: 'rotated' } })
  assert.equal(await verify(unknown, { fetchJwks: counting, now: later }), false)
  assert.equal(fetches, 1)
  assert.equal(await verify(unknown, { fetchJwks: counting, now: later + 5000 }), false)
  assert.equal(fetches, 1, 'a flood of bad key ids cannot make the Worker refetch every time')
  assert.equal(await verify(unknown, { fetchJwks: counting, now: later + 61000 }), false)
  assert.equal(fetches, 2)
})

test('a failing or malformed key fetch fails closed and does not poison later logins', async () => {
  const later = NOW + 6 * 3600e3
  const unknown = await token({}, { header: { alg: 'RS256', kid: 'again' } })
  assert.equal(await verify(unknown, { fetchJwks: async () => { throw new Error('down') }, now: later }), false)
  assert.equal(await verify(unknown, { fetchJwks: async () => new Response('nope', { status: 500 }), now: later + 61000 }), false)
  assert.equal(await verify(unknown, { fetchJwks: async () => Response.json({ keys: 'x' }), now: later + 122000 }), false)
  assert.equal(await verify(await token(), { fetchJwks, now: NOW }), true, 'the cached good key still works')
})

test('HS256, a missing exp or iat, and a custom domain are refused or ignored', async () => {
  assert.equal(await verify(await token({}, { header: { alg: 'HS256', kid: 'k1' } })), false)
  for (const field of ['exp', 'iat']) assert.equal(await verify(await token({ [field]: undefined })), false, field)
  const bearer = await token({ aud: 'demo.example.com' })
  assert.equal((await call('demo.example.com', { bearer })).res, null)
})
