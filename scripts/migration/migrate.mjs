// node scripts/migration/migrate.mjs --inventory inventory.json --to <new-owner> [--only a,b] [--run]
// Copies the best source of every repo into <new-owner>/<name> (private) with all branches and tags.
// Dry run unless --run. Needs `gh auth login` as the NEW account on this machine (yskills does that by hand).
import { readFileSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { execFileSync } from 'node:child_process'

const a = process.argv.slice(2)
const opt = (k) => { const i = a.indexOf(k); return i >= 0 ? a[i + 1] : null }
const inv = JSON.parse(readFileSync(opt('--inventory') || 'inventory.json', 'utf8'))
const to = opt('--to'), only = opt('--only')?.split(','), run = a.includes('--run')
if (!to) { console.error('--to <new-owner> is required'); process.exit(2) }

const sh = (cmd, args, cwd) => {
  console.log(`${run ? '$' : '(dry)'} ${cmd} ${args.join(' ')}`)
  if (run) execFileSync(cmd, args, { cwd, stdio: 'inherit' })
}
const exists = (slug) => { try { execFileSync('gh', ['repo', 'view', slug, '--json', 'name'], { stdio: 'ignore' }); return true } catch { return false } }
const tmp = mkdtempSync(join(tmpdir(), 'mig-'))
const failed = []

for (const r of inv.repos) {
  if (only && !only.includes(r.name)) continue
  const s = r.best
  if (!s) { console.log(`SKIP ${r.name}: no usable source`); failed.push(r.name); continue }
  if (s.kind === 'clone' && (s.unpushed || s.dirty)) console.log(`NOTE ${r.name}: clone has ${s.unpushed} unpushed commits, ${s.dirty} dirty files (dirty files are NOT copied; commit them first)`)
  const slug = `${to}/${r.name}`
  try {
    let src = s.path
    if (s.kind === 'bundle') { src = join(tmp, r.name + '.git'); sh('git', ['clone', '--bare', s.path, src]) }
    if (run ? !exists(slug) : true) sh('gh', ['repo', 'create', slug, '--private'])
    const url = `https://github.com/${slug}.git`
    sh('git', ['push', url, '--all'], src)
    sh('git', ['push', url, '--tags'], src)
  } catch (e) { console.log(`FAIL ${r.name}: ${e.message}`); failed.push(r.name) }
}
rmSync(tmp, { recursive: true, force: true })
console.log(failed.length ? `\nFailed: ${failed.join(', ')}` : `\n${run ? 'Done.' : 'Dry run only. Add --run.'}`)
process.exit(failed.length ? 1 : 0)
