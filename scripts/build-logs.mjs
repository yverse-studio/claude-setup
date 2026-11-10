#!/usr/bin/env node
// build-logs: lists the 10 newest Workers Builds (status, branch, commit) and prints the tail of the latest log, so a cloud thread (which
// cannot open the Cloudflare dashboard) can read why a build failed. Run by
// .github/workflows/build-logs.yml (workflow_dispatch). Every line goes through new-project's
// redact(): ids, uuids and token-like strings never reach the public Actions log.
// Calls: reads, plus two writes: CANCEL=true cancels builds stuck for over 10 minutes; BUILD_BRANCH=<branch> starts a Workers Builds build of that branch (a Worker Preview) when the push webhook missed it, waits for it, then prints its log tail, which carries the preview URL. Only registered projects (`projects/<name>.json` on main). Reads CLOUDFLARE_API_TOKEN and CLOUDFLARE_ACCOUNT_ID.
import { existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { validName, redact, describe } from './new-project.mjs'

export const TAIL = 120

// redact() plus what a build log adds: KEY=value and KEY: value pairs whose key sounds secret,
// URL credentials and bearer headers. The repo is public, so its Actions logs are too.
export function scrub(text) {
  return redact(text)
    .replace(/\b(?:sk|rk|pk)_(?:live|test)_\w+|\bwhsec_\w+|\bgithub_pat_\w+|\bgh[pousr]_\w+|\bAKIA[0-9A-Z]{16}\b|\bxox[abprs]-[\w-]+/g, '***')
    .replace(/\b(bearer|basic)\s+\S+/gi, '$1 ***')
    .replace(/(--?[\w-]*(?:token|secret|key|password)[\w-]*|\b(?:token|secret|password))\s+(?![=:])\S+/gi, '$1 ***')
    .replace(/\b([A-Za-z0-9_.-]*(?:token|secret|key|password|passwd|auth|credential|cookie|session|dsn)[A-Za-z0-9_.-]*)(\s*[=:]\s*)("[^"]*"|'[^']*'|\S+)/gi, '$1$2***')
    .replace(/(\w+:\/\/)[^/\s:@]+:[^/\s@]+@/g, '$1***@')
}

// Workers Builds answers lines as [timestamp, text] pairs; older answers used plain strings.
export function logLines(json, tail = TAIL) {
  const lines = json?.result?.lines || []
  return lines.slice(-tail).map((l) => scrub(Array.isArray(l) ? l[l.length - 1] : l))
}

// Newest first by created_on, whatever order the API used.
export function latestBuild(builds) {
  return [...(builds || [])].sort((a, b) => String(b.created_on).localeCompare(String(a.created_on)))[0] || null
}

// One scrubbed line per build, newest first; branch names are user-chosen and the Actions log is public.
export function recentLines(builds) {
  return [...(builds || [])].sort((a, b) => String(b.created_on).localeCompare(String(a.created_on))).map((b) => {
    const m = b.build_trigger_metadata || {}
    return scrub(`[build-logs] recent: ${b.created_on} ${b.status}/${b.build_outcome} ${m.branch || '?'} ${String(m.commit_hash || '?').slice(0, 7)}`)
  })
}

// Builds that never reached "stopped": queued, initializing or running. A stuck one blocks the queue.
export const STUCK_MINUTES = 10
export function openBuilds(builds, now = Date.now(), minutes = STUCK_MINUTES) {
  return (builds || []).filter((b) => b.status !== 'stopped' && now - Date.parse(b.created_on) > minutes * 60000)
}

// Branch names go into an API body, not a shell, but the Actions log is public: plain git ref characters only.
export const validBranch = (b) => typeof b === 'string' && /^[A-Za-z0-9][A-Za-z0-9._/-]{0,100}$/.test(b) && !b.includes('..')
// Never the production branch: a manual build of main would be a deploy outside the gate. The trigger builds the branch tip, so no commit is forwarded.
export const isProduction = (b, trigger) => ['main', 'master', ...(trigger?.branch_includes || [])].includes(b)

export const WAIT_MS = 4 * 60000
export const POLL_MS = 15000
const PRODUCTION_BRANCHES = ['main', 'master']

// What a refusal says about a trigger: names and the fields that decide production vs preview, never ids or secrets.
const describeTrigger = (t) => `name ${t.trigger_name || '?'}, branch_includes [${(t.branch_includes || []).join(',')}], branch_excludes [${(t.branch_excludes || []).join(',')}], deploy_command "${t.deploy_command || ''}", keys: ${Object.keys(t).filter((k) => !/uuid|id$|token|secret/i.test(k)).join(',')}`

// The one trigger that builds previews. A Worker with preview builds has two triggers; starting a branch on the production one would run
// its `wrangler deploy` on unmerged code. Anything but exactly one clearly non-production trigger is an error, never a guess.
export function pickTrigger(triggers) {
  const preview = (triggers || []).filter((t) => {
    const includesMain = (t.branch_includes || []).some((b) => PRODUCTION_BRANCHES.includes(b))
    return !includesMain && !/wrangler (versions )?deploy/.test(t.deploy_command || '') // a preview trigger never builds main and never deploys
  })
  if (preview.length !== 1) throw new Error(`expected exactly one preview trigger, found ${preview.length} of ${(triggers || []).length}; refusing to start a build (${scrub((triggers || []).map(describeTrigger).join(' | '))})`)
  return preview[0]
}

// Starts a build of the branch tip on the preview trigger, then follows that build (by the uuid the API returned) until it stops or WAIT_MS passes.
// Returns { uuid, finished, outcome }; the caller fails the run unless it finished.
export async function triggerBuild(cf, workerId, branch, getBuild, wait = (ms) => new Promise((r) => setTimeout(r, ms)), limit = WAIT_MS) {
  if (!validBranch(branch)) throw new Error(`BUILD_BRANCH "${scrub(String(branch))}" is not a plain git branch name`)
  const triggers = (await cf(`/builds/workers/${workerId}/triggers`)).json?.result
  const trigger = pickTrigger(triggers)
  // production = main, master and whatever the OTHER triggers (the production one) build; the preview trigger's own `*` is no guide
  const others = (triggers || []).filter((t) => t !== trigger)
  if (isProduction(branch, { branch_includes: others.flatMap((t) => t.branch_includes || []) })) throw new Error(`refusing to start a build of the production branch (${scrub(branch)}): it deploys only through the gate's merge`)
  const started = (await cf(`/builds/triggers/${trigger.trigger_uuid}/builds`, 'POST', { branch })).json?.result
  const uuid = started?.build_uuid
  if (!uuid) throw new Error('the build was not started: the API answered without a build id')
  console.log(`[build-logs] started a build of branch ${scrub(branch)} on trigger ${scrub(trigger.trigger_name || 'preview')}`)
  for (let waited = 0; waited < limit; waited += POLL_MS) {
    await wait(POLL_MS)
    const build = await getBuild(uuid)
    if (build?.status === 'stopped') return { uuid, finished: true, outcome: build.build_outcome }
  }
  return { uuid, finished: false, outcome: null }
}

async function main() {
  const name = process.env.NAME || ''
  if (!validName(name)) throw new Error(`name "${name}" must be lowercase letters, digits and dashes`)
  if (!existsSync(`projects/${name}.json`)) throw new Error(`projects/${name}.json is not on main; build-logs reads only registered projects`)
  const token = process.env.CLOUDFLARE_API_TOKEN
  const account = process.env.CLOUDFLARE_ACCOUNT_ID
  if (!token || !account) throw new Error('CLOUDFLARE_API_TOKEN and CLOUDFLARE_ACCOUNT_ID are required')
  const cf = async (path, method = 'GET', body) => {
    const res = await fetch(`https://api.cloudflare.com/client/v4/accounts/${account}${path}`, { method, headers: { authorization: `Bearer ${token}`, ...(body && { 'content-type': 'application/json' }) }, ...(body && { body: JSON.stringify(body) }) })
    const text = await res.text()
    let json = null
    try { json = JSON.parse(text) } catch { json = null }
    const r = { status: res.status, ok: res.ok, json, text }
    if (!r.ok) throw new Error(`${redact(path)} → ${describe(r)}`)
    return r
  }
  const workers = (await cf('/workers/workers?per_page=100')).json?.result || []
  const worker = workers.find((w) => w.name === name)
  if (!worker) throw new Error(`no Worker named ${name} in this account`)
  const listBuilds = async () => (await cf(`/builds/workers/${worker.id}/builds?per_page=50`)).json?.result || []
  const branch = process.env.BUILD_BRANCH || ''
  if (branch && !validBranch(branch)) throw new Error(`BUILD_BRANCH "${scrub(branch)}" is not a plain git branch name`)
  let mine = null
  if (branch) mine = await triggerBuild(cf, worker.id, branch, async (uuid) => (await cf(`/builds/builds/${uuid}`)).json?.result)
  const builds = await listBuilds()
  const build = mine ? builds.find((b) => b.build_uuid === mine.uuid) || { build_uuid: mine.uuid, status: mine.finished ? 'stopped' : 'running', build_outcome: mine.outcome, created_on: new Date().toISOString() } : latestBuild(builds)
  if (!build) throw new Error(`${name} has no builds yet`)
  for (const line of recentLines(builds.slice(0, 10))) console.log(line)
  const stuck = openBuilds(builds)
  console.log(`[build-logs] ${stuck.length} of ${builds.length} builds are older than ${STUCK_MINUTES} min and not stopped`)
  for (const line of recentLines(stuck)) console.log(line.replace('recent:', 'stuck:'))
  if (process.env.CANCEL === 'true') {
    for (const b of stuck) {
      const r = await cf(`/builds/builds/${b.build_uuid}/cancel`, 'PUT').then(() => 'cancelled', (e) => `failed: ${redact(e.message)}`)
      console.log(`[build-logs] cancel ${b.created_on}: ${r}`)
    }
  }
  const meta = build.build_trigger_metadata || {}
  console.log(scrub(`[build-logs] ${name}: ${build.status}, outcome ${build.build_outcome}, branch ${meta.branch || '?'}, commit ${String(meta.commit_hash || '?').slice(0, 7)}, created ${build.created_on}`))
  for (const line of logLines((await cf(`/builds/builds/${build.build_uuid}/logs`)).json)) console.log(line)
  // a dispatcher must never read green as "preview ready" when it is not (the log above is printed first so a slow build can still be read)
  if (mine && !mine.finished) throw new Error('the build did not finish within 4 minutes (or never appeared); run this again to read its log')
  if (mine && mine.outcome !== 'success') throw new Error(`the build finished with outcome ${mine.outcome}`)
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((err) => { console.error(`[build-logs] ${redact(err.message)}`); process.exit(1) })
}
