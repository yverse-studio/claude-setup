# install_flamenco_admin.ps1: one-time admin install of Flamenco on the CXY laptop (wave D2, 2026-11-09).
# Run ONCE in an elevated PowerShell (Windows PowerShell 5.1 is fine):
#   powershell -ExecutionPolicy Bypass -File C:\Users\Claude\Documents\StudioLibrary\tools\flamenco\install_flamenco_admin.ps1
# Claude's sessions may not create persistent system state (services, scheduled tasks), so the owner runs this by hand.
#  1. Manager  -> Windows service 'FlamencoManager' (WinSW wrapper), start=auto, restart on crash (sc.exe failure).
#  2. Worker   -> scheduled task 'CXY Flamenco Worker' at logon of claude (EEVEE needs the GPU + desktop session,
#                 a service in session 0 has neither), worker-loop.ps1 restarts it when it exits.
# Safe to run again: it reinstalls both.
$ErrorActionPreference = 'Continue'
$F = 'C:\Users\Claude\Documents\StudioLibrary\tools\flamenco'
$svc = 'FlamencoManager'
$task = 'CXY Flamenco Worker'

$me = New-Object Security.Principal.WindowsPrincipal([Security.Principal.WindowsIdentity]::GetCurrent())
if (-not $me.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {
    Write-Host 'Bitte als Administrator starten (Rechtsklick PowerShell -> Als Administrator ausfuehren).'
    exit 1
}

# 0. hand-started test copies would block port 8080 and the worker slot
Get-Process flamenco-manager, flamenco-worker -ErrorAction SilentlyContinue | Stop-Process -Force
Get-CimInstance Win32_Process -Filter "Name='powershell.exe'" | Where-Object { $_.CommandLine -like '*worker-loop.ps1*' } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force }
Start-Sleep 2

# 1. Manager service
if (Get-Service $svc -ErrorAction SilentlyContinue) {
    sc.exe stop $svc | Out-Null
    Start-Sleep 3
    & "$F\flamenco-manager-service.exe" uninstall
}
& "$F\flamenco-manager-service.exe" install
sc.exe config $svc start= auto
sc.exe failure $svc reset= 3600 actions= restart/10000/restart/30000/restart/60000
sc.exe start $svc
Start-Sleep 5
Get-Service $svc | Format-Table Name, StartType, Status -AutoSize

# 2. Worker at logon of claude (runs only while claude is logged on: needed for the GPU)
# conhost --headless: no window at all (Windows Terminal ignores -WindowStyle Hidden and showed two windows, 2026-11-09)
$ps = "$env:SystemRoot\System32\WindowsPowerShell\v1.0\powershell.exe"
$a = New-ScheduledTaskAction -Execute "$env:SystemRoot\System32\conhost.exe" -Argument "--headless `"$ps`" -NoProfile -ExecutionPolicy Bypass -File `"$F\worker-loop.ps1`"" -WorkingDirectory $F
$s = New-ScheduledTaskSettingsSet -ExecutionTimeLimit ([TimeSpan]::Zero) -RestartCount 999 -RestartInterval (New-TimeSpan -Minutes 1) `
    -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -MultipleInstances IgnoreNew
Register-ScheduledTask -TaskName $task -Action $a -Trigger (New-ScheduledTaskTrigger -AtLogOn -User 'claude') -Settings $s `
    -User 'claude' -RunLevel Limited -Force | Out-Null
if (Test-Path "$F\WORKER_OFF") { Remove-Item "$F\WORKER_OFF" }
Start-ScheduledTask $task
Start-Sleep 8
Get-ScheduledTask $task | Format-Table TaskName, State -AutoSize

# 3. check: Manager answers, worker registered
try {
    $w = (Invoke-RestMethod 'http://127.0.0.1:8080/api/v3/worker-mgt/workers' -TimeoutSec 10).workers
    Write-Host "Manager OK, Worker: $(($w | ForEach-Object { "$($_.name)=$($_.status)" }) -join ', ')"
} catch {
    Write-Host "Manager antwortet nicht: $($_.Exception.Message) (Log: $F\logs)"
}
Write-Host 'Fertig. Claude prueft den Rest.'
