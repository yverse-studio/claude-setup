// Counting lock for laptop Blender jobs. Home of the rule: docs/pc-claude-user.md (Blender limits).
// One lock file per running render in a shared dir; a file whose pid is dead is stale and reused.
import { spawnSync } from 'node:child_process'
import { mkdirSync, readFileSync, readdirSync, renameSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

export const MAX_RENDERS = 1 // one Blender job at a time (companyxy report 2026-11-12: several parallel jobs on about 3.6 GB free RAM)
export const MAX_BLENDER = 2 // our one job plus yskills' own Blender
export const slotDir = () => process.env.LAPTOP_JOB_LOCK_DIR ?? join(tmpdir(), 'claude-laptop-render-slots')

export const pidAlive = (pid) => {
  try { process.kill(pid, 0); return true } catch (e) { return e.code === 'EPERM' }
}

const readHolder = (file) => { try { return Number(readFileSync(file, 'utf8')) } catch { return NaN } }

// Takes a free render slot, or returns null when `max` are held by live jobs.
// An unreadable or half-written lock counts as held; only a lock with a dead pid is taken over.
export function acquireSlot({ dir = slotDir(), max = MAX_RENDERS, pid = process.pid, alive = pidAlive } = {}) {
  mkdirSync(dir, { recursive: true })
  for (let n = 1; n <= max; n++) {
    const file = join(dir, `render-${n}.lock`)
    try { writeFileSync(file, String(pid), { flag: 'wx' }); return file } catch (e) { if (e.code !== 'EEXIST') throw e }
    const holder = readHolder(file)
    if (!Number.isInteger(holder) || holder <= 0 || alive(holder)) continue
    // Only one waiter's rename of the stale file succeeds; the loser sees ENOENT and moves on.
    const taken = `${file}.${pid}.stale`
    try { renameSync(file, taken) } catch { continue }
    const moved = readHolder(taken)
    rmSync(taken, { force: true })
    if (moved !== holder) { try { writeFileSync(file, String(moved), { flag: 'wx' }) } catch { /* restored by its owner */ } continue }
    try { writeFileSync(file, String(pid), { flag: 'wx' }); return file } catch (e) { if (e.code !== 'EEXIST') throw e }
  }
  return null
}

export const releaseSlot = (file) => { if (file) rmSync(file, { force: true }) }

export function slotsHeld({ dir = slotDir(), max = MAX_RENDERS, alive = pidAlive } = {}) {
  let held = 0
  for (let n = 1; n <= max; n++) {
    if (alive(readHolder(join(dir, `render-${n}.lock`)))) held++
  }
  return held
}

// Every blender.exe on the machine, manual ones included; null when it cannot be read.
export function blenderCount(run = (cmd, args) => spawnSync(cmd, args, { encoding: 'utf8' })) {
  const r = run('tasklist', ['/FI', 'IMAGENAME eq blender.exe', '/NH'])
  if (r.error || r.status !== 0) return null
  return (r.stdout.match(/blender\.exe/gi) ?? []).length
}

// RAM ledger (yskills 2026-11-12): whoever starts Blender or Ren'Py signs in and signs out again, so "who holds the RAM"
// is a list, not a guess. One file per entry; an entry whose pid is dead is stale and dropped when the list is read.
const ledgerDir = (dir) => join(dir, 'ledger')
const ledgerFile = (who, dir) => join(ledgerDir(dir), `${who.replace(/[^\w.-]/g, '_')}.json`)

export function ledgerSignIn({ who, app, pid = process.pid, dir = slotDir(), now = Date.now() }) {
  mkdirSync(ledgerDir(dir), { recursive: true })
  writeFileSync(ledgerFile(who, dir), JSON.stringify({ who, app, pid, at: now }))
}

export const ledgerSignOut = (who, dir = slotDir()) => rmSync(ledgerFile(who, dir), { force: true })

export function ledgerList({ dir = slotDir(), alive = pidAlive } = {}) {
  let names = []
  try { names = readdirSync(ledgerDir(dir)) } catch { return [] }
  const rows = []
  for (const name of names) {
    const file = join(ledgerDir(dir), name)
    let row = null
    try { row = JSON.parse(readFileSync(file, 'utf8')) } catch { /* half-written: dropped below */ }
    if (row && alive(row.pid)) rows.push(row)
    else rmSync(file, { force: true })
  }
  return rows
}

// By hand (a Ren'Py playtest or Blender started outside laptop-job): the pid is the app's own, so the entry lives as long as it does.
//   node scripts/laptop-slots.mjs ledger in <who> <blender|renpy> <pid> | out <who> | list
export function ledgerCli(args, dir = slotDir()) {
  const [verb, who, app, pid] = args
  if (verb === 'in' && who && ['blender', 'renpy'].includes(app) && Number(pid) > 0) { ledgerSignIn({ who, app, pid: Number(pid), dir }); return `signed in ${who}` }
  if (verb === 'out' && who) { ledgerSignOut(who, dir); return `signed out ${who}` }
  if (verb === 'list') return ledgerList({ dir }).map((r) => `${r.who} (${r.app}, pid ${r.pid})`).join('\n') || 'empty'
  throw new Error('usage: ledger in <who> <blender|renpy> <pid> | ledger out <who> | ledger list')
}

if (process.argv[1] === fileURLToPath(import.meta.url) && process.argv[2] === 'ledger') {
  try { console.log(ledgerCli(process.argv.slice(3))) } catch (e) { console.error(e.message); process.exit(2) }
}
