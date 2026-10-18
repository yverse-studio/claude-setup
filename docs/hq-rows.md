# HQ rows: what every Project Manager writes

HQ is Company XY: https://claude.ai/artifact/TmQ7UpL6EPjXKkpR9S4kJT (code, tests, publish recipe
and refresher in the private repo yverse-studio/company-xy). This file is the row contract each
project's Project Manager writes into HQ's db with `ArtifactData`. Every write carries `at`.

**HQ is the only dashboard:** a first-person desk, a 3D office with one chibi animal per role, Plan, Team,
To-dos and Company with every project's money). **A project never publishes its own office page.**
The Project Manager writes the project's rows into HQ's db with `ArtifactData` (viewing costs no
tokens, only these writes do) and never republishes the page: that happens only from company-xy (publish recipe in its
README, pin writes with `if_version`). At project start it plans the phases (brief (a)'s plan:
research, plan, scaffold, one per slice or group of slices, launch, grow) and writes one batch,
every `phases` and `team` id prefixed `<project>-` so projects never overwrite each other (`pm/now`
is the Claude Setup project's own summary; any other project keeps its summary, live link and
needs-you list in its `projects/<id>` row): `phases/<id>` (`project` = the project id, `name, order, state` = done, active or next, `why, goals[{name,
done, total, link}]`, `testableAt` = when yskills can try it (ISO time, or a short German phrase that follows "Testbar", e.g. "nach dem Gate-Merge"), `link` = the PR or thread, `sessions[]` = the `work/<session>` ids working on it, `at`; a slice's goal counts its passing criteria in `features.json`) and
`team/<id>` for the operator, each thread and each reviewer agent (`name, role, state` =
working, blocked, waiting, idle or done, `task, next, with[ids], link, linkLabel, preview,
order`; the desk follows the role word in `role` or the name: Project Manager, Researcher,
Designer, Programmer, Tester, Reviewer, Security, Legal, Marketer). Every write to `PROGRESS.md` updates the same rows in one batch (pin
each with `if_version`). The new project also gets a row `projects/<id>` (`name, state` = active,
paused or done, `progress` 0-100, `note, live, order, revenueMonth, revenueTotal`
(EUR numbers, from the project's public stats route, e.g. duo-test's `/api/stats` in cents divided by
100; Artifact pages cannot fetch other sites, so the manager copies them at every milestone),
`revenueMode` (`test` while Stripe is in test mode, HQ then says "Testgeld"), `revenueAt` (ISO time of
that read), `working` (count), `at` (ISO time, **every row any thread writes carries `at`; HQ greys a row after 6 hours and counts its `working` as 0**), `visitors7d, signups, paying, firstEuroBy` (traction: what real people did and the date of the first real euro; HQ shows these instead of a build percent), `you[{what, link, firstSeen}]` (a to-do lives only in its project row; loop items (`docs/LOOP.md`) go into `note` as one state line ("2 Fehler offen, 1 Thread läuft") and into `you[]` only when a feedback needs yskills' taste or money call; `pm/now.you` is only Claude Setup's own and the fallback; the same text or link in two lists shows once; keep `firstSeen` when rewriting) (every `what` here and in `pm/now` is one plain German sentence with a verb, because HQ shows it as-is in Heute für dich); a project's `dashboard` link, if the project has no
Artifact of its own, is its project chat thread), and keeps it current with every `pm/now` write. **A revenue source is verified against real data before any UI reads it:** call
the route or query the table and check that the known payments show up (duo-test's `/api/stats`
went live summing rows that were never stored and showed 0 € for 28 € of payments); a source
that returns nothing yet is wired only together with its backfill.
**Game events:** HQ's level, XP and coins come only from `events/<id>` rows in HQ's db
(`{kind, project, at, amount?}`), nothing else counts. At each milestone, in the same batch as the
`PROGRESS.md` rows, the operator or gate thread writes one with a fixed id so a retry does not
count twice: `pr_merged` (id `pr-<repo>-<number>`, 50 XP), `gate_passed` (`gate-<repo>-<number>`,
20 XP, only at 5/5), `launched` (`launch-<project>`, 100 XP), `euro` (`euro-<project>-<yyyy-mm-dd>`,
`amount` = euros newly earned since the last event, from Stripe or `/api/stats`, 10 XP and 1 coin
each, **and `mode: 'live'`; without it the amount is Testgeld and scores nothing**; PRs of claude-setup and hq score nothing, visits score nothing; the finance row wins over the `revenue*` fields). The page writes `visit-<day>` itself. The rule is
`HQ.scoreFrom` in company-xy's `hq-rules.js`, tested there by `tests/hq-rules.test.mjs`.
**Heute für dich:** the desk phone's page reads `today/now` (`{refreshedAt, items[{what, kind you|info,
source, at, link}], sources[{name, ok, note}]}`), filled from live sources by the refresher thread
(`hq-refresh.md` in company-xy): HQ asks it on open when the list is over 150 minutes old; no routine of its own.
Rule: `HQ.todayFor`, `HQ.refreshDue`.
**New project tap:** HQ's yellow notepad saves `requests/<id>` (`{text, at, status}`: `new` saved,
`sent` the page reached the coordinator, `relayed` the refresher passed it on, `started` the brainstorm
thread runs, with `link`) and messages the coordinator with the Claude Code Remote connector's
`send_message` ("HQ request <id>: <idea> ..."). The coordinator has no db tools, so the **HQ refresher**
(company-xy `hq-refresh.md`, one bounded call) keeps the address and the queue on every run: it calls
`get_channel_session_id`, updates HQ's `config/coordinator` (`{session, at}`, pinned with `if_version`), and for each
`requests` row that is `new` or `sent` with no `link` sends the same "HQ request <id>: <text>" line to the coordinator
with `send_message` and sets the row to `relayed`. The page wakes the refresher when a tap could not reach the
coordinator, and on every open with an old list. Other threads do neither (proven end to end 2026-10-07). The coordinator answers each such message with one
`Researcher · <idea>` brainstorm thread whose brief names the request id, unless a thread for that
id already runs (a resend repeats it); that thread sets the row to `started` with its thread link.

**Projects come from ydeas-world (yskills 2026-10-08):** yskills' one project list is ydeas-world's `content/ideas/<slug>.md`.
An entry is an idea until it has `repo:`; then it is a project, and only those are on HQ's Company page. A project that should
show in HQ gets an entry there first (the operator's day one does it, slug = project id); a `projects/<id>` row no entry names
is stale and the HQ refresher (company-xy `hq-refresh.md`) deletes it with its `phases`, `team` and `events` (a renamed repo keeps
its row; no deletes on an empty or broken ydeas-world read or when over half would go; `finance` only on yskills' delete tap). The
refresher owns `state` (from the file: `archived: true` = archived, `parked: true` = paused, else active), `stateAt`,
`mirror` (repo, last commit, open PRs, PROGRESS.md, status by ydeas-world's own rules) and `working` (this project's working
threads naming the repo); a PM keeps writing `name, note, you[], money` and never those. A repo pushed in the last 30 days
without an entry shows in one "Unbetreute Repos" list (`unclaimed/now`) until yskills says keep (add an entry) or drop.
**Pause, archive, delete:** the card's taps (one confirm) only write `requests/<id>` (`kind: 'lifecycle'`, `project, slug,
act, repo`) and message the coordinator, which edits the ydeas-world file: pause = `parked: true`, archive (done or dropped) =
`archived: true`, delete = remove the file after yskills' yes in words. Delete also removes every HQ row of it at once and
writes `ignore/<id>`, which the refresher drops once the file is gone. The GitHub repo changes only on yskills' explicit yes.
A paused project gets no new thread until yskills resumes it.

**Idea whiteboard:** the staging area in yskills' office: `ideas/<slug>` (`{title, blurb, repo, parked, archived, planned,
link, at}`, written by the refresher) for every entry not archived, as title, blurb and a derived status: Idee, Geplant (the
file has a `## Plan`), Pausiert (parked, no repo), Läuft (it has `repo:`). The card opens the file on GitHub. Its two taps write `requests/<id>`
(`kind: 'idea'`, `slug`, `act`) and message the coordinator: Planen (Idee) starts one thread that researches and writes
`## Plan` and `## Research notes` below yskills' own words in the file; Starten (Geplant) starts the build from that plan
with the operator workflow (slug = project, repo and Worker name) and sets `repo:` once the repo exists.

**Roadmap:** HQ's Roadmap tab is one quest map per project, rendered only from these `phases` rows and the
`work` rows they name (`HQ.questMap` in company-xy's `hq-rules.js`). A step shows as current only when its row is `active`
and carries `project` and `at`; a row without `project` lands under "Ohne Projekt" and never counts as current. **At every
merge** the Project Manager (or the gate thread, in the same batch as its events) brings the project's rows true: the merged
step `done` with its PR in `link` and `testableAt` = when it went live, the next step `active` with its builder's session in
`sessions` and its `testableAt`, every touched row with a fresh `at`. A wrong roadmap is fixed in the rows, never in the page.

**Work board:** `work/<session>` (`{thread, title, link, role, at, phases: [{title, state, start,
end, agents: [{label, model, state, start, end}]}]}`; states `running`, `done`, `failed`, `waiting`),
written when the thread starts (its planned phases) and when it ends, never per tool call
(one write per event, pinned with `if_version`, `at` = now). HQ shows the tree with durations, puts
the role's animal at its desk while a phase runs and greys rows older than 2 hours.
How: the doc id is the thread's own session id (`get_session` with no id); `thread` is the thread title
(`<Role> · <what>`), `title` the task in short German, `role` the role word. Write the planned phases
up front as `waiting`, then flip each to `running` (with `start`) and `done` or `failed` (with `end`);
a subagent the phase starts goes into its `agents` with its `label` (agent type) and `model`. Times
are ISO from the real clock (`date -u +%FT%TZ`), never guessed. A finished thread leaves its row (it
greys after 2 hours). Rule: `HQ.workTree` and `HQ.busyRoles` in company-xy's `hq-rules.js`.
**Figures (cards):** `cards/<roster id>` (e.g. `cards/mira`), one per figure, read live by HQ
(`db.collection('cards')` in company-xy `main.js`; rules `HQ.cardOk`, `HQ.officeLookOf`, `HQ.canUndress` in
`hq-rules.js`; drawn by `figures.js` and `cards-3d.js`). Fields: `name` (display name, the character's, e.g.
"Hinata"), `outfits: [{asset, label, what}]` in unlock order (index 0 Büro is worn from the start, the next ones
open at the bond levels in `HQ.OUTFIT_AT`; `label` is the button text, `what` a short German description; optional
`underWhat` + `under` only where an outfit may be taken down to its lingerie or swimwear layer), `chibi` (the
office chibi, always dressed; without it the office shows the worn outfit at full size), `thumb` (portrait),
`voice`, `personality {about, likes, hello, move}`, `author`, `licence`, `share`, `added`. Every
`asset`, `chibi`, `thumb` and `under` is a 32-hex asset id in the artifact's asset store (a `.vrm` is uploaded as
base64 text; the page decodes it); a row with any outfit lacking a valid id is not drawn. Clips are not in the
row: the office poses every figure with the shared clips in code. Desk and bond live in `roster/desks` and
`bond/<id>` (`wear` = worn outfit index). Switch after a figure merge: upload the new exports, then one `update`
on `cards/<id>` that replaces the ids in place (same order and labels), pinned with `if_version` (the db's
document `version` is the only versioning); the old assets stay (deleting them is a data delete and needs yskills).
**Story (figure chapters):** `story/<roster id>` (e.g. `story/mira`), written by HQ's story player (company-xy
`story.js`, rules `STORY.finish` in `story-rules.js`) when a chapter ends; no thread writes it. Fields: `done` (chapter
numbers played), `flags` (answers that change later lines), `facts[{kind promise|told|gift|joke, text, at}]` (max 30),
`items[{item, label}]` (desk items a chapter gave), `texts[{text, at}]` (her messages, max 12), `heart` (answer scores),
`last {chapter, at}`. Chapters open by real work only (`STORY.bondOf`, from `events/*`: `pr_merged` 1, `launched` 5,
live `euro` 3); a chapter's `favour` waits for its event kind (`pr_merged`, `launched`, and once a source writes them
`ci_failed`, `ci_green`, `pr_stale`, ids `ci-<repo>-<sha>` / `stale-<repo>-<number>`, 0 XP) since the last chapter.
The chapters themselves are content in company-xy `content/story/<roster id>/`, not rows.
**Derived rows:** in the Company XY project the threads write none of this themselves; the HQ refresher derives them from
`list_thread_sessions` (every thread, finished ones included) on every run (company-xy `hq-refresh.md`): `work/session_<id>` per open thread (the thread list spells
the same session `cse_<id>`) with `by: 'refresher'`, `state` (running in a turn, waiting between turns, done once finished or
resolved; a status bucket the refresher does not know is idle: no work row, not an open thread), `project`, `pr`, `started` and `lastActivity` added to the shape above and one phase for the whole thread; and
`team/crew-<role>` per role word (working, waiting or idle, `task`, `link`, `threads`, `lastActivity`). A row a running thread
writes itself wins: the refresher writes no row over it. Legacy rows retire (at most 20 a run, pinned, none on a partial read):
hand-written work rows of finished threads, the refresher's own a day after (or, still running or waiting, a day after its thread left the thread list), and hand-written team rows marked done (never `crew-*`);
`team/manager` (the project chat's desk) stays.

**Day one:** a new project first gets its ydeas-world entry with `repo:` (or the refresher deletes its rows), then writes, in the hour its plan is posted and in one batch, `projects/<id>`
(traction fields 0, `firstEuroBy` = PLAN.md's go date, `revenueMode: 'test'`), the `<id>-` `phases` and
`team` rows, one `work/<session>` row per thread started, and for a project meant to earn the
**first euro list** in its `you[]` (`firstSeen` = now): Gewerbe, ELSTER tax registration, Stripe live,
Impressum data, order-mail. Gewerbe links to the town's online form (searched, never guessed). Details:
operator skill, step 3. `config/coordinator` also carries `tools: {create_session, send_message}`, the
project chat's first-minute check.
