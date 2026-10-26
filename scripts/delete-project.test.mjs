import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { checkRequest, madeByWorkflow, run, MARKER, ORG } from './delete-project.mjs'

const KEYS = { CLOUDFLARE_ACCOUNT_ID: 'acc', CLOUDFLARE_API_TOKEN: 'cf', PROJECTS_GITHUB_TOKEN: 'gh' }

// A fake GitHub + Cloudflare that records every call.
function fakeApis({ repo = { description: MARKER }, workers = [{ name: 'app', id: 'w1' }], d1 = ['app', 'app-preview'], tokens = [{ build_token_name: 'claude-setup-builds', build_token_uuid: 't1' }] } = {}) {
  const calls = []
  const reply = (status, body) => ({ status, ok: status < 300, text: async () => JSON.stringify(body) })
  const fetchFn = async (url, init) => {
    const method = init?.method || 'GET'
    calls.push(`${method} ${url}`)
    if (url.startsWith('https://api.github.com/')) return repo && method === 'GET' ? reply(200, repo) : repo ? reply(204, {}) : reply(404, {})
    if (method === 'DELETE') return reply(200, {})
    if (url.includes('/workers/workers?')) return reply(200, { result: workers })
    if (url.includes('/d1/database?name=')) { const n = decodeURIComponent(url.split('name=')[1].split('&')[0]); return reply(200, { result: d1.includes(n) ? [{ name: n, uuid: `u-${n}` }] : [] }) }
    if (url.includes('/builds/tokens')) return reply(200, { result: tokens })
    if (url.includes('/builds/workers/')) return reply(404, {})
    return reply(404, {})
  }
  return { calls, fetchFn, deletes: () => calls.filter((c) => c.startsWith('DELETE')) }
}
const go = (env, apis, registered = () => true) => run({ env: { ...KEYS, ...env }, fetchFn: apis.fetchFn, registered, log: () => {} })

test('nothing is deleted without the name typed twice', () => {
  assert.throws(() => checkRequest({ name: 'app', confirm: 'ap', registered: true }), /confirm must repeat/)
  assert.throws(() => checkRequest({ name: 'App!', confirm: 'App!', registered: true }), /lowercase/)
  assert.doesNotThrow(() => checkRequest({ name: 'app', confirm: 'app', registered: true }))
})

test('protected repos are refused before any call', async () => {
  for (const name of ['claude-setup', 'duo-test', 'company-xy', 'mypage', 'worker', 'luna-monorepo', 'yland', 'anime-filter', 'tellmey', 'ideaworld', 'social', 'igelgarten', 'companyxy-spiel']) {
    const apis = fakeApis()
    await assert.rejects(go({ NAME: name, CONFIRM: name, DRY_RUN: 'false' }, apis), /protected/)
    assert.equal(apis.calls.length, 0)
  }
})

test('an unregistered project is refused before any call', async () => {
  const apis = fakeApis()
  await assert.rejects(go({ NAME: 'app', CONFIRM: 'app', DRY_RUN: 'false' }, apis, () => false), /projects\/app\.json is not on main/)
  assert.equal(apis.calls.length, 0)
})

test('a missing repo deletes nothing on the Cloudflare side', async () => {
  const apis = fakeApis({ repo: null })
  await assert.rejects(go({ NAME: 'app', CONFIRM: 'app', DRY_RUN: 'false' }, apis), /not found/)
  assert.deepEqual(apis.deletes(), [])
  assert.ok(apis.calls.every((c) => c.includes(`/repos/${ORG}/app`)), 'only the repo is read, always in the pinned org')
})

test('a repo without the marker deletes nothing', async () => {
  const apis = fakeApis({ repo: { description: 'my real app' } })
  await assert.rejects(go({ NAME: 'app', CONFIRM: 'app', DRY_RUN: 'false' }, apis), /not made by new-project/)
  assert.deepEqual(apis.deletes(), [])
})

test('dry run is the default and deletes nothing', async () => {
  const apis = fakeApis()
  const r = await go({ NAME: 'app', CONFIRM: 'app' }, apis)
  assert.equal(r.deleted, false)
  assert.equal(r.plan.d1.length, 2)
  assert.deepEqual(apis.deletes(), [])
})

test('a real run deletes Worker, both D1, the unused build token, then the repo last', async () => {
  const apis = fakeApis()
  await go({ NAME: 'app', CONFIRM: 'app', DRY_RUN: 'false' }, apis)
  const d = apis.deletes()
  assert.ok(d.some((c) => c.includes('/workers/scripts/app?force=true')))
  assert.equal(d.filter((c) => c.includes('/d1/database/')).length, 2)
  assert.ok(d.some((c) => c.includes('/builds/tokens/t1')))
  assert.match(d.at(-1), new RegExp(`api.github.com/repos/${ORG}/app$`))
})

test('new-project still writes the marker delete-project looks for', async () => {
  const made = await import('./new-project.mjs')
  assert.equal(made.MARKER, MARKER)
  assert.ok(readFileSync(new URL('./new-project.mjs', import.meta.url), 'utf8').includes('description: MARKER'))
})
