# Quick health check before a Blender job: RAM, kernel pool, GPU, heavy processes. Read-only.
$o = Get-CimInstance Win32_OperatingSystem
'RAM free {0:N1} / {1:N1} GB' -f ($o.FreePhysicalMemory/1MB), ($o.TotalVisibleMemorySize/1MB)
$c = Get-Counter '\Memory\Pool Paged Bytes', '\Memory\Pool Nonpaged Bytes'
$c.CounterSamples | ForEach-Object { '{0,-20} {1,6:N0} MB  (healthy: < 1000)' -f $_.Path.Split('\')[-1], ($_.CookedValue/1MB) }
nvidia-smi --query-gpu=name,utilization.gpu,memory.used --format=csv,noheader
Get-Process blender -ErrorAction SilentlyContinue | ForEach-Object { 'Blender running: PID {0}' -f $_.Id }
Get-Process | Group-Object Name | ForEach-Object { [pscustomobject]@{Name=$_.Name; GB=[math]::Round(($_.Group | Measure-Object WS -Sum).Sum/1GB, 2)} } | Sort-Object GB -Descending | Select-Object -First 8 | Format-Table -AutoSize
