import assert from 'node:assert/strict'
import { test } from 'node:test'
import { spawn } from 'node:child_process'
import { mkdtempSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { buildSnapshot, checkNeed, freshClaims, ownerOf, releaseOwner, reservedGb, setClaimPid, tryClaim } from './ram-ledger.mjs'

const SESSION_CMD = 'app\\Claude-Data\\claude-code\\2.1\\claude.exe --output-format stream-json --resume=6dc0a328-f531-4e41-8d8a-795b80dd440f'
const procs = [
  { pid: 1, ppid: 0, name: 'Claude.exe', cmd: '"apps\\Claude\\app\\Claude.exe" ', mb: 330 },
  { pid: 2, ppid: 1, name: 'claude.exe', cmd: SESSION_CMD, mb: 300, started: '17:00' },
  { pid: 3, ppid: 2, name: 'cmd.exe', cmd: 'cmd /c npx', mb: 1 },
  { pid: 4, ppid: 3, name: 'node.exe', cmd: 'node playwright', mb: 90 },
  { pid: 5, ppid: 1, name: 'claude.exe', cmd: 'Claude.exe --type=renderer', mb: 1150 },
  { pid: 6, ppid: 9, name: 'blender.exe', cmd: 'blender.exe work\\CH_rika\\rika.blend', mb: 3000 },
  { pid: 7, ppid: 2, name: 'blender.exe', cmd: 'blender.exe -b x.blend', mb: 2500 },
  { pid: 8, ppid: 0, name: 'vmmem', cmd: '', mb: 700 },
]
const byPid = new Map(procs.map((p) => [p.pid, p]))
const owner = (pid, ledger) => ownerOf(byPid.get(pid), byPid, ledger)

test('a child of a Claude session belongs to that session', () => {
  assert.match(owner(4), /^Claude session 6dc0a328 \(started 17:00\) > node.exe$/)
  assert.match(owner(7), /^Claude session 6dc0a328/)
})
test('the Desktop app, its renderer and the VM are told apart from sessions', () => {
  assert.match(owner(5), /Claude Desktop app/)
  assert.match(owner(8), /sandbox VM/)
})
test('a Blender nobody claimed is flagged, a claimed one names the claimer', () => {
  assert.match(owner(6), /NOT in the ledger \(rika\.blend\)/)
  assert.match(owner(6, [{ pid: 6, owner: 'animator-12', what: 'render' }]), /animator-12 \(ledger: render\)/)
})
test('claims: dead pid and old claims drop, a running claim is not reserved twice', () => {
  const now = Date.parse('2026-11-12T20:00:00Z')
  const claims = [
    { owner: 'a', what: 'x', gb: 4, at: '2026-11-12T19:00:00Z' },
    { owner: 'b', what: 'y', gb: 4, at: '2026-11-12T19:00:00Z', pid: 6 },
    { owner: 'c', what: 'z', gb: 4, at: '2026-11-12T19:00:00Z', pid: 999 },
    { owner: 'd', what: 'w', gb: 4, at: '2026-11-11T19:00:00Z' },
  ]
  const live = freshClaims(claims, now, (pid) => pid === 6)
  assert.deepEqual(live.map((c) => c.owner), ['a', 'b'])
  assert.equal(reservedGb(live, new Set([6])), 4)
})
test('check refuses when the open claims plus the need exceed free RAM', () => {
  const m = { freeGb: 6, procs }
  const fresh = new Date().toISOString()
  assert.equal(checkNeed(4, m, []).ok, true)
  const r = checkNeed(4, m, [{ owner: 'a', what: 'render', gb: 3, at: fresh }])
  assert.equal(r.ok, false)
  assert.equal(r.available, 3)
})
test('snapshot lists every process over 200 MB with its owner and sums per owner', () => {
  const text = buildSnapshot({ freeGb: 6, totalGb: 15.7, poolGb: 1.1, procs }, [], '2026-11-12')
  assert.match(text, /\| 5 \| claude\.exe \| 1150 \| Claude Desktop app/)
  assert.match(text, /\| Claude session 6dc0a328 \(started 17:00\) \| 2891 \|/)
  assert.doesNotMatch(text, /\| 4 \| node\.exe/)
})
test('a Blender started by hand from the desktop is not hidden as Windows', () => {
  const ps = [{ pid: 20, ppid: 0, name: 'explorer.exe', cmd: '', mb: 270 }, { pid: 21, ppid: 20, name: 'blender.exe', cmd: 'blender.exe work\\b.blend', mb: 900 }]
  assert.match(ownerOf(ps[1], new Map(ps.map((p) => [p.pid, p]))), /^Blender, NOT in the ledger \(b\.blend\)/)
})
test('two claims in a row cannot both fit: the second sees the first one reserved', () => {
  const path = join(mkdtempSync(join(tmpdir(), 'ramled-')), 'ledger.json')
  const m = { freeGb: 6, procs: [] }
  assert.equal(tryClaim({ owner: 'a', what: 'render', gb: 4 }, m, path).ok, true)
  assert.equal(tryClaim({ owner: 'b', what: 'render', gb: 4 }, m, path).ok, false)
  assert.equal(JSON.parse(readFileSync(path, 'utf8')).claims.length, 1)
  setClaimPid('a', 4242, path)
  assert.equal(JSON.parse(readFileSync(path, 'utf8')).claims[0].pid, 4242)
  assert.equal(releaseOwner('a', path), 1)
})
test('a job that just started still reserves its RAM until it has allocated it', () => {
  const now = Date.parse('2026-11-12T20:00:00Z')
  const running = new Set([6])
  const fresh = [{ owner: 'a', what: 'x', gb: 4, pid: 6, at: '2026-11-12T19:57:00Z' }]
  assert.equal(reservedGb(fresh, running, now), 4)
  assert.equal(reservedGb([{ ...fresh[0], at: '2026-11-12T19:00:00Z' }], running, now), 0)
})
test('8 processes claim at the same millisecond, 3 rounds: exactly one wins each round', async () => {
  const code = `const t = Number(process.env.START); while (Date.now() < t); import('${new URL('./ram-ledger.mjs', import.meta.url).href}').then((m) => { const r = m.tryClaim({ owner: process.argv[1], what: 'x', gb: 4 }, { freeGb: 6, procs: [] }); console.log(r.ok) })`
  for (let round = 0; round < 3; round++) {
    const path = join(mkdtempSync(join(tmpdir(), 'ramled-')), 'ledger.json')
    const start = String(Date.now() + 2500)
    const kids = Array.from({ length: 8 }, (_, n) => spawn('node', ['-e', code, `o${n}`], { stdio: ['ignore', 'pipe', 'inherit'], env: { ...process.env, RAM_LEDGER: path, START: start } }))
    const out = await Promise.all(kids.map((k) => new Promise((res) => { let o = ''; k.stdout.on('data', (d) => { o += d }); k.on('close', () => res(o.trim())) })))
    assert.equal(out.filter((v) => v === 'true').length, 1, `round ${round}: ${out}`)
    assert.equal(JSON.parse(readFileSync(path, 'utf8')).claims.length, 1)
  }
})
