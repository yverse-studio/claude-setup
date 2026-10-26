import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { verifyJourney } from './journey.mjs'
import { isGateFile, isJourneyFile, isNonApp, needsJourney, planJourney, previewHosts, previewUrl, statusFor } from '../.claude/skills/publish/templates/new-project/scripts/journey-gate.mjs'

const SHA = 'c'.repeat(40)
const BASE = 'a'.repeat(40)
const REPO = 'yverse-studio/social'
const RUN = 'https://github.com/yverse-studio/social/actions/runs/123456'
const RUN_INFO = { id: 123456, display_title: `journey ${SHA}`, status: 'completed', conclusion: 'success', head_sha: SHA, path: '.github/workflows/journey.yml', event: 'pull_request_target', html_url: RUN }

test('previewUrl follows the Workers Builds branch alias', () => {
  assert.equal(previewUrl('claude/Fix_Drop', 'social'), 'https://claude-fix-drop-social.yverse.workers.dev')
  assert.equal(previewUrl('a@evil.com#x', 'social'), 'https://a-evil-com-x-social.yverse.workers.dev', 'no userinfo, host or hash can sneak in')
})

test('statusFor passes only a successful run; a missing preview or a skipped run fails', () => {
  assert.equal(statusFor('success', SHA).state, 'success')
  assert.equal(statusFor('failure', SHA).state, 'failure')
  assert.equal(statusFor('skipped', SHA).state, 'failure')
  assert.equal(statusFor('cancelled', SHA).state, 'failure')
  assert.match(statusFor('no-preview', SHA).description, /never served cccccc/)
})

test('statusFor says when the PR changes journey files, which run from main', () => {
  assert.match(statusFor('success', SHA, true).description, /changes journey files/)
  assert.doesNotMatch(statusFor('success', SHA).description, /changes journey files/)
  assert.deepEqual(['e2e/login.spec.js', 'journey/a.js', 'package.json', 'scripts/journey.mjs'].map(isJourneyFile), [true, true, true, true])
  assert.deepEqual(['src/index.js', 'README.md', 'public/journeys.css'].map(isJourneyFile), [false, false, false])
})

test('previewHosts reads the preview URLs a Workers Builds check run names', () => {
  const runs = [{ details_url: 'https://dash.cloudflare.com/x', output: { summary: 'Preview: https://claude-fix-social.yverse.workers.dev ok', text: null } }, { output: null }]
  assert.deepEqual(previewHosts(runs), ['https://claude-fix-social.yverse.workers.dev'])
  assert.deepEqual(previewHosts([{ output: { summary: 'https://evil.example.com' } }]), [])
})

// HIGH 2 of gate round 1: the n/a must fail closed. Only docs, tests and CI files may skip the journey.
test('only docs, tests and CI files are n/a; every app, server and config file runs the journey', () => {
  const app = ['app/pages/index.vue', 'app/components/Drop.vue', 'pages/index.vue', 'components/A.vue', 'app.vue', 'assets/main.css', 'server/api/drop.post.ts',
    'nuxt.config.ts', 'wrangler.jsonc', 'worker/index.ts', 'package.json', 'src/index.js', 'public/app.css', 'index.html', 'migrations/0002.sql', 'src/commit.js',
    'server/routes/x.test.ts', 'src/a.test.js', 'app/notes.md', 'content/post.md', 'public/robots.txt', 'LICENSE.exe', 'a/b/README.md']
  for (const f of app) assert.equal(isNonApp(f), false, `${f} runs the journey`)
  const other = ['README.md', 'docs/a.png', 'test/a.spec.ts', 'e2e/x.spec.ts', '.github/workflows/ci.yml', 'LICENSE', 'notes.txt', '.gitignore']
  for (const f of other) assert.equal(isNonApp(f), true, `${f} is n/a`)
  assert.equal(needsJourney(['README.md', 'app/pages/index.vue']), true, 'one app file is enough')
  assert.equal(needsJourney(['README.md', 'docs/a.md']), false)
})

// A PR branch can post `journey` with the same GITHUB_TOKEN; verify tells it from the real workflow run.
test('verifyJourney passes only the newest journey status, by github-actions[bot], linked to a pull_request_target run of journey.yml in the same repo', () => {
  const bot = { context: 'journey', state: 'success', creator: { login: 'github-actions[bot]' }, target_url: RUN, created_at: '2026-10-26T10:00:00Z', id: 1, description: 'journey passed' }
  assert.equal(verifyJourney([bot], RUN_INFO, SHA).ok, true)
  assert.equal(verifyJourney({ statuses: [bot] }, RUN_INFO, SHA).ok, true, 'the combined-status shape works too')
  assert.equal(verifyJourney([], RUN_INFO, SHA).ok, false, 'no status: blocked without a run')
  assert.equal(verifyJourney([{ ...bot, context: 'ci' }], RUN_INFO, SHA).ok, false, 'another context')
  assert.match(verifyJourney([bot]).reason, /pass the linked run/, 'the run is required')
  assert.equal(verifyJourney([{ ...bot, creator: { login: 'someone' } }], RUN_INFO, SHA).ok, false, 'a human or other app')
  const { creator, ...noCreator } = bot
  assert.equal(verifyJourney([noCreator], RUN_INFO, SHA).ok, true, 'the MCP status output names no creator: the run decides')
  assert.equal(verifyJourney([noCreator], { ...RUN_INFO, conclusion: 'failure' }, SHA).ok, false)
  assert.equal(verifyJourney([{ ...bot, target_url: 'https://example.com/x' }], RUN_INFO, SHA).ok, false, 'a link elsewhere')
  assert.match(verifyJourney([bot], { ...RUN_INFO, event: 'pull_request' }, SHA).reason, /forged/, 'a PR workflow run is no gate run')
  assert.match(verifyJourney([bot], { ...RUN_INFO, path: '.github/workflows/evil.yml' }, SHA).reason, /forged/)
  assert.match(verifyJourney([bot], { ...RUN_INFO, event: 'workflow_dispatch' }, SHA).reason, /forged/)
  assert.match(verifyJourney([bot], { ...RUN_INFO, html_url: 'https://github.com/yverse-studio/other/actions/runs/123456' }, SHA).reason, /wrong repo or run/)
  assert.match(verifyJourney([bot], { ...RUN_INFO, id: 9 }, SHA).reason, /pass the linked run/)
  assert.match(verifyJourney([bot], { ...RUN_INFO, display_title: `journey ${'d'.repeat(40)}` }, SHA).reason, /another PR's real run/, 'a status that links to the real run of another head')
  assert.match(verifyJourney([bot], RUN_INFO, '').reason, /another PR's real run/, 'no head sha, no pass')
  assert.match(verifyJourney([bot], { ...RUN_INFO, status: 'in_progress', conclusion: null }, SHA).reason, /wait for it/, 'the status is posted before the run ends')
  assert.match(verifyJourney([bot], { ...RUN_INFO, conclusion: 'failure' }, SHA).reason, /wait for it/, 'a real red run beats a forged green status')
  assert.match(verifyJourney([bot], { ...RUN_INFO, head_sha: 'e'.repeat(40) }, SHA).reason, /not the head/, 'a run for another commit')
  const red = { ...bot, state: 'failure', created_at: '2026-10-26T09:00:00Z', id: 0 }
  assert.equal(verifyJourney([bot, red], RUN_INFO, SHA).ok, true, 'the newest status wins over an older red')
  const redNew = { ...bot, state: 'failure', created_at: '2026-10-26T12:00:00Z', id: 3 }
  assert.equal(verifyJourney([redNew, bot], RUN_INFO, SHA).ok, false, 'a newer red beats an older green')
  assert.equal(verifyJourney([{ ...bot, state: 'pending' }], RUN_INFO, SHA).ok, false, 'pending is no pass')
})

// A fake GitHub: routes by path. `files` is the PR's changed files; `heads` the head sha on each read.
function fakeApi({ fork = false, files = ['app/pages/index.vue'], heads = [SHA, SHA], baseRef = 'main', checkRuns = [] } = {}) {
  let reads = 0
  return async (path) => {
    if (path === `repos/${REPO}/pulls/7`) return { head: { sha: heads[Math.min(reads++, heads.length - 1)], ref: 'claude/fix', repo: { full_name: fork ? 'evil/social' : REPO } }, base: { ref: baseRef, sha: BASE } }
    if (path.startsWith(`repos/${REPO}/pulls/7/files`)) return files.map((filename) => ({ filename }))
    if (path === `repos/${REPO}`) return { default_branch: 'main' }
    if (path === `repos/${REPO}/commits/${SHA}/check-runs`) return { check_runs: checkRuns }
    throw new Error(`unexpected ${path}`)
  }
}

test('planJourney: a Nuxt UI PR runs the journey; a docs PR is n/a', async () => {
  const run = await planJourney(REPO, '7', 'social', fakeApi())
  assert.deepEqual(run, { sha: SHA, ui: true, url: 'https://claude-fix-social.yverse.workers.dev', specsChanged: false })
  assert.equal((await planJourney(REPO, '7', 'social', fakeApi({ files: ['README.md', 'docs/a.md'] }))).ui, false)
  assert.equal((await planJourney(REPO, '7', 'social', fakeApi({ files: ['package.json'] }))).specsChanged, true)
})

test('planJourney refuses a fork, a moved head, a non-default base and a preview the Workers Builds check contradicts', async () => {
  await assert.rejects(planJourney(REPO, '7', 'social', fakeApi({ fork: true })), /fork/)
  await assert.rejects(planJourney(REPO, '7', 'social', fakeApi({ heads: [SHA, 'd'.repeat(40)] })), /head moved/)
  await assert.rejects(planJourney(REPO, '7', 'social', fakeApi({ baseRef: 'dev' })), /not the default branch/)
  await assert.rejects(planJourney(REPO, '7', 'social', fakeApi({ baseRef: 'dev', files: ['README.md'] })), /not the default branch/, 'n/a is issued only for PRs to the default branch')
  await assert.rejects(planJourney(REPO, '7', 'social', fakeApi({ checkRuns: [{ output: { summary: 'https://other-social.yverse.workers.dev' } }] })), /no pass/)
})

test('planJourney flags a docs-only PR that changes the journey gate itself', async () => {
  const plan = await planJourney(REPO, '7', 'social', fakeApi({ files: ['.github/workflows/journey.yml'] }))
  assert.deepEqual([plan.ui, plan.gateChanged], [false, true])
  assert.equal((await planJourney(REPO, '7', 'social', fakeApi({ files: ['README.md'] }))).gateChanged, false)
  assert.deepEqual(['.github/workflows/journey.yml', 'scripts/journey-gate.mjs', '.github/workflows/ci.yml'].map(isGateFile), [true, true, false])
})

test('planJourney counts a PR too long to list as app code', async () => {
  const api = async (path) => {
    if (path.includes('/files')) return Array.from({ length: 100 }, (_, i) => ({ filename: `docs/${i}.md` }))
    return fakeApi()(path)
  }
  assert.equal((await planJourney(REPO, '7', 'social', api)).ui, true)
})

// CRLF checkouts (Windows) must not break the workflow shape tests.
const yml = readFileSync(new URL('../.claude/skills/publish/templates/new-project/.github/workflows/journey.yml', import.meta.url), 'utf8').replace(/\r\n/g, '\n')

test('the project workflow comes from the default branch and never checks the PR out; the specs run with read-only rights', () => {
  assert.match(yml, /\nrun-name: journey \$\{\{ github\.event\.pull_request\.head\.sha \}\}\n/, 'verify matches the run to the head by this title')
  assert.match(yml, /\non:\n  pull_request_target:\n/)
  assert.ok(!/\n  pull_request:/.test(yml), 'a plain pull_request run would use the PR\'s own workflow file')
  assert.ok(!/ref: .*head\.(sha|ref)/.test(yml), 'no PR head is checked out (the head sha only names the run)')
  assert.equal(yml.match(/ref: \$\{\{ github\.event\.repository\.default_branch \}\}/g).length, 3, 'all three jobs check out the default branch')
  const run = yml.slice(yml.indexOf('\n  run:'), yml.indexOf('\n  report:'))
  assert.match(run, /permissions:\n      contents: read\n/)
  assert.ok(!/statuses: write|secrets\./.test(run), 'the job that runs the specs can post no status and holds no secret')
  assert.match(yml, /\n  report:\n    needs: \[preview, run\]/)
  assert.ok(!/secrets\./.test(yml), 'no secrets in a project repo')
  const preview = yml.slice(yml.indexOf('\n  preview:'), yml.indexOf('\n  run:'))
  assert.match(preview, /pull-requests: read\n      statuses: write\n      checks: read/, 'the one job that reads the PR and posts the pending status')
  assert.match(yml.slice(yml.indexOf('\n  report:')), /permissions:\n      contents: read\n      statuses: write\n/, 'report posts the result and reads nothing else')
  assert.match(yml, /NAME: __NAME__/, 'new-project fills the Worker name')
  assert.ok(!/artifact/.test(preview), 'the preview job hands nothing to the run job but outputs')
})
