import { test } from 'node:test'
import assert from 'node:assert/strict'
import { previewLogin, isPreviewHost } from '../src/preview-login.js'

const NAME = 'demo'
const TOKEN = 'a-long-random-test-token'
const call = (host, { token = TOKEN, method = 'POST', env = { PREVIEW_LOGIN_TOKEN: TOKEN } } = {}) => {
  const log = []
  const req = new Request(`https://${host}/api/test-login`, { method, headers: token === null ? {} : { authorization: `Bearer ${token}` } })
  return previewLogin(req, env, { name: NAME, seed: async () => log.push('seed'), signIn: async () => (log.push('in'), Response.json({ ok: true })) }).then((res) => ({ res, log }))
}

test('preview hosts are told apart from the live host', () => {
  assert.equal(isPreviewHost('abc-demo.me.workers.dev', NAME), true)
  assert.equal(isPreviewHost('demo.me.workers.dev', NAME), false)
  assert.equal(isPreviewHost('abc-demo.evil.com', NAME), false)
  assert.equal(isPreviewHost('abc-other.me.workers.dev', NAME), false)
  assert.equal(isPreviewHost('anime-filter.me.workers.dev', 'anime-filter'), false)
  assert.equal(isPreviewHost('x-anime-filter.me.workers.dev', 'anime-filter'), true)
})

test('on a preview with the right token it seeds, then signs in', async () => {
  const { res, log } = await call('abc-demo.me.workers.dev')
  assert.equal(res.status, 200)
  assert.deepEqual(log, ['seed', 'in'])
})

test('a wrong or missing token is refused and seeds nothing', async () => {
  for (const token of ['nope', null, '']) {
    const { res, log } = await call('abc-demo.me.workers.dev', { token })
    assert.equal(res.status, 403)
    assert.deepEqual(log, [])
  }
})

test('the live host never answers, even with the right token', async () => {
  const { res, log } = await call('demo.me.workers.dev')
  assert.equal(res, null)
  assert.deepEqual(log, [])
})

test('without a configured token nothing answers, and only POST counts', async () => {
  assert.equal((await call('abc-demo.me.workers.dev', { env: {} })).res, null)
  assert.equal((await call('abc-demo.me.workers.dev', { env: { PREVIEW_LOGIN_TOKEN: '' }, token: '' })).res, null)
  assert.equal((await call('abc-demo.me.workers.dev', { method: 'GET' })).res, null)
})
