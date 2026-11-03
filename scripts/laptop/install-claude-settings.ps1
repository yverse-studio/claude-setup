# Merges claude-settings.template.json into ~/.claude/settings.json: sets defaultMode, adds missing allow/ask/deny
# entries, keeps everything already there. Safe to run again. Writes a .bak next to the file first.
$target = Join-Path $env:USERPROFILE '.claude\settings.json'
$tpl = (Get-Content (Join-Path $PSScriptRoot 'claude-settings.template.json') -Raw | ConvertFrom-Json).permissions
$cur = if (Test-Path $target) { Get-Content $target -Raw | ConvertFrom-Json } else { [pscustomobject]@{} }
if (Test-Path $target) { Copy-Item $target "$target.bak" -Force }
if (-not $cur.permissions) { $cur | Add-Member permissions ([pscustomobject]@{}) }
$p = $cur.permissions
$p | Add-Member defaultMode $tpl.defaultMode -Force
foreach ($k in 'allow', 'ask', 'deny') { $p | Add-Member $k @(@($p.$k) + @($tpl.$k) | Where-Object { $_ } | Select-Object -Unique) -Force }
[IO.File]::WriteAllText($target, ($cur | ConvertTo-Json -Depth 20), (New-Object Text.UTF8Encoding($false)))
"settings merged: allow=$($p.allow.Count) ask=$($p.ask.Count) deny=$($p.deny.Count) mode=$($p.defaultMode)"
