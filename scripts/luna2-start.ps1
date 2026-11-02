# Start Luna 2 on the latest claude-setup (docs/luna2.md). One clone, no fork:
# pulls the current branch (main once PR 352 is merged), then opens opencode.
# Luna 2 changes go back only through a branch and a PR.
Set-Location (Split-Path $PSScriptRoot -Parent)
git pull --ff-only
node scripts/open-items.mjs --html | Out-Null
opencode
