// Pre-job health check for the laptop: free RAM, kernel nonpaged pool (driver leak) and uptime.
// Reusable on its own (Flamenco worker pre-check later). Home of the rule: docs/pc-claude-user.md (RAM guard).
// A bad laptop gets ONE plain line in the owner's status file instead of a silent wait.
import { spawnSync } from 'node:child_process'
import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { freemem, tmpdir, uptime } from 'node:os'
import { join } from 'node:path'

const GB = 2 ** 30
export const LIMITS = { minFreeGb: 2.5, maxPoolGb: 2, maxUptimeDays: 3 }
export const STATUS_PREFIX = 'Laptop braucht Neustart:'

// Memory\Pool Nonpaged Bytes in bytes (normal < 1 GB; a leaking driver grows it for days); null when unreadable.
export function nonpagedPoolBytes(run = (c, a) => spawnSync(c, a, { encoding: 'utf8' })) {
  const r = run('powershell', ['-NoProfile', '-Command', "(Get-Counter '\\Memory\\Pool Nonpaged Bytes').CounterSamples[0].CookedValue"])
  const n = Number((r.stdout ?? '').trim())
  return r.error || r.status !== 0 || !Number.isFinite(n) || n <= 0 ? null : n
}

// vmmem (WSL2/Hyper-V) working set in bytes from `tasklist /FO CSV /NH`; null when not running.
export function vmmemBytes(run = (c, a) => spawnSync(c, a, { encoding: 'utf8' })) {
  const r = run('tasklist', ['/FI', 'IMAGENAME eq vmmem*', '/FO', 'CSV', '/NH'])
  const m = (r.stdout ?? '').match(/^"vmmem[^"]*","\d+",.*"([\d.,\s]+) K"/m)
  return m ? Number(m[1].replace(/\D/g, '')) * 1024 : null
}

// Biggest nonpaged pool tag from a PoolMon snapshot (`poolmon -p -b -n <file>`, Windows Driver Kit); null without PoolMon.
// Row: ` Ndu  Nonp  1234  12  1222  5586542592  4572`. Tells which driver leaks (Ndu = Windows network usage monitor).
export function topPoolTag(snapshot) {
  const rows = [...(snapshot ?? '').matchAll(/^\s*(\S{1,4})\s+Nonp\s+\d+\s+\d+\s+\d+\s+(\d+)\s+\d+/gm)].map((m) => ({ tag: m[1], bytes: Number(m[2]) }))
  const top = rows.sort((a, b) => b.bytes - a.bytes)[0]
  return top ? `${top.tag} ${(top.bytes / GB).toFixed(1)} GB` : null
}
export function poolTagNow(run = (c, a) => spawnSync(c, a, { encoding: 'utf8' }), file = join(tmpdir(), 'poolmon-snap.txt')) {
  const r = run('poolmon', ['-p', '-b', '-n', file])
  return r.error || r.status !== 0 || !existsSync(file) ? null : topPoolTag(readFileSync(file, 'utf8'))
}

export function readHealth({ win = process.platform === 'win32', run } = {}) {
  const pool = win ? nonpagedPoolBytes(run) : null
  const vmmem = win ? vmmemBytes(run) : null
  const tag = win && pool !== null && pool / GB > LIMITS.maxPoolGb ? poolTagNow(run) : null
  return { freeGb: freemem() / GB, poolGb: pool === null ? null : pool / GB, vmmemGb: vmmem === null ? null : vmmem / GB, uptimeDays: uptime() / 86400, poolTag: tag }
}

// Problems as plain German lines; empty list = healthy. A reading that is null is skipped, never guessed.
export function healthProblems(h, l = LIMITS) {
  const out = []
  if (h.poolGb !== null && h.poolGb > l.maxPoolGb) out.push(`${STATUS_PREFIX} Pool ${h.poolGb.toFixed(1)} GB (normal unter 1 GB, Treiber-Leck), frei ${h.freeGb.toFixed(1)} GB${h.poolTag ? `, größter Tag: ${h.poolTag}` : ''}`)
  else if (h.freeGb < l.minFreeGb) out.push(`${STATUS_PREFIX} nur ${h.freeGb.toFixed(1)} GB RAM frei${h.vmmemGb ? ` (vmmem hält ${h.vmmemGb.toFixed(1)} GB)` : ''}, Pool ${h.poolGb === null ? '?' : h.poolGb.toFixed(1)} GB`)
  if (h.uptimeDays > l.maxUptimeDays) out.push(`Render-Nacht erst nach Neustart: Laptop läuft seit ${h.uptimeDays.toFixed(1)} Tagen`)
  return out
}

// Same format as GAL\\_tools\\ram_admin.ps1: `ts | label | free GB | nonpaged MB | vmmem MB` in <dir>/ram-<yyyymmdd>.log (default _work/ram, LAPTOP_RAM_LOG_DIR).
// Read-only: this watcher never restarts the VM or a service (admin only, owner-run).
export function logHealth(h, label = 'queue', dir = process.env.LAPTOP_RAM_LOG_DIR ?? join('_work', 'ram'), now = new Date()) {
  mkdirSync(dir, { recursive: true })
  const mb = (g) => (g === null || g === undefined ? '?' : Math.round(g * 1024))
  const line = `${now.toISOString()} | ${label} | ${h.freeGb.toFixed(1)} | ${mb(h.poolGb)} | ${mb(h.vmmemGb)}`
  appendFileSync(join(dir, `ram-${now.toISOString().slice(0, 10).replaceAll('-', '')}.log`), line + '\n')
  return line
}

// Replaces any earlier health line, keeps the rest of the file; returns true when the file changed.
export function writeStatus(lines, file = process.env.LAPTOP_STATUS_FILE ?? 'STATUS.md') {
  const isOurs = (l) => l.startsWith(STATUS_PREFIX) || l.startsWith('Render-Nacht erst nach Neustart:')
  const old = existsSync(file) ? readFileSync(file, 'utf8').split(/\r?\n/) : []
  const keep = old.filter((l) => !isOurs(l))
  const next = [...lines, ...keep].join('\n').replace(/\n+$/, '') + '\n'
  if (next === old.join('\n')) return false
  writeFileSync(file, next)
  return true
}

// Healthy again: drop our lines so the status never shows a stale restart request.
export const clearStatus = (file = process.env.LAPTOP_STATUS_FILE ?? 'STATUS.md') => existsSync(file) && writeStatus([], file)

if (process.argv[1] === new URL(import.meta.url).pathname) {
  const h = readHealth()
  const p = healthProblems(h)
  console.log(JSON.stringify(h))
  console.log(p.length ? p.join('\n') : 'Laptop ok')
  process.exit(p.length ? 1 : 0)
}
