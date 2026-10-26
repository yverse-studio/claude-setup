#!/usr/bin/env node
// preview-login: gives a project's journey check a way past the app login, without a human and without
// the live app ever knowing it. Run by .github/workflows/preview-login.yml (workflow_dispatch, input: the
// project name; yskills approved the secret 2026-10-26). One fresh random token goes to two places:
//   1. the Worker's PREVIEWS env (previews_base_config), never the live Worker: live has no such secret, so
//      the app's `POST /api/test-login` answers 404 there (publish skill, Preview login);
//   2. the project repo's Actions secret PREVIEW_LOGIN_TOKEN, which only the journey `run` job reads.
// The token is masked before it exists and never printed, written or returned. A re-run rotates it (and the
// previews' BETTER_AUTH_SECRET, which is resent because Cloudflare never returns secret values): rotating a
// secret waits for yskills' tap (CLAUDE.md, Ask first). Reads CLOUDFLARE_API_TOKEN, CLOUDFLARE_ACCOUNT_ID,
// PROJECTS_GITHUB_TOKEN (needs Secrets read and write on the project repo).
import { existsSync, readFileSync, appendFileSync } from 'node:fs'
import { randomBytes } from 'node:crypto'
import { fileURLToPath } from 'node:url'
import { validName, validRepo, projectConfig, ORG, redact, PREVIEW_LOGIN, previewEnv, setRepoSecret, sealWithSodium } from './new-project.mjs'

export async function run({ cf, gh, seal, org, repo, name, token = randomBytes(32).toString('base64url'), authSecret = randomBytes(32).toString('base64url'), log = console.log }) {
  const workers = (await cf('/workers/workers?per_page=100')).json?.result || []
  const worker = workers.find((w) => w.name === name)
  if (!worker) throw new Error(`no Worker named ${name} in this account`)
  const current = (await cf(`/workers/workers/${worker.id}`)).json?.result
  const env = previewEnv(current?.previews_base_config?.env, authSecret, token)
  await cf(`/workers/workers/${worker.id}`, { method: 'PATCH', body: { previews_base_config: { ...current?.previews_base_config, env } } })
  log(`[preview-login] ${name}: previews env set (live Worker untouched)`)
  await setRepoSecret(gh, { org, repo, value: token, seal })
  log(`[preview-login] ${org}/${repo}: environment secret ${PREVIEW_LOGIN} set`)
  return { name, repo: `${org}/${repo}` }
}

async function http(base, token, path, init = {}) {
  const res = await fetch(base + path, {
    ...init,
    headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json', accept: 'application/json', 'user-agent': 'claude-setup preview-login', ...(init.headers || {}) },
    body: init.body === undefined ? undefined : JSON.stringify(init.body),
  })
  const text = await res.text()
  let json = null
  try { json = text ? JSON.parse(text) : null } catch { json = null }
  return { status: res.status, ok: res.ok, json, text }
}

async function main() {
  const name = process.env.NAME || ''
  if (!validName(name)) throw new Error(`name "${name}" must be lowercase letters, digits and dashes`)
  const file = `projects/${name}.json`
  if (!existsSync(file)) throw new Error(`${file} is not on main; preview-login reads only registered projects`)
  const project = projectConfig(name, JSON.parse(readFileSync(file, 'utf8')))
  if (project.org !== ORG || !validRepo(project.repo)) throw new Error(`${file}: org must be ${ORG} and repo a GitHub repo name`)
  const [cfToken, account, ghToken] = ['CLOUDFLARE_API_TOKEN', 'CLOUDFLARE_ACCOUNT_ID', 'PROJECTS_GITHUB_TOKEN'].map((k) => {
    if (!process.env[k]) throw new Error(`${k} is not set`)
    return process.env[k]
  })
  const token = randomBytes(32).toString('base64url')
  console.log(`::add-mask::${token}`)
  const cf = async (path, init) => {
    const r = await http('https://api.cloudflare.com/client/v4', cfToken, `/accounts/${account}${path}`, init)
    if (!r.ok) throw new Error(`Cloudflare ${init?.method || 'GET'} ${path.replace(/workers\/[0-9a-f]{32}/, 'workers/<id>')}: ${r.status} ${redact(r.text).slice(0, 300)}`)
    return r
  }
  const gh = (path, init) => http('https://api.github.com', ghToken, path, init).then((r) => {
    if (!r.ok) throw new Error(`GitHub ${init?.method || 'GET'} ${path}: ${r.status} ${redact(r.text).slice(0, 300)}`)
    return r
  })
  const out = await run({ cf, gh, seal: sealWithSodium, org: project.org, repo: project.repo, name, token })
  if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, `## preview-login ${name}\n\n- Worker previews env and ${out.repo} environment secret ${PREVIEW_LOGIN} set (value never shown)\n`)
}

if (process.argv[1] === fileURLToPath(import.meta.url)) main().catch((e) => { console.error(`[preview-login] ${e.message}`); process.exit(1) })
