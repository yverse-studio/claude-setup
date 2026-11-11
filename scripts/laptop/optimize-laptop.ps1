#Requires -RunAsAdministrator
# One-time laptop setup for render work. Run ONCE as administrator:
#   powershell -ExecutionPolicy Bypass -File scripts\laptop\optimize-laptop.ps1
# Every step is reversible (see the undo lines). Nothing here touches BIOS, drivers or security software.
$ErrorActionPreference = 'Continue'
if ($env:USERNAME -ne 'Claude') { Write-Host "Run this logged in as the Claude account (now: $env:USERNAME), its autostart entries live there." -ForegroundColor Yellow }
function Step($t) { Write-Host "`n== $t" -ForegroundColor Cyan }

Step 'Autostart off: OneDrive, Riot Vanguard, KeePass preload (Surfshark stays, yskills wants it)'
foreach ($n in 'OneDrive') { Remove-ItemProperty 'HKCU:\Software\Microsoft\Windows\CurrentVersion\Run' -Name $n -ErrorAction SilentlyContinue }
foreach ($n in 'Riot Vanguard', 'KeePass 2 PreLoad') { Remove-ItemProperty 'HKLM:\Software\Microsoft\Windows\CurrentVersion\Run' -Name $n -ErrorAction SilentlyContinue }
# undo: start the apps once, they re-register themselves

Step 'Riot Vanguard kernel driver: manual start (only when you play Valorant)'
Write-Host 'Vanguard protects itself from sc.exe: remove it under Settings > Apps > Riot Vanguard > Uninstall (or keep it if you play Valorant).'

Step 'Services that are not needed for rendering'
foreach ($s in 'Killer Network Service', 'DiagTrack') { Set-Service $s -StartupType Manual -ErrorAction SilentlyContinue }
# undo: Set-Service <name> -StartupType Automatic

Step 'Power plan: Balanced when idle; renders use with-highperf.ps1'
powercfg /setactive 381b4222-f694-41f0-9685-ff5bb260df2e

Step 'Blender on the RTX 4060 (already set, kept)'
$k = 'HKCU:\Software\Microsoft\DirectX\UserGpuPreferences'
New-Item $k -Force | Out-Null
Set-ItemProperty $k -Name "$env:ProgramFiles\Blender Foundation\Blender 5.1\blender.exe" -Value 'GpuPreference=2;'

Step 'Windows Game Bar / Game DVR off (background capture)'
Set-ItemProperty 'HKCU:\Software\Microsoft\Windows\CurrentVersion\GameDVR' -Name AppCaptureEnabled -Value 0 -ErrorAction SilentlyContinue
Set-ItemProperty 'HKCU:\System\GameConfigStore' -Name GameDVR_Enabled -Value 0 -ErrorAction SilentlyContinue

Write-Host "`nDone. Still by hand: NVIDIA App > Settings > In-game overlay OFF (the numbers top-right); Outlook > Settings > do not run in background; Meta Quest Link uninstall if unused. Then reboot." -ForegroundColor Green
