// Shared bits of the GitHub owner migration (docs/github-migration.md).
import { execFileSync } from 'node:child_process'
import { readdirSync, existsSync, statSync } from 'node:fs'
import { join, basename } from 'node:path'

export const git = (cwd, ...args) => execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim()
export const tryGit = (cwd, ...args) => { try { return git(cwd, ...args) } catch { return null } }

// Repos (dirs with .git) and *.bundle files under the roots, depth <= 5.
export function scan(roots, depth = 5) {
  const repos = [], bundles = []
  const SKIP = new Set(['node_modules', '.venv', 'venv', '__pycache__', '$RECYCLE.BIN', '_trash'])
  const walk = (dir, d) => {
    let entries
    try { entries = readdirSync(dir, { withFileTypes: true }) } catch { return }
    if (entries.some((e) => e.name === '.git')) repos.push(dir)
    for (const e of entries) {
      const p = join(dir, e.name)
      if (e.isFile() && e.name.endsWith('.bundle')) bundles.push(p)
      else if (e.isDirectory() && d < depth && e.name !== '.git' && !SKIP.has(e.name) && !e.name.startsWith('_trash')) walk(p, d + 1)
    }
  }
  roots.filter(existsSync).forEach((r) => walk(r, 0))
  return { repos, bundles }
}

// What one git dir (work tree or bare) holds: tips, newest commit, unpushed work.
export function describe(dir) {
  const bare = tryGit(dir, 'rev-parse', '--is-bare-repository') === 'true'
  const heads = (tryGit(dir, 'for-each-ref', '--format=%(refname:short) %(objectname) %(committerdate:iso-strict)', 'refs/heads') || '')
    .split('\n').filter(Boolean).map((l) => { const [name, sha, date] = l.split(' '); return { name, sha, date } })
  const newest = heads.map((h) => h.date).sort().at(-1) || null
  const unpushed = bare ? null : Number(tryGit(dir, 'rev-list', '--count', '--branches', '--not', '--remotes') ?? NaN)
  const dirty = bare ? null : (tryGit(dir, 'status', '--porcelain') || '').split('\n').filter(Boolean).length
  const origin = tryGit(dir, 'remote', 'get-url', 'origin')
  return { heads, newest, unpushed, dirty, origin }
}

// Repo name guess: origin URL, else folder or bundle file name without date and extension.
export function nameOf(path, origin) {
  const m = origin && origin.match(/[:/]([^/:]+)\/([^/]+?)(?:\.git)?$/)
  if (m) return m[2].toLowerCase()
  return basename(path).replace(/\.bundle$/, '').replace(/[-_]?20\d\d[-_.]?\d\d[-_.]?\d\d.*$/, '').toLowerCase()
}

export const isFile = (p) => existsSync(p) && statSync(p).isFile()
