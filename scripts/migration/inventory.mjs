// node scripts/migration/inventory.mjs <root>... [--out inventory.json]
// Finds every git clone and *.bundle under the roots, verifies each bundle (git bundle verify),
// and picks per repo the source with the newest commit. Read-only; touches nothing but a temp dir.
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { scan, describe, nameOf, git, tryGit } from './lib.mjs'

const argv = process.argv.slice(2)
const oi = argv.indexOf('--out')
const out = oi >= 0 ? argv.splice(oi, 2)[1] : 'inventory.json'
if (!argv.length) { console.error('usage: inventory.mjs <root>... [--out file]'); process.exit(2) }

const { repos, bundles } = scan(argv)
const tmp = mkdtempSync(join(tmpdir(), 'inv-'))
git(tmp, 'init', '--quiet') // bundle verify needs a repo to run in
const sources = []

for (const dir of repos) {
  const d = describe(dir)
  sources.push({ kind: 'clone', path: dir, name: nameOf(dir, d.origin), ...d })
}
for (const file of bundles) {
  const s = { kind: 'bundle', path: file, name: nameOf(file), verified: false }
  try { git(tmp, 'bundle', 'verify', file); s.verified = true } catch (e) { s.error = String(e.stderr || e.message).split('\n')[0] }
  if (s.verified) {
    const bare = join(tmp, String(sources.length))
    if (tryGit(tmp, 'clone', '--bare', '--quiet', file, bare) !== null) Object.assign(s, describe(bare))
  }
  sources.push(s)
}
rmSync(tmp, { recursive: true, force: true })

const groups = {}
for (const s of sources) (groups[s.name] ||= []).push(s)
const repoList = Object.entries(groups).map(([name, list]) => {
  const ok = list.filter((s) => s.kind === 'clone' || s.verified)
  // newest tip wins; a clone beats a bundle on a tie (a clone also holds uncommitted state)
  ok.sort((a, b) => (b.newest || '').localeCompare(a.newest || '') || (a.kind === 'clone' ? -1 : 1))
  return { name, best: ok[0] || null, sources: list }
}).sort((a, b) => a.name.localeCompare(b.name))

writeFileSync(out, JSON.stringify({ made: new Date().toISOString(), repos: repoList }, null, 2))
for (const r of repoList) {
  const b = r.best
  console.log(`${r.name.padEnd(24)} ${b ? `${b.kind} ${b.newest?.slice(0, 16) ?? '?'} unpushed=${b.unpushed ?? '-'} dirty=${b.dirty ?? '-'}  ${b.path}` : 'NO USABLE SOURCE'}`)
  for (const s of r.sources) if (s !== b) console.log(`  ${s.kind.padEnd(6)} ${s.newest?.slice(0, 16) ?? '?'} ${s.kind === 'bundle' ? (s.verified ? 'verified' : 'BROKEN ' + s.error) : ''} ${s.path}`)
}
const broken = sources.filter((s) => s.kind === 'bundle' && !s.verified).length
console.log(`\n${repoList.length} repos, ${bundles.length} bundles (${broken} broken), ${repos.length} clones -> ${out}`)
