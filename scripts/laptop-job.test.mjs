// The laptop job watchdog: parsing, power and GPU checks, and real runs (OK, FAIL, HANG, TIMEOUT).
// Run: node --test scripts/laptop-job.test.mjs
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { spawn, spawnSync } from 'node:child_process'
import { mkdtempSync, readdirSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { MAX_BLENDER, MAX_RENDERS, acquireSlot, blenderCount, releaseSlot } from './laptop-slots.mjs'
import { parseAcMinutes, parseArgs, powerProblems, gpuProblem, ramShort, heartbeatProblem, progressProblem } from './laptop-job.mjs'

const script = fileURLToPath(new URL('./laptop-job.mjs', import.meta.url))
const run = (flags, ...cmd) => spawnSync('node', [script, '--no-gpu', ...flags, '--', ...cmd], { encoding: 'utf8', env: { ...process.env, LAPTOP_JOB_LOG: process.platform === 'win32' ? 'NUL' : '/dev/null' } })
const lastLine = (r) => r.stdout.trim().split('\n').at(-1)

test('parses flags and command', () => {
  const { opt, cmd } = parseArgs(['--name', 'pov', '--timeout-min', '5', '--', 'blender', '-b'])
  assert.deepEqual([opt.name, opt.timeoutMin, cmd], ['pov', 5, ['blender', '-b']])
})
test('reads the AC minutes from powercfg', () => {
  assert.equal(parseAcMinutes('  Current AC Power Setting Index: 0x00000000\n'), 0)
  assert.equal(parseAcMinutes('  Current AC Power Setting Index: 0x00000708\n'), 30)
  assert.equal(parseAcMinutes('nothing'), null)
})
test('warns when AC sleep is not off', () => {
  const read = (a) => (a === 'STANDBYIDLE' ? 'Current AC Power Setting Index: 0x00000258' : 'Current AC Power Setting Index: 0x00000000')
  assert.deepEqual(powerProblems(read), ['laptop sleeps (sleep) after 10 min on AC'])
  assert.deepEqual(powerProblems(() => 'Current AC Power Setting Index: 0x00000000'), [])
})
test('flags a busy GPU and names Blender', () => {
  const fake = (cmd) => (cmd === 'nvidia-smi' ? { status: 0, stdout: '6200, 8192\n' } : { stdout: 'blender.exe 4242' })
  assert.match(gpuProblem(1500, fake), /6200 of 8192 MB.*Blender is open/)
  assert.equal(gpuProblem(1500, () => ({ status: 0, stdout: '300, 8192\n' })), null)
  assert.equal(gpuProblem(1500, () => ({ status: 1, stdout: '' })), null)
})
test('reports OK', () => {
  const r = run([], 'node', '-e', 'console.log(1)')
  assert.equal(r.status, 0)
  assert.match(lastLine(r), /^JOB OK job:/)
})
test('reports FAIL with the exit code', () => {
  const r = run([], 'node', '-e', 'process.exit(7)')
  assert.equal(r.status, 1)
  assert.match(lastLine(r), /^JOB FAIL job: exit code 7/)
})
test('kills a job that runs too long', () => {
  const r = run(['--timeout-min', '0.05'], 'node', '-e', 'setInterval(()=>console.log(1),1000)')
  assert.match(lastLine(r), /^JOB TIMEOUT job:/)
})
test('kills a silent job', () => {
  const r = run(['--idle-min', '0.05'], 'node', '-e', 'setInterval(()=>{},1000)')
  assert.match(lastLine(r), /^JOB HANG job: no output/)
})
test('kills grandchildren and still reports (POSIX)', { skip: process.platform === 'win32' }, () => {
  const r = run(['--timeout-min', '0.05'], 'sh', '-c', 'sleep 300 & wait')
  assert.match(lastLine(r), /^JOB TIMEOUT job:/)
})

test('one global Blender lock: at most 1 job holds the slot, a stale slot is reused, release frees it (companyxy report 10)', () => {
  assert.equal(MAX_RENDERS, 1, 'one job at a time on the laptop (about 3.6 GB RAM free)')
  const dir = mkdtempSync(join(tmpdir(), 'slots-'))
  const alive = (pid) => pid !== 999
  const a = acquireSlot({ dir, pid: 11, alive })
  assert.ok(a)
  assert.equal(acquireSlot({ dir, pid: 12, alive }), null, 'the second job waits')
  releaseSlot(a)
  assert.ok(acquireSlot({ dir, pid: 14, alive }))
  assert.equal(acquireSlot({ dir, pid: 15, alive }), null)
  assert.ok(acquireSlot({ dir, pid: 16, alive: () => false }), 'a dead holder is taken over')
})

test('counts Blender instances from tasklist, null when unreadable', () => {
  assert.equal(blenderCount(() => ({ status: 0, stdout: 'blender.exe 1 Console\nblender.exe 2 Console\n' })), 2)
  assert.equal(blenderCount(() => ({ status: 0, stdout: 'INFO: No tasks are running' })), 0)
  assert.equal(blenderCount(() => ({ error: new Error('no tasklist') })), null)
})

test('the second parallel job queues instead of failing and both finish OK', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'slots-run-'))
  const env = { ...process.env, LAPTOP_JOB_LOCK_DIR: dir, LAPTOP_JOB_POLL_MS: '100', LAPTOP_JOB_LOG: process.platform === 'win32' ? 'NUL' : '/dev/null' }
  const start = (n) => new Promise((resolve) => {
    const c = spawn('node', [script, '--no-gpu', '--name', `j${n}`, '--', 'node', '-e', 'setTimeout(() => {}, 1500)'], { env })
    let out = ''
    c.stdout.on('data', (d) => { out += d })
    c.on('close', (code) => resolve({ code, out, at: Date.now() }))
  })
  const t0 = Date.now()
  const jobs = [start(1)]
  await new Promise((r) => setTimeout(r, 600))
  assert.equal(readdirSync(dir).length, 1)
  jobs.push(start(2))
  const [r1, r2] = await Promise.all(jobs)
  assert.deepEqual([r1.code, r2.code], [0, 0])
  assert.match(r2.out, /QUEUED j2/)
  assert.ok(r2.at - t0 >= 2800, `second job ran after the slot freed (${r2.at - t0} ms)`)
  assert.equal(readdirSync(dir).length, 0)
  assert.equal(MAX_BLENDER, 2, 'one job plus yskills\' own Blender')
})

test('a job that waits longer than --queue-min ends BLOCKED', () => {
  const dir = mkdtempSync(join(tmpdir(), 'slots-block-'))
  const env = { ...process.env, LAPTOP_JOB_LOCK_DIR: dir, LAPTOP_JOB_POLL_MS: '50', LAPTOP_MAX_RENDERS: '0', LAPTOP_JOB_LOG: process.platform === 'win32' ? 'NUL' : '/dev/null' }
  const r = spawnSync('node', [script, '--no-gpu', '--queue-min', '0', '--', 'node', '-e', '0'], { encoding: 'utf8', env })
  assert.equal(r.status, 3)
  assert.match(r.stdout, /JOB BLOCKED job: no render slot free/)
})

test('a half-written or vanished lock counts as held, never crashes or is stolen', () => {
  const dir = mkdtempSync(join(tmpdir(), 'slots-half-'))
  writeFileSync(join(dir, 'render-1.lock'), '')
  writeFileSync(join(dir, 'render-2.lock'), '')
  assert.equal(acquireSlot({ dir, pid: 5, alive: () => false }), null)
})

// Windows has no catchable SIGTERM: child.kill() there ends the watchdog without its handler.
test('stopping the watchdog kills its job and frees the slot', { skip: process.platform === 'win32' }, async () => {
  const dir = mkdtempSync(join(tmpdir(), 'slots-kill-'))
  const env = { ...process.env, LAPTOP_JOB_LOCK_DIR: dir, LAPTOP_JOB_LOG: '/dev/null' }
  const c = spawn('node', [script, '--no-gpu', '--', 'node', '-e', 'setTimeout(() => {}, 30000)'], { env })
  await new Promise((r) => setTimeout(r, 700))
  assert.equal(readdirSync(dir).length, 1)
  c.kill('SIGTERM')
  await new Promise((r) => c.on('close', r))
  assert.equal(readdirSync(dir).length, 0)
})

test('a Blender job waits while less than the minimum RAM is free', () => {
  assert.equal(ramShort(4, () => 3 * 2 ** 30), true)
  assert.equal(ramShort(4, () => 5.3 * 2 ** 30), false)
})

test('topRam lists the biggest RAM users first', async () => {
  const { topRam } = await import('./laptop-job.mjs')
  const out = '"blender.exe","111","Console","1","3.200.000 K"\r\n"node.exe","22","Console","1","50.000 K"\r\n"chrome.exe","33","Console","1","1,024,000 K"\r\n'
  assert.equal(topRam(() => ({ status: 0, stdout: out }), 2), 'blender.exe 111 3125 MB, chrome.exe 33 1000 MB')
  assert.equal(topRam(() => ({ status: 1, stdout: '' })), 'tasklist failed')
})


test('the STOP file pauses new jobs and "now" kills the running one', async () => {
  const { stopState } = await import('./laptop-job.mjs')
  const f = join(mkdtempSync(join(tmpdir(), 'stop-')), 'STOP')
  assert.equal(stopState(f), null)
  writeFileSync(f, '')
  assert.equal(stopState(f), 'pause')
  writeFileSync(f, 'now\n')
  assert.equal(stopState(f), 'now')
})

test('a job stopped with "now" goes back to the queue', async () => {
  const { endState } = await import('./render-queue.mjs')
  assert.equal(endState('JOB STOPPED x: STOP file says now', 1), '.json')
  assert.equal(endState('JOB OK x: finished in 1 min', 0), '.done')
  assert.equal(endState('JOB FAIL x: exit code 1', 1), '.fail')
})

// Companyxy report 2026-11-12, point 6: the animator waited hours on crashed renders (4/96 and 0 frames) without checking.
test('heartbeat: a Blender job must name a progress file, and a stale progress file kills it', () => {
  const MIN = 60000
  assert.match(progressProblem(['blender.exe', '-b', 'x.blend', '-a'], {}), /--progress-file/)
  assert.equal(progressProblem(['blender.exe', '-b', 'x.blend', '-a'], { progressFile: 'frames.json' }), null)
  assert.equal(progressProblem(['blender.exe', '-b'], { noProgress: 'one-frame still' }), null, 'a named reason lifts it')
  assert.equal(progressProblem(['node', '-e', '0'], {}), null, 'only Blender jobs need one')
  const start = 1_000_000_000
  assert.equal(heartbeatProblem({ now: start + 5 * MIN, started: start, mtimeMs: start + 4 * MIN, heartbeatMin: 10 }), null)
  assert.match(heartbeatProblem({ now: start + 25 * MIN, started: start, mtimeMs: start + 4 * MIN, heartbeatMin: 10 }), /no progress for 21 min/)
  assert.match(heartbeatProblem({ now: start + 31 * MIN, started: start, mtimeMs: null, heartbeatMin: 10 }), /never wrote/, 'a job that never wrote it dies too')
  assert.equal(heartbeatProblem({ now: start + 25 * MIN, started: start, mtimeMs: null, heartbeatMin: 10 }), null, 'grace for a heavy first frame')
  assert.equal(parseArgs(['--progress-file', 'p.json', '--heartbeat-min', '7', '--', 'x']).opt.heartbeatMin, 7)
})
