import { test } from 'node:test'
import { readFileSync } from 'node:fs'
import assert from 'node:assert/strict'
import { run } from './preview-login.mjs'
import { previewEnv, setRepoSecret, wranglerConfig, packageJson } from './new-project.mjs'

const TOKEN = 'tok-secret-value-1234567890'
const ok = (json, status = 200) => ({ ok: true, status, json, text: JSON.stringify(json) })

test('previewEnv carries the login token only when asked, and refuses to drop other variables', () => {
  assert.deepEqual(Object.keys(previewEnv({}, 'a', undefined)), ['BETTER_AUTH_SECRET'])
  assert.deepEqual(Object.keys(previewEnv({ PREVIEW_LOGIN_TOKEN: { type: 'secret_text' } }, 'a', 'b')), ['BETTER_AUTH_SECRET', 'PREVIEW_LOGIN_TOKEN'])
  assert.throws(() => previewEnv({ STRIPE_KEY: {} }, 'a', 'b'), /STRIPE_KEY/)
})

test('setRepoSecret puts the sealed value in a default-branch-only environment, never in clear', async () => {
  const calls = []
  const gh = async (path, init) => {
    calls.push({ path, init })
    if (path === '/repos/o/r') return ok({ default_branch: 'main' })
    if (path.endsWith('public-key')) return ok({ key: 'PK', key_id: 'K1' })
    return ok({}, init?.method === 'PUT' && path.includes('/secrets/') ? 201 : 200)
  }
  await setRepoSecret(gh, { org: 'o', repo: 'r', value: TOKEN, seal: async (k, v) => `sealed(${k},${v.length})` })
  const env = calls.find((c) => c.path === '/repos/o/r/environments/preview-login')
  assert.deepEqual(env.init.body, { deployment_branch_policy: { protected_branches: false, custom_branch_policies: true } })
  const policy = calls.find((c) => c.path.endsWith('/deployment-branch-policies'))
  assert.deepEqual(policy.init.body, { name: 'main', type: 'branch' })
  const put = calls.find((c) => c.path === '/repos/o/r/environments/preview-login/secrets/PREVIEW_LOGIN_TOKEN')
  assert.deepEqual(put.init.body, { encrypted_value: 'sealed(PK,27)', key_id: 'K1' })
  assert.ok(!JSON.stringify(calls).includes(TOKEN))
})

test('setRepoSecret says what is missing when the key lacks the permission', async () => {
  const gh = async (path) => (path === '/repos/o/r' ? ok({ default_branch: 'main' }) : { ok: false, status: 403, json: null, text: '' })
  await assert.rejects(setRepoSecret(gh, { org: 'o', repo: 'r', value: TOKEN }), /Administration.*Environments/)
})

test('run patches the previews env of the named Worker, sets the repo secret and prints no token', async () => {
  const cfCalls = []
  const cf = async (path, init) => {
    cfCalls.push({ path, init })
    if (path.startsWith('/workers/workers?')) return ok({ result: [{ id: 'w1', name: 'social' }, { id: 'w2', name: 'other' }] })
    return ok({ result: { previews_base_config: { env: { BETTER_AUTH_SECRET: { type: 'secret_text' } } } } })
  }
  const gh = async (path) => (path === '/repos/yverse-studio/social' ? ok({ default_branch: 'main' }) : path.endsWith('public-key') ? ok({ key: 'PK', key_id: 'K1' }) : ok({}, 204))
  const lines = []
  await run({ cf, gh, seal: async () => 'sealed', org: 'yverse-studio', repo: 'social', name: 'social', token: TOKEN, authSecret: 'auth-secret-xyz', log: (l) => lines.push(l) })
  const patch = cfCalls.find((c) => c.init?.method === 'PATCH')
  assert.equal(patch.path, '/workers/workers/w1')
  assert.equal(patch.init.body.previews_base_config.env.PREVIEW_LOGIN_TOKEN.text, TOKEN)
  assert.ok(Object.keys(patch.init.body.previews_base_config).length >= 1)
  assert.ok(!lines.join('\n').includes(TOKEN))
})

test('run stops before changing anything when the Worker does not exist', async () => {
  const cf = async () => ok({ result: [] })
  await assert.rejects(run({ cf, gh: async () => ok({}), seal: async () => '', org: 'o', repo: 'r', name: 'x' }), /no Worker named x/)
})

test('a new site scaffold has a journey script and a previews block', () => {
  assert.ok(packageJson({ name: 'app', d1: true }).scripts.journey)
  assert.ok(wranglerConfig({ name: 'app', d1: true, liveId: 'l', previewId: 'p' }).previews)
})

test('a re-run is fine when the branch policy already exists (422)', async () => {
  const gh = async (path, init) => {
    if (path === '/repos/o/r') return ok({ default_branch: 'main' })
    if (path.endsWith('/deployment-branch-policies')) return { ok: false, status: 422, json: null, text: 'exists' }
    if (path.endsWith('public-key')) return ok({ key: 'PK', key_id: 'K1' })
    return ok({}, init?.method === 'PUT' && path.includes('/secrets/') ? 204 : 200)
  }
  await setRepoSecret(gh, { org: 'o', repo: 'r', value: TOKEN, seal: async () => 'sealed' })
})

test('the repo secret is set before the Worker changes, and a failing GitHub step leaves the Worker alone', async () => {
  const order = []
  const cf = async (path, init) => {
    if (init?.method === 'PATCH') order.push('worker')
    return path.startsWith('/workers/workers?') ? ok({ result: [{ id: 'w1', name: 'social' }] }) : ok({ result: { previews_base_config: { env: {} } } })
  }
  const good = async (path, init) => {
    if (init?.method === 'PUT' && path.includes('/secrets/')) order.push('secret')
    return path === '/repos/o/r' ? ok({ default_branch: 'main' }) : path.endsWith('public-key') ? ok({ key: 'PK', key_id: 'K1' }) : ok({}, 204)
  }
  await run({ cf, gh: good, seal: async () => 's', org: 'o', repo: 'r', name: 'social', log: () => {} })
  assert.deepEqual(order, ['secret', 'worker'])
  order.length = 0
  const denied = async () => ({ ok: false, status: 403, json: null, text: '' })
  await assert.rejects(run({ cf, gh: denied, seal: async () => 's', org: 'o', repo: 'r', name: 'social', log: () => {} }), /Administration/)
  assert.deepEqual(order, [])
})

test('both workflows that seal the secret install libsodium at the same pinned version', () => {
  const pin = (file) => readFileSync(new URL(`../.github/workflows/${file}`, import.meta.url), 'utf8').match(/npm install [^\n]*libsodium-wrappers@([\d.]+)/)?.[1]
  assert.ok(pin('new-project.yml'), 'new-project.yml installs libsodium-wrappers before new-project.mjs')
  assert.equal(pin('new-project.yml'), pin('preview-login.yml'))
})
