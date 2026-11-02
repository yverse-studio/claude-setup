# Starts Claude Code on the Anthropic API key, for this window only. Everything else stays on the
# claude.ai login (Remote Control needs it). The key is stored once, encrypted for this Windows user
# (DPAPI), in ~/.claude/anthropic-api-key.xml; never in git or a user environment variable.
#   scripts/claude-api.ps1 [claude args]      e.g.  scripts/claude-api.ps1 --model opus
#   scripts/claude-api.ps1 -SetKey            store or replace the key
# Plain $args, no param block: a [Parameter] attribute adds common parameters and -p would bind to -PipelineVariable.
$SetKey = $args -contains '-SetKey'
$ClaudeArgs = @($args | Where-Object { $_ -ne '-SetKey' })
$store = Join-Path $env:USERPROFILE '.claude\anthropic-api-key.xml'

if ($SetKey -or -not (Test-Path $store)) {
  $secure = Read-Host 'Anthropic API key (sk-ant-...)' -AsSecureString
  $secure | Export-Clixml -Path $store
  Write-Host "Key saved to $store"
  if ($SetKey) { return }
}

$plain = [System.Net.NetworkCredential]::new('', (Import-Clixml -Path $store)).Password
$env:ANTHROPIC_API_KEY = $plain
Remove-Variable plain
try { claude @ClaudeArgs } finally { Remove-Item Env:ANTHROPIC_API_KEY -ErrorAction SilentlyContinue }
