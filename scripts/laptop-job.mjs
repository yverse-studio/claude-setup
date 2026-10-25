#!/usr/bin/env node
// Runs one long laptop job (render, bake, batch) under a watchdog. Home of the rule: docs/pc-claude-user.md (Long laptop jobs).
// node scripts/laptop-job.mjs [--name n] [--timeout-min 60] [--idle-min 15] [--gpu-max-used-mb 1500] [--no-gpu] -- <command> [args]
// Always ends with ONE line on stdout: `JOB OK|FAIL|HANG|TIMEOUT|BLOCKED <name>: <why>`; exit 0 only for OK.
import { spawn, spawnSync } from 'node:child_process'
import { appendFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const KEEP_AWAKE_PS = `Add-Type -MemberDefinition '[DllImport("kernel32.dll")] public static extern uint SetThreadExecutionState(uint f);' -Name P -Namespace W; while ($true) { [W.P]::SetThreadExecutionState(0x80000001) | Out-Null; Start-Sleep 30 }`

export function parseArgs(argv) {
  const cut = argv.indexOf('--')
  const flags = cut < 0 ? argv : argv.slice(0, cut)
  const cmd = cut < 0 ? [] : argv.slice(cut + 1)
  const opt = { name: 'job', timeoutMin: 60, idleMin: 15, gpuMaxUsedMb: 1500, gpu: true }
  for (let i = 0; i < flags.length; i++) {
    const f = flags[i]
    if (f === '--no-gpu') opt.gpu = false
    else if (f === '--name') opt.name = flags[++i]
    else if (f === '--timeout-min') opt.timeoutMin = Number(flags[++i])
    else if (f === '--idle-min') opt.idleMin = Number(flags[++i])
    else if (f === '--gpu-max-used-mb') opt.gpuMaxUsedMb = Number(flags[++i])
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

const statusLine = (state, name, why) => `JOB ${state} ${name}: ${why}`

function finish(line, code) {
  console.log(line)
  try { appendFileSync(process.env.LAPTOP_JOB_LOG ?? 'laptop-job.log', `${new Date().toISOString()} ${line}\n`) } catch {}
  process.exit(code)
}

function main() {
  const { opt, cmd } = parseArgs(process.argv.slice(2))
  if (!cmd.length) finish(statusLine('FAIL', opt.name, 'no command after --'), 2)
  const win = process.platform === 'win32'
  if (win) {
    const power = powerProblems()
    if (power.length) console.log(`WARN ${opt.name}: ${power.join('; ')}; run once as admin: powercfg /change standby-timeout-ac 0 and powercfg /change hibernate-timeout-ac 0`)
  }
  if (opt.gpu) {
    const busy = gpuProblem(opt.gpuMaxUsedMb)
    if (busy) finish(statusLine('BLOCKED', opt.name, `${busy}; close the app or pass --gpu-max-used-mb`), 3)
  }
  const awake = win ? spawn('powershell', ['-NoProfile', '-Command', KEEP_AWAKE_PS], { stdio: 'ignore' }) : null
  const child = spawn(cmd[0], cmd.slice(1), { stdio: ['ignore', 'pipe', 'pipe'], shell: win })
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
    else child.kill('SIGKILL')
  }
  const watch = setInterval(() => {
    const now = Date.now()
    if (now - started > opt.timeoutMin * 60000) kill('TIMEOUT', `over ${opt.timeoutMin} min`)
    else if (now - lastOutput > opt.idleMin * 60000) kill('HANG', `no output for ${opt.idleMin} min`)
  }, 10000)
  const done = (code, why) => {
    clearInterval(watch)
    awake?.kill()
    const [state, reason] = verdict ?? (code === 0 ? ['OK', `finished in ${Math.round((Date.now() - started) / 60000)} min`] : ['FAIL', why ?? `exit code ${code}`])
    finish(statusLine(state, opt.name, reason), state === 'OK' ? 0 : 1)
  }
  child.on('error', (e) => done(1, `could not start: ${e.message}`))
  child.on('close', (code) => done(code))
}

if (process.argv[1] === fileURLToPath(import.meta.url)) main()
