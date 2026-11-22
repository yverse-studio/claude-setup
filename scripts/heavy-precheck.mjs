#!/usr/bin/env node
// Pre-check before a heavy laptop job (Blender, Ren'Py). Home of the rule: docs/pc-claude-user.md (Find hangs and timeouts).
// yskills 2026-11-22: `find /` started by threads in Git Bash hung, pinned one CPU core each and grew the kernel Paged Pool past 6 GB,
// invisible in the normal process list; a Blender job started on top of that stalls the machine. This refuses to start then.
//   node scripts/heavy-precheck.mjs [--max-pool-gb 4]
// Prints ONE line: `PRECHECK OK|SKIP|BLOCKED: <why>`; exit 0 for OK and SKIP, 2 for BLOCKED. Read-only: it never kills anything.
// SKIP = not Windows or the probes could not be read (fails open, like the RAM ledger). scripts/laptop-job.mjs runs it before every Blender or Ren'Py job.
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

export const MAX_POOL_GB = 4 // a healthy laptop holds well under 1 GB of Paged Pool
export const HUNG_FIND_MIN = 10 // a find.exe that runs longer than this is hung, whatever its parent
const GB = 2 ** 30
const ORPHAN_MIN_AGE_MS = 60000

// One PowerShell call: Paged Pool bytes (WMI property names are not localized, unlike the counter paths), every find.exe, every pid.
// CreationDate comes back as a DateTime, converted to epoch milliseconds in the script.
export const PROBE_PS = [
  "$p = (Get-CimInstance Win32_PerfRawData_PerfOS_Memory).PoolPagedBytes",
  "$all = @(Get-CimInstance Win32_Process)",
  "$f = @($all | Where-Object { $_.Name -eq 'find.exe' } | ForEach-Object { [pscustomobject]@{ pid = $_.ProcessId; ppid = $_.ParentProcessId; startedMs = ([DateTimeOffset]$_.CreationDate).ToUnixTimeMilliseconds(); cmd = $_.CommandLine } })",
  "[pscustomobject]@{ pagedPoolBytes = [double]$p; finds = $f; pids = @($all | ForEach-Object { $_.ProcessId }) } | ConvertTo-Json -Compress -Depth 4",
].join('; ')

// The default probe: null when it cannot run (not Windows, no powershell, bad output).
export function readProbe(run = (cmd, args) => spawnSync(cmd, args, { encoding: 'utf8', timeout: 20000, windowsHide: true }), platform = process.platform) {
  if (platform !== 'win32') return null
  const r = run('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', PROBE_PS])
  if (r.error || r.status !== 0) return null
  try {
    const j = JSON.parse(r.stdout)
    return { pagedPoolBytes: Number(j.pagedPoolBytes), finds: [j.finds ?? []].flat(), pids: [j.pids ?? []].flat() }
  } catch { return null }
}

// A find.exe is a problem when its parent is gone (orphaned: the tool that started it timed out and left it running) or when it runs
// longer than HUNG_FIND_MIN minutes.
export function badFinds({ finds = [], pids = [] }, now = Date.now(), hungMin = HUNG_FIND_MIN) {
  const alive = new Set(pids.map(Number))
  return finds.flatMap((f) => {
    const why = []
    if (!alive.has(Number(f.ppid)) && now - Number(f.startedMs) > ORPHAN_MIN_AGE_MS) why.push('orphaned (parent gone)') // a seconds-old find may show a dead parent under MSYS exec
    if (now - Number(f.startedMs) > hungMin * 60000) why.push(`running ${Math.round((now - Number(f.startedMs)) / 60000)} min`)
    return why.length ? [{ pid: f.pid, why: why.join(', '), cmd: String(f.cmd ?? '').slice(0, 80) }] : []
  })
}

// Tests set HEAVY_PRECHECK_PROBE_JSON to a fake probe result (the shape readProbe returns), also through scripts/laptop-job.mjs.
const defaultProbe = () => (process.env.HEAVY_PRECHECK_PROBE_JSON ? JSON.parse(process.env.HEAVY_PRECHECK_PROBE_JSON) : readProbe())

// probe: a function returning what readProbe returns (the tests pass a fake). Returns { state: 'OK'|'SKIP'|'BLOCKED', why, problems }.
export function precheck({ maxPoolGb = Number(process.env.HEAVY_PAGED_POOL_MAX_GB) || MAX_POOL_GB, probe = defaultProbe, now = Date.now() } = {}) {
  let data = null
  try { data = probe() } catch { /* unreadable: skip below */ }
  if (!data) return { state: 'SKIP', why: 'not Windows or the probes could not be read, no check done', problems: [] }
  const problems = []
  const poolGb = data.pagedPoolBytes / GB
  if (Number.isFinite(poolGb) && poolGb > maxPoolGb) problems.push(`kernel Paged Pool is ${poolGb.toFixed(1)} GB (limit ${maxPoolGb} GB)`)
  const finds = badFinds(data, now)
  if (finds.length) problems.push(`${finds.length} stuck find.exe: ${finds.slice(0, 5).map((f) => `pid ${f.pid} ${f.why}`).join('; ')}`)
  if (!problems.length) return { state: 'OK', why: `Paged Pool ${Number.isFinite(poolGb) ? poolGb.toFixed(1) : '?'} GB, no stuck find.exe`, problems }
  const fix = finds.length ? ` Stop it and report to yskills; his fix: taskkill /F /IM find.exe, and a restart if the Paged Pool stays high.` : ' Stop and report to yskills; a restart frees the pool.'
  return { state: 'BLOCKED', why: `${problems.join('; ')}.${fix}`, problems }
}

export const precheckLine = (r) => `PRECHECK ${r.state}: ${r.why}`

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const i = process.argv.indexOf('--max-pool-gb')
  const flagGb = i > 0 ? Number(process.argv[i + 1]) : 0
  const r = precheck(flagGb > 0 ? { maxPoolGb: flagGb } : {})
  console.log(precheckLine(r))
  process.exit(r.state === 'BLOCKED' ? 2 : 0)
}
