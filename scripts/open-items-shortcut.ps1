# Puts the desktop shortcut "Luna Übersicht" (open-items.cmd, icon luna-cut.ico) on the desktop. Run once per laptop.
$ErrorActionPreference = 'Stop'
$name = 'Luna ' + [char]0xDC + 'bersicht.lnk'
$cmd = Join-Path $PSScriptRoot 'open-items.cmd'
$ico = Join-Path $env:USERPROFILE '.claude\luna-cut.ico'
$lnk = (New-Object -ComObject WScript.Shell).CreateShortcut((Join-Path ([Environment]::GetFolderPath('Desktop')) $name))
$lnk.TargetPath = $cmd
$lnk.WorkingDirectory = Split-Path $PSScriptRoot -Parent
$lnk.WindowStyle = 7
if (Test-Path $ico) { $lnk.IconLocation = $ico }
$lnk.Save()
Write-Host "Shortcut: $($lnk.FullName)"
