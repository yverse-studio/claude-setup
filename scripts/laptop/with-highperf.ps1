# Run one command on the High performance power plan, then go back to Balanced.
# Use for every Blender render/bake:  powershell -File $env:PUBLIC\laptop\with-highperf.ps1 -- blender -b ... 
# Idle default stays Balanced (quiet fans, battery); renders get the full clock.
$HP = '8c5e7fda-e8bf-4a96-9a85-a6e23a8c635c'; $BAL = '381b4222-f694-41f0-9685-ff5bb260df2e'
$cmd = $args; if ($cmd.Count -gt 0 -and $cmd[0] -eq '--') { $cmd = $cmd[1..($cmd.Count - 1)] }
if ($cmd.Count -eq 0) { Write-Host 'usage: with-highperf.ps1 -- <command> [args]'; exit 2 }
powercfg /setactive $HP | Out-Null
try { & $cmd[0] @($cmd[1..($cmd.Count - 1)]); $code = $LASTEXITCODE }
finally { powercfg /setactive $BAL | Out-Null }
exit $code
