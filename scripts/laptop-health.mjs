// Pre-job health check for the laptop: free RAM, kernel nonpaged pool (driver leak) and uptime.
// Run it from Task Scheduler every ~10 min to log pool growth continuously (each run appends one log line).
// Reusable on its own (Flamenco worker pre-check later). Home of the rule: docs/pc-claude-user.md (RAM guard).
// A bad laptop gets ONE plain line in the owner's status file instead of a silent wait.
import { spawnSync } from 'node:child_process'
import { appendFileSync, existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs'
import { freemem, tmpdir, uptime } from 'node:os'
import { join } from 'node:path'

const GB = 2 ** 30
export const LIMITS = { minFreeGb: 2.5, maxPoolGb: 3, maxUptimeDays: 3 }
// Pool tags that point at Claude Desktop itself (MSIX/bindflt file-open leak, claude-code issues 94198, 95489, 96870); anything else: measure first.
const CLAUDE_TAGS = /^(NtFC|File|FMfn)\b/
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
  if (h.poolGb !== null && h.poolGb > l.maxPoolGb) out.push(`${STATUS_PREFIX} Pool ${h.poolGb.toFixed(1)} GB (normal unter 1 GB, Treiber-Leck), frei ${h.freeGb.toFixed(1)} GB${h.poolTag ? `, größter Tag: ${h.poolTag}${CLAUDE_TAGS.test(h.poolTag) ? ' (Claude Desktop, CLAUDE_CODE_TMPDIR setzen)' : ''}` : ''}; nicht mitten im Render, erst nach dem Job`)
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

// A queued job (.json) nobody picked up while nothing runs: render-queue.mjs polls every 30 s, so 2 min means the runner is dead
// (it does not survive a reboot). Returns a plain line or null; a STOP file or a .running job is a normal wait.
export function staleQueueLine(queueDir, now = Date.now(), staleMin = 2) {
  const jobs = join(queueDir, 'jobs')
  if (!existsSync(jobs) || existsSync(join(queueDir, 'STOP'))) return null
  const files = readdirSync(jobs)
  if (files.some((f) => f.endsWith('.running'))) return null
  const waiting = files.filter((f) => f.endsWith('.json')).map((f) => ({ f, min: (now - statSync(join(jobs, f)).mtimeMs) / 60000 })).filter((x) => x.min > staleMin).sort((a, b) => b.min - a.min)[0]
  return waiting ? `Queue steht: ${waiting.f.replace(/\.json$/, '')} wartet seit ${Math.round(waiting.min)} min, Runner läuft nicht (nach Neustart: node scripts/render-queue.mjs ${queueDir} starten)` : null
}

// Replaces any earlier health line, keeps the rest of the file; returns true when the file changed.
export function writeStatus(lines, file = process.env.LAPTOP_STATUS_FILE ?? 'STATUS.md') {
  const isOurs = (l) => l.startsWith(STATUS_PREFIX) || l.startsWith('Queue steht:') || l.startsWith('Render-Nacht erst nach Neustart:')
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
  const qDir = process.argv[2] ?? process.env.LAPTOP_QUEUE_DIR
  const stale = qDir ? staleQueueLine(qDir) : null
  if (stale) p.push(stale)
  try { if (p.length) writeStatus(p); else clearStatus() } catch (e) { console.error(`WARN status not written: ${e.message}`) }
  try { logHealth(h, 'cli') } catch (e) { console.error(`WARN ram log not written: ${e.message}`) }
  console.log(JSON.stringify(h))
  console.log(p.length ? p.join('\n') : 'Laptop ok')
  process.exit(p.length ? 1 : 0)
}
