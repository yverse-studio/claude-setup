# Luna 2: free fallback agent for when Claude usage runs out (docs/luna2.md).
# Installs Node (if missing), OpenCode and Ollama, pulls a small local model,
# and writes ~/.config/opencode/opencode.json. No key, no payment.
$ErrorActionPreference = 'Stop'
if (-not (Get-Command node -ErrorAction SilentlyContinue)) { winget install -e --id OpenJS.NodeJS.LTS }
if (-not (Get-Command ollama -ErrorAction SilentlyContinue)) { winget install -e --id Ollama.Ollama }
npm i -g opencode-ai
# winget installs are not on PATH in this shell yet
$env:Path = [Environment]::GetEnvironmentVariable('Path', 'Machine') + ';' + [Environment]::GetEnvironmentVariable('Path', 'User')
$env:OLLAMA_NUM_PARALLEL = '1'; $env:OLLAMA_MAX_LOADED_MODELS = '1'; $env:OLLAMA_CONTEXT_LENGTH = '8192'
ollama pull qwen3:8b
$dir = Join-Path $HOME '.config/opencode'
New-Item -ItemType Directory -Force $dir | Out-Null
@'
{
  "$schema": "https://opencode.ai/config.json",
  "provider": {
    "ollama": {
      "npm": "@ai-sdk/openai-compatible",
      "name": "Ollama (local)",
      "options": { "baseURL": "http://localhost:11434/v1" },
      "models": { "qwen3:8b": { "name": "Qwen3 8B (local)" } }
    }
  }
}
'@ | Set-Content (Join-Path $dir 'opencode.json')
Write-Host 'Done. In a repo folder: opencode  (then /models: pick a free OpenCode Zen model, or ollama/qwen3:8b)'
