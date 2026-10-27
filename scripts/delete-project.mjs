#!/usr/bin/env node
// delete-project: removes what new-project made, from one GitHub Actions run
// (.github/workflows/delete-project.yml, workflow_dispatch only): the org repo, the Worker with its
// Workers Builds connection, the D1 databases `<name>` and `<name>-preview`, and the shared build
// token once no other Worker in the account builds with it. The repo goes last, so a re-run after
// a failure still passes the guards and finishes the rest.
// Guards, all checked before anything is deleted: CONFIRM repeats NAME; NAME is not a protected
// repo; `projects/<name>.json` is on main (the project registry); the repo exists in yverse-studio
// and carries new-project's description. DRY_RUN (default) only prints the plan.
// Reads the same keys as new-project: CLOUDFLARE_API_TOKEN, CLOUDFLARE_ACCOUNT_ID, PROJECTS_GITHUB_TOKEN.
import { appendFileSync, existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { validName, redact } from './new-project.mjs'

export const ORG = 'yverse-studio'
export const MARKER = 'made by claude-setup new-project'
const BUILD_TOKEN_NAME = 'claude-setup-builds'
// Real repos and live projects (Worker and D1 go by the project name), never deletable here whatever
// their description says. Deleting one of these needs yskills' yes and a gated PR that drops it here.
export const PROTECTED = new Set(['tellmey', 'ideaworld', 'social', 'igelgarten', 'companyxy-spiel', 'claude-setup', 'duo-test', 'company-xy', 'mypage', 'ydeas-world', 'worker', 'yland', 'kleingarten', 'luna-monorepo', 'y-games', 'trayding-bot', 'anime-filter', 'luna-assistant-service', 'personal-luna', 'aissistant', 'tiktokisland', 'butzis-spiel'])

export function checkRequest({ name, confirm, registered }) {
  if (!validName(name || '')) throw new Error(`name "${name}" must be lowercase letters, digits and dashes`)
  if (confirm !== name) throw new Error(`confirm must repeat the name exactly ("${name}"); nothing was deleted`)
  if (PROTECTED.has(name.toLowerCase())) throw new Error(`${name} is a protected repo; nothing was deleted`)
  if (!registered) throw new Error(`projects/${name}.json is not on main, so ${name} is no project new-project made; nothing was deleted`)
}

export function madeByWorkflow(repo) {
  return String(repo?.description || '').includes(MARKER)
}

async function api(fetchFn, base, token, path, init = {}) {
  const res = await fetchFn(base + path, {
    ...init,
    headers: { authorization: `Bearer ${token}`, accept: 'application/json', 'user-agent': 'claude-setup delete-project' },
  })
  const text = await res.text()
  let json = null
  try { json = text ? JSON.parse(text) : null } catch { json = null }
  return { status: res.status, ok: res.ok, json, text }
}

function must(r, what) {
  if (!r.ok && r.status !== 404) throw new Error(`${what}: ${r.status} ${redact(r.text).slice(0, 300)}`)
  return r
}

async function listWorkers(cf) {
  const all = []
  for (let page = 1; ; page += 1) {
    const list = must(await cf(`/workers/workers?per_page=100&page=${page}`), 'list Workers').json?.result || []
    all.push(...list)
    if (list.length < 100) return all
  }
}

async function findD1(cf, dbName) {
  const list = must(await cf(`/d1/database?name=${encodeURIComponent(dbName)}&per_page=100`), 'list D1')
  return (list.json?.result || []).find((d) => d.name === dbName) || null
}

// What would go, read before anything is touched. The build token is shared by every project in
// the account, so it goes only when no other Worker still builds.
async function makePlan(cf, name) {
  const workers = await listWorkers(cf)
  const worker = workers.find((w) => w.name === name) || null
  const d1 = [await findD1(cf, name), await findD1(cf, `${name}-preview`)].filter(Boolean)
  let tokenInUse = null
  for (const w of workers.filter((x) => x.name !== name)) {
    if ((await cf(`/builds/workers/${w.id}`)).ok) { tokenInUse = w.name; break }
  }
  const tokens = tokenInUse ? [] : (must(await cf('/builds/tokens'), 'list build tokens').json?.result || []).filter((t) => t.build_token_name === BUILD_TOKEN_NAME)
  return { worker, d1, tokens, tokenInUse }
}

export async function run({ env, fetchFn = fetch, registered = (name) => existsSync(`projects/${name}.json`), log = console.log }) {
  const say = (step, detail) => log(`[delete-project] ${step}: ${detail}`)
  const name = env.NAME
  checkRequest({ name, confirm: env.CONFIRM, registered: validName(name || '') && registered(name) })
  for (const key of ['CLOUDFLARE_ACCOUNT_ID', 'CLOUDFLARE_API_TOKEN', 'PROJECTS_GITHUB_TOKEN']) {
    if (!env[key]) throw new Error(`${key} is not set (claude-setup → Settings → Secrets and variables → Actions)`)
  }
  const dryRun = env.DRY_RUN !== 'false'
  const cf = (path, init) => api(fetchFn, 'https://api.cloudflare.com/client/v4', env.CLOUDFLARE_API_TOKEN, `/accounts/${env.CLOUDFLARE_ACCOUNT_ID}${path}`, init)
  const gh = (path, init) => api(fetchFn, 'https://api.github.com', env.PROJECTS_GITHUB_TOKEN, path, init)

  const repo = await gh(`/repos/${ORG}/${name}`)
  if (!repo.ok) throw new Error(`${ORG}/${name} not found (${repo.status}); nothing was deleted`)
  if (!madeByWorkflow(repo.json)) throw new Error(`${ORG}/${name} was not made by new-project (its description lacks "${MARKER}"); nothing was deleted`)

  const plan = await makePlan(cf, name)
  say('plan', `repo ${ORG}/${name}`)
  say('plan', `Worker ${plan.worker ? name : `${name} (not found)`}`)
  say('plan', `D1 ${plan.d1.map((d) => d.name).join(', ') || 'none'}`)
  say('plan', `build token ${plan.tokenInUse ? `kept (${plan.tokenInUse} still builds)` : plan.tokens.length ? BUILD_TOKEN_NAME : 'none'}`)
  if (dryRun) { say('dry run', 'nothing deleted; run again with dry_run false to delete'); return { plan, deleted: false } }

  if (plan.worker) {
    const builds = await cf(`/builds/workers/${plan.worker.id}`, { method: 'DELETE' })
    say('builds', builds.ok ? 'connection removed' : `connection not removed separately (${builds.status}), it goes with the Worker`)
    must(await cf(`/workers/scripts/${name}?force=true`, { method: 'DELETE' }), `delete Worker ${name}`)
    say('worker', `deleted ${name}`)
  }
  for (const db of plan.d1) {
    must(await cf(`/d1/database/${db.uuid}`, { method: 'DELETE' }), `delete D1 ${db.name}`)
    say('d1', `deleted ${db.name}`)
  }
  for (const t of plan.tokens) {
    must(await cf(`/builds/tokens/${t.build_token_uuid}`, { method: 'DELETE' }), 'delete build token')
    say('build token', `deleted ${BUILD_TOKEN_NAME} (the next new project registers it again)`)
  }
  const gone = await gh(`/repos/${ORG}/${name}`, { method: 'DELETE' })
  if (!gone.ok) throw new Error(`delete repo ${ORG}/${name}: ${gone.status} ${redact(gone.text).slice(0, 300)}`)
  say('repo', `deleted ${ORG}/${name}`)
  return { plan, deleted: true }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  run({ env: process.env })
    .then(({ deleted }) => {
      if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, `## ${process.env.NAME} ${deleted ? 'deleted' : 'dry run, nothing deleted'}\n\nThe plan is in the log.${deleted ? ` Still to do: remove projects/${process.env.NAME}.json from main in a small PR.` : ''}\n`)
    })
    .catch((err) => { console.error(`[delete-project] ${err.message}`); process.exit(1) })
}
