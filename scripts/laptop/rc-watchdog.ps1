# Remote Control watchdog for the Claude laptop. Run every 2 min by the task from install-rc-watchdog.ps1.
# Why: RC sessions dropped when RAM ran out (Claude app CliGovernor evicts "idle" sessions, e.g. one waiting
# on a long Blender job) and when the Acer service reset the Wi-Fi power plan. See docs/pc-claude-user.md.
# Never kills a process; it only repairs settings, restarts the Claude app if it is gone, and logs.
$ErrorActionPreference = 'Continue'
$logDir  = Join-Path $env:LOCALAPPDATA 'rc-watchdog'
$log     = Join-Path $logDir 'watchdog.log'
$state   = Join-Path $logDir 'state.json'
$mainLog = Join-Path $env:LOCALAPPDATA 'Claude\logs\main.log'
$wifiGuid = '19cbb8fa-5279-450e-9fac-8a3d5fedd0c1'; $savingGuid = '12bbebe6-58d6-4636-95bb-3217ef867c1a'
New-Item -ItemType Directory -Force $logDir | Out-Null
function Log($m) { "$(Get-Date -Format 'yyyy-MM-dd HH:mm:ss') $m" | Add-Content $log }
if ((Test-Path $log) -and (Get-Item $log).Length -gt 2MB) { Move-Item $log "$log.old" -Force }

$st = if (Test-Path $state) { Get-Content $state -Raw | ConvertFrom-Json } else { [pscustomobject]@{ netFails = 0; evictSeen = 0 } }

# 1. Wi-Fi power saving: keep Maximum Performance (Acer Quick Access resets the plan on every charger change).
$q = powercfg /q SCHEME_CURRENT $wifiGuid $savingGuid | Out-String
if ($q -match 'Current AC Power Setting Index: 0x0*[1-9a-f]|Current DC Power Setting Index: 0x0*[1-9a-f]') {
  powercfg /setacvalueindex SCHEME_CURRENT $wifiGuid $savingGuid 0 | Out-Null
  powercfg /setdcvalueindex SCHEME_CURRENT $wifiGuid $savingGuid 0 | Out-Null
  powercfg /setactive SCHEME_CURRENT | Out-Null
  Log 'wifi power saving was reset by something: set back to Maximum Performance'
}

# 2. Memory. Below 4 GB free: a log line with the top eaters plus the kernel pools (the Claude desktop app is the
# suspect for "driver" memory there, docs/pc-claude-user.md) and ONE Windows toast per low episode (re-armed at 4 GB
# free again), none while a laptop-job slot is held. Below 1 GB free the app starts evicting sessions. Kills nothing.
$os = Get-CimInstance Win32_OperatingSystem
$freeGB = [math]::Round($os.FreePhysicalMemory / 1MB, 2)
$warned = $st.PSObject.Properties['warned'] -and $st.warned
if ($freeGB -ge 4.0) { $warned = $false }
else {
  $top = Get-Process | Group-Object Name | ForEach-Object { '{0}x{1}={2}MB' -f $_.Name, $_.Count, [int](($_.Group | Measure-Object WorkingSet64 -Sum).Sum / 1MB) } |
    Sort-Object { [int](($_ -split '=')[1] -replace 'MB') } -Descending | Select-Object -First 5
  # CIM class, not a perf-counter path: those are localized (de-DE) and would throw.
  $pool = try { $m = Get-CimInstance Win32_PerfFormattedData_PerfOS_Memory -ErrorAction Stop; 'nonpaged={0}MB paged={1}MB' -f [int]($m.PoolNonpagedBytes / 1MB), [int]($m.PoolPagedBytes / 1MB) } catch { Log "pool read failed: $($_.Exception.Message)"; 'n/a' }
  Log "LOW RAM free=${freeGB}GB top: $($top -join ' ') pools: $pool"
  $slotDir = Join-Path $env:TEMP 'claude-laptop-render-slots'
  $jobRuns = @(Get-ChildItem $slotDir -Filter 'render-*.lock' -ErrorAction SilentlyContinue | Where-Object { Get-Process -Id ([int](Get-Content $_.FullName -ErrorAction SilentlyContinue)) -ErrorAction SilentlyContinue }).Count -gt 0
  if (-not $warned -and -not $jobRuns) {
    try {
      [void][Windows.UI.Notifications.ToastNotificationManager, Windows.UI.Notifications, ContentType = WindowsRuntime]
      $xml = [Windows.UI.Notifications.ToastNotificationManager]::GetTemplateContent([Windows.UI.Notifications.ToastTemplateType]::ToastText02)
      $xml.GetElementsByTagName('text')[0].AppendChild($xml.CreateTextNode("Nur ${freeGB} GB RAM frei")) | Out-Null
      $xml.GetElementsByTagName('text')[1].AppendChild($xml.CreateTextNode('Claude-App komplett schliessen und neu starten (Test). Hilft das nicht: Windows neu starten.')) | Out-Null
      $app = '{1AC14E77-02E7-4E5D-B744-2EB1AE5198B7}\WindowsPowerShell\v1.0\powershell.exe'
      [Windows.UI.Notifications.ToastNotificationManager]::CreateToastNotifier($app).Show([Windows.UI.Notifications.ToastNotification]::new($xml))
      $warned = $true
    } catch { Log "toast failed: $($_.Exception.Message)" }
  }
}
if ($st.PSObject.Properties['warned']) { $st.warned = $warned } else { $st | Add-Member -NotePropertyName warned -NotePropertyValue $warned }

# 3. Evictions: the app pauses sessions under memory pressure. Count new ones since the last run.
if (Test-Path $mainLog) {
  $n = @(Select-String -Path $mainLog -Pattern 'pressure evicting' -ErrorAction SilentlyContinue).Count
  if ($st.evictSeen -gt 0 -and $n -gt $st.evictSeen) { Log "governor evicted $($n - $st.evictSeen) session(s) (free RAM ${freeGB}GB)" }
  $st.evictSeen = $n
}

# 4. Network: tcp 443 to the API. After 3 misses in a row (about 6 min) while Wi-Fi is Up, try an adapter restart.
$ok = $false
try { $c = [Net.Sockets.TcpClient]::new(); $ok = $c.ConnectAsync('api.anthropic.com', 443).Wait(4000); $c.Dispose() } catch {}
if ($ok) { if ($st.netFails -ge 3) { Log 'network back' }; $st.netFails = 0 }
else {
  $st.netFails++
  Log "network check failed ($($st.netFails))"
  if ($st.netFails -eq 3) {
    try { Restart-NetAdapter -Name 'WLAN' -Confirm:$false -ErrorAction Stop; Log 'restarted WLAN adapter' }
    catch { Log "adapter restart needs admin: $($_.Exception.Message)" }
  }
}

# 5. The Claude app itself: start it again if it is gone (RC runs inside it).
if (-not (Get-Process -Name Claude -ErrorAction SilentlyContinue)) {
  $exe = Get-ChildItem "$env:LOCALAPPDATA\AnthropicClaude\Claude.exe", "$env:LOCALAPPDATA\Programs\Claude\Claude.exe", "$env:LOCALAPPDATA\Claude\Claude.exe" -ErrorAction SilentlyContinue | Select-Object -First 1
  if ($exe) { Start-Process $exe.FullName; Log "Claude app was not running: started $($exe.FullName)" } else { Log 'Claude app not running and exe not found' }
}

$st | ConvertTo-Json | Set-Content $state
