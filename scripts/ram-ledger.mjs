// Laptop RAM attribution and ledger. Home of the rule: docs/pc-claude-user.md (RAM ledger).
//   node scripts/ram-ledger.mjs snapshot [--out SNAPSHOT.md]   who holds the RAM now (owner per process, totals per owner)
//   node scripts/ram-ledger.mjs check <gb>                      exit 0 when <gb> is free after the open claims, else 2 + who holds it
//   node scripts/ram-ledger.mjs claim <owner> <what> <gb> [--pid N]   check, then write the claim (exit 2 when short)
//   node scripts/ram-ledger.mjs release <owner>                 drop every claim of that owner
// Read-only on processes: it never kills anything. Ledger: $RAM_LEDGER or <STUDIO_ROOT>/_claude/ram-ledger.json.
import { spawnSync } from 'node:child_process'
import { mkdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { studioRoot } from './paths.mjs'

export const BIG_MB = 200 // a process above this gets its own row in the snapshot
export const CLAIM_TTL_H = 8 // a claim older than this is stale (a thread that died without release)
const MB = 1024 * 1024
export const ledgerPath = () => process.env.RAM_LEDGER ?? join(studioRoot(), '_claude', 'ram-ledger.json')

const isSession = (p) => /^claude\.exe$/i.test(p.name) && /claude-code[\\/]/i.test(p.cmd) && /--output-format stream-json/.test(p.cmd)

// Owner of one process by its own name and command line; null = look at the parent.
export function selfOwner(p, ledger = []) {
  const claim = ledger.find((c) => c.pid === p.pid)
  if (claim) return `${claim.owner} (ledger: ${claim.what})`
  if (isSession(p)) return `Claude session ${(p.cmd.match(/--resume=([0-9a-f]{8})/) ?? [])[1] ?? `pid ${p.pid}`} (started ${p.started ?? '?'})`
  if (/^claude\.exe$/i.test(p.name)) return 'Claude Desktop app (UI, GPU, network)'
  if (/^(vmmem|cowork-svc)/i.test(p.name)) return 'Claude Desktop sandbox VM (CoworkVMService)'
  if (/^(MsMpEng|MpDefenderCoreService)\.exe$/i.test(p.name)) return 'Windows Defender'
  if (/^(explorer|dwm|SearchHost|csrss|svchost|System)\.exe$/i.test(p.name)) return 'Windows'
  if (/^flamenco-(worker|manager)\.exe$/i.test(p.name)) return 'Flamenco render farm (ours, idle until a job)'
  if (/^(copilot|PhoneExperienceHost|ShellHost|StartMenuExperienceHost|RuntimeBroker|TextInputHost|ApplicationFrameHost|WmiPrvSE|OfficeClickToRun|SearchIndexer|sihost|lsass|Memory Compression|Registry|Secure System|WUDFHost|CrossDeviceService|NVDisplay|RtkAud|DtsApo)/i.test(p.name)) return 'Windows'
  if (/^Surfshark/i.test(p.name)) return 'Surfshark VPN'
  if (/^(msedge|msedgewebview2)\.exe$/i.test(p.name)) return 'Edge / WebView2'
  return null
}

// Walks the parent chain until something names the owner; a blender.exe or Ren'Py nobody claimed says so.
export function ownerOf(p, byPid, ledger = []) {
  for (let cur = p, hops = 0; cur && hops < 12; cur = byPid.get(cur.ppid), hops++) {
    const o = selfOwner(cur, ledger)
    // A process started from the desktop (explorer) is not Windows' own: it falls through to the Blender / Ren'Py / unattributed rows.
    if (o && !(cur !== p && o === 'Windows')) return cur === p ? o : `${o} > ${p.name}`
  }
  if (/^blender\.exe$/i.test(p.name)) return `Blender, NOT in the ledger (${(p.cmd.match(/[^\\" ]+\.blend/i) ?? ['no .blend in command line'])[0]})`
  if (/^renpy|ren'?py/i.test(p.name + p.cmd)) return "Ren'Py, NOT in the ledger"
  return 'unattributed'
}

export const freshClaims = (claims, now = Date.now(), alive = () => true) =>
  claims.filter((c) => now - Date.parse(c.at) < CLAIM_TTL_H * 3600e3 && (c.pid == null || alive(c.pid)))

// A claim with a live pid is inside the measured free RAM once the process has allocated (after RAMP_MS); until then and before the start it is reserved on top.
export const RAMP_MS = 10 * 60000 // a started job has not allocated its RAM yet: its claim stays reserved this long
export const reservedGb = (claims, running, now = Date.now()) =>
  claims.filter((c) => c.pid == null || !running.has(c.pid) || now - Date.parse(c.at) < RAMP_MS).reduce((s, c) => s + c.gb, 0)

export function readLedger(path = ledgerPath()) {
  try { return JSON.parse(readFileSync(path, 'utf8')).claims ?? [] } catch { return [] }
}
export function writeLedger(claims, path = ledgerPath()) {
  mkdirSync(dirname(path), { recursive: true })
  writeFileSync(path, JSON.stringify({ claims }, null, 2))
}

const LOCK_STALE_MS = 30000
// Exclusive lock file (wx, as in laptop-slots.mjs): every read-modify-write of the ledger runs inside it, so two claims cannot both pass the check.
export function withLock(fn, path = ledgerPath()) {
  const lock = `${path}.lock`
  mkdirSync(dirname(path), { recursive: true })
  for (let tries = 0; ; tries++) {
    try { writeFileSync(lock, String(process.pid), { flag: 'wx' }); break } catch (e) {
      if (e.code !== 'EEXIST') throw e
      let age = 0
      try { age = Date.now() - statSync(lock).mtimeMs } catch { continue }
      if (age > LOCK_STALE_MS) { rmSync(lock, { force: true }); continue } // a holder that died inside fn
      if (tries > 200) throw new Error('ram ledger lock busy')
      Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 50)
    }
  }
  try { return fn() } finally { rmSync(lock, { force: true }) }
}

// Check and write in one locked step; returns checkNeed's result (ok false = nothing written).
export function tryClaim({ owner, what, gb, pid }, m = measure(), path = ledgerPath()) {
  return withLock(() => {
    const r = checkNeed(gb, m, readLedger(path))
    if (r.ok) writeLedger([...r.live, { owner, what, gb, ...(pid ? { pid: Number(pid) } : {}), at: new Date().toISOString() }], path)
    return r
  }, path)
}
export const releaseOwner = (owner, path = ledgerPath()) => withLock(() => {
  const before = readLedger(path)
  writeLedger(before.filter((c) => c.owner !== owner), path)
  return before.filter((c) => c.owner === owner).length
}, path)
export const setClaimPid = (owner, pid, path = ledgerPath()) => withLock(() => writeLedger(readLedger(path).map((c) => (c.owner === owner ? { ...c, pid } : c)), path), path)

export function measure() {
  const ps = `$o=Get-CimInstance Win32_OperatingSystem; $pool=(Get-Counter '\\Memory\\Pool Nonpaged Bytes').CounterSamples[0].CookedValue
$p=Get-CimInstance Win32_Process | Select-Object ProcessId,ParentProcessId,Name,CommandLine,WorkingSetSize,@{n='Started';e={if($_.CreationDate){$_.CreationDate.ToString('HH:mm')}}}
$v=Get-Process vmmem* -ErrorAction SilentlyContinue | Select-Object @{n='ProcessId';e={$_.Id}},@{n='ParentProcessId';e={0}},Name,@{n='CommandLine';e={''}},@{n='WorkingSetSize';e={$_.WorkingSet64}},@{n='Started';e={''}}
@{freeKb=$o.FreePhysicalMemory;totalKb=$o.TotalVisibleMemorySize;poolBytes=$pool;procs=@($p)+@($v)} | ConvertTo-Json -Compress -Depth 4`
  const r = spawnSync('powershell', ['-NoProfile', '-Command', ps], { encoding: 'utf8', maxBuffer: 64 * MB })
  if (r.status !== 0) throw new Error(`cannot measure: ${r.stderr || r.error}`)
  const d = JSON.parse(r.stdout)
  const procs = [...new Map(d.procs.map((x) => [x.ProcessId, x])).values()].map((x) => ({ pid: x.ProcessId, ppid: x.ParentProcessId, name: x.Name, cmd: x.CommandLine ?? '', mb: Math.round(x.WorkingSetSize / MB), started: x.Started }))
  return { freeGb: d.freeKb / MB, totalGb: d.totalKb / MB, poolGb: d.poolBytes / MB / 1024, procs }
}

export function buildSnapshot({ freeGb, totalGb, poolGb, procs }, claims, when = new Date().toISOString()) {
  const byPid = new Map(procs.map((p) => [p.pid, p]))
  const rows = procs.map((p) => ({ ...p, owner: ownerOf(p, byPid, claims) }))
  const totals = new Map()
  for (const r of rows) { const g = r.owner.split(' > ')[0]; totals.set(g, (totals.get(g) ?? 0) + r.mb) }
  const big = rows.filter((r) => r.mb > BIG_MB).sort((a, b) => b.mb - a.mb)
  const sorted = [...totals].sort((a, b) => b[1] - a[1]).filter(([, mb]) => mb >= 50)
  const lines = [
    `# RAM snapshot ${when}`, '',
    `Free ${freeGb.toFixed(1)} of ${totalGb.toFixed(1)} GB, nonpaged pool ${poolGb.toFixed(2)} GB (normal < 1; over 3 = reboot, see docs/pc-claude-user.md), open claims ${claims.length}.`, '',
    `## Processes over ${BIG_MB} MB`, '', '| PID | Process | MB | Owner |', '|---|---|---|---|',
    ...big.map((r) => `| ${r.pid} | ${r.name} | ${r.mb} | ${r.owner} |`), '',
    '## Per owner (all child processes added up, 50 MB and up)', '', '| Owner | MB |', '|---|---|',
    ...sorted.map(([o, mb]) => `| ${o} | ${mb} |`), '',
    '## Ledger claims', '', ...(claims.length ? claims.map((c) => `- ${c.owner}: ${c.what}, ${c.gb} GB${c.pid ? `, pid ${c.pid}` : ''}, since ${c.at}`) : ['none']), '',
  ]
  return lines.join('\n')
}

export function checkNeed(gb, { freeGb, procs }, claims) {
  const live = freshClaims(claims, Date.now(), (pid) => procs.some((p) => p.pid === pid))
  const reserved = reservedGb(live, new Set(procs.map((p) => p.pid)))
  const available = freeGb - reserved
  return { ok: available >= gb, available, reserved, live }
}

const main = (argv) => {
  const [cmd, ...a] = argv
  const flag = (n) => { const i = a.indexOf(n); return i < 0 ? undefined : a.splice(i, 2)[1] }
  const out = flag('--out'); const pid = flag('--pid')
  if (cmd === 'snapshot') {
    const text = buildSnapshot(measure(), readLedger())
    if (out) { mkdirSync(dirname(out), { recursive: true }); writeFileSync(out, text) } else console.log(text)
    return 0
  }
  if (cmd === 'check' || cmd === 'claim') {
    const [owner, what, gbArg] = cmd === 'claim' ? a : [null, null, a[0]]
    const gb = Number(gbArg)
    if (!(gb > 0) || (cmd === 'claim' && (!owner || !what))) { console.error('usage: check <gb> | claim <owner> <what> <gb> [--pid N]'); return 1 }
    const m = measure()
    const r = cmd === 'claim' ? tryClaim({ owner, what, gb, pid }, m) : checkNeed(gb, m, readLedger())
    const held = r.live.map((c) => `${c.owner}: ${c.what} ${c.gb} GB`).join('; ') || 'no claims'
    if (!r.ok) { console.log(`WAIT need ${gb} GB, free ${m.freeGb.toFixed(1)} minus reserved ${r.reserved.toFixed(1)} = ${r.available.toFixed(1)} GB. Claims: ${held}. Do not start; wait or run reduced.`); return 2 }
    console.log(`OK need ${gb} GB, available ${r.available.toFixed(1)} GB. Claims: ${held}.${cmd === 'claim' ? ' Claimed.' : ''}`)
    return 0
  }
  if (cmd === 'release' && a[0]) {
    console.log(`released ${releaseOwner(a[0])} claim(s) of ${a[0]}`)
    return 0
  }
  console.error('usage: snapshot [--out file] | check <gb> | claim <owner> <what> <gb> [--pid N] | release <owner>')
  return 1
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) process.exit(main(process.argv.slice(2)))
