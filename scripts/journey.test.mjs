import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { isJourneyFile, isNonApp, needsJourney, planJourney, previewHosts, previewUrl, projectRepo, statusFor, verifyJourney } from './journey.mjs'

const SHA = 'c'.repeat(40)
const BASE = 'a'.repeat(40)
const REPO = 'yverse-studio/social'
const RUN = 'https://github.com/yverse-studio/claude-setup/actions/runs/123456'

test('previewUrl follows the Workers Builds branch alias', () => {
  assert.equal(previewUrl('claude/Fix_Drop', 'social'), 'https://claude-fix-drop-social.yverse.workers.dev')
  assert.equal(previewUrl('a@evil.com#x', 'social'), 'https://a-evil-com-x-social.yverse.workers.dev', 'no userinfo, host or hash can sneak in')
})

test('projectRepo reads the registry and refuses unknown or Worker-less projects', () => {
  const reg = { 'projects/social.json': { name: 'social' }, 'projects/ideaworld.json': { name: 'ideaworld', repo: 'ydeas-world' }, 'projects/spiel.json': { name: 'spiel', kind: 'repo' } }
  const read = (f) => reg[f] ?? null
  assert.equal(projectRepo('social', read), 'yverse-studio/social')
  assert.equal(projectRepo('ideaworld', read), 'yverse-studio/ydeas-world')
  assert.throws(() => projectRepo('nope', read), /not on main/)
  assert.throws(() => projectRepo('spiel', read), /no Worker/)
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
    'nuxt.config.ts', 'wrangler.jsonc', 'worker/index.ts', 'package.json', 'src/index.js', 'public/app.css', 'index.html', 'migrations/0002.sql', 'src/commit.js']
  for (const f of app) assert.equal(isNonApp(f), false, `${f} runs the journey`)
  const other = ['README.md', 'docs/a.png', 'test/a.spec.ts', 'src/a.test.js', 'e2e/x.spec.ts', '.github/workflows/ci.yml', 'LICENSE', 'notes.txt']
  for (const f of other) assert.equal(isNonApp(f), true, `${f} is n/a`)
  assert.equal(needsJourney(['README.md', 'app/pages/index.vue']), true, 'one app file is enough')
  assert.equal(needsJourney(['README.md', 'docs/a.md']), false)
})

// HIGH 3 of gate round 1: a PR branch can post `journey` with its own token; verify tells it from the bot.
test('verifyJourney passes only the newest journey status, created by the bot, linked to a claude-setup run, in state success', () => {
  const bot = { context: 'journey', state: 'success', creator: { login: 'yskills-claude' }, target_url: RUN, created_at: '2026-10-26T10:00:00Z', id: 1, description: 'journey passed' }
  assert.equal(verifyJourney([bot]).ok, true)
  assert.equal(verifyJourney({ statuses: [bot] }).ok, true, 'the combined-status shape works too')
  assert.equal(verifyJourney([]).ok, false, 'no status')
  assert.equal(verifyJourney([{ ...bot, context: 'ci' }]).ok, false, 'another context')
  const forged = { ...bot, creator: { login: 'github-actions[bot]' }, target_url: 'https://example.com/x', created_at: '2026-10-26T11:00:00Z', id: 2 }
  assert.match(verifyJourney([forged, bot]).reason, /github-actions\[bot\]/, 'a bot-forged success after a real pass fails')
  const red = { ...bot, state: 'failure', created_at: '2026-10-26T09:00:00Z', id: 0 }
  assert.equal(verifyJourney([bot, red]).ok, true, 'the newest status wins over an older red')
  assert.equal(verifyJourney([{ ...forged, creator: { login: 'yskills-claude' } }, red]).ok, false, 'the org bot linking elsewhere fails')
  const redNew = { ...bot, state: 'failure', created_at: '2026-10-26T12:00:00Z', id: 3 }
  assert.equal(verifyJourney([redNew, bot]).ok, false, 'a newer red beats an older green')
  assert.equal(verifyJourney([{ ...forged, creator: { login: 'github-actions[bot]' }, state: 'success' }, { ...bot, created_at: '2026-10-26T12:30:00Z', id: 9 }]).ok, true, 'the newer real pass beats an older forgery')
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

test('planJourney: a Nuxt UI PR runs the journey from the base sha; a docs PR is n/a', async () => {
  const run = await planJourney(REPO, '7', 'social', fakeApi())
  assert.deepEqual(run, { sha: SHA, ui: true, url: 'https://claude-fix-social.yverse.workers.dev', specsRef: BASE, specsChanged: false })
  assert.equal((await planJourney(REPO, '7', 'social', fakeApi({ files: ['README.md', 'docs/a.md'] }))).ui, false)
  assert.equal((await planJourney(REPO, '7', 'social', fakeApi({ files: ['package.json'] }))).specsChanged, true)
})

test('planJourney refuses a fork, a moved head, a non-default base and a preview the Workers Builds check contradicts', async () => {
  await assert.rejects(planJourney(REPO, '7', 'social', fakeApi({ fork: true })), /fork/)
  await assert.rejects(planJourney(REPO, '7', 'social', fakeApi({ heads: [SHA, 'd'.repeat(40)] })), /head moved/)
  await assert.rejects(planJourney(REPO, '7', 'social', fakeApi({ baseRef: 'dev' })), /not the default branch/)
  await assert.rejects(planJourney(REPO, '7', 'social', fakeApi({ checkRuns: [{ output: { summary: 'https://other-social.yverse.workers.dev' } }] })), /no pass/)
})

test('planJourney counts a PR too long to list as app code', async () => {
  const api = async (path) => {
    if (path.includes('/files')) return Array.from({ length: 100 }, (_, i) => ({ filename: `docs/${i}.md` }))
    return fakeApi()(path)
  }
  assert.equal((await planJourney(REPO, '7', 'social', api)).ui, true)
})

// CRLF checkouts (Windows) must not break the workflow shape tests.
const yml = readFileSync(new URL('../.github/workflows/journey.yml', import.meta.url), 'utf8').replace(/\r\n/g, '\n')

test('the specs run from the base in a job without the org token; the PR is never checked out on a runner', () => {
  const run = yml.slice(yml.indexOf('\n  run:'), yml.indexOf('\n  report:'))
  assert.ok(!/PROJECTS_GITHUB_TOKEN/.test(run), 'no org token in the run job')
  assert.ok(!/actions\/checkout/.test(run), 'the run job checks nothing out; it downloads the specs artifact')
  assert.match(run, /download-artifact/)
  assert.ok(!/needs\.preview\.outputs\.sha/.test(yml.slice(yml.indexOf('\n  preview:'), yml.indexOf('\n  run:'))), 'the PR head sha is not checked out in the preview job')
  assert.match(yml, /ref: \$\{\{ steps\.wait\.outputs\.specs_ref \}\}/)
  assert.match(yml, /\n  report:\n    needs: \[preview, run\]/)
})
