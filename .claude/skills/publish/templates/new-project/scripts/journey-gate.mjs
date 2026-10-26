#!/usr/bin/env node
// journey gate for this repo's PRs, run by .github/workflows/journey.yml with the built-in GITHUB_TOKEN.
// `wait` reads the PR, posts `n/a` when it changes only docs, tests or CI files, else posts pending,
// waits until the PR's Worker Preview serves its head (`/api/config` `commit`) and writes ui, sha and
// url to GITHUB_OUTPUT; a preview that never serves it fails. `report` posts the result.
// The workflow is `pull_request_target`: it comes from the PR base branch (the gate accepts only runs on the default branch), not the PR, so a PR cannot
// edit it; no PR code runs on a runner (incident 2026-10-26, claude-setup gate.md).
// Reads GH_TOKEN, REPO, NAME (the Worker name), PR; `report` also SHA, RESULT, RUN_URL.
import { appendFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

export const WAIT_MINUTES = 20 // Workers Builds runs one build at a time; a queue of branch builds takes this long
const POLL_SECONDS = 20
const SHA = /^[0-9a-f]{40}$/

// Workers Builds' preview alias: the branch, lowercased, `/` and `_` as `-`, before the Worker name.
// Anything outside [a-z0-9-] becomes `-`, and the result must parse to a host under yverse.workers.dev.
export function previewUrl(branch, name) {
  const url = new URL(`https://${branch.toLowerCase().replace(/[^a-z0-9-]/g, '-')}-${name}.yverse.workers.dev`)
  if (!/^[a-z0-9-]+\.yverse\.workers\.dev$/.test(url.hostname) || url.username || url.hash) throw new Error(`branch "${branch}" gives no preview host`)
  return url.origin
}

export function liveCommit(body) {
  try {
    const commit = JSON.parse(body)?.commit
    return typeof commit === 'string' && SHA.test(commit) ? commit : null
  } catch {
    return null
  }
}

// A file that cannot change what the app does. Everything else (Nuxt app/, pages/, server/, worker/,
// configs, package.json, assets) runs the journey: the n/a fails closed, not open.
const APP_DIR = /^(app|pages|components|layouts|plugins|middleware|server|worker|src|public|content|assets)\//
export const isNonApp = (f) => !APP_DIR.test(f) && (/^[^/]+\.(md|txt)$/i.test(f) || /^(docs|test|tests|e2e|\.github)\//.test(f) || /^(LICENSE|\.gitignore)$/.test(f))
export const needsJourney = (files) => files.some((f) => !isNonApp(f))

// The journey specs run from the default branch, so a PR's own change to them (or to the package.json
// that names the script) is not run here: the status says so and the Tester reads it.
export const isJourneyFile = (f) => /(^|\/)(journey|e2e)(\/|\.[\w.]+$)/i.test(f) || f === 'package.json'

// Every *.yverse.workers.dev host a Workers Builds check run of the head names (its summary, text or link).
export function previewHosts(checkRuns) {
  const text = checkRuns.flatMap((c) => [c.output?.summary, c.output?.text, c.details_url]).filter(Boolean).join('\n')
  return [...new Set((text.match(/https:\/\/[a-z0-9-]+\.yverse\.workers\.dev/g) || []))]
}

// What the `journey` status says for a job result.
export function statusFor(result, sha, specsChanged = false) {
  const note = specsChanged ? ' (this PR changes journey files: they run from the default branch, the Tester reads them)' : ''
  if (result === 'success') return { state: 'success', description: `journey passed on the preview of ${sha.slice(0, 7)}${note}` }
  return { state: 'failure', description: result === 'no-preview' ? `the preview never served ${sha.slice(0, 7)}: no pass` : 'journey failed or could not run on the preview' }
}

async function gh(path, method = 'GET', body) {
  const res = await fetch(`https://api.github.com/${path}`, {
    method,
    headers: { authorization: `Bearer ${process.env.GH_TOKEN}`, accept: 'application/vnd.github+json', 'x-github-api-version': '2022-11-28' },
    body: body && JSON.stringify(body),
  })
  if (!res.ok) throw new Error(`${method} ${path}: ${res.status} (needs: ${res.headers.get('x-accepted-github-permissions') ?? '-'})`)
  return res.json()
}

const post = (repo, sha, status) => gh(`repos/${repo}/statuses/${sha}`, 'POST', { context: 'journey', target_url: process.env.RUN_URL, ...status })

async function changedFiles(repo, pr, api) {
  const files = []
  for (let page = 1; page <= 30; page++) {
    const batch = await api(`repos/${repo}/pulls/${pr}/files?per_page=100&page=${page}`)
    files.push(...batch.flatMap((f) => [f.filename, f.previous_filename].filter(Boolean)))
    if (batch.length < 100) return files
  }
  return [...files, 'src/(more than 3000 files: counted as app code)'] // too long to list: fail closed
}

// What `wait` decides about a PR, with `api` injected so the decisions are tested with fakes.
// Throws for a fork, a moved head or (when a journey is needed) a PR to a non-default branch.
export async function planJourney(repo, pr, name, api) {
  const { head, base } = await api(`repos/${repo}/pulls/${pr}`)
  if (head.repo?.full_name !== repo) throw new Error('a PR from a fork never gets the preview: journey runs only branches of this repo')
  const files = await changedFiles(repo, pr, api)
  if ((await api(`repos/${repo}/pulls/${pr}`)).head.sha !== head.sha) throw new Error('the PR head moved while its files were listed: the next run covers the new head')
  if (base.ref !== (await api(`repos/${repo}`)).default_branch) throw new Error(`the PR targets ${base.ref}, not the default branch: journey runs only PRs to the default branch`)
  if (!needsJourney(files)) return { sha: head.sha, ui: false }
  const url = previewUrl(head.ref, name)
  const named = previewHosts((await api(`repos/${repo}/commits/${head.sha}/check-runs`)).check_runs || [])
  if (named.length && !named.includes(url)) throw new Error(`Workers Builds names ${named.join(', ')} but the branch alias gives ${url}: no pass`)
  return { sha: head.sha, ui: true, url, specsChanged: files.some(isJourneyFile) }
}

async function wait() {
  const { REPO: repo = '', NAME: name = '', PR: pr = '' } = process.env
  if (!/^[\w.-]+\/[\w.-]+$/.test(repo) || !/^[a-z0-9][a-z0-9-]+$/.test(name) || !/^\d+$/.test(pr)) throw new Error('REPO, NAME and PR are required')
  const out = (k, v) => process.env.GITHUB_OUTPUT && appendFileSync(process.env.GITHUB_OUTPUT, `${k}=${v}\n`)
  const plan = await planJourney(repo, pr, name, gh)
  out('sha', plan.sha)
  if (!plan.ui) {
    out('ui', 'false')
    await post(repo, plan.sha, { state: 'success', description: 'n/a: only docs, tests or CI files changed' })
    return console.log(`[journey] ${repo}#${pr} changes only docs, tests or CI files: n/a`)
  }
  const { sha, url } = plan
  await post(repo, sha, { state: 'pending', description: 'journey running on the preview' })
  out('ui', 'true'); out('url', url); out('specs_changed', plan.specsChanged)
  for (let t = 0; t < (WAIT_MINUTES * 60) / POLL_SECONDS; t++) {
    const res = await fetch(`${url}/api/config`, { signal: AbortSignal.timeout(10000) }).catch(() => null)
    const live = res?.ok ? liveCommit(await res.text()) : null
    if (live === sha) return console.log(`[journey] ${url} serves ${sha}`)
    await new Promise((r) => setTimeout(r, POLL_SECONDS * 1000))
  }
  out('preview', 'missing')
  throw new Error(`${url} did not serve ${sha} within ${WAIT_MINUTES} min`)
}

async function report() {
  const { REPO: repo = '', SHA: sha = '', RESULT: result = '', SPECS_CHANGED: specsChanged = '' } = process.env
  if (!/^[\w.-]+\/[\w.-]+$/.test(repo) || !SHA.test(sha)) throw new Error('REPO and SHA are required')
  const status = statusFor(result, sha, specsChanged === 'true')
  await post(repo, sha, status)
  console.log(`[journey] ${repo}@${sha.slice(0, 7)}: ${status.state} (${status.description})`)
  if (status.state !== 'success') process.exitCode = 1
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  ;({ report }[process.argv[2]] ?? wait)().catch((err) => { console.error(err.message); process.exit(1) })
}
