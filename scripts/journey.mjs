#!/usr/bin/env node
// journey: the gate's preview journey for one project PR, run by .github/workflows/journey.yml.
// `wait` reads the PR, posts `n/a` when it changes only docs, tests or CI files, else posts pending,
// waits until its Worker Preview serves the head (`/api/config` `commit`) and writes ui, sha, url,
// repo and specs_ref to GITHUB_OUTPUT; a preview that never serves it fails. `report` posts the
// result. Only this workflow (the org token) posts the `journey` status, the n/a too; the project's
// own CI never does, so a PR cannot post its own pass (incident 2026-10-26, gate.md).
// `verify` (stdin: the head's statuses as JSON) is the gate's mechanical check: it passes only when the
// newest `journey` status is a success posted by this workflow's token, whatever a PR branch posted.
// Reads NAME, PR, PROJECTS_GITHUB_TOKEN; `report` also SHA, REPO, RESULT, RUN_URL, SPECS_CHANGED.
import { appendFileSync, existsSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { validName } from './new-project.mjs'
import { liveCommit } from './deploy-watch.mjs'

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

// A file that cannot change what the app does. Everything else (Nuxt app/, pages/, server/, worker/,
// configs, package.json, assets) runs the journey: the n/a fails closed, not open.
const APP_DIR = /^(app|pages|components|layouts|plugins|middleware|server|worker|src|public|content|assets)\//
export const isNonApp = (f) => !APP_DIR.test(f) && (/^[^/]+\.(md|txt)$/i.test(f) || /^(docs|test|tests|e2e|\.github)\//.test(f) || /^(LICENSE|\.gitignore)$/.test(f))
export const needsJourney = (files) => files.some((f) => !isNonApp(f))

export const JOURNEY_BOT = 'yskills-claude'
export const RUN_LINK = /^https:\/\/github\.com\/yverse-studio\/claude-setup\/actions\/runs\/\d+$/

// The gate's check: the NEWEST `journey` status of a head must be a success, created by the org bot
// and linked to a claude-setup run. A PR branch can post statuses with its own token (and overwrite a
// real red), but never as the bot; so a forged green fails here. `statuses`: the API list or the
// combined-status object.
export function verifyJourney(statuses) {
  const list = Array.isArray(statuses) ? statuses : statuses?.statuses || []
  const newest = list.filter((s) => s.context === 'journey').sort((a, b) => Date.parse(b.created_at || 0) - Date.parse(a.created_at || 0) || (b.id || 0) - (a.id || 0))[0]
  if (!newest) return { ok: false, reason: 'no journey status on the head: run journey.yml' }
  if (newest.creator?.login !== JOURNEY_BOT) return { ok: false, reason: `the newest journey status was posted by ${newest.creator?.login ?? 'unknown'}, not ${JOURNEY_BOT}: forged or not run` }
  if (!RUN_LINK.test(newest.target_url || '')) return { ok: false, reason: 'the newest journey status does not link to a claude-setup journey run' }
  if (newest.state !== 'success') return { ok: false, reason: `the newest journey status is ${newest.state}: ${newest.description || ''}`.trim() }
  return { ok: true, reason: newest.description }
}

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
  if (!res.ok) {
    const h = (k) => res.headers.get(k) ?? '-'
    const detail = (await res.text().catch(() => '')).slice(0, 300)
    throw new Error(`${method} ${path}: ${res.status} (needs: ${h('x-accepted-github-permissions')}; token scopes: ${h('x-oauth-scopes')}; ${detail})`)
  }
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
  if (head.repo?.full_name !== repo) throw new Error('a PR from a fork never gets the preview login: journey runs only branches of the project repo')
  const files = await changedFiles(repo, pr, api)
  if ((await api(`repos/${repo}/pulls/${pr}`)).head.sha !== head.sha) throw new Error('the PR head moved while its files were listed: run journey again')
  if (base.ref !== (await api(`repos/${repo}`)).default_branch) throw new Error(`the PR targets ${base.ref}, not the default branch: journey runs only PRs to the default branch`)
  if (!needsJourney(files)) return { sha: head.sha, ui: false }
  const url = previewUrl(head.ref, name)
  const named = previewHosts((await api(`repos/${repo}/commits/${head.sha}/check-runs`)).check_runs || [])
  if (named.length && !named.includes(url)) throw new Error(`Workers Builds names ${named.join(', ')} but the branch alias gives ${url}: no pass`)
  return { sha: head.sha, ui: true, url, specsRef: base.sha, specsChanged: files.some(isJourneyFile) }
}

async function wait() {
  const name = process.env.NAME || ''
  const pr = process.env.PR || ''
  if (!validName(name)) throw new Error(`name "${name}" must be lowercase letters, digits and dashes`)
  if (!/^\d+$/.test(pr)) throw new Error(`pr "${pr}" must be a number`)
  const repo = projectRepo(name)
  const out = (k, v) => process.env.GITHUB_OUTPUT && appendFileSync(process.env.GITHUB_OUTPUT, `${k}=${v}\n`)
  const plan = await planJourney(repo, pr, name, gh)
  out('sha', plan.sha); out('repo', repo)
  if (!plan.ui) {
    out('ui', 'false')
    await post(repo, plan.sha, { state: 'success', description: 'n/a: only docs, tests or CI files changed' })
    return console.log(`[journey] ${repo}#${pr} changes only docs, tests or CI files: n/a`)
  }
  const { sha, url } = plan
  await post(repo, sha, { state: 'pending', description: 'journey running on the preview' })
  out('ui', 'true'); out('url', url); out('specs_ref', plan.specsRef); out('specs_changed', plan.specsChanged)
  for (let t = 0; t < (WAIT_MINUTES * 60) / POLL_SECONDS; t++) {
    const res = await fetch(`${url}/api/config`, { signal: AbortSignal.timeout(10000) }).catch(() => null)
    const live = res?.ok ? liveCommit(await res.text()) : null
    if (live === sha) return console.log(`[journey] ${url} serves ${sha}`)
    await new Promise((r) => setTimeout(r, POLL_SECONDS * 1000))
  }
  out('preview', 'missing')
  throw new Error(`${url} did not serve ${sha} within ${WAIT_MINUTES} min (build-logs workflow shows why)`)
}

async function verify() {
  const chunks = []
  for await (const c of process.stdin) chunks.push(c)
  const { ok, reason } = verifyJourney(JSON.parse(Buffer.concat(chunks).toString('utf8') || '[]'))
  console.log(`[journey] verify: ${ok ? 'PASS' : 'FAIL'} (${reason})`)
  process.exit(ok ? 0 : 1)
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
  ;({ report, verify }[mode] ?? wait)().catch((err) => { console.error(err.message); process.exit(1) })
}
