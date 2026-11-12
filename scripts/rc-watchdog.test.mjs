// rc-watchdog.ps1 cannot run here (Windows); these tests pin the choices that broke or would break on the laptop.
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const ps = readFileSync(new URL('./laptop/rc-watchdog.ps1', import.meta.url), 'utf8')

test('the pool is read from the CIM class, not a localized Get-Counter path (de-DE)', () => {
  assert.match(ps, /Win32_PerfFormattedData_PerfOS_Memory/)
  assert.doesNotMatch(ps, /Get-Counter/)
})

test('the low-RAM toast fires once per episode and is re-armed at 4 GB free', () => {
  assert.match(ps, /if \(\$freeGB -ge 4\.0\) \{ \$warned = \$false \}/)
  assert.match(ps, /if \(-not \$warned -and -not \$jobRuns\)/)
  assert.equal((ps.match(/ToastNotification\]::new/g) ?? []).length, 1)
})

test('the watchdog adds no network-adapter calls beyond the one that was already there', () => {
  assert.equal((ps.match(/Restart-NetAdapter|Disable-NetAdapter|netsh/g) ?? []).length, 1)
})
