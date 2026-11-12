// Overlap warning (cleanup/PLAN.md step 3; #443 and #444 both edited the same files and nobody saw it until the gate).
// pre-pr runs this: it lists the branches (local and origin) not yet merged into the base that touch a file this change touches.
// It only warns, since two PRs may touch one file on purpose; the point is that the second author knows before the gate does.
// Local branches only. Open PRs without a branch in this checkout need the GitHub API, which is not wired yet.
import { execFileSync } from 'node:child_process'

// mine: [path]; others: [{ name, files }]. Returns [{ name, files: shared paths }] for every other change that shares one.
export function overlaps(mine, others) {
  return others.map(({ name, files }) => ({ name, files: mine.filter((f) => files.includes(f)) })).filter((o) => o.files.length)
}

// Files nearly every PR touches (the MAP table, the CI test list): sharing only these is weak news, so those branches rank last
// and the list is cut at MAX_LINES; a real overlap (the same script or doc) stays on top.
const HOT = new Set(['docs/MAP.md', '.github/workflows/ci.yml'])
const MAX_LINES = 8
export function rank(list) {
  const real = (o) => o.files.filter((f) => !HOT.has(f)).length
  return [...list].sort((a, b) => real(b) - real(a) || b.files.length - a.files.length || a.name.localeCompare(b.name))
}

const git = (cwd, ...args) => execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim().split('\n').filter(Boolean)

// A shallow clone may lack the merge base; that branch then counts as touching nothing instead of failing the check.
const filesSince = (cwd, base, name) => { try { return git(cwd, 'diff', '--name-only', `${base}...${name}`) } catch { return [] } }

const RECENT_DAYS = 5 // an open PR is a recent branch; older ones are abandoned or merged and only add noise
const SQUASH_LOOKBACK = 400 // base commits whose message is searched for a branch's tip subject

// Every recent branch not merged into `base` (except base and `head`) with the files it changed since it left base.
// Not merged is judged twice: `--no-merged` covers fast-forward and merge commits; a squash merge (this repo's way) leaves its
// branch behind and unmerged by that test, so a branch whose tip subject stands in a recent base commit message is merged too.
export function otherBranches({ cwd, base, head, days = RECENT_DAYS }) {
  const bare = base.replace(/^origin\//, '')
  const self = new Set(git(cwd, 'for-each-ref', '--points-at', head, '--format=%(refname:short)'))
  const skip = new Set([base, head, `origin/${head}`, 'origin/HEAD', bare, `origin/${bare}`, ...self])
  const since = Date.now() / 1000 - days * 86400
  const baseMessages = git(cwd, 'log', base, '-n', String(SQUASH_LOOKBACK), '--format=%B').join('\n')
  const rows = git(cwd, 'for-each-ref', '--no-merged', base, '--format=%(refname:short)\t%(committerdate:unix)\t%(subject)', 'refs/heads', 'refs/remotes/origin')
    .map((r) => { const [name, when, ...subject] = r.split('\t'); return { name, when: Number(when), subject: subject.join('\t') } })
    .filter((r) => !skip.has(r.name) && r.when >= since && !(r.subject && baseMessages.includes(r.subject)))
  const local = new Set(rows.filter((r) => !r.name.startsWith('origin/')).map((r) => r.name)) // a local branch wins over its origin twin
  return rows.filter((r) => !(r.name.startsWith('origin/') && local.has(r.name.slice(7)))).map(({ name }) => ({ name, files: filesSince(cwd, base, name) }))
}

export function overlapWarnings({ cwd, base, head = 'HEAD' }) {
  const mine = git(cwd, 'diff', '--name-only', `${base}...${head}`)
  const lines = rank(overlaps(mine, otherBranches({ cwd, base, head }))).map(({ name, files }) => `${name} also changes ${files.join(', ')}`)
  return lines.length > MAX_LINES ? [...lines.slice(0, MAX_LINES), `... and ${lines.length - MAX_LINES} more branches (mostly ${[...HOT].join(', ')})`] : lines
}
