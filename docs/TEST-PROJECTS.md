# Test projects

Three test projects, each run through the whole `operator` flow end to end to find what breaks,
and each built to earn so the money path gets tested too. Test 3 tests demand itself: whether
strangers sign up before anything is built. What they teach goes back into this
repo; then the next one starts.

| # | Project | Shape | What it proves |
|---|---|---|---|
| 1 | **duo-test**, the language-learning app (existing repo), finished end to end | the operator taking over an existing app, slices | Briefs, Workers Builds previews, the evaluator, the 5/5 gate ending in the gate thread's merge, logins and D1 with `security-reviewer` and `red-team`, the `sell` kit in Stripe sandbox, the `legal` team, a migration PR flagged as important |
| 2 | **Kleingarten**, a Roblox game (`yverse-studio/kleingarten`, private) | three slices, 2026-10-07, merged at 5/5 | A build thread in the cloud (Luau, Lune tests, Rojo) plus play and screenshots through Studio's MCP server on the PC, Robux receipts, Creator Hub steps only yskills can do (icon, thumbnails, listing, go public) |
| 3 | **A journal app probe** (new repo) | the probe slice only, then build or kill | The probe step: offer, price, waitlist (no pre-orders yet), one channel for 14 days against a go number fixed in advance, the kill/change card, probe-mode gate. On go: the `store` path up to a TestFlight build and Google's closed test, recruited from the waitlist |
| HQ | **Claude Setup HQ game** (then in this repo, since 2026-10-07 in yverse-studio/company-xy), run between 1 and 2 | an Architect plan, six slices in one file, one fresh thread each, auto-run | Auto-run with no taps, an architect plan, Opus and Sonnet slice threads, the office reading real team state, real money from duo-test's `/api/stats`, the New project tap from a page into the project chat |

## Rules for a test run

- yskills sends the idea and answers the one brainstorm batch and the three briefs when they
  want to change course; the gate merges at 5/5 (a tap only when Claude Code's safety check
  blocks a claude-setup merge). Every other touch is a finding.
- The operator logs in `PROGRESS.md`: each thread, its model, its cost, gate rounds and why they
  failed.
- Payments stay in sandbox or test mode until yskills decides a test project goes live for real.
  Forms store submissions instead of sending mail.
- Every test meant to earn fixes its go number in `PLAN.md` before the probe starts and logs
  whether it hit it. 30/60/90-day targets are set too, but only checked for a test that launches
  and runs the weekly routine.
- Only the first test that launches runs the weekly routine, for two weeks; every trigger a test created is deleted when
  it ends.

## After each run

1. One PR to claude-setup titled `fix(setup): lessons from test project <n>`: every finding
   becomes a rule, a skill line, a template fix, a test or a check, the smallest that would have
   prevented it.
2. A line in the table below.
3. The next test project starts only after that PR is merged.

| # | Date | Touches outside briefs | Gate rounds | Cost (USD) | Lessons PR |
|---|---|---|---|---|---|
| 1 duo-test | 2026-10-05 to 10-06 | 6 (design cards, a typed ok, 3 key-card rounds, "merge everything", Build settings, the live test that found bugs) | #21: 2, #20 and #22: none on a preview | 38.04 | [lessons-1.md](https://claude.ai/code/project/chan_01XKnLb2nhGBYoEt3HNp26NS) (project files `test-runs/lessons-1.md`), folded in over #23 to #28 and this PR |
| HQ game | 2026-10-06 | 3 (a pause "only burning my money", the rejected cube animals, "merge everything, skip everything") | one per PR, #31 redid the animals after yskills' taste call | about 30 to 50 (the estimate held, one slice at a time) | #37 |
| 2 Kleingarten (Roblox) | 2026-10-07 | slices 1 to 3 merged at 5/5; a stalled hand-back cost six hours once | see PRs in `yverse-studio/kleingarten` | not recorded | lessons in `roles/programmer.md` |
| Sofa-Shop (`yverse-studio/workflow-tests`) | 2026-10-08 | 3 ("alles hässlich", the missing team, the missing screenshots) | none, built as Artifacts | not recorded | `LESSONS.md` in workflow-tests; vote rule in CLAUDE.md |
| 3 Journal probe | | | | | |

## HQ game run (2026-10-06, PRs 29 to 36)

Not a numbered test, but the first run of the setup under auto-run and with an Architect plan
([PLAN.md](https://claude.ai/code/project/chan_01XKnLb2nhGBYoEt3HNp26NS), project files
`hq-game/PLAN.md`). Six slices: CEO room, team animals, money feed, game loop, New project tap,
design polish; Opus for the ones with design or judgement, Sonnet for data wiring and the game
rules. What it taught, and where it now lives:

- A thread kept building after yskills' pause, and another argued to keep the Kenney cube animals
  yskills had rejected. Pauses and taste calls are final and go into every brief (`operator`
  SKILL.md, Project Manager, Programmer and Designer playbooks, CLAUDE.md).
- The money feed went live summing rows the webhook had never stored and showed 0 € for 28 € of
  test payments. A revenue source is verified against known payments before a UI reads it
  (`operator` §3, Programmer playbook).
- Six slices edited one `dashboard.html`. The gate pulls main before every merge (`gate.md`).
- The coordinator has no db tools, so the HQ refresher writes `config/coordinator` and relays pending
  `requests` rows on every run (company-xy `hq-refresh.md`); other threads skip that chore.
- Auto-run: cards take the recommended option at once, the gate merges at 5/5 after a real
  preview test and review, the coordinator posts results and blockers only (`operator`, `gate.md`,
  `briefs.md`, CLAUDE.md, `docs/WORKFLOW.md`).
- Design: copy real life first, then make it better; state-of-the-art quality; cute cartoon or
  pixel taste (CLAUDE.md UI, Designer playbook).
- Brainstorm first for every new project, a typed idea and an HQ request alike (`operator`,
  Project Manager playbook).
- Model routing: the Models line in `docs/WORKFLOW.md`.

duo-test stays web-only in test 1; its App Store and Google Play release (`store` skill) is a
slice after test 1, once test 3 has proven the store path or the web version earns.

Test 2 ran as Kleingarten (Roblox), not a Three.js game; its lessons are in the Programmer, Tester and Designer playbooks and `game-3d`. A Three.js web game is optional later.

## Then

The first real project. Every project reports status, revenue, spend and its own key numbers
into its HQ rows, the one dashboard over all apps (`docs/hq-rows.md`); the operator reads them weekly
and turns the best next step into a slice.
