# The 5/5 gate

A gate runs this on one PR: size S and M in the author thread, size L in a fresh gate thread (see Gate size); in a plain chat the operator, always with fresh subagents.
Five pass/fail checks, never a star score: judges grade their own team's work too kindly, so each
check is a hard yes or no from someone who didn't write the code.

| # | Check | Who | Gets only | Applies |
|---|---|---|---|---|
| 1 | CI (its `floor-guard` step fails a skipped or deleted test, fewer assertions, a new suppression; a `floor-ok:` commit waives it, so judge the reason) and `Workers Builds: <worker>` green on the head SHA | check runs | | always |
| 2 | Every acceptance criterion passes on the preview | `evaluator` | the head SHA's preview URL (from the Workers Builds check or Cloudflare's PR comment), the slice's criteria | always |
| 3 | Nothing blocking | a **fresh** `code-reviewer` (the builder's last ship-check pass counts if its report names this head SHA) | the diff, the slice goal in 2 sentences; it also reads the PR body's `Lessons:` line and fails the check when the named home does not hold the lesson or the "none, because" reason is not true (CI only checks the shape) | always |
| 4 | Nothing blocking, no CRITICAL/HIGH | `security-reviewer` on the diff; `red-team` on the preview | the diff; the preview URL and routes | auth, payments, user input or secrets touched; red team always on the last PR before launch |
| 5 | Nothing blocking | `design-critic`; `legal-reviewer` when pages, forms, tracking, embeds or AI output change | phone and desktop screenshots, the preview URL | UI changed (fails when `ui-review/scripts/design-check.mjs` fails: no Direction citing three captures in `design/reference/`, no palette with passing text pairs, no type scale or no `## Bar` ([`roles/designer.md`](roles/designer.md), Art direction first); when `design-critic` names any [`SLOP.md`](../ui-review/SLOP.md) pattern; or the PR body has no design-vote line; the evaluator checks each `## Bar` item on the preview); `legal-reviewer` always on the last PR before launch |

A check that doesn't apply passes; say "n/a" in the table. A reviewer verdict in checks 3 to 5 without quoted lines, the test-gap answer and a `Not judged:` list is not a pass ([`roles/reviewer.md`](roles/reviewer.md), Report).

**Until the `journey` status can be posted (2026-10-26).** claude-setup's `journey.yml` fails on every run (GitHub 403 on the project repo, PR 292 replaces it), so a missing or red `journey` status from it is a warning, not a fail, until a project's own `journey.yml` posts one (this overrides "missing, pending, red ... is not 5/5" in The `journey` status below; a green one is still run through `verify` and a forged one still fails). Instead, check 2 runs the default branch's `npm run journey` against the preview by hand (or, without that script, the evaluator's preview run) and quotes its output. A check that cannot pass for anyone never blocks a merge (yskills 2026-10-26).

## Gate size

The PR's size decides which checks run; the headline names it: `Gate 5/5 (S, round <n>)`.
Security never drops: any PR touching user input, auth, money or secrets runs check 4.

| Size | PR | Checks |
|---|---|---|
| S | docs, skills, templates, config | 1 and one fresh `code-reviewer` (3); 2, 4, 5 n/a |
| M | code without UI; a garment move or refit with no new look (Asset PRs) | 1, 2, 3; 4 when user input, auth, money or secrets are touched |
| L | UI, auth, payments, data, migrations, launch | the full table |

Who runs it (yskills, 2026-10-18: a gate thread starts at ~114k tokens and every call re-reads it, `docs/WORKFLOW.md` Token budget): S and M run in the author thread: CI, one fresh `code-reviewer` subagent (never the author's own pass) and the merge, with the table headline in the PR. The author does not pick the size: the table does, and anything touching user input, auth, money, data or UI is L. The reviewer gets the diff itself (`git diff <base>...<head>`), never the author's summary of it, and the author posts its report unedited; a finding the author disputes goes to the coordinator, not to a second reviewer. L keeps a fresh gate thread, because it runs the preview, security and design checks. A reviewer subagent still sees only the diff, the criteria and the previous round's table.

## Asset PRs (models, garments, figures, scenes)

Asset work (a garment fit or move, a body, a figure, a posed scene) has no preview URL; the evidence
replaces check 2, the rest of the table and the sizes stay as they are (clothes moved with no measurements clipped through the body, 2026-10-26). No new system.

- **Evidence:** the PR carries the Programmer's measurement file (the Done report rows of
  `docs/clothing-pipeline.md`; scenes: `character-workflow.md` step 4) and the render sheet (contact sheet, 4 angles,
  390 px and 1440 px), as files in the PR or under `/mnt/project-files/`. A missing piece or row, or a row over the
  limit, fails the PR. A sheet alone, "looks the same" or "no visual change" is no evidence.
- **Reviewer:** the one exception to "only the diff" (check 3, Who runs it): it also gets the measurement file and the
  sheet, because a `.blend` has no diff. It checks that every piece, pose and slider extreme has a row, that no row is over the
  limit, and looks at the sheet. A sheet that shows clipping the numbers do not is a fail; the Programmer re-measures
  on the laptop (`docs/WORKFLOW.md`, PC work) and attaches the new file.
- **Check 2** is shown as `evidence` in the table (the file and the sheet), not n/a.
- **Size:** a garment move or refit with no new look = M; one that changes the look, and any figure, body, character or scene PR, is L (`character-workflow.md`, step 6).
- No picture of a posed scene or a figure reaches yskills without a gate row in `gate/` that names
  its head SHA (yskills, 2026-10-11: bed shots with the duvet cutting through the body, no check
  had run). The criteria for a scene come from the plan that introduced it, machine checks first,
  a human-eye pass second; a posed shot from the Programmer alone is a draft.
- A figure or scene PR that fails the same item in two rounds is not re-gated until the Programmer
  attaches the diagnosis (`character-workflow.md`, step 4).

## Mode: probe or product

`PLAN.md` says `Mode: probe` until the first paying user; the operator (or the weekly routine,
whichever sees that payment first) switches it to `Mode: product`. Until someone pays, gate rounds go to finding out whether anyone will:

| # | Probe mode |
|---|---|
| 1, 2 | as above |
| 3 | the builder's ship-check report, when it names this head SHA; no fresh reviewer |
| 4 | `security-reviewer` whenever the PR touches logins, payments, secrets or stores anything a user typed (emails, notes, journal entries); `red-team` only on the last PR before launch |
| 5 | `legal-reviewer` when public pages, forms, tracking or embeds change; `design-critic` only on the probe slice and the last PR before launch |

No `Mode:` line in `PLAN.md` means product mode. Product mode is the full table above. The headline names the mode: `Gate 5/5 (probe, round <n>)`.

**Preview test:** check 2 opens the live preview. Screenshots are for UI only: the Programmer's
390 px and 1440 px set from the preview is the one `design-critic` uses; the evaluator adds a
screenshot only for a failed criterion or the journey run. A change without UI is proven by test
output or a live check.
Roblox projects have no preview URL: play the test place through the Studio MCP server and
`screen_capture` it (`toolbox/catalog/roblox.md`, The loop).

**The `journey` status (every project PR).** It is posted only by claude-setup's `journey.yml` (the Tester
runs it per PR, `name` + `pr`): `n/a` when the PR changes only docs, tests or `.github/` files, else green
after the PR's preview served its head and the default branch's `npm run journey` passed there on a phone
profile (`publish` skill, Preview journey). Anything else, Nuxt `app/`, `server/`, configs, `package.json`,
runs the journey. A PR branch can post a `journey` status with its own token (and overwrite a red), so a
green tick in the UI proves nothing. **Check 1 runs `verify`:** put the head's statuses
(`commits/<sha>/statuses`, newest first) on stdin of `node scripts/journey.mjs verify`. It passes only when
the newest `journey` status is a success created by `yskills-claude` that links to a claude-setup `journey`
run; a missing, pending, red or forged one is not 5/5. Until a branch ruleset requires the status on the
project repos, `verify` is the gate. When the description says the PR changes journey files, the Tester
reads them (they run only after the merge) and runs the new journey by hand in check 2 (incident
2026-10-26: three gated PRs passed on local `verify` while the preview was broken).

**No preview URL is not a pass.** Check 2 runs on the branch's Worker Preview. A PR without one
(the Deploy or Preview command isn't set up, `publish` §A new project) is not 5/5: the gate stops
and the operator fixes the deploy first. A flow that depends on mail (a confirm link, a mailed
cancel) passes check 4 only where mail is configured in that environment, else the flow is off.

To confirm a Preview serves the PR head, read its `/api/config`: `commit` must equal the head SHA. A
local `npm run verify` leaves `src/commit.js` alone (only Workers Builds and CI write it), so a dirty
tree after it is a real change.

**No preview yet or any more:** the scaffold PR (before Workers Builds is connected) needs CI
only. Once branch builds are off (live payment keys, `publish` skill), check 1 is CI only and the
gate runs the PR's build locally (`wrangler dev`) for checks 2, 4 and 5.

## Merge policy (the one source)

Under auto-run the gate merges (squash) every PR at 5/5: launch, live money and
claude-setup PRs included (yskills, "merge everything", 2026-10-06). That merge is the approved
production deploy. If Claude Code's safety check or auto mode refuses a merge, the gate asks
yskills for the tap on the card and tries no other way. Other files say this in one line and
point here.

Policy files (`CLAUDE.md`, this file, `hq-refresh.md` in yverse-studio/company-xy, `global/`, `cloud/`, `install.mjs`): the
cloud safety check may refuse an edit to them. The thread says so once and asks yskills to tap
Allow in that thread (it cleared this file on 2026-10-10); it never rewords, splits or routes the
edit another way.

How to undo a merge, by kind of change (write the line into the PR's "undo" line):

| Change | Undo |
|---|---|
| Code, Worker deploy | Cloudflare dashboard → Worker → Deployments → roll back to the previous version, or revert the PR and merge it |
| D1 migration | D1 Time Travel restores the database to a minute before the deploy (`wrangler d1 time-travel restore <db> --timestamp=<ISO>`); migrations stay additive so a code rollback works without it |
| Row in the HQ db | `ArtifactData` set the row back to its previous value (the PR comment quotes it) |
| Key or secret | rotate it in the provider's dashboard, then set the new value on the Worker |
| Docs, skills, templates | revert the PR |

## Rounds

- **5/5:** with a `features.json` (apps), commit the evaluator's verdict into it (`passes`) on the PR
  branch, wait for check 1 on that commit (a commit touching only `features.json` doesn't restart
  checks 2-5); a repo without one (a game starter, claude-setup) skips that and only posts the table
  below as a PR comment. Then:
  - **Pull main first.** If main moved since the branch was cut, merge main into the branch and
    wait for CI again before merging: in the HQ run six slices edited one `dashboard.html`, and a
    merge without the pull would have dropped the previous slice's work.
  - **One batch at the merge:** write the events (`pr-<repo>-<number>` `pr_merged`, `gate-<repo>-<number>` `gate_passed`) together with `projects/<id>`, the `team/*` rows and `phases`, every doc stamped `at`, so XP and rows never disagree.
  - **Every PR**, launch and live money included: the gate merges it (squash). If
    Claude's auto mode refuses, it doesn't try another way: it asks yskills for the tap.
  - **claude-setup PRs:** the gate merges them too; only when Claude Code's safety check
    blocks the merge does yskills tap **Merge it** on the card or GitHub's Merge button.
  - **Live check after the merge** (incident 2026-10-26: ~3 h of social merges never deployed):
    the merge is not done until live serves it. Within 15 minutes, read live `/api/config`; its
    `commit` must equal the merge commit on `main` (`send_later` for the wait, never a sleep). Not
    there: run the `build-logs` workflow (`cancel` for builds stuck over 10 min), say so in the
    thread and to the coordinator, and post no `Done:` line. `deploy-watch.yml` checks every
    project every 15 minutes as the net behind this and opens a `deploy-drift` issue.
  - **After the merge:** one lessons step (`docs/WORKFLOW.md`, Learning): save a lesson only if
    the next thread would repeat the mistake, mechanical ones as a check, prune what a check covers.
- **Last PR before launch:** the operator posts brief (c) with the table; the gate merges at 5/5
  (auto-run, launch included). Live keys yskills has not set yet stay a key card; the site goes
  live without them.
- **Less:** post the blocking findings as one PR review and stop. The builder fixes them; the next
  round re-runs the failed checks with fresh agents on the new head.
- **Up to 6 rounds** (yskills 2026-10-26: "6-7 versuche", was 2; the one home of the gate's round
  limit, every other file links here): the builder fixes and the gate re-runs until 5/5, at most six
  rounds. A defect that fails the same check twice gets a diagnosis before the next fix
  (`character-workflow.md`, step 4), not a blind patch.
- **Still not 5/5 after round 6:** the Tester sends one message to yskills: what the PR does, why it
  still fails and the problems in plain words (from the last reports), and two or three ideas to
  solve it as tap options; the thread goes on with the
  recommended option and the card lets yskills change course; when the coordinator already
  answered, carry on with its answer instead of asking again; money, a new service, deleting and
  anything irreversible wait for the tap (`CLAUDE.md`, Cards).

**Important or hard PRs** (auth, payments, database migrations, secrets, anything that can lose
data or money, the last PR before launch, any PR that needed a second gate round) merge at 5/5
like every other under auto-run, but their table comes with three plain lines for yskills to read
afterwards: what changed, what could break, how to undo it.

```
Gate 5/5 (round <n>), merging | launch: brief (c) below   [risky: auth | payments | migration | secrets]
1 CI + Workers Builds .. pass  <run links>
2 Evaluator ............ pass  <n>/<n> criteria
3 Code review .......... pass
4 Security / red team .. pass | n/a
5 Design / legal ....... pass | n/a
```

A gate thread reads the PR diff, PLAN.md and features.json only. Do not read: node_modules, build output, lockfiles, generated files, screenshots, other slices' code, HANDOFF files of old threads; `grep` first, read only the part you need.
