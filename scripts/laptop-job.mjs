#!/usr/bin/env node
// Runs one long laptop job (render, bake, batch) under a watchdog. Home of the rule: docs/pc-claude-user.md (Long laptop jobs).
// Runs the command directly (no shell): wrap a .cmd or .bat as `cmd /c x.bat`.
// node scripts/laptop-job.mjs [--name n] [--timeout-min 60] [--idle-min 15] [--gpu-max-used-mb 1500] [--no-gpu] -- <command> [args]
// Blender limits (yskills 2026-10-26): at most 1 job runs at once (global lock) and at most 2 Blender instances exist (ours plus his own); extra jobs wait (--queue-min, default 180), yskills' own Blender is counted but never blocked.
// Always ends with ONE line on stdout: `JOB OK|FAIL|HANG|TIMEOUT|BLOCKED|STOPPED <name>: <why>`; exit 0 only for OK.
import { spawn, spawnSync } from 'node:child_process'
import { appendFileSync, existsSync, readFileSync, statSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { freemem } from 'node:os'
import { MAX_BLENDER, MAX_RENDERS, acquireSlot, blenderCount, ledgerList, ledgerSignIn, ledgerSignOut, releaseSlot, slotsHeld } from './laptop-slots.mjs'

const KILL_GRACE_MS = 5000
let heldSlot = null
let ledgerName = null
let runningChild = null
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const KEEP_AWAKE_PS = `Add-Type -MemberDefinition '[DllImport("kernel32.dll")] public static extern uint SetThreadExecutionState(uint f);' -Name P -Namespace W; while ($true) { [W.P]::SetThreadExecutionState(0x80000001) | Out-Null; Start-Sleep 30 }`

export function parseArgs(argv) {
  const cut = argv.indexOf('--')
  const flags = cut < 0 ? argv : argv.slice(0, cut)
  const cmd = cut < 0 ? [] : argv.slice(cut + 1)
  const opt = { name: 'job', timeoutMin: 60, idleMin: 15, gpuMaxUsedMb: 1500, gpu: true, queueMin: 180, heartbeatMin: 10, progressFile: null, noProgress: null }
  for (let i = 0; i < flags.length; i++) {
    const f = flags[i]
    if (f === '--no-gpu') opt.gpu = false
    else if (f === '--name') opt.name = flags[++i]
    else if (f === '--timeout-min') opt.timeoutMin = Number(flags[++i])
    else if (f === '--idle-min') opt.idleMin = Number(flags[++i])
    else if (f === '--queue-min') opt.queueMin = Number(flags[++i])
    else if (f === '--gpu-max-used-mb') opt.gpuMaxUsedMb = Number(flags[++i])
    else if (f === '--progress-file') opt.progressFile = flags[++i]
    else if (f === '--heartbeat-min') opt.heartbeatMin = Number(flags[++i])
    else if (f === '--no-progress') opt.noProgress = flags[++i]
  }
  return { opt, cmd }
}

// AC sleep and hibernate timeouts in minutes (0 = never), null when it cannot be read.
export function parseAcMinutes(powercfgOutput) {
  const m = powercfgOutput.match(/Current AC Power Setting Index:\s*0x([0-9a-f]+)/i)
  return m ? parseInt(m[1], 16) / 60 : null
}

export function powerProblems(read = (alias) => spawnSync('powercfg', ['/query', 'SCHEME_CURRENT', 'SUB_SLEEP', alias], { encoding: 'utf8' }).stdout ?? '') {
  return [['STANDBYIDLE', 'sleep'], ['HIBERNATEIDLE', 'hibernate']].flatMap(([alias, label]) => {
    const min = parseAcMinutes(read(alias))
    if (min === null) return [`cannot read the ${label} setting`]
    return min === 0 ? [] : [`laptop sleeps (${label}) after ${min} min on AC`]
  })
}

export function gpuProblem(maxUsedMb, run = (cmd, args) => spawnSync(cmd, args, { encoding: 'utf8' })) {
  const smi = run('nvidia-smi', ['--query-gpu=memory.used,memory.total', '--format=csv,noheader,nounits'])
  if (smi.error || smi.status !== 0) return null
  const [used, total] = smi.stdout.trim().split('\n')[0].split(',').map(Number)
  if (used <= maxUsedMb) return null
  const blender = /blender\.exe/i.test(run('tasklist', ['/FI', 'IMAGENAME eq blender.exe']).stdout ?? '')
  return `GPU busy: ${used} of ${total} MB in use${blender ? ' (Blender is open)' : ''}`
}

// Heartbeat (companyxy report 2026-11-12, point 6): a Blender job names a progress file it rewrites after every frame
// (or batch step); the watchdog kills the job when that file's mtime is older than --heartbeat-min (default 10), so a
// crashed render is found in 10 minutes, not after hours. The job resumes by skipping frames already on disk (Overwrite off).
// --no-progress "<reason>" lifts the need for a one-frame still or a bake that has no steps.
export function progressProblem(cmd, opt) {
  if (!/blender/i.test(cmd.join(' ')) || opt.progressFile || opt.noProgress) return null
  return 'a Blender job needs --progress-file <file> (rewritten after every frame; the watchdog checks it every 10 min) or --no-progress "<reason>"'
}

export function heartbeatProblem({ now, started, mtimeMs, heartbeatMin, firstFrameMin = 30 }) {
  const limit = heartbeatMin * 60000
  if (mtimeMs === null || mtimeMs < started) return now - started > firstFrameMin * 60000 ? `progress file never wrote in ${firstFrameMin} min` : null   // the first frame may compile shaders and build the BVH
  return now - mtimeMs > limit ? `no progress for ${Math.round((now - mtimeMs) / 60000)} min (progress file not rewritten)` : null
}

const statusLine = (state, name, why) => `JOB ${state} ${name}: ${why}`

function finish(line, code) {
  releaseSlot(heldSlot)
  if (ledgerName) ledgerSignOut(ledgerName, process.pid)
  console.log(line)
  const log = process.env.LAPTOP_JOB_LOG ?? 'laptop-job.log'
  try { appendFileSync(log, `${new Date().toISOString()} ${line}\n`) } catch (e) { console.error(`WARN could not write ${log}: ${e.message}`) }
  process.exit(code)
}

// True while less than minGb of RAM is free: the animator's open Blenders count, a crash on 2026-10-26 came from RAM, not slots.
export const ramShort = (minGb, free = freemem) => free() / 2 ** 30 < minGb

// Top RAM users from `tasklist /FO CSV /NH`, so a "RAM low" wait says who holds the memory.
export function topRam(run = (c, a) => spawnSync(c, a, { encoding: 'utf8' }), n = 5) {
  const r = run('tasklist', ['/FO', 'CSV', '/NH'])
  if (r.error || r.status !== 0) return 'tasklist failed'
  const rows = (r.stdout ?? '').split(/\r?\n/).map((l) => l.match(/^"([^"]+)","(\d+)",.*"([\d.,\s]+) K"$/)).filter(Boolean)
    .map(([, name, pid, k]) => ({ name, pid, mb: Math.round(Number(k.replace(/\D/g, '')) / 1024) }))
  return rows.sort((a, b) => b.mb - a.mb).slice(0, n).map((x) => `${x.name} ${x.pid} ${x.mb} MB`).join(', ')
}

// Stop switch (yskills 2026-11-08): while the STOP file exists no job starts; "now" in it also kills the running job.
// File: LAPTOP_STOP_FILE, default STOP in the working directory (the queue folder for render-queue.mjs).
export function stopState(file = process.env.LAPTOP_STOP_FILE ?? 'STOP') {
  if (!existsSync(file)) return null
  try { return /now/i.test(readFileSync(file, 'utf8')) ? 'now' : 'pause' } catch { return 'pause' }
}

// Blender and Ren'Py are the two RAM-heavy starts; both sign in to the RAM ledger (scripts/laptop-slots.mjs).
export const heavyApp = (cmd) => (/blender/i.test(cmd.join(' ')) ? 'blender' : /(^|[\\/ ])renpy(\.exe|\.sh|\.py)?(\s|$)/i.test(cmd.join(' ')) ? 'renpy' : null)
const isHeavy = (cmd) => heavyApp(cmd) !== null
const ledgerText = () => ledgerList().map((r) => `${r.who} (${r.app}, pid ${r.pid})`).join(', ') || 'empty'

// Waits for a render slot (and a free Blender instance when the command is Blender); null when queueMin ran out.
async function waitForSlot(opt, cmd) {
  const isBlender = /blender/i.test(cmd.join(' '))
  const heavy = isHeavy(cmd)
  const pollMs = Number(process.env.LAPTOP_JOB_POLL_MS ?? 5000)
  const maxBlender = Number(process.env.LAPTOP_MAX_BLENDER ?? MAX_BLENDER)
  let deadline = Date.now() + opt.queueMin * 60000
  let told = false
  let nextRamNote = 0
  let toldStop = false
  for (;;) {
    if (stopState()) {
      if (!toldStop) { console.log(`STOPPED ${opt.name}: STOP file present, waiting until it is removed`); toldStop = true }
      deadline = Date.now() + opt.queueMin * 60000
      await sleep(pollMs)
      continue
    }
    const count = isBlender ? blenderCount() : null
    const ramLow = heavy && ramShort(Number(process.env.LAPTOP_MIN_FREE_GB ?? 2.5))
    if (!(count !== null && count >= maxBlender) && !ramLow) {
      const slot = acquireSlot({ max: Number(process.env.LAPTOP_MAX_RENDERS ?? MAX_RENDERS) })
      if (slot) return slot
    }
    if (Date.now() > deadline) return null
    if (!told) { console.log(`QUEUED ${opt.name}: waiting for a free render slot (max ${MAX_RENDERS} renders, ${maxBlender} Blender instances, ${ramLow ? 'RAM low' : 'RAM ok'})`); told = true }
    if (ramLow && Date.now() >= nextRamNote) { console.log(`RAM low ${opt.name}: ${(freemem() / 2 ** 30).toFixed(1)} GB free; top: ${topRam()}; ledger: ${ledgerText()}`); nextRamNote = Date.now() + 10 * 60000 }
    await sleep(pollMs)
  }
}

async function main() {
  const { opt, cmd } = parseArgs(process.argv.slice(2))
  if (!cmd.length) finish(statusLine('FAIL', opt.name, 'no command after --'), 2)
  const noProgress = progressProblem(cmd, opt)
  if (noProgress) finish(statusLine('FAIL', opt.name, noProgress), 2)
  const win = process.platform === 'win32'
  if (win) {
    const power = powerProblems()
    if (power.length) console.log(`WARN ${opt.name}: ${power.join('; ')}; run once as admin: powercfg /change standby-timeout-ac 0 and powercfg /change hibernate-timeout-ac 0`)
  }
  heldSlot = await waitForSlot(opt, cmd)
  if (!heldSlot) finish(statusLine('BLOCKED', opt.name, `no render slot free for ${opt.queueMin} min`), 3)
  // The first running job's own GPU memory must not block the second (2 renders are allowed).
  if (opt.gpu && slotsHeld() <= 1) {
    const busy = gpuProblem(opt.gpuMaxUsedMb)
    if (busy) finish(statusLine('BLOCKED', opt.name, `${busy}; close the app or pass --gpu-max-used-mb`), 3)
  }
  const app = heavyApp(cmd)
  if (app) { ledgerName = opt.name; ledgerSignIn({ who: opt.name, app, pid: process.pid }) }
  const awake = win ? spawn('powershell', ['-NoProfile', '-Command', KEEP_AWAKE_PS], { stdio: 'ignore' }) : null
  const child = spawn(cmd[0], cmd.slice(1), { stdio: ['ignore', 'pipe', 'pipe'], detached: !win })
  runningChild = child
  const started = Date.now()
  let lastOutput = started
  const touch = (chunk) => { lastOutput = Date.now(); process.stdout.write(chunk) }
  child.stdout.on('data', touch)
  child.stderr.on('data', touch)
  let verdict = null
  const kill = (state, why) => {
    if (verdict) return
    verdict = [state, why]
    if (win) spawnSync('taskkill', ['/PID', String(child.pid), '/T', '/F'])
    else { try { process.kill(-child.pid, 'SIGKILL') } catch { child.kill('SIGKILL') } }
    setTimeout(() => done(null), KILL_GRACE_MS).unref()
  }
  const watch = setInterval(() => {
    const now = Date.now()
    if (stopState() === 'now') kill('STOPPED', 'STOP file says now')
    else if (now - started > opt.timeoutMin * 60000) kill('TIMEOUT', `over ${opt.timeoutMin} min`)
    else if (now - lastOutput > opt.idleMin * 60000) kill('HANG', `no output for ${opt.idleMin} min`)
    else if (opt.progressFile) {
      let mtimeMs = null
      try { mtimeMs = statSync(opt.progressFile).mtimeMs } catch { /* not written yet */ }
      const stale = heartbeatProblem({ now, started, mtimeMs, heartbeatMin: opt.heartbeatMin, firstFrameMin: Math.max(30, opt.heartbeatMin) })
      if (stale) kill('HANG', stale)
    }
  }, 10000)
  let finished = false
  const done = (code, why) => {
    if (finished) return
    finished = true
    clearInterval(watch)
    awake?.kill()
    const [state, reason] = verdict ?? (code === 0 ? ['OK', `finished in ${Math.round((Date.now() - started) / 60000)} min`] : ['FAIL', why ?? (code === null ? 'ended by a signal' : `exit code ${code}`)])
    finish(statusLine(state, opt.name, reason), state === 'OK' ? 0 : 1)
  }
  child.on('error', (e) => done(1, `could not start: ${e.message}`))
  child.on('close', (code) => done(code))
  child.on('exit', (code) => { if (verdict) done(code) })
}

// A stopped watchdog takes its job down too, so no render keeps running without a slot.
function killChild() {
  if (!runningChild?.pid) return
  if (process.platform === 'win32') spawnSync('taskkill', ['/PID', String(runningChild.pid), '/T', '/F'])
  else { try { process.kill(-runningChild.pid, 'SIGKILL') } catch { runningChild.kill('SIGKILL') } }
}
for (const sig of ['SIGINT', 'SIGTERM', 'SIGHUP']) process.on(sig, () => { killChild(); releaseSlot(heldSlot); if (ledgerName) ledgerSignOut(ledgerName, process.pid); process.exit(130) })
if (process.argv[1] === fileURLToPath(import.meta.url)) main().catch((e) => { killChild(); finish(statusLine('FAIL', 'job', `watchdog error: ${e.message}`), 1) })
