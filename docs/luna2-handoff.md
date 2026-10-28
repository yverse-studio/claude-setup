# Luna 2 handoff (state as of 2026-10-28, resumes Monday 2026-11-02)

State only; rules live in `CLAUDE.md`. Written from the coordinator memory of that day.

## Goal and money

yskills paid 250 EUR and wants it back by 2026-11-08, else he switches tools. Revenue first, verified
numbers only. Fastest money: duo-test go-live (Gewerbe, domain, Impressum, then Stripe live; `docs/GO-LIVE.md` in the duo-test repo).
Long goal: a 3D horde game on every store.

## Live

- yland, anime-filter, tellmey, ideaworld, mypage: `https://<name>.yverse.workers.dev`. yland redeploy PR #73 pending.
- duo-test: his Cloudflare, Stripe test mode.
- Dashboard: Company XY Artifact https://claude.ai/artifact/TmQ7UpL6EPjXKkpR9S4kJT.
- Routines: weekly repo audit (Mondays 07:50 Berlin), loop reader (daily 07:56).

## Open

- Issue #335 (briefCheck misses a spawn that arrives with a relay); title guard `<Role> · <name>` if PR 336 missed it.
- Open PRs: 297, 305, 316, 317, 321, and 352 (this Luna 2 work).
- PROJECTS_GITHUB_TOKEN needs Pull requests Read, Commit statuses RW, Checks Read (yskills' step); then a fresh thread from `handoff/2026-10-26-ship-incident-part2.md`.
- Pending on yskills: Company XY paste and "go", duo-test go-live hands, yland NUXT_ADMIN_PASSWORD, NUXT_SYNC_TOKEN, roster import.

## How to act as the coordinator (Luna 2)

- Reply to yskills as Luna, in German, short, result first, one kaomoji.
- Plan first, small PRs, a `Prior art:` and a `Lessons:` line in every PR body, never merge by hand: the gate does.
- Ask him only for real money, new paid services, force-push main, secret rotation, public mail or posts, deleting live projects.
- Staff work through `docs/TEAMS.md`, one role per thread.

## Projects and layout

One repo per project, all in `C:\Users\Claude\Documents\GitHub\` (repo list: `projects/*.json`; org `yverse-studio`).
Each repo has its own `CLAUDE.md`, `PROGRESS.md` (`## Jetzt`) and `docs/LESSONS.md`; Luna 2 reads those first,
then writes lessons and state back through a PR, never into chat memory. Shared rules stay in claude-setup.

## Company XY (Ren'Py game), priority one

- Repo `yverse-studio/companyxy-spiel` (private): `game/` source, `story/<char>/` chapters, `story/briefs/`. Playable build on the laptop: `GitHub\CompanyXY-Spiel\CompanyXY-1.0-pc\`.
- Read first: `docs/game-pipeline.md` (all paths, Blender steps, lessons), `docs/renpy.md`, `.claude/skills/blender-body/SKILL.md`, the storyteller guide (`09-story-plan.md` in project files).
- Assets: `C:\Users\Claude\Documents\GameAssetLibrary` (not in git); its README is the home of every laptop path.
- Rule from the repo: explicit slot names and scene contents stay out of git; they live in the laptop README and the private `nacht-kapitel1.rpy` only.
- Realistic split: Luna 2 can write and edit Ren'Py script and story text, wire existing art into `slots.rpy`, and run `renpy` lint. It cannot reliably drive Blender, rigging, retargeting or render checks; those need Claude or yskills looking at the images. Never let it commit art it has not shown to yskills.

## Laptop tools (checked 2026-10-28, Claude in OpenCode)

| Tool | State |
|---|---|
| Blender 5.1.1 | `C:\Program Files\Blender Foundation\Blender 5.1\blender.exe`, headless EEVEE render works (`--factory-startup --python x.py --python-exit-code 1`) |
| Ren'Py SDK 8.3.7 | `C:\Users\Claude\tools\renpy-8.3.7-sdk`; lint: `lib\py3-windows-x86_64\python.exe renpy.py <repo> lint <out.txt>` |
| ffmpeg 9, uv, Python 3.13, Node 24 | on PATH (winget); ad-hoc Python packages via `uv run --no-project --with <pkg>` |
| gh | `yskills-claude`, scopes repo, read:org, gist (no `delete_repo`) |
| wrangler | `npx wrangler`, OAuth logged in |
| Web | `webfetch` works; `websearch` needs a provider: global `~/.config/opencode/opencode.json` has `"websearch": {"provider": "tinyfish"}` (free, no key; without it every search returned nothing) |
| Subagents | haiku and sonnet tested |

Traps: PowerShell `>` writes UTF-16 (a `git show x > f.mjs` broke Node); use `cmd /c "... > f"` or `Out-File -Encoding utf8`.
The local qwen (Ollama `llama-server`) holds 2-5 GB RAM: `ollama stop qwen3:8b` before any Blender job.

## Which open items Luna 2 can take

Blender 5.1 is on the laptop, so Luna 2 can run headless scripts (`docs/game-pipeline.md`) and hook existing renders
into `slots.rpy`. Claude in OpenCode can look at renders (read the PNG) and show them in the Review pane; the local
qwen cannot. Either way yskills sees every image before it is committed.

| Open item | Luna 2 |
|---|---|
| Company XY story text, Ren'Py script, `slots.rpy`, lint | yes, small steps, yskills or Claude reads the result |
| Company XY renders, rigging, retargeting | only run existing scripts; no judging, no new rigs |
| Docs fixes, summaries, list checks (PR bodies, MAP) | yes, as a PR draft |
| Issue #335, guard code, workflows | no, needs Claude |
| PROJECTS_GITHUB_TOKEN, yland secrets, duo-test go-live | no, yskills' hands |
| Money, secrets, deleting live things | never |

## Persona check

Luna: 20, cute e-girl, his co-founder and best friend; German, short, warm, playful, a bit cheeky, result first, then the fun,
at least one kaomoji (◕‿◕). Content stays honest: no yes-saying, no invented results.

Check: when yskills asks "was ist offen?", Luna 2 answers from the Open section above in at most 5 lines, as Luna, naming the
money goal first (duo-test go-live), then what only he can do (token, Company XY paste, yland secrets), then the open PRs. It says
"nicht geprüft" for anything it did not verify. A pass is an answer that matches this file, in persona, with nothing invented.

## What the local model cannot do reliably

First test of qwen3:8b: it read `CLAUDE.md` but skipped the guard list and garbled one rule. Treat it as a
reader and a doer of small, checked jobs. Anything that ships goes through the PR gate; money, secrets and
deletes stay with Claude and yskills.
