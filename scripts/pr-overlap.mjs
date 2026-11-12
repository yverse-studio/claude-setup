// Overlap warning (cleanup/PLAN.md step 3; #443 and #444 both edited the same files and nobody saw it until the gate).
// pre-pr runs this: it lists the branches (local and origin) not yet merged into the base that touch a file this change touches.
// It only warns, since two PRs may touch one file on purpose; the point is that the second author knows before the gate does.
// Local branches only. Open PRs without a branch in this checkout need the GitHub API, which is not wired yet.
import { execFileSync } from 'node:child_process'

// mine: [path]; others: [{ name, files }]. Returns [{ name, files: shared paths }] for every other change that shares one.
export function overlaps(mine, others) {
  return others.map(({ name, files }) => ({ name, files: mine.filter((f) => files.includes(f)) })).filter((o) => o.files.length)
}

const git = (cwd, ...args) => execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim().split('\n').filter(Boolean)

// A shallow clone may lack the merge base; that branch then counts as touching nothing instead of failing the check.
const filesSince = (cwd, base, name) => { try { return git(cwd, 'diff', '--name-only', `${base}...${name}`) } catch { return [] } }

// Every branch not merged into `base` (except base and `head`) with the files it changed since it left base.
export function otherBranches({ cwd, base, head }) {
  const skip = new Set([base, head, `origin/${head}`, 'origin/HEAD', base.replace(/^origin\//, ''), `origin/${base.replace(/^origin\//, '')}`])
  const names = git(cwd, 'for-each-ref', '--no-merged', base, '--format=%(refname:short)', 'refs/heads', 'refs/remotes/origin').filter((n) => !skip.has(n))
  const local = new Set(names.filter((n) => !n.startsWith('origin/')))
  return names.filter((n) => !(n.startsWith('origin/') && local.has(n.slice(7)))).map((name) => ({ name, files: filesSince(cwd, base, name) }))
}

export function overlapWarnings({ cwd, base, head = 'HEAD' }) {
  const mine = git(cwd, 'diff', '--name-only', `${base}...${head}`)
  const headName = git(cwd, 'rev-parse', '--abbrev-ref', head)[0]
  return overlaps(mine, otherBranches({ cwd, base, head: headName })).map(({ name, files }) => `${name} also changes ${files.join(', ')}`)
}
