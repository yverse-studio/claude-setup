// Counting lock for laptop Blender jobs. Home of the rule: docs/pc-claude-user.md (Blender limits).
// One lock file per running render in a shared dir; a file whose pid is dead is stale and reused.
import { spawnSync } from 'node:child_process'
import { mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

export const MAX_RENDERS = 2
export const MAX_BLENDER = 3
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
