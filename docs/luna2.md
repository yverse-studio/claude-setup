# Luna 2: free fallback agent when Claude usage runs out

Unverified: written from search results of 2026-10-28, nothing here has been run yet. The first
real task decides whether it stays (see Test).

## Pick

OpenCode is the harness. It is said to read `AGENTS.md`/`CLAUDE.md` and `.claude/skills/` itself, so
this repo works unchanged under both tools (sources are gists, not the official docs). Models, in order:

1. A free OpenCode Zen model (needs no payment; the list changes, `/models` shows today's).
2. Local Ollama `qwen3:8b` for small jobs (8 GB laptop limits: `docs/research/2026-10-26-free-models-in-workflow.md`).

Not chosen: Hermes Agent (Windows only experimental, own skill system), Kolibri by Aleph Alpha
(78 GB weights, no coding benchmark, no public API found). Open models trail Opus on the hard
coding benchmark (SWE-bench Pro), so Luna 2 does small, checked jobs; Claude reviews anything that ships.

## Setup (laptop, once)

Run `scripts/luna2-setup.ps1` in PowerShell (installs Node, Ollama, OpenCode, pulls the model, writes the config).

## Test

In a clone of this repo run `opencode`, ask "summarize CLAUDE.md and list the guards", then one
small docs fix. Pass: it quotes the real rules and the fix passes `node scripts/check.mjs`.

## Rules for Luna 2

Same repo rules as Claude (`CLAUDE.md`). Hooks do not run in OpenCode, so every PR still goes
through the gate; no secrets, no deploys.
