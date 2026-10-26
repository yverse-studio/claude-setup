#!/usr/bin/env node
// journey: the gate's preview journey for one project PR, run by .github/workflows/journey.yml.
// `wait` reads the PR, posts `n/a: no UI change` when it touches no UI file, else posts pending,
// waits until its Worker Preview serves the head (`/api/config` `commit`) and writes ui, sha, url,
// repo and specs_ref to GITHUB_OUTPUT; a preview that never serves it fails. `report` posts the
// result. Only this workflow (the org token) posts the `journey` status, the n/a too; the project's
// own CI never does, so a PR cannot post its own pass (incident 2026-10-26, gate.md).
// Reads NAME, PR, PROJECTS_GITHUB_TOKEN; `report` also SHA, REPO, RESULT, RUN_URL, SPECS_CHANGED.
import { appendFileSync, existsSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { validName } from './new-project.mjs'
import { liveCommit } from './deploy-watch.mjs'
import { isUi } from '../.claude/skills/publish/templates/new-project/scripts/project-checks.mjs'

export const WAIT_MINUTES = 20 // Workers Builds runs one build at a time; a queue of branch builds takes this long
const POLL_SECONDS = 20

// Workers Builds' preview alias: the branch, lowercased, `/` and `_` as `-`, before the Worker name.
// Anything outside [a-z0-9-] becomes `-`, and the result must parse to a host under yverse.workers.dev.
export function previewUrl(branch, name) {
  const url = new URL(`https://${branch.toLowerCase().replace(/[^a-z0-9-]/g, '-')}-${name}.yverse.workers.dev`)
  if (!/^[a-z0-9-]+\.yverse\.workers\.dev$/.test(url.hostname) || url.username || url.hash) throw new Error(`branch "${branch}" gives no preview host`)
  return url.origin
}

export function projectRepo(name, read = (f) => (existsSync(f) ? JSON.parse(readFileSync(f, 'utf8')) : null)) {
  const p = read(`projects/${name}.json`)
  if (!p) throw new Error(`projects/${name}.json is not on main; journey runs only registered projects`)
  if (p.kind === 'repo') throw new Error(`${name} has no Worker, so no preview`)
  return `${p.org || 'yverse-studio'}/${p.repo || p.name}`
}

// The journey specs run from the project's default branch, so a PR's own change to them (or to the
// package.json that names the script) is not run here: the status says so and the Tester reads it.
export const isJourneyFile = (f) => /(^|\/)(journey|e2e)(\/|\.[\w.]+$)/i.test(f) || f === 'package.json'

// Every *.yverse.workers.dev host a Workers Builds check run of the head names (its summary, text or link).
export function previewHosts(checkRuns) {
  const text = checkRuns.flatMap((c) => [c.output?.summary, c.output?.text, c.details_url]).filter(Boolean).join('\n')
  return [...new Set((text.match(/https:\/\/[a-z0-9-]+\.yverse\.workers\.dev/g) || []))]
}

// What the `journey` status says for a job result.
export function statusFor(result, sha, specsChanged = false) {
  const note = specsChanged ? ' (this PR changes journey files: they run from main, the Tester reads them)' : ''
  if (result === 'success') return { state: 'success', description: `journey passed on the preview of ${sha.slice(0, 7)}${note}` }
  return { state: 'failure', description: result === 'no-preview' ? `the preview never served ${sha.slice(0, 7)}: no pass` : 'journey failed or could not run on the preview' }
}

async function gh(path, method = 'GET', body) {
  const res = await fetch(`https://api.github.com/${path}`, {
    method,
    headers: { authorization: `Bearer ${process.env.PROJECTS_GITHUB_TOKEN}`, accept: 'application/vnd.github+json', 'x-github-api-version': '2022-11-28' },
    body: body && JSON.stringify(body),
  })
  if (!res.ok) throw new Error(`${method} ${path}: ${res.status}`)
  return res.json()
}

const post = (repo, sha, status) => gh(`repos/${repo}/statuses/${sha}`, 'POST', { context: 'journey', target_url: process.env.RUN_URL, ...status })

async function changedFiles(repo, pr) {
  const files = []
  for (let page = 1; page <= 30; page++) {
    const batch = await gh(`repos/${repo}/pulls/${pr}/files?per_page=100&page=${page}`)
    files.push(...batch.flatMap((f) => [f.filename, f.previous_filename].filter(Boolean)))
    if (batch.length < 100) return files
  }
  return [...files, 'src/(more than 3000 files: counted as UI)'] // too long to list: fail closed
}

async function wait() {
  const name = process.env.NAME || ''
  const pr = process.env.PR || ''
  if (!validName(name)) throw new Error(`name "${name}" must be lowercase letters, digits and dashes`)
  if (!/^\d+$/.test(pr)) throw new Error(`pr "${pr}" must be a number`)
  const repo = projectRepo(name)
  const { head, base } = await gh(`repos/${repo}/pulls/${pr}`)
  if (head.repo?.full_name !== repo) throw new Error('a PR from a fork never gets the preview login: journey runs only branches of the project repo')
  const out = (k, v) => process.env.GITHUB_OUTPUT && appendFileSync(process.env.GITHUB_OUTPUT, `${k}=${v}\n`)
  const files = await changedFiles(repo, pr)
  if ((await gh(`repos/${repo}/pulls/${pr}`)).head.sha !== head.sha) throw new Error('the PR head moved while its files were listed: run journey again')
  out('sha', head.sha); out('repo', repo)
  if (!files.some(isUi)) {
    out('ui', 'false')
    await post(repo, head.sha, { state: 'success', description: 'n/a: no UI change' })
    return console.log(`[journey] ${repo}#${pr} changes no UI file: n/a`)
  }
  if (base.ref !== (await gh(`repos/${repo}`)).default_branch) throw new Error(`the PR targets ${base.ref}, not the default branch: journey specs run from the default branch`)
  const url = previewUrl(head.ref, name)
  const named = previewHosts((await gh(`repos/${repo}/commits/${head.sha}/check-runs`)).check_runs || [])
  if (named.length && !named.includes(url)) throw new Error(`Workers Builds names ${named.join(', ')} but the branch alias gives ${url}: no pass`)
  await post(repo, head.sha, { state: 'pending', description: 'journey running on the preview' })
  out('ui', 'true'); out('url', url); out('specs_ref', base.ref); out('specs_changed', files.some(isJourneyFile))
  for (let t = 0; t < (WAIT_MINUTES * 60) / POLL_SECONDS; t++) {
    const res = await fetch(`${url}/api/config`, { signal: AbortSignal.timeout(10000) }).catch(() => null)
    const live = res?.ok ? liveCommit(await res.text()) : null
    if (live === head.sha) return console.log(`[journey] ${url} serves ${head.sha}`)
    await new Promise((r) => setTimeout(r, POLL_SECONDS * 1000))
  }
  out('preview', 'missing')
  throw new Error(`${url} did not serve ${head.sha} within ${WAIT_MINUTES} min (build-logs workflow shows why)`)
}

async function report() {
  const { REPO: repo = '', SHA: sha = '', RESULT: result = '', SPECS_CHANGED: specsChanged = '' } = process.env
  if (!/^[\w.-]+\/[\w.-]+$/.test(repo) || !/^[0-9a-f]{40}$/.test(sha)) throw new Error('REPO and SHA are required')
  const status = statusFor(result, sha, specsChanged === 'true')
  await post(repo, sha, status)
  console.log(`[journey] ${repo}@${sha.slice(0, 7)}: ${status.state} (${status.description})`)
  if (status.state !== 'success') process.exitCode = 1
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const mode = process.argv[2]
  ;(mode === 'report' ? report() : wait()).catch((err) => { console.error(err.message); process.exit(1) })
}
