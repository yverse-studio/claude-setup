import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { isJourneyFile, previewHosts, previewUrl, projectRepo, statusFor } from './journey.mjs'

const SHA = 'c'.repeat(40)

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

// HIGH finding 2 of the security review: no PR code and no org token on the runner that runs the specs.
test('the specs run from the default branch in a job without the org token; the PR is never checked out on a runner', () => {
  const yml = readFileSync(new URL('../.github/workflows/journey.yml', import.meta.url), 'utf8')
  const run = yml.slice(yml.indexOf('\n  run:'), yml.indexOf('\n  report:'))
  assert.ok(!/PROJECTS_GITHUB_TOKEN/.test(run), 'no org token in the run job')
  assert.ok(!/actions\/checkout/.test(run), 'the run job checks nothing out; it downloads the specs artifact')
  assert.match(run, /download-artifact/)
  assert.ok(!/needs\.preview\.outputs\.sha/.test(yml.slice(yml.indexOf('\n  preview:'), yml.indexOf('\n  run:'))), 'the PR head sha is not checked out in the preview job')
  assert.match(yml, /ref: \$\{\{ steps\.wait\.outputs\.specs_ref \}\}/)
  assert.match(yml, /\n  report:\n    needs: \[preview, run\]/)
})

// HIGH finding 1: the status comes only from this workflow, the n/a too.
test('journey.mjs posts the n/a itself and wait refuses a PR to a non-default branch', () => {
  const src = readFileSync(new URL('./journey.mjs', import.meta.url), 'utf8')
  assert.match(src, /n\/a: no UI change/)
  assert.match(src, /default_branch/)
  assert.match(src, /head moved while its files were listed/, 'the n/a is posted only for the head whose files were listed')
  assert.match(src, /counted as UI/, 'a PR too long to list counts as UI')
})
