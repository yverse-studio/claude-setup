# worker-loop.ps1: keeps one Flamenco Worker running in the logged-in session of user claude.
# Started at logon by the scheduled task 'CXY Flamenco Worker' (install_flamenco_admin.ps1).
# Why not a service: EEVEE needs the GPU and a desktop session; Windows services run in session 0 without one.
# Restarts the worker 15 s after it exits. Create tools\flamenco\WORKER_OFF to end the loop on purpose.
$F = Split-Path -Parent $MyInvocation.MyCommand.Path
$log = Join-Path $F 'logs\worker-loop.log'
New-Item -ItemType Directory -Force (Join-Path $F 'logs') | Out-Null
while (-not (Test-Path (Join-Path $F 'WORKER_OFF'))) {
    if (Get-Process flamenco-worker -ErrorAction SilentlyContinue) { Start-Sleep 30; continue }
    Add-Content $log "$(Get-Date -Format s) start worker"
    $p = Start-Process -FilePath (Join-Path $F 'flamenco-worker.exe') -WorkingDirectory $F -WindowStyle Hidden -PassThru `
        -RedirectStandardError (Join-Path $F 'logs\worker.log') -RedirectStandardOutput (Join-Path $F 'logs\worker.out')
    $null = $p.Handle  # PS 5.1: ExitCode stays empty unless the handle is opened before exit
    $p.WaitForExit()
    Add-Content $log "$(Get-Date -Format s) worker exited with $($p.ExitCode), restart in 15 s"
    Start-Sleep 15
}
Add-Content $log "$(Get-Date -Format s) WORKER_OFF found, loop ends"
