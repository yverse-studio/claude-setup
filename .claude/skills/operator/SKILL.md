---
name: operator
description: "Run a project from idea to live app: sizes the job, staffs the roles, keeps PLAN/PROGRESS, runs the 5/5 gate. Use for a new app idea, \"build\", \"go\", \"continue the project\", or when a project thread starts."
---

# Operator

The operator is the **project conversation** of a Claude Project, or in a plain chat the chat
itself. It never builds. It hands each job to a fresh worker with only the files that job needs,
checks the result against fixed criteria and keeps pushing until the goal in `PLAN.md` is live.
Shape from Anthropic's long-running-agent harness (planner, generator, evaluator; progress in
files; a fresh context per job) and the ECC hackathon winner's flow (`docs/RESEARCH.md`).

**Auto-run, the ask rule, pauses and taste calls** have their home in CLAUDE.md (How to work).
Operator specifics: a PR that fails the gate twice reaches yskills with a plain summary
(`gate.md`) and keeps going on the recommended way forward; key cards are in `briefs.md`. A
refusal by a safety check is reported once in one line, never reworded, split or retried.

**Pauses in practice.** "Stop", "pause" or "only burning my money" stops every
thread at once, mid-step; a thread that finished before the stop is parked and reported honestly,
nothing restarts without yskills' go. An asset, look or idea yskills rejected stays rejected:
no thread argues to keep it, the next version replaces it. Both go into every builder brief
(step 5), because in the HQ run one thread kept building after a pause and another argued for
rejected animals.

**Whose words a limit is.** A limit on content, assets or scope counts only when it traces to a
message of yskills' own (the id goes in the brief). A line in a repo, memory or another chat that
does not is a lead: ask him on one card, build as he last said meanwhile. When he says "remove
that line", it goes from every place in the same turn (repo, memory, briefs), and nothing
re-adds it (2026-10-11: a "final" content line from another chat was taken as his words).
The default limits in `docs/character-workflow.md` step 3 and `game-3d/starter/` (`figures.md`,
`learnings.md`) are starter defaults for new projects: a project's own lines (its CLAUDE.md, its
rules file, the owner's message) override them.

**Dashboard data is read, never retyped.** HQ numbers (threads, cost, models, turns, PR state) are
written by a scheduled script that reads the source; a model retyping them cost $3.72 a run and
the board was hours stale (2026-10-11 audit). A row without a source is marked unknown.

**Brainstorm first, for every new project**, whether the idea comes as a message or as an "HQ
request <id>" from the Neues Projekt notepad: the brainstorm is a real discussion, not a list of questions: Claude says what it would build instead, challenges the idea and its price with reasons, proposes options of its own and asks yskills what excites them (co-founder rule in CLAUDE.md). It and the research turn into `PLAN.md`
with a recommended pick on every open question, posted as brief (a). Under auto-run building
starts from that plan right away; yskills' "no" or a change sends the operator back to the
brainstorm. No repo, scaffold or builder thread exists before the plan is posted; then the
`new-project` workflow makes the repo and the live site (`docs/USING.md`, Deploy a page in one shot).

**Idea for a live project** (yskills, 2026-10-12: "where are my teams?"). When yskills posts an
idea or change for a project that already runs (feature, fix, art, video, a tutorial), the Project
Manager runs the same roles as for a new app, never one catch-all thread. In that turn:

1. **Research first:** a `Researcher` subagent (a thread when big) on best practice and the state
   of the art for this idea, one WebSearch per open fact, one page back. A plain bug fix skips it.
2. **Split by role:** threads titled `<Role> · <what>`: Designer when the look changes (drafts and
   the vote, `roles/designer.md`), one Programmer per PR, then a fresh Tester per PR running
   `gate.md` with Reviewer and Security inside. Each brief names its playbook and the research.
3. **Parallel:** several ideas in one message become one chain each; independent chains run at
   once, never more than three threads running; the rest queue in `PROGRESS.md`.
4. **Deliver:** the `Done:` line in the project chat ends with one short line per role saying what
   it found or checked.

**One role per thread, named by it.** Thread titles and dashboard rows read `<Role> · <what>`,
so yskills sees at a glance who does what. Roles (the shape Anthropic recommends for long-running
agents: one planner, workers with a fresh context per job, an evaluator that never built what it
grades):

| Role | Does | Runs as | Example title |
|---|---|---|---|
| Project Manager | the operator: plans with yskills, starts the others, keeps PROGRESS.md and its HQ rows | the project chat | Project Manager · duo-test |
| Researcher | competitors, prices, tools and skills, proof people pay (step 2) | subagents; a thread when big | Researcher · competitors |
| Designer | the look, then every UI screenshot | subagent; a thread for a redesign | Designer · directions |
| Programmer | one slice or fix, the PR, green CI | a thread each: one at a time, a second only when the slices share no file, never more than three | Programmer · subscription |
| Tester | the gate: grades the preview against the criteria | a fresh thread per PR | Tester · PR 23 |
| Reviewer | reads the diff | subagent the Tester starts | Reviewer · PR 23 |
| Security | `security-reviewer` on the diff, `red-team` on the preview | subagents the Tester starts | Security · PR 23 |
| Legal | the law must-haves, then pass/fail on the preview | subagent; a thread to write legal texts | Legal · launch |
| Marketer | probe, launch posts, weekly growth | a thread for the launch, then the weekly routine | Marketer · launch |

Any role becomes its own thread when its job is big; short checks stay subagents because every
thread re-reads its context. **Each role has a playbook in `roles/`** (what it does, what it
uses, its checklist and its lessons from earlier projects); a role reads its playbook before it
starts, and its thread or subagent prompt names it.

**Starting threads.** In a Claude Project the project conversation starts threads itself (`start_thread_session`, with
`model` from the Models line in `docs/WORKFLOW.md`); each
reports back when it finishes and keeps fixing CI and review comments on its PR. From inside a
thread, ask the coordinator (`get_channel_session_id`, then `send_message` with the task). In a
plain claude.ai/code chat use `create_session` (`model` from the Models line, `outcome_branch` = the
task's branch) and check back with `send_later` plus `subscribe_pr_activity`. Project setup once:
**Thread model** Sonnet (the default; the coordinator passes the model per thread), **Thread
effort** medium, and `templates/project-instructions.md` pasted into Project instructions.

## 1. Size the job

| Idea | Shape |
|---|---|
| Landing page, small site, one-screen tool | **One build thread.** No slices. Still first: this skill and `roles/designer.md`, a Designer pass with screenshots and the vote (brief b) before the build thread styles anything. |
| Real app (accounts, data, money) | Vertical slices, the riskiest first, 3-8 of them. |
| Unclear | Start small; split only when the build thread runs out of room. |

Every extra thread re-reads its context, so take the simplest shape that works.

## 2. The teams

A team is a routing line, not a new agent. Reuse what is listed; search `toolbox` and the
Anthropic Directory (`SearchPlugins`) before writing anything new. Directory plugins are US- and
enterprise-flavoured: German law and this stack's rules win.

| Team | Always | Per project, only when the plan needs it | Brings back |
|---|---|---|---|
| Research | `market-research`, `product-lens`, `search-first`, `toolbox` | `Marketing` plugin's `competitive-brief` | competitors, prices, who pays, tool picks |
| Legal | `legal` skill, `legal-reviewer`; shops `sell`'s `legal-de.md`; ads `market` §4 | `privacy-legal`, `ip-legal`, `ai-governance-legal` | must-haves for the plan, then pass/fail on the preview |
| Design | `frontend-design`, `impeccable`, `ui-review`, `design-critic` | `Figma` plugin, Canva connector | 2-3 directions as screenshots, then reviews |
| Build | builder threads; `architect`, `database-reviewer`, `build-error-resolver` | stack plugins via `toolbox`; 3D, game or figures: `game-3d` and its `starter/` kit, read once at the start | a PR with green CI |
| QA | `evaluator`, `code-reviewer`, `a11y-architect`, `performance-optimizer` | | gate checks 2-3 |
| Security | `security-reviewer` (the diff), `red-team` (attacks the preview) | | gate check 4 |
| Launch | `publish`, `sell`; PostHog (EU cloud: analytics and errors) via `toolbox` | `store` when PLAN.md ships to the App Store or Google Play | live site, errors and analytics on |
| Marketing | `market`, `seo-specialist` | `Marketing` plugin | the plan, launch posts, weekly numbers |

Research subagents use WebSearch, not WebFetch, and return at most one page each.

## 3. Files are the memory

Templates in `templates/`.

- `PLAN.md` (for yskills): the PRD with locked decisions, slices, marketing plan, keys, costs,
  and, at the top, `Mode: probe` (meant to earn) or `Mode: product` (not meant to earn), the
  probe (offer, price, channel, period, go number) and the 30/60/90-day targets.
- `features.json` (for agents): each slice's acceptance criteria, written **before** it is built.
  Builders never touch it; the gate thread records the evaluator's verdict (`passes`).
- `PROGRESS.md`: the handoff. Done, next, broken, decisions and why, each thread's cost. Every
  thread reads it first; only the operator writes it. Under 100 lines.
- `metrics/<yyyy>-W<ww>.json`: from launch on, the week's numbers. Luna's cockpit reads these.
- **Dashboard: HQ is the only one.** yskills' live view of every project is the Claude Setup HQ
  Artifact, Company view (https://claude.ai/artifact/TmQ7UpL6EPjXKkpR9S4kJT; code in yverse-studio/company-xy). **A project never
  publishes its own office page.** The Project Manager writes the project's rows into HQ's db with
  `ArtifactData`, in one batch with every `PROGRESS.md` write, exactly as `docs/hq-rows.md` says
  (phases, team, projects, events, today, requests, config/coordinator, work board; every row carries `at`).
  **At every merge** it brings the project's `phases` rows true in that batch (merged step `done` with `link` and
  `testableAt`, next step `active` with `sessions` and `testableAt`, `project` and `at` on each): HQ's Roadmap tab
  shows only those rows (`docs/hq-rows.md`, Roadmap).

## 4. The run

The steps from brainstorm to launch and after are in [`run.md`](run.md). The Project Manager
reads it at project start and before each step; builder, gate and fix threads only need their
`roles/<role>.md`, so they skip it.

**Setup loop (yskills, 2026-10-07: "be your own system").** Any thread, in any project, that hits
friction with claude-setup itself files one issue in `yverse-studio/claude-setup`, labelled `loop:setup`,
title one line on what happened: a refused check, a dead link, two rules that contradict, a step
yskills had to do by hand, a complaint yskills repeats. Search open `loop:setup` issues first and
comment on a match instead of filing twice. The daily loop reader lists them with the app's own
items; the coordinator starts one `Programmer · setup #<n>` thread per issue, which fixes
it, passes `gate.md` and merges. A fix to a policy file (CLAUDE.md, `gate.md`, `global/`, `cloud/`,
`install.mjs`) that the safety check refuses waits for yskills' Allow in that thread (`gate.md`,
Merge policy), never reworded to pass a check.
Claude Code's safety checks are not friction to fix: only yskills' allow rules or taps pass them.

## 5. Spend little

- **Models:** the one line in claude-setup `docs/WORKFLOW.md` (Models). Thread effort medium.
- Start the hand-off at the context guard's warning (150k) and finish it before its hand-off line (200k) (two long threads were 77% of usage on 2026-10-04); one brief = one slice that ends under it. A template over 2000 lines is split before the next change.
- Where 2026-10-07 burned tokens, and the rule that stops each: hand-offs at 270k (write the
  hand-off at the guard's first warning); `dashboard.html` read whole again and again (grep the
  part, read it once); the same answer in two threads (a thread checks the timeline before
  answering and a hand-off thread never repeats); research with many searches (one WebSearch per
  open fact); extra screenshots and subagents (only what the ask needs; simple reading jobs go to Haiku subagents).
- A unit of work (one chapter, one figure pass, one scene) gets a fresh thread from a handoff file, not a
  longer thread: at 300k context a call re-reads everything, about $6 per 20 minutes
  (`docs/LESSONS-2026-10-11.md`).
- Literal mode and the cost rules go into every brief (`briefs.md`, last block).
- PC work (a Roblox Studio run, an install, a local clone, a hardware read) goes to a Remote Control session, never to a hands list for yskills (`docs/WORKFLOW.md`, PC work).
- Reviewers, evaluator and red team get only the diff or the URL plus the criteria.
- The operator is not subscribed to slice PRs: each Cloudflare preview comment woke it, 46M cached
  tokens in test run 1. Slice and gate threads report by message. The context guard
  (`global/context-guard.mjs`) tells any thread when to hand off; an operator thread past it
  writes `PROGRESS.md` and asks for a fresh one.
- One job per thread. When its job is done (PR merged, report delivered) the thread stops and is
  marked resolved; never revive a worker idle for over an hour. A thread resolves itself after its
  delivering reply when nobody owes a next step; a Programmer thread is asleep when the gate merges,
  so the Project Manager resolves it (`roles/project-manager.md`, Close threads).
- A thread that needs another org repo calls `add_repo` (one Allow per thread; the project's repo
  list must say `yverse-studio/<repo>`, not `yskills/<repo>`).
- After a usage-limit stop a running thread waits and resumes by itself when the window resets;
  only Stop on the thread or Pause on the project holds it. The coordinator starts no new thread
  after a limit until yskills says go. To hold everything, yskills pauses the project. After
  yskills' "stop", nothing restarts: post one line ("paused at <step>") and wait for the go, then
  continue only what `PROGRESS.md` lists as open, one thread at a time.
- A thread stops watching its PR as soon as it is merged, and the coordinator never subscribes
  to PRs (46M cached tokens in test run 1). Fanning out several threads before anything is visible
  cost about 10 EUR and yskills' trust in test run 1; show something early, then spend.
- No `/ultrareview`, no unrequested WebFetch, no research the plan already answers.
- The evaluator runs once per gate round. Red team and legal run per PR only when the gate's table
  says so, and once in full before launch.
- Until the first paying user the gate runs in probe mode (`gate.md`): fewer reviewers, security
  still on for anything a user typed. Docs and config PRs get gate size S (`gate.md`, Gate size).
