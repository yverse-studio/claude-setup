# The run (operator §4)

Each step names the kinds it applies to; the kit row in [`docs/MAP.md`](../../../docs/MAP.md) (Kits) says which run for a kind.

The Project Manager's steps from brainstorm to launch and after. Read at project start and
before each step; builder, gate and fix threads read their `roles/<role>.md` instead.

1. **Brainstorm.** (all kinds) Open with your own take: what you would build, what worries you, one or two ideas yskills did not ask for, then challenge their answers with reasons. One batch of tap cards: the idea's open questions, `sell`'s money questions if
   it sells, the Impressum data (name, postal address, email, second channel) if it is public,
   and a **design card**: "Send pictures, screenshots or links of apps and sites you like (or
   hate) for this, one line each on why." Linked sites are shot with `ui-review` and saved with
   the pictures in `design/refs/`; the lines go into `design/DESIGN.md`.
2. **Research** (site, app, game, story; a fix skips it), parallel subagents, one page each. The Researcher writes `research/RESEARCH.md` from [`templates/research.md`](templates/research.md) before `PLAN.md`, by the method in [`roles/researcher.md`](roles/researcher.md) (Method); a bug fix skips it:
   - **Inside:** our skills and catalog, the lessons in claude-setup's `docs/TEST-PROJECTS.md`,
     yskills' repos with code to reuse.
   - **Outside:** competitors and prices, how the best similar products and open-source projects
     are built.
   - **Tools and skills:** the `toolbox` skill, per capability the idea needs. Its `find.mjs`
     searches the installed plugin marketplaces, the ECC skills and skills.sh; `SearchPlugins`,
     `SearchSkills` and `SearchMcpRegistry` search the Anthropic Directory (Figma, Canva, legal
     plugins...). Every pick from outside the official marketplace is read before it is used.
     Picks go into `PLAN.md`; the scaffold adds them to this project only.
   - **Demand probe** (if it should earn; the `product-lens` skill, Mode 1): one page,
     `docs/demand-probe.md`, before any repo or build slice: who pays (one specific person),
     where they are (the channel the probe will use), three signals checked with WebSearch (people
     already pay for this, people complain about the gap, a competitor's price), and a go or
     no-go. No-go → brief (a) recommends no or a smaller first version. This shows that others
     earn, not that yskills can find buyers; the probe slice (step 5) tests that.
   - **Legal:** the `legal` skill's table for this idea.
3. **Plan.** (site, app, game, story) The research's open questions go to yskills as ONE batch of cards, posted by the Project Manager together with the Designer's vote card of 2-3 example looks (screenshots) copied from the category leaders, before the plan. `planner` proposes; the operator writes `PLAN.md` and `features.json`. **Brief (a).**
   No task for yskills: the operator deploys the day-zero site in one shot
   ([`docs/USING.md`](../../../docs/USING.md), Deploy a page in one shot) before the scaffold.
   **Day one in HQ** (the same hour as brief (a), one `ArtifactData` batch, every row with `at`, as
   `docs/hq-rows.md` says): the `projects/<id>` row (`state` active, `revenueMode` test, traction
   fields 0, `firstEuroBy` = PLAN.md's go date), the `<id>-` phases and `team` rows, a `work/<session>`
   row for every thread started (phase, agents, `at`), and, if the project should earn, the **first
   euro list** as `you[]` with `firstSeen` = now: Gewerbe (link: the Gewerbeamt's online form for
   yskills' town, found with WebSearch, never guessed), tax registration (https://www.elster.de),
   Stripe live (https://dashboard.stripe.com/account/onboarding), Impressum data (the repo file that holds it,
   as a GitHub link) and mail for the order confirmation. Each `what` is one German sentence with a
   verb; steps are ticked off by deleting the entry. Nothing waits for them except the live key.
   **Cross-project reach.** A project chat starts its own threads (`start_thread_session`) and
   messages another project's chat by session id (`send_message`, id from that project's
   `config/coordinator` row, `{session, at}`). No tool probe up front: the first failed call says
   the same, and then the threads fall back to the coordinator relay (§ Starting threads).
4. **Scaffold + design.** (site, app, game, story) Scaffold thread: "Scaffold PLAN.md's app on branch `scaffold` with
   the `scaffold` skill (its file list, in order). Open a PR, don't merge." Its gate is CI only. The design team shoots 2-3
   directions. **Brief (b)** carries the design pick only: the deploy exists since the workflow. The gate
   merges the scaffold PR at 5/5 like any other (its branch has a Preview URL from the start). Building starts once
   brief (b) is answered.

   **Keys and accounts just in time.** Every other key or account is asked for by a **key card**
   (`briefs.md`) at the moment the next slice needs it ("you want payments: add a Stripe key
   here"), one card per slice, never a list up front. The slice builds what it can without the
   key (tests use fakes) and waits only for the step that needs it. Exception, **lead time**:
   anything with a wait (identity checks, Google's 14-day test, domain verification) gets its
   card as soon as PLAN.md knows it is needed, so the clock runs during the build. The card's
   steps come from the skill that owns the key (`sell` `keys.md`, `store` §1, `publish`,
   `toolbox` picks). Keys go into the service's own settings page, never into chat or git.
5. **Build.** (site, app, game, story, setup; video, social: see their skill) A pick between variants follows [`roles/designer.md`](roles/designer.md) (variants). One builder thread per slice: one at a time, the next in a fresh
   thread once the previous one is merged; a second only when the slices share no file; never more than three: "Build
   slice <id> of PLAN.md;
   its criteria are in features.json (read only). Read PLAN.md, PROGRESS.md and CLAUDE.md first. Do not read: node_modules, build output, lockfiles, generated files, screenshots, other slices' code, HANDOFF files of old threads; `grep` first, read only the part you need.
   Tests first, then code, then ship-check. Push branch `slice/<id>`, open a PR with phone and
   desktop screenshots and a 3-line progress note. Don't merge; keep fixing CI and the review
   findings on the PR until it is merged. Pull main into the branch right before the gate merges
   (other slices may edit the same file). yskills' pauses and taste calls are final: a 'stop'
   stops you mid-step, a rejected asset or look is replaced, not defended. Write HQ's
   `work/<your session>` row when you start and when you end (`docs/hq-rows.md`, Work board)." The first
   slice also commits the D1 ids from
   `PROGRESS.md`. The operator copies each note and the thread's cost (`get_session`,
   `external_metadata.usage.cost_usd`) into `PROGRESS.md`.

   **A game slice that changes play** gets a fresh `Playtester · <game>` thread on its Preview once CI is green and before the gate: [`roles/playtester.md`](roles/playtester.md) plays it and commits `design/playtests/<date>-<sha>.md`; the game's CI step `playtest-check.mjs` fails the PR without it. An older game copies `scripts/playtest-check.mjs` and the CI step from `publish/templates/new-project/.github/workflows/ci.yml`.

   **Probe first** (anything meant to earn). Slice `probe` is built and merged alone, before
   every other slice: a landing page that names the offer and the price, a waitlist with
   double opt-in (no pre-orders: `sell` has no pre-order flow yet), Impressum and Datenschutz,
   and UTM-tagged visits. Once it is live, the marketing team pushes it in the plan's channel
   for the probe period (default 7 days: the money goal leaves no room for 14). PLAN.md fixes the go number before the probe starts
   (default: 100 confirmed waitlist signups). Met: the other slices start, nothing to
   ask. Missed: one tap card to yskills with the numbers: **kill** (archive, lessons into
   claude-setup), **change** (one new offer or channel, one more probe) or **build anyway**.
   Never move the go number after the probe started. A small site meant to earn is its own
   probe; one not meant to earn skips it.
6. **Gate.** (all kinds) A gate per PR (size S and M in the author thread, L a fresh gate thread) runs `gate.md` and either posts the 5/5 table and merges
   the PR (after pulling main into the branch when another PR merged since) or one review with
   the blocking findings, which the builder fixes. Two failed rounds: `gate.md` (Rounds).
   **The whole journey, once.** After the last slice merges, one `evaluator` run walks the full
   first visit on live (or main's preview) along the journey criteria in `features.json` (one
   criterion per user journey that crosses slices) before yskills hears "ready to test". Test run
   1's slices each passed and broke at their seams.
7. **Launch.** (site, app, game; story at release) The last PR gets the full `red-team` and `legal-reviewer` pass. **Brief (c)** is
   posted, and the gate merges at 5/5, which goes live (auto-run: launch included); live keys
   are the one thing on it that waits for yskills' hands. Then `sell`'s go-live (§4) if it sells.
   **The loop is wired before launch** (`docs/LOOP.md`): the app stores its errors and feedback
   and lists them in its owner report, `loop.yml` files them as `loop` issues, the daily reader
   routine exists; `features.json`'s `loop-1` to `loop-4` are part of the last PR's check 2. No loop,
   no launch.
8. **Grow.** (site, app, game; social: its weekly routine) At launch `create_trigger` a weekly routine (fresh session, jittered time): it
   collects the numbers (`market` §5) and opens one PR with the week's `metrics/` file and the best
   next step as a slice in `features.json`. That PR is the weekly report; it gets the gate with
   checks 2-5 n/a, and its merge is the go for the next slice. `PLAN.md` fixes 30/60/90-day
   targets before launch (defaults: 100 signups, 10 paying, €100 revenue in total); the routine copies them
   into each `metrics/` file. A missed target sends one tap card: **kill** (stop the routine,
   archive, lessons into claude-setup), **change** (one new offer or channel, next target in 30
   days) or **keep** (one line why). Targets never move to make a miss pass.
   **Errors and feedback fix themselves, through the gate** (`docs/LOOP.md`): the app's own
   report lands as `loop` issues every morning (`templates/loop/`), the daily reader routine
   sends the coordinator the list, and the coordinator starts one `Programmer · fix #n` thread per
   error (its failing test first) and decides each feedback batch (slice, answer or closed with
   one line why). Checkout, Stripe, webhook and login errors and a red live check are
   `loop:urgent` and go first. PostHog joins as a second source only when a project needs replay
   or funnels.
9. **Learn.** (all kinds) Every correction, every gate round that failed for a catchable reason, every test
   project lesson passes the lessons step (`docs/WORKFLOW.md`, Learning) and lands as a rule,
   skill line, test or check in claude-setup, in a small PR. At the
   project's end (or a kill), each role that worked adds one dated line per lesson to its
   `roles/<role>.md` (project, type, what to do differently, which tools it needed), so the next
   project of the same kind starts with them.

**Hand-over to another project.** A coordinator can't see other projects and project files
don't cross over, so a hand-over travels through the target project's repo. Before the source
thread resolves, its `HANDOFF.md` lists every artifact, not only code: notes, plans, TASTE lines,
reference pictures, screenshots, generated assets (or the script that rebuilds them), artifact
links and open asks, each with its path. All of it lands in the target repo in one PR (big or
paid assets go where that repo's README says, never git if the licence forbids it). If a safety
check refuses the copy, the thread asks yskills for the Allow in that thread once and does not
split or reword it (the heroine pictures were missed on 2026-10-07).

**Waiting on yskills:** write the state to `PROGRESS.md` before each brief. A project
conversation can continue later; a plain chat idle for over an hour hands off to a fresh session.
