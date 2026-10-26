#!/usr/bin/env node
// deploy-watch: for every registered project (`projects/<name>.json`), compares the commit the
// live site serves (`/api/config` `commit`, publish skill, live smoke test) with the repo's
// default-branch HEAD. When they differ and HEAD is older than 15 minutes, it opens (or keeps) one
// `deploy-drift` issue per project in claude-setup; when live catches up, it closes it. A project
// that serves no commit is listed as unwatched. Run by .github/workflows/deploy-watch.yml every 15
// minutes (incident 2026-10-26: ~3 h of social merges never deployed and nobody noticed).
// Reads PROJECTS_GITHUB_TOKEN (the org repos' HEAD) and GITHUB_TOKEN (this repo's issues).
import { readdirSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

export const GRACE_MINUTES = 15
export const LABEL = 'deploy-drift'
export const SKIP_KINDS = new Set(['repo']) // a private repo has no Worker
const SHA = /^[0-9a-f]{40}$/

export const issueTitle = (name) => `${LABEL}: ${name}`

export function readProjects(dir = 'projects') {
  return readdirSync(dir).filter((f) => f.endsWith('.json')).map((f) => JSON.parse(readFileSync(`${dir}/${f}`, 'utf8')))
    .filter((p) => p.name && !SKIP_KINDS.has(p.kind))
    .map((p) => ({ name: p.name, repo: `${p.org || 'yverse-studio'}/${p.repo || p.name}`, url: `https://${p.name}.yverse.workers.dev` }))
}

// The commit a live `/api/config` body names, or null when it names none.
export function liveCommit(body) {
  try {
    const commit = JSON.parse(body)?.commit
    return typeof commit === 'string' && SHA.test(commit) ? commit : null
  } catch {
    return null
  }
}

// ok | drift | building (HEAD is newer than the grace period) | unwatched (no commit served)
export function verdict({ live, head, headAt }, now = Date.now(), grace = GRACE_MINUTES) {
  if (!live) return 'unwatched'
  if (live === head) return 'ok'
  return now - Date.parse(headAt) > grace * 60000 ? 'drift' : 'building'
}

// What to do with this project's issue: open one, close the open one, or nothing.
export function issueAction(state, openIssue) {
  if (state === 'drift') return openIssue ? null : 'open'
  if (state === 'ok' && openIssue) return 'close'
  return null
}

export function issueBody(p, { live, head, headAt }) {
  return [
    `Live ${p.url} serves \`${live}\`, but \`${p.repo}\` main is at \`${head}\` (committed ${headAt}, over ${GRACE_MINUTES} min ago).`,
    '',
    'Merges are not reaching live. Next: run the `build-logs` workflow for this Worker (with `cancel` for builds stuck over 10 min), fix the build, and check live `/api/config` again. This issue closes by itself when live serves main HEAD.',
    '',
    'Opened by `.github/workflows/deploy-watch.yml` (`scripts/deploy-watch.mjs`).',
  ].join('\n')
}

async function main() {
  const orgToken = process.env.PROJECTS_GITHUB_TOKEN
  const repoToken = process.env.GITHUB_TOKEN
  const self = process.env.GITHUB_REPOSITORY
  if (!orgToken || !repoToken || !self) throw new Error('PROJECTS_GITHUB_TOKEN, GITHUB_TOKEN and GITHUB_REPOSITORY are required')
  const gh = async (token, path, method = 'GET', body) => {
    const res = await fetch(`https://api.github.com/${path}`, {
      method,
      headers: { authorization: `Bearer ${token}`, accept: 'application/vnd.github+json', 'x-github-api-version': '2022-11-28' },
      body: body && JSON.stringify(body),
    })
    if (!res.ok) throw new Error(`${method} ${path}: ${res.status}`)
    return res.json()
  }
  const open = await gh(repoToken, `repos/${self}/issues?state=open&labels=${LABEL}&per_page=100`)
  for (const p of readProjects()) {
    try {
      const repo = await gh(orgToken, `repos/${p.repo}`)
      const commit = await gh(orgToken, `repos/${p.repo}/commits/${repo.default_branch}`)
      const res = await fetch(`${p.url}/api/config`, { signal: AbortSignal.timeout(10000) }).catch(() => null)
      const facts = { live: res?.ok ? liveCommit(await res.text()) : null, head: commit.sha, headAt: commit.commit.committer.date }
      const state = verdict(facts)
      const issue = open.find((i) => i.title === issueTitle(p.name))
      console.log(`[deploy-watch] ${p.name}: ${state} (live ${facts.live?.slice(0, 7) || '-'}, main ${facts.head.slice(0, 7)})`)
      const action = issueAction(state, issue)
      if (action === 'open') await gh(repoToken, `repos/${self}/issues`, 'POST', { title: issueTitle(p.name), body: issueBody(p, facts), labels: [LABEL] })
      if (action === 'close') {
        await gh(repoToken, `repos/${self}/issues/${issue.number}/comments`, 'POST', { body: `Live serves main HEAD \`${facts.head}\` again.` })
        await gh(repoToken, `repos/${self}/issues/${issue.number}`, 'PATCH', { state: 'closed', state_reason: 'completed' })
      }
    } catch (err) {
      console.log(`[deploy-watch] ${p.name}: error ${err.message}`)
    }
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) main().catch((err) => { console.error(err.message); process.exit(1) })
