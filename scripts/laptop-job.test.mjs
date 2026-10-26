// The laptop job watchdog: parsing, power and GPU checks, and real runs (OK, FAIL, HANG, TIMEOUT).
// Run: node --test scripts/laptop-job.test.mjs
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { spawn, spawnSync } from 'node:child_process'
import { mkdtempSync, readdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { acquireSlot, blenderCount, releaseSlot } from './laptop-slots.mjs'
import { parseAcMinutes, parseArgs, powerProblems, gpuProblem } from './laptop-job.mjs'

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

test('render slots: at most 2 held, a stale slot is reused, release frees one', () => {
  const dir = mkdtempSync(join(tmpdir(), 'slots-'))
  const alive = (pid) => pid !== 999
  const a = acquireSlot({ dir, pid: 11, alive })
  const b = acquireSlot({ dir, pid: 12, alive })
  assert.ok(a && b)
  assert.equal(acquireSlot({ dir, pid: 13, alive }), null)
  releaseSlot(a)
  assert.ok(acquireSlot({ dir, pid: 14, alive }))
  assert.equal(acquireSlot({ dir, pid: 15, alive }), null)
  assert.ok(acquireSlot({ dir, pid: 16, alive: () => false }))
})

test('counts Blender instances from tasklist, null when unreadable', () => {
  assert.equal(blenderCount(() => ({ status: 0, stdout: 'blender.exe 1 Console\nblender.exe 2 Console\n' })), 2)
  assert.equal(blenderCount(() => ({ status: 0, stdout: 'INFO: No tasks are running' })), 0)
  assert.equal(blenderCount(() => ({ error: new Error('no tasklist') })), null)
})

test('the third parallel job queues instead of failing and all three finish OK', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'slots-run-'))
  const env = { ...process.env, LAPTOP_JOB_LOCK_DIR: dir, LAPTOP_JOB_POLL_MS: '100', LAPTOP_JOB_LOG: process.platform === 'win32' ? 'NUL' : '/dev/null' }
  const start = (n) => new Promise((resolve) => {
    const c = spawn('node', [script, '--no-gpu', '--name', `j${n}`, '--', 'node', '-e', 'setTimeout(() => {}, 1500)'], { env })
    let out = ''
    c.stdout.on('data', (d) => { out += d })
    c.on('close', (code) => resolve({ code, out, at: Date.now() }))
  })
  const t0 = Date.now()
  const jobs = [start(1), start(2)]
  await new Promise((r) => setTimeout(r, 600))
  assert.equal(readdirSync(dir).length, 2)
  jobs.push(start(3))
  const [r1, r2, r3] = await Promise.all(jobs)
  assert.deepEqual([r1.code, r2.code, r3.code], [0, 0, 0])
  assert.match(r3.out, /QUEUED j3/)
  assert.ok(r3.at - t0 >= 2800, `third job ran after a slot freed (${r3.at - t0} ms)`)
  assert.equal(readdirSync(dir).length, 0)
})

test('a job that waits longer than --queue-min ends BLOCKED', () => {
  const dir = mkdtempSync(join(tmpdir(), 'slots-block-'))
  const env = { ...process.env, LAPTOP_JOB_LOCK_DIR: dir, LAPTOP_JOB_POLL_MS: '50', LAPTOP_MAX_RENDERS: '0', LAPTOP_JOB_LOG: process.platform === 'win32' ? 'NUL' : '/dev/null' }
  const r = spawnSync('node', [script, '--no-gpu', '--queue-min', '0', '--', 'node', '-e', '0'], { encoding: 'utf8', env })
  assert.equal(r.status, 3)
  assert.match(r.stdout, /JOB BLOCKED job: no render slot free/)
})
