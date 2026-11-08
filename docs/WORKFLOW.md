# Roadmap: from idea to money

Every new project follows this. You send the idea in a Claude Project (or a plain chat); the
project conversation becomes the **operator** (`operator` skill) and starts a thread per job. It
holds the goals, staffs the teams and pushes them until the goal is live. You answer one
brainstorm batch and three ok/no briefs; the gate merges every PR at 5/5 itself.
Each thread lives for one job, hands off through files and closes: long threads re-read their
whole history every turn.

## The phases

The steps from idea to money, who runs each and which steps a task's size needs: one pipeline,
[`TEAMS.md`](TEAMS.md) (Sizes, Pipeline, Kits); the Project Manager's detail per step:
[`run.md`](../.claude/skills/operator/run.md). What you do: answer the grill cards, tap brief (a)
(plan, with proof people pay), pick a look (brief b), read brief (c) at launch, approve post
batches, pay for ads and live keys.

After launch, steps 5 and 6 repeat for every improvement the weekly numbers suggest.

Auto-run, pauses and taste calls: `CLAUDE.md` (How to work).

## PC work

Remote Control (2026-10-07): yskills allows Claude Code on their PC. Anything that needs the PC (installs, local files and clones, Roblox Studio and its MCP server, screenshots of local apps, hardware reads, git with their logins) is done by a Remote Control session started on the user's message, never written out as steps for yskills. Project work runs on the Windows user `Claude` with Claude's own logins (GitHub `yskills-claude`, Cloudflare as Administrator member once invited; `docs/pc-claude-user.md`). What stays with yskills: the owner side of their accounts (repo access, Cloudflare members, GitHub app installs, Roblox Creator Hub), passwords, CAPTCHAs, phone codes and money. The PC session never reads, prints or sends keys, tokens or passwords. Checked 2026-10-08: a fresh PC session commits, pushes, merges, deletes remote branches and installs tools; its safety check still refuses reading browser cookies. A session keeps the permissions it started with, so after yskills changes them, start a fresh one.

## Models

The Models line, the model of every role and of every other task live in [`TEAMS.md`](TEAMS.md)
(Models line, Roster); `scripts/check.mjs` fails on a model id anywhere else. Every thread start
and every subagent names its model from there; the project's default is never relied on.

## Token budget

yskills hit most of a weekly limit in under a day (2026-10-18) and wants at least 4 days from it. One rule for every thread, project and chat, and the global setup:

Budget: Haiku (effort low) reads, lists, checks files, polls CI and does simple edits; Sonnet builds; Opus only as the one Opus rule in the Models line (`docs/TEAMS.md`), which includes every gate at every size; Fable is the escalation step: only when the coordinator names it in the brief, for a thread stuck twice on the same problem or a critical task (launch, money, data loss, a decision with no default). An S or M gate round is one Opus review plus CI, a new round only for a real bug; the round limit and the summary to yskills: `gate.md` (Rounds). Max two working threads at a time. Nothing beyond the ask: no extra research or screenshots. Reuse before research: first read the existing report, role or skill for that kind of work (`research/`, `roles/`) and research only what is new; a thread that solves a new kind of task leaves a short playbook or template in its one home so the next one follows it. The coordinator keeps briefs short and rewrites memory only at milestones.

Why calls, not threads, cost the most (measured 2026-10-18; the breakdown is `claude-setup/audit/2026-10-18-token-start-cost.md` in the claude.ai project's shared files, not in this repo): a fresh project thread starts at about 114k tokens, only about 10k of it from this repo, and every call re-reads all of it. So batch independent calls in one turn, read several files with one command or one Haiku reader, name in the brief the one file a role must read, and use an Agent subagent (it starts small) instead of a new project thread for a bounded check.

Cache-read price per M tokens (2026-10-17, architect report): Fable $0.25, Opus $0.20, Sonnet $0.10, Haiku $0.01 up to 100k and $0.05 above, so a Haiku reader stays under 100k and a Fable read costs 1.25x Opus, not 2.2x. Cloud promo credit ($100 Pro, $250 Max, expires 2026-11-04; found 2026-10-04): it covers only plain claude.ai/code sessions, never Projects, Routines or Remote Control, so every project thread spends the plan's 5-hour and weekly limits; never tell yskills the credit keeps project threads going.

## Handoff triggers

A thread hands off only at one of three triggers (yskills 2026-11-08: a forced handoff at a token number is wrong when a thread merely waits):

1. Role change: the next step needs another role.
2. Quality loss: `attempt-guard` fired twice, the same approach repeated, or a contradiction with an earlier step.
3. A finished milestone.

At a trigger: finish the step, write `/mnt/project-files/<project>/handoff/<date>-<topic>.md` (done, next, branch, PR, open asks), reply with its path, stop. A thread only waiting makes no tool call and ends the turn.

Otherwise no handoff: compaction with the PreCompact guard (`global/compact-guard.mjs`) keeps Role/Kit/Size, branch, PR, asks and decisions; after a compaction SessionStart `compact` reloads the rules (team-guard start). The numbers in `global/context-guard.mjs` (their only home) are a backstop: its message asks for the trigger check and never orders a handoff. No brief, guide or prompt ties a handoff to a token count or a time (`scripts/check.mjs` fails on one).

## The 5/5 gate

Five pass/fail checks by agents that didn't write the code: CI, evaluator on the preview, fresh
code review, security + red team, design + legal. At 5/5 the gate merges (author thread for S and M, gate thread for L), claude-setup
included. The rules, probe mode and the round limit and its summary: `operator` skill, `gate.md`.

## Fixes

A fix removes the cause, not the symptom (yskills 2026-11-08): name the rule, check or design that let the defect through, fix there, add the check that would have caught it (`gate.md`: a check failing twice gets this diagnosis first). A workaround (retry, sleep, catch-all, special case, skipped test) only when yskills says so, labelled `Workaround:` in the PR body and deleted when the root fix lands. Lean setup, deep know-how: the know-how goes into its one home (`docs/MAP.md`), never into a second copy, and a thread finds it through MAP.md, the card or the rules index, not by asking.

## Learning

Every correction, every failed gate round with a catchable cause and every test project ends as
a rule, skill line, test or check in this repo. That is the memory: committed, reviewed, loaded
by every thread. No memory plugin or Obsidian: ECC hooks from the PC install don't run in cloud threads (only the settings hooks `cloud/setup.sh` writes, like the context guard), and the repo already
does the job.

**Lessons step** (after every merge, the thread that merged, one short pass; sources: Every's ce-compound,
Matt Pocock's retro, both MIT). For each correction or catchable failed round of the PR, ask: would
the next thread repeat this mistake without the lesson? No: write nothing and say so in one line.
Yes: update the line that already covers it, else add one line in its single home (`CLAUDE.md`
line, skill line, or a product repo's `docs/LESSONS.md`; `docs/MAP.md`, Where a lesson goes, decides; never project memory). A mechanical lesson (a fixed pattern, a banned call, a file rule)
becomes a check, test or lint rule in `scripts/` or CI instead of text. Then prune: delete a
lesson line that a check now covers, or whose guarded thing is gone.

**Project retro** (yskills 2026-11-08: errors and good practice are recorded at a project's end, not only per merge). The thread that ships a project (go-live PR, store release) or deletes it writes one block before it says done: what broke and why, what worked and is worth reusing, what the next project of this kind does differently. General lessons follow Where a lesson goes (`docs/MAP.md`); product lessons stay in the product's `docs/LESSONS.md`, and a deleted repo's `docs/LESSONS.md` is copied to `/mnt/project-files/<project>/retro/` first, since the repo goes. Reusable good practice becomes a template or skill line, not a story. The `publish` skill (A new project, Delete a project) names this step.

A thread that cannot open a PR itself (cloud, GitHub App disconnected) writes the lesson as a block into the lessons inbox instead ([template](../.claude/skills/operator/templates/lessons-inbox.md): format, `Seen:` rule, Monday patch). `Seen: 3x` or confirmed by yskills is promoted to a rule line in its home via PR; `1x` stays in the inbox.

**Memory check, two speeds.** Every coordinator start, cheap: `MEMORY.md` has only the five sections of
[the template](../.claude/skills/operator/templates/project-memory.md) and no line that is a rule; a rule
found there becomes a `loop:setup` issue. Monthly, or when you say "memory check": full. Every fact
file and auto-memory note is moved into its home ([`docs/MAP.md`, Start here](MAP.md#start-here)) or
deleted, the raw copy archived under `docs/archive/` first, and you get three lines on what moved and
what went. Claude Code's built-in auto-memory on your PC (`~/.claude/projects/*/memory/`) stays a
scratchpad that the full check empties.

Before the first real project, three test projects run this roadmap end to end
(`docs/TEST-PROJECTS.md`).

## Selling (pages that bill, shops, shipping)

The `sell` skill carries everything: the questions, the keys, tested Stripe-on-Workers code, the
shipping setup and German shop law, with a dated table re-checked at every new project.

Once, before your first real sale (the skill links each step):
- Gewerbe and the ELSTER tax questionnaire (Kleinunternehmer or not).
- A Stripe account; activate it for live payments when the first shop is ready.
- Legal texts: Claude writes them (official model texts word for word); a paid service such as
  eRecht24 once sales come in.
- Physical products: a Sendcloud account, plus LUCID and a packaging licence before the first
  parcel.

Deploys and previews: the `publish` skill.

## Security, always on

- `security-guidance` warns while code is being written.
- ECC hooks block secrets and `--no-verify` at commit time (on your PC; the ECC hooks of the PC install don't run in cloud threads).
- `security-reviewer` reads every risky diff; `red-team` attacks the preview before launch.
- GitHub secret scanning and `npm audit` are worth turning on per project.

## Where this comes from

Anthropic's harness posts (planner, generator and a separate evaluator; progress in files; a
fresh context per job; hard thresholds) and the ECC hackathon winner's flow (research and
scaffold first, thin vertical slices, test first, review before commit, lessons saved as skills).
Sources and what was left out: `docs/RESEARCH.md`.
