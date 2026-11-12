// PR brake (plan 2026-11-12, M41): a new PR waits while more than LIMIT drafts older than 24 h are open in this repo.
// The cause: 32 open PRs piled up in claude-setup and nobody could tell finished from stale. Old drafts land, get
// parked (/mnt/project-files/claude-setup/parked-prs.md) or close first. pre-pr runs it with --body (the PR-open check).
// The list comes from `gh api` (REST); when it cannot be read the brake only warns, it never blocks on a network gap.
import { execFileSync } from 'node:child_process'

export const LIMIT = 10
const DAY = 24 * 3600e3

export const staleDrafts = (prs, now = Date.now()) =>
  prs.filter((p) => p.draft && now - Date.parse(p.created_at) > DAY)

// prs: the open PRs from the REST API, or null when they could not be read. Returns { ok: true|false|null, message }.
export function brakeVerdict(prs, now = Date.now()) {
  if (!Array.isArray(prs)) return { ok: null, message: 'PR brake not checked (open PRs could not be read)' }
  const old = staleDrafts(prs, now)
  if (old.length <= LIMIT) return { ok: true, message: `PR brake: ${old.length} drafts older than 24 h (limit ${LIMIT})` }
  return {
    ok: false,
    message: `PR brake: ${old.length} drafts older than 24 h are open (limit ${LIMIT}): ${old.map((p) => `#${p.number}`).join(' ')}. Land, park (claude-setup/parked-prs.md) or close old drafts before a new PR.`,
  }
}

// owner/repo from the origin remote, then the open PRs via gh. Any failure returns null (warn, never block).
export function openPrs({ cwd, env } = {}) {
  try {
    const url = execFileSync('git', ['remote', 'get-url', 'origin'], { cwd, env, encoding: 'utf8' }).trim()
    const slug = url.match(/github\.com[/:]([^/]+\/[^/.]+?)(\.git)?$/)?.[1] ?? url.match(/\/git\/([^/]+\/[^/.]+?)(\.git)?$/)?.[1]
    if (!slug) return null
    return JSON.parse(execFileSync('gh', ['api', `repos/${slug}/pulls?state=open&per_page=100`], { cwd, env, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], timeout: 20000 }))
  } catch { return null }
}
