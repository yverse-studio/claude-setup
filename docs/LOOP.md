# The loop: errors and feedback after launch

Before 2026-10-08 the roadmap ended at launch: `docs/WORKFLOW.md` step 8 described a weekly routine
and PostHog errors, but no project had the routine (`list_triggers` showed none) and no app stored
what went wrong or what users said. Deploys were a one-way street. This is the way back.

## Shape

Three sensors, one inbox, one reader. Keys stay on the Worker and in GitHub; threads read issues. Issues quote error text (secrets redacted by `loop.mjs`), so the project repo stays private.

| Part | What | Where | Key |
|---|---|---|---|
| Sensor: errors | the app stores its own server errors (`serverError()`) and client errors (`app:error` hook, `POST /api/errors`, rate-limited, no personal data) as `fingerprint, route, message, count, firstAt, lastAt` and lists them in the owner report | the app's D1 | none |
| Sensor: feedback | a "Feedback" link in every footer: text, page, optional reply address (kept in the app), rate-limited; listed in the owner report as `id, at, page, text, replyWanted` | the app's D1 | none |
| Sensor: numbers | `GET /api/stats` (public sums) and the `Live check` smoke suite after every deploy and every Monday | the app, `.github/workflows/live.yml` | none |
| Inbox | `loop.yml` runs `scripts/loop.mjs` every morning, after a red live check and by hand: one issue labelled `loop` per new error (`loop:error`, plus `loop:urgent` for checkout, Stripe, webhook or login routes), per feedback item (`loop:feedback`) and per red live check (`loop:live`, urgent); the same error gets its count rewritten and one comment, never a second issue; the five `loop` labels are created on first use | GitHub Actions, `loop` environment | `STATS_REPORT_TOKEN` (read-only) and `REPORT_URL` in that environment only |
| Reader | one routine per project (`templates/loop/routine.md`): a fresh Sonnet session a day reads the open `loop` issues and the last runs, and sends the coordinator one message with the list; nothing new, no message | `create_trigger` at launch | none |
| Work | the coordinator starts one `Programmer · fix #n` thread per error or red run (a failing test first, then the fix, gate and merge: `gate.md`) and one Project Manager decision per feedback batch (slice in `features.json`, an answer, or closed with one line why); the thread comments its link on the issue and closes it at merge | threads | none |
| yskills sees | HQ: the fix thread on the work board, the state line in `projects/<id>.note` ("2 Fehler offen, 1 Thread läuft"), and only a feedback that needs a taste or money call in `you[]`; the weekly `metrics/` PR carries the counts | HQ rows (`docs/hq-rows.md`) | none |

Templates: `.claude/skills/operator/templates/loop/` (`loop.yml`, `loop.mjs`, `loop.test.mjs`,
`routine.md`). The project copies `loop.mjs` to `scripts/`, `loop.yml` to `.github/workflows/`
and adds its two report lists; `scaffold` lists them for new projects.

## Why this and not the reel's setup

Agents merging on their own: that is the gate (`gate.md`), running since 2026-10-06. A dedicated
desktop that tests: every cloud thread already has one (a Worker Preview per branch and headless
Chromium); the laptop covers Chrome logins, Roblox Studio and the worker through Remote Control.
What the reel's desktop really buys is a machine that is always on. That is a hosting choice
(a small VPS, or the laptop left on), not a setup change, and it costs no tokens to watch:
tokens go on what Claude does, not on who looks.

What was missing is the way back from launch: errors nobody read (Workers logs stay in
Cloudflare's dashboard, which threads cannot reach) and feedback nobody could give. The loop
above closes it with what the stack already has (D1, Actions, issues, routines) and no new vendor:
no PostHog, no Sentry until a project has the traffic to need replay or funnels (`toolbox`,
Growth). Then PostHog's API joins the inbox as a second source; the issues stay the same.

## Limits, said plainly

- An urgent error reaches a thread within a day (the routine's cadence), not within minutes. The
  Monday and after-deploy smoke failures email yskills at once as before. Faster needs a routine
  every hour, about 30 cheap runs a day; switch it on per project when it earns money.
- Mail replies and store reviews are not sensors yet: mail waits for the worker's `email:read`
  job, store and Play reviews for the `store` skill's API step, Roblox has votes only.
- The report lists only what the app stored: a Worker that dies before `serverError()` runs leaves
  no row; the live check catches that.

## Before launch (operator step 7)

The gate's check 2 on the last PR before launch also walks these journey criteria from
`features.json` (`loop-1` to `loop-4`): the `loop` environment holds the token and `loop.yml` ran
green by hand; a forced test error on the preview shows up as a `loop:error` issue; the footer's
Feedback link sends and the text shows in the report; the routine exists (`list_triggers`) and its
first fire reached the coordinator. No loop, no launch.
