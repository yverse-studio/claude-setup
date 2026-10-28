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

Run `scripts/luna2-setup.ps1` in PowerShell (installs Node, Ollama, OpenCode, pulls the model, writes the config). Start with `scripts/luna2-start.ps1` (pulls, then opens opencode). The laptop folder is a plain clone of this repo, no fork; changes go back via branch and PR.

## Test

In a clone of this repo run `opencode`, ask "summarize CLAUDE.md and list the guards", then one
small docs fix. Pass: it quotes the real rules and the fix passes `node scripts/check.mjs`.

## Result (2026-10-28, laptop, Ollama 0.40.12, OpenCode 1.19.5)

`opencode run -m ollama/qwen3:8b` did call `Read CLAUDE.md` and summarized it mostly right, but it
skipped the `[guard: ...]` list and garbled one rule. So: usable for reading and light work, not for
exact rule-following. Give it narrow prompts, or try a bigger free Zen model (not tried yet).
The setup script failed once at `ollama pull` because winget's PATH was not live; fixed in the script.

Vision (same day, RTX 4060 8 GB, 15.7 GB RAM): `qwen2.5vl:7b` fits and sees coarse content (office, reception, characters),
but it invented defects (a floating cup that sits on the tray, a "cut-off" arm that is plain cropping). OpenCode cannot use it:
`does not support tools`, so it works only through the Ollama API. Treat it as "what is in the picture", never as defect hunting.
Free Zen models (`big-pickle`, `deepseek-v4.1-flash-free`, `glm-5.3-flash-free`) hung with no output, likely needing an `opencode auth` login
(an account signup; not done). Ren'Py SDK is not installed on the laptop, so lint cannot run yet; `CompanyXY-Spiel` there is a plain folder, not a git clone.

Persona check on OpenCode 2.2.0 with `qwen3:8b` (repo `opencode.json` + `docs/luna2-persona.md`): FAIL. It calls the `question` tool with
empty arguments, or a web search, instead of answering; denying a tool only moves it to the next one. Without those tricks it read the handoff and got
the facts right, but in English, 25 lines, no Luna voice. Free Zen now answers "Free usage limit reached" (a paid wall, nothing connected).
Untried: `/no_think`, all tools off with the files pasted in as context. Verdict: the 8B local model is a file reader, not a coordinator;
a better fallback needs a stronger model with reliable tool use, which is a paid or key-based service and yskills' call.

Last try (yskills chose "reader and helper only"): `/no_think` plus both files pasted into the prompt, run from a folder outside the repo, gave a correct
German Luna answer, but the model wrote it into a file with the Write tool instead of the chat (wildcard tool deny was ignored). The answer is close to the
example in `luna2-persona.md`, so it may be copying it. Untried: deny each tool by name (`write`, `edit`, `bash`, `read`, `glob`, `grep`).

## API worker (Claude Code on the Console key)

Desktop shortcut `Luna API` runs `scripts/luna-terminal.cmd`: a Windows Terminal window `luna` with a
Koordinator tab (`scripts/luna-api.cmd`) and an Agents tab (`claude agents`, the threads view; agent view is a
research preview, and which key background sessions bill when both lanes run is not yet checked). The Koordinator is Claude Code on Opus with the key from
`scripts/claude-api.ps1` (DPAPI file, no env var, so Remote Control keeps the login), hooks from `install.mjs`.
It starts as the coordinator and lists what is open. Claude Desktop hands it work by writing one file per job
into `%USERPROFILE%\.claude\jobs\` (what, repo, done-when); finished jobs move to `jobs\done`.
Claude Desktop's own gateway mode does not work with this key (billing error on the `claude-code-20250219` beta).

## Rules for Luna 2

Same repo rules as Claude (`CLAUDE.md`). Hooks do not run in OpenCode, so every PR still goes
through the gate; no secrets, no deploys.
