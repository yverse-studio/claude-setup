# Roadmap: from idea to money

Every new project follows this. You send the idea in a Claude Project (or a plain chat); the
project conversation becomes the **operator** (`operator` skill) and starts a thread per job. It
holds the goals, staffs the teams and pushes them until the goal is live. You answer one
brainstorm batch and three ok/no briefs; the gate merges every PR at 5/5 itself.
Each thread lives for one job, hands off through files and closes: long threads re-read their
whole history every turn.

## The phases

| # | Phase | Team (who) | Output | You do |
|---|---|---|---|---|
| 0 | Idea | you | one message | Send it |
| 1 | Brainstorm | operator | a real discussion (Claude brings its own view and challenges) ending in one batch of tap-card questions (incl. money questions from `sell`) | Answer once |
| 2 | Research, in parallel | **Inside:** our skills, catalog, lessons from `docs/TEST-PROJECTS.md`, your other repos. **Outside:** competitors, how the best similar products and open-source projects are built, tools (`toolbox`, Anthropic Directory). **Money:** who pays, how much, 3 pieces of evidence; none → the plan says no. **Legal:** the `legal` skill's table | one page each | Nothing |
| 3 | Plan | `planner` | `PLAN.md` (PRD, slices, marketing plan, keys, costs), `features.json` (acceptance criteria per slice, written before any code) | **Brief (a):** ok/no (it includes proof people pay) |
| 4 | Scaffold + design | one scaffold thread; design team (`frontend-design`, `impeccable`, `design-critic`) | default stack, `verify`, CI; the repo and its deploy already exist from the `new-project` workflow (`publish`); 2-3 directions as screenshots | **Brief (b):** pick one. Later keys come one card at a time, when a slice needs them |
| 5a | Probe (anything meant to earn) | one builder thread, then the marketing team | slice `probe` live: offer, price, waitlist; pushed in one channel for the probe period (7 days default, operator `run.md` step 5) against the go number from `PLAN.md` | Nothing if it hits the number; else one tap: kill, change or build anyway |
| 5 | Build | builder threads, one per slice, the next in a fresh thread after a merge; a second only when the slices share no file, never more than three; a small site is one thread, no slices | PRs with tests, screenshots, preview link; `PROGRESS.md` updated | Nothing |
| 6 | Gate each PR | QA: `evaluator` on the preview, fresh `code-reviewer`; security: `security-reviewer` + `red-team`; `design-critic` + `legal-reviewer` | a 5/5 table on the PR and the merge, or one review the builder fixes | nothing |
| 7 | Launch | full `red-team` and `legal-reviewer` pass; `publish`, `sell` go-live; the loop wired (`docs/LOOP.md`: errors and feedback stored by the app, `loop.yml`, the reader routine) | live site | **Brief (c)** to read; the gate merges (auto-run); live keys when you want real money |
| 8 | Grow | marketing team (`market` skill, `seo-specialist`); the daily loop reader and a weekly routine | posts, launch, a fix thread per error or red live check, a decision per feedback item, a weekly PR with the `metrics/` file HQ reads and the next slice | The gate merges the weekly PR (you tap only if Claude Code's safety check blocks it); approve post batches, pay for ads |
| 9 | Learn | operator | each lesson becomes a rule, skill line, test or check in claude-setup | Nothing; the gate merges it (you tap only if Claude Code's safety check blocks it) |

After launch, phases 5-6 repeat for every improvement the weekly numbers suggest.

Auto-run, pauses and taste calls: `CLAUDE.md` (How to work).

## PC work

Remote Control (2026-10-07): yskills allows Claude Code on their PC. Anything that needs the PC (installs, local files and clones, Roblox Studio and its MCP server, screenshots of local apps, hardware reads, git with their logins) is done by a Remote Control session started on the user's message, never written out as steps for yskills. Project work runs on the Windows user `Claude` with Claude's own logins (GitHub `yskills-claude`, Cloudflare as Administrator member once invited; `docs/pc-claude-user.md`). What stays with yskills: the owner side of their accounts (repo access, Cloudflare members, GitHub app installs, Roblox Creator Hub), passwords, CAPTCHAs, phone codes and money. The PC session never reads, prints or sends keys, tokens or passwords. Checked 2026-10-08: a fresh PC session commits, pushes, merges, deletes remote branches and installs tools; its safety check still refuses reading browser cookies. A session keeps the permissions it started with, so after yskills changes them, start a fresh one.

## Models

The one model line (`scripts/check.mjs` fails on a model id anywhere else):

Models: best fitting model per task, cheapest that fits. Fable (claude-fable-5-1) is rare, drawn from yskills' Max plan: only the architecture or plan of a new product, a problem still stuck after a Sonnet round and an Opus checkpoint, or what yskills names; plus the project chat (coordinator), which yskills sets by hand; if Fable is out of credits or unavailable, Opus takes it without asking. Opus (claude-opus-5-5) for plans, design, judgement and full audits. Sonnet (claude-sonnet-5-5) for gates, fixes, research and builds. A simple reading job goes to a Haiku subagent. Cheap first: Sonnet does the work and calls an Opus subagent before committing to an approach, when stuck twice on the same spot and before saying done; the gate's verdict is Opus on size L only, never on S or M. A thread never picks Fable itself, and routing, reviews, research, builds and fixes stay off it unless the brief names it (Budget). Effort medium unless yskills asks for more. When a newer model ships, use the newest of each tier. A model yskills names is used as named.

Role table (tiers only; the ids live in the line above):

| Role | Model | Effort | Escalate to | When |
|---|---|---|---|---|
| Coordinator (project chat) | as yskills sets it in project settings | medium | | never changed by a thread |
| Architect, plan of a new product | Fable | medium (high when yskills asks) | | only the three Fable cases above |
| Planner (feature plan, PLAN.md) | Opus | medium | Fable | plan rejected twice |
| Designer, design-critic, vote verdict | Opus | medium | | taste is judgement |
| Game Designer | Opus | medium | | play is judgement |
| Audio, Analytics, Playtester, Content Designer | Sonnet | medium | | |
| Programmer / builder | Sonnet | medium | Opus subagent | before committing to an approach; stuck twice on the same spot; before "done" |
| Researcher | Sonnet | medium | Opus | only to weigh conflicting findings |
| Reviewer subagents (code, ts, vue, db, silent-failure) | Sonnet | medium | | |
| Tester / gate thread | Sonnet | medium | Opus verdict | size L only |
| Evaluator, variant comparison | Sonnet | medium | Opus | size L gates, any pick between variants |
| Security, red team | Sonnet | high on money, auth, secrets | Opus | a finding the builder disputes |
| Legal, Marketer | Sonnet | medium | | |
| Reading jobs (files, PRs, logs, one web page) | Haiku | low | | prompt under 100k |
| Doc updates, status rows, lint fixes | Haiku | low | | |
| Handoff writing | Haiku or the thread itself | low | | never a new Opus call |
| Figure and scene pipeline | Sonnet renders and crops | medium | Opus diagnoses once | Fable never |
| Video and media edits, store and deploy workflows | Sonnet | medium | | |
| Video studio: Producer, Writer, Director, Sound, Editor, Motion | Sonnet | medium | Opus picks the concept and gives the Critic's verdict | |
| Social team: Lead, Scout, Community, Partnerships, Analyst | Sonnet | medium | Opus writes the weekly plan, ranks ideas and reads deal contracts | |

Fixed rules: effort medium is the default; high only where listed; max never unless yskills asks. Never switch a running thread's model (the cache is rewritten once, about $1 at 110k). Haiku reading jobs stay under 100k of prompt, because its price doubles above that.

Thread starts pass the full ids; agent files use the aliases `fable`, `opus`, `sonnet`, `haiku` (a `fable` agent falls back to Opus by the line above); built-in
subagents get Sonnet through `CLAUDE_CODE_SUBAGENT_MODEL`. Every other file points here.

## Token budget

yskills hit most of a weekly limit in under a day (2026-10-18) and wants at least 4 days from it. One rule for every thread, project and chat, and the global setup:

Budget: Haiku (effort low) reads, lists, checks files, polls CI and does simple edits; Sonnet builds and reviews; Opus only for a size L verdict or a decision with no clear default, never for an S or M gate; Fable is the escalation step: only when the coordinator names it in the brief, for a thread stuck twice on the same problem or a critical task (launch, money, data loss, a decision with no default). An S or M gate is one Sonnet review round plus CI, a second round only for a real bug, max two fix rounds, then stop and report. Max two working threads at a time. Nothing beyond the ask: no extra research or screenshots. Reuse before research: first read the existing report, role or skill for that kind of work (`research/`, `roles/`) and research only what is new; a thread that solves a new kind of task leaves a short playbook or template in its one home so the next one follows it. The coordinator keeps briefs short and rewrites memory only at milestones.

Why calls, not threads, cost the most (measured 2026-10-18; the breakdown is `claude-setup/audit/2026-10-18-token-start-cost.md` in the claude.ai project's shared files, not in this repo): a fresh project thread starts at about 114k tokens, only about 10k of it from this repo, and every call re-reads all of it. So batch independent calls in one turn, read several files with one command or one Haiku reader, name in the brief the one file a role must read, and use an Agent subagent (it starts small) instead of a new project thread for a bounded check.

Cache-read price per M tokens (2026-10-17, architect report): Fable $0.25, Opus $0.20, Sonnet $0.10, Haiku $0.01 up to 100k and $0.05 above, so a Haiku reader stays under 100k and a Fable read costs 1.25x Opus, not 2.2x. Cloud promo credit ($100 Pro, $250 Max, expires 2026-11-04; found 2026-10-04): it covers only plain claude.ai/code sessions, never Projects, Routines or Remote Control, so every project thread spends the plan's 5-hour and weekly limits; never tell yskills the credit keeps project threads going.

## The 5/5 gate

Five pass/fail checks by agents that didn't write the code: CI, evaluator on the preview, fresh
code review, security + red team, design + legal. At 5/5 the gate merges (author thread for S and M, gate thread for L), claude-setup
included. The rules, probe mode and the two-failed-rounds summary: `operator` skill, `gate.md`.

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
