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
const NAME = /^[a-z0-9-]+$/
const PART = /^[\w.-]+$/

export const issueTitle = (name) => `${LABEL}: ${name}`

export function readProjects(dir = 'projects') {
  return readdirSync(dir).filter((f) => f.endsWith('.json')).map((f) => JSON.parse(readFileSync(`${dir}/${f}`, 'utf8')))
    .filter((p) => NAME.test(p.name ?? '') && !SKIP_KINDS.has(p.kind) && PART.test(p.org || 'x') && PART.test(p.repo || 'x'))
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

// ok | drift | building (HEAD is newer than the grace period) | unwatched (no commit served) |
// unreachable (no answer at all). An unreadable HEAD date counts as old, so it can't hide drift.
export function verdict({ live, head, headAt, reached = true }, now = Date.now(), grace = GRACE_MINUTES) {
  if (!reached) return 'unreachable'
  if (!live) return 'unwatched'
  if (live === head) return 'ok'
  return !(now - Date.parse(headAt) <= grace * 60000) ? 'drift' : 'building'
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

// One pass over the projects. gh(path, method?, body?) is the GitHub API, `live(url)` answers
// { reached, body }. Open issues are matched by title, not by label (a label can be missing or
// dropped on create, and then every run would open another issue), and only the ones this
// workflow opened: in a public repo anyone can open an issue with that title to mute the alert.
export const BOT = 'github-actions[bot]'
export async function watch({ gh, live, projects, self, now = Date.now(), log = console.log }) {
  const open = (await gh(`repos/${self}/issues?state=open&creator=${encodeURIComponent(BOT)}&per_page=100`))
    .filter((i) => !i.pull_request && i.user?.login === BOT)
  let errors = 0
  for (const p of projects) {
    try {
      const repo = await gh(`repos/${p.repo}`, 'GET', undefined, 'org')
      const commit = await gh(`repos/${p.repo}/commits/${repo.default_branch}`, 'GET', undefined, 'org')
      const answer = await live(`${p.url}/api/config`)
      const facts = { reached: answer.reached, live: liveCommit(answer.body), head: commit.sha, headAt: commit.commit?.committer?.date }
      const state = verdict(facts, now)
      const issue = open.find((i) => i.title === issueTitle(p.name))
      log(`[deploy-watch] ${p.name}: ${state} (live ${facts.live?.slice(0, 7) || '-'}, main ${String(facts.head).slice(0, 7)})`)
      const action = issueAction(state, issue)
      if (action === 'open') {
        const made = await gh(`repos/${self}/issues`, 'POST', { title: issueTitle(p.name), body: issueBody(p, facts), labels: [LABEL] })
        open.push(made)
      }
      if (action === 'close') {
        await gh(`repos/${self}/issues/${issue.number}/comments`, 'POST', { body: `Live serves main HEAD \`${facts.head}\` again.` })
        await gh(`repos/${self}/issues/${issue.number}`, 'PATCH', { state: 'closed', state_reason: 'completed' })
      }
    } catch (err) {
      errors++
      log(`[deploy-watch] ${p.name}: error ${err.message}`)
    }
  }
  if (projects.length && errors === projects.length) throw new Error('every project failed: is PROJECTS_GITHUB_TOKEN still valid?')
}

async function main() {
  const tokens = { org: process.env.PROJECTS_GITHUB_TOKEN, repo: process.env.GITHUB_TOKEN }
  const self = process.env.GITHUB_REPOSITORY
  if (!tokens.org || !tokens.repo || !self) throw new Error('PROJECTS_GITHUB_TOKEN, GITHUB_TOKEN and GITHUB_REPOSITORY are required')
  const gh = async (path, method = 'GET', body, token = 'repo') => {
    const res = await fetch(`https://api.github.com/${path}`, {
      method,
      headers: { authorization: `Bearer ${tokens[token]}`, accept: 'application/vnd.github+json', 'x-github-api-version': '2022-11-28' },
      body: body && JSON.stringify(body),
    })
    if (!res.ok) throw new Error(`${method} ${path}: ${res.status}`)
    return res.json()
  }
  const live = async (url) => {
    const res = await fetch(url, { signal: AbortSignal.timeout(10000) }).catch(() => null)
    return { reached: Boolean(res), body: res?.ok ? await res.text() : '' }
  }
  await watch({ gh, live, projects: readProjects(), self })
}

if (process.argv[1] === fileURLToPath(import.meta.url)) main().catch((err) => { console.error(err.message); process.exit(1) })
