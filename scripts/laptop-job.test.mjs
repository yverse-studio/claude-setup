// The laptop job watchdog: parsing, power and GPU checks, and real runs (OK, FAIL, HANG, TIMEOUT).
// Run: node --test scripts/laptop-job.test.mjs
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
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
