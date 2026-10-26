#!/usr/bin/env node
// journey verify: the gate's mechanical check of a project PR's `journey` status. The status itself is
// posted by the project's own `.github/workflows/journey.yml` (template: publish skill, scripts/journey-gate.mjs)
// with the built-in GITHUB_TOKEN; a PR branch can post a `journey` status with that same token, so
// a green tick proves nothing until this checks who made it. Stdin: {"statuses": the head's
// `commits/<sha>/statuses` (API list or combined object), "sha": that head sha, "run": the workflow run its newest
// `journey` status links to (`actions_get get_workflow_run`)}. Exit 0 = PASS.
import { fileURLToPath } from 'node:url'

export const JOURNEY_BOT = 'github-actions[bot]'
export const JOURNEY_WORKFLOW = '.github/workflows/journey.yml'
export const RUN_LINK = /^https:\/\/github\.com\/(yverse-studio\/[\w.-]+)\/actions\/runs\/(\d+)$/

// The NEWEST `journey` status must be a success, created by github-actions[bot] (when the API output names the creator; the GitHub MCP `get_status` does not, and the run checks below carry the proof) and linked to a run
// of this repo's journey workflow that came from `pull_request_target`. That event runs the file from
// the default branch, so a PR cannot change it; a forged status from a PR workflow links to a run of
// another path, event or repo. A PR workflow can also link a real run of another PR, so the run's title
// (`run-name`, set by the same file) must carry this head sha, and the run must have finished green. GitHub takes the workflow file of a `pull_request_target` run from the repo's default branch (since 2025-12-08; probe anime-filter#7 got no run from a file on another base), and the run's `head_sha` is the PR head, so the run must be for exactly this head.
export const runTitle = (sha) => `journey ${sha}`

export function verifyJourney(statuses, run, sha = '') {
  const list = Array.isArray(statuses) ? statuses : statuses?.statuses || []
  const newest = list.filter((s) => s.context === 'journey').sort((a, b) => Date.parse(b.created_at || 0) - Date.parse(a.created_at || 0) || (b.id || 0) - (a.id || 0))[0]
  if (!newest) return { ok: false, reason: 'no journey status on the head: the PR has no journey run (is .github/workflows/journey.yml on the default branch?)' }
  if (newest.creator && newest.creator.login !== JOURNEY_BOT) return { ok: false, reason: `the newest journey status was posted by ${newest.creator.login}, not ${JOURNEY_BOT}` }
  const link = RUN_LINK.exec(newest.target_url || '')
  if (!link) return { ok: false, reason: 'the newest journey status does not link to a workflow run of an yverse-studio repo' }
  if (!run || String(run.id) !== link[2]) return { ok: false, reason: `pass the linked run (id ${link[2]}) as "run"` }
  if (run.html_url !== newest.target_url) return { ok: false, reason: `the linked run is ${run.html_url ?? 'unknown'}, not the status link ${newest.target_url}: wrong repo or run` }
  if (run.path !== JOURNEY_WORKFLOW || run.event !== 'pull_request_target') return { ok: false, reason: `the linked run is ${run.path} on ${run.event}, not ${JOURNEY_WORKFLOW} on pull_request_target: forged or not run` }
  if (!/^[0-9a-f]{40}$/.test(sha) || run.display_title !== runTitle(sha)) return { ok: false, reason: `the linked run is for "${run.display_title}", not ${runTitle(sha || '<head sha>')}: a status can link to another PR's real run` }
  if (run.head_sha !== sha) return { ok: false, reason: `the linked run is for commit ${run.head_sha ?? 'unknown'}, not the head ${sha || '<head sha>'}` }
  if (run.status !== 'completed' || run.conclusion !== 'success') return { ok: false, reason: `the linked run is ${run.status}/${run.conclusion ?? 'no conclusion'}: wait for it to finish green` }
  if (newest.state !== 'success') return { ok: false, reason: `the newest journey status is ${newest.state}: ${newest.description || ''}`.trim() }
  return { ok: true, reason: newest.description }
}

async function verify() {
  const chunks = []
  for await (const c of process.stdin) chunks.push(c)
  const input = JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}')
  const { ok, reason } = verifyJourney(input.statuses ?? [], input.run, input.sha)
  console.log(`[journey] verify: ${ok ? 'PASS' : 'FAIL'} (${reason})`)
  process.exit(ok ? 0 : 1)
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  verify().catch((err) => { console.error(err.message); process.exit(1) })
}
