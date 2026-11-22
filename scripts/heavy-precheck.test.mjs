// Pre-check before a heavy laptop job: Paged Pool size and stuck find.exe (yskills 2026-11-22). Probes are mocked; Windows is not needed.
// Run: node --test scripts/heavy-precheck.test.mjs
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { badFinds, precheck, precheckLine, readProbe, MAX_POOL_GB } from './heavy-precheck.mjs'

const script = fileURLToPath(new URL('./heavy-precheck.mjs', import.meta.url))
const jobScript = fileURLToPath(new URL('./laptop-job.mjs', import.meta.url))
const GB = 2 ** 30
const NOW = Date.parse('2026-11-22T20:00:00Z')
const probe = (over = {}) => () => ({ pagedPoolBytes: 0.5 * GB, finds: [], pids: [4, 100, 200], ...over })
const find = (over = {}) => ({ pid: 555, ppid: 100, startedMs: NOW - 30000, cmd: 'find / -name x', ...over })

test('a healthy machine passes', () => {
  const r = precheck({ probe: probe(), now: NOW })
  assert.equal(r.state, 'OK')
  assert.match(precheckLine(r), /^PRECHECK OK: Paged Pool 0\.5 GB, no stuck find\.exe/)
})
test('a Paged Pool over the limit blocks and says the numbers', () => {
  const r = precheck({ probe: probe({ pagedPoolBytes: 6.3 * GB }), now: NOW })
  assert.equal(r.state, 'BLOCKED')
  assert.match(r.why, /Paged Pool is 6\.3 GB \(limit 4 GB\)/)
  assert.match(r.why, /report to yskills/)
  assert.equal(precheck({ probe: probe({ pagedPoolBytes: 4.2 * GB }), maxPoolGb: 8, now: NOW }).state, 'OK', 'the limit is a parameter')
  assert.equal(MAX_POOL_GB, 4)
})
test('an orphaned find.exe blocks (parent pid gone), a young find with a live parent does not', () => {
  const r = precheck({ probe: probe({ finds: [find({ ppid: 9999, startedMs: NOW - 120000 })] }), now: NOW })
  assert.equal(r.state, 'BLOCKED')
  assert.match(r.why, /1 stuck find\.exe: pid 555 orphaned \(parent gone\)/)
  assert.match(r.why, /taskkill \/F \/IM find\.exe/)
  assert.equal(precheck({ probe: probe({ finds: [find()] }), now: NOW }).state, 'OK')
  assert.equal(precheck({ probe: probe({ finds: [find({ ppid: 9999 })] }), now: NOW }).state, 'OK', 'a seconds-old find with a dead parent is not yet an orphan (MSYS exec)')
})
test('a find.exe that runs over 10 minutes is hung even with a live parent', () => {
  const r = precheck({ probe: probe({ finds: [find({ startedMs: NOW - 25 * 60000 })] }), now: NOW })
  assert.equal(r.state, 'BLOCKED')
  assert.match(r.why, /running 25 min/)
  assert.deepEqual(badFinds({ finds: [find({ ppid: 9999, startedMs: NOW - 25 * 60000 })], pids: [1] }, NOW).map((f) => f.why), ['orphaned (parent gone), running 25 min'])
})
test('both problems are named together', () => {
  const r = precheck({ probe: probe({ pagedPoolBytes: 7 * GB, finds: [find({ ppid: 1, startedMs: NOW - 120000 })] }), now: NOW })
  assert.match(r.why, /Paged Pool is 7\.0 GB.*1 stuck find\.exe/)
})
test('an unreadable probe skips (fails open), it never blocks a job on a guess', () => {
  assert.equal(precheck({ probe: () => null, now: NOW }).state, 'SKIP')
  assert.equal(precheck({ probe: () => { throw new Error('no powershell') }, now: NOW }).state, 'SKIP')
  assert.equal(readProbe(() => ({ status: 0, stdout: '{}' }), 'linux'), null, 'not Windows')
  assert.equal(readProbe(() => ({ status: 1, stdout: '' }), 'win32'), null, 'powershell failed')
  assert.equal(readProbe(() => ({ status: 0, stdout: 'garbage' }), 'win32'), null, 'bad output')
  assert.deepEqual(readProbe(() => ({ status: 0, stdout: JSON.stringify({ pagedPoolBytes: 1, finds: { pid: 1, ppid: 2, startedMs: 3 }, pids: 5 }) }), 'win32'), { pagedPoolBytes: 1, finds: [{ pid: 1, ppid: 2, startedMs: 3 }], pids: [5] }, 'PowerShell turns a one-element array into a scalar')
})
test('the CLI exits 2 with one BLOCKED line when the pool is over the limit, 0 when fine', () => {
  const env = (j) => ({ ...process.env, HEAVY_PRECHECK_PROBE_JSON: JSON.stringify(j) })
  const bad = spawnSync('node', [script], { encoding: 'utf8', env: env({ pagedPoolBytes: 6.5 * GB, finds: [], pids: [] }) })
  assert.equal(bad.status, 2)
  assert.match(bad.stdout.trim(), /^PRECHECK BLOCKED: kernel Paged Pool is 6\.5 GB/)
  assert.equal(bad.stdout.trim().split('\n').length, 1)
  const orphan = spawnSync('node', [script], { encoding: 'utf8', env: env({ pagedPoolBytes: GB, finds: [{ pid: 7, ppid: 8, startedMs: Date.now() - 120000 }], pids: [1] }) })
  assert.equal(orphan.status, 2)
  assert.match(orphan.stdout, /orphaned/)
  const ok = spawnSync('node', [script, '--max-pool-gb', '8'], { encoding: 'utf8', env: env({ pagedPoolBytes: 6.5 * GB, finds: [], pids: [] }) })
  assert.equal(ok.status, 0)
  assert.match(ok.stdout, /^PRECHECK OK/)
})
test('HEAVY_PAGED_POOL_MAX_GB sets the limit for the pre-check and the job path', () => {
  const j = JSON.stringify({ pagedPoolBytes: 6.5 * GB, finds: [], pids: [] })
  const env = { ...process.env, HEAVY_PRECHECK_PROBE_JSON: j, HEAVY_PAGED_POOL_MAX_GB: '8', LAPTOP_JOB_LOG: process.platform === 'win32' ? 'NUL' : '/dev/null' }
  assert.equal(spawnSync('node', [script], { encoding: 'utf8', env }).status, 0, 'CLI')
  assert.equal(precheck({ probe: () => JSON.parse(j), now: NOW, maxPoolGb: 8 }).state, 'OK')
  const job = spawnSync('node', [jobScript, '--no-gpu', '--no-progress', 'still', '--queue-min', '0', '--', 'node', '-e', 'console.log("blender")'], { encoding: 'utf8', env })
  assert.match(job.stdout, /PRECHECK OK/, 'the job path reads the env too')
})
test('laptop-job: a Blender job is BLOCKED before it queues when the pre-check is red, a light job is not checked', () => {
  const env = { ...process.env, LAPTOP_JOB_LOG: process.platform === 'win32' ? 'NUL' : '/dev/null', HEAVY_PRECHECK_PROBE_JSON: JSON.stringify({ pagedPoolBytes: 6.5 * GB, finds: [], pids: [] }) }
  const heavy = spawnSync('node', [jobScript, '--no-gpu', '--no-progress', 'still', '--', 'node', '-e', 'console.log("blender")'], { encoding: 'utf8', env })
  assert.equal(heavy.status, 3)
  assert.match(heavy.stdout, /PRECHECK BLOCKED/)
  assert.match(heavy.stdout.trim().split('\n').at(-1), /^JOB BLOCKED job: kernel Paged Pool is 6\.5 GB/)
  const light = spawnSync('node', [jobScript, '--no-gpu', '--', 'node', '-e', 'console.log(1)'], { encoding: 'utf8', env })
  assert.equal(light.status, 0)
  assert.doesNotMatch(light.stdout, /PRECHECK/)
})
