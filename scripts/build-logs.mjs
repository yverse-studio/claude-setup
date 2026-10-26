#!/usr/bin/env node
// build-logs: lists the 10 newest Workers Builds (status, branch, commit) and prints the tail of the latest log, so a cloud thread (which
// cannot open the Cloudflare dashboard) can read why a build failed. Run by
// .github/workflows/build-logs.yml (workflow_dispatch). Every line goes through new-project's
// redact(): ids, uuids and token-like strings never reach the public Actions log.
// Only registered projects (`projects/<name>.json` on main). Reads CLOUDFLARE_API_TOKEN and CLOUDFLARE_ACCOUNT_ID, read-only calls only.
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

async function main() {
  const name = process.env.NAME || ''
  if (!validName(name)) throw new Error(`name "${name}" must be lowercase letters, digits and dashes`)
  if (!existsSync(`projects/${name}.json`)) throw new Error(`projects/${name}.json is not on main; build-logs reads only registered projects`)
  const token = process.env.CLOUDFLARE_API_TOKEN
  const account = process.env.CLOUDFLARE_ACCOUNT_ID
  if (!token || !account) throw new Error('CLOUDFLARE_API_TOKEN and CLOUDFLARE_ACCOUNT_ID are required')
  const cf = async (path) => {
    const res = await fetch(`https://api.cloudflare.com/client/v4/accounts/${account}${path}`, { headers: { authorization: `Bearer ${token}` } })
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
  const builds = (await cf(`/builds/workers/${worker.id}/builds?per_page=10`)).json?.result || []
  const build = latestBuild(builds)
  if (!build) throw new Error(`${name} has no builds yet`)
  for (const b of [...builds].sort((x, y) => String(y.created_on).localeCompare(String(x.created_on)))) {
    const m = b.build_trigger_metadata || {}
    console.log(`[build-logs] recent: ${b.created_on} ${b.status}/${b.build_outcome} ${m.branch || '?'} ${String(m.commit_hash || '?').slice(0, 7)}`)
  }
  const meta = build.build_trigger_metadata || {}
  console.log(`[build-logs] ${name}: ${build.status}, outcome ${build.build_outcome}, branch ${meta.branch || '?'}, commit ${String(meta.commit_hash || '?').slice(0, 7)}, created ${build.created_on}`)
  for (const line of logLines((await cf(`/builds/builds/${build.build_uuid}/logs`)).json)) console.log(line)
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((err) => { console.error(`[build-logs] ${redact(err.message)}`); process.exit(1) })
}
