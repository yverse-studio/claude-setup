# Incident: levels built without research, plan and design (vacation-game, 2026-11-15)

Same-day report of yskills' complaints (rule 8 of his 2026-11-12 transition message; home of rule 8: [`2026-11-12-gate-loop.md`](2026-11-12-gate-loop.md)).

## Complaints

| # | Complaint (his words, 12:41Z) | Cause | Status |
|---|---|---|---|
| 1 | "Warum ist airport nicht First person?" | The airport (vacation-game #9, item M4) was built on 2026-11-11/12 with a follow camera; first person became the standard later (M5, #20, waits on his mouse test). M6 moves the airport to first person. | M6 is the first level to run the order of complaint 2. |
| 2 | "Der Workflow war nicht perfekt: Researcher, Planer für das Level, dann Designer mit Inspo und Vorschlägen basierend darauf." | Pipeline steps 2 to 4 (`docs/TEAMS.md`) ran once per game, not per level; the game kit listed the Planner before the Researcher; no brief line asked for the files of the steps before. | Fixed in this PR: `docs/TEAMS.md` (A level), the `Level:` brief line refused by `global/team-guard.mjs`, test `scripts/brief-fields.test.mjs`, the coordinator card line. |
| 3 | "Du hörst nicht und liest nichts, startest nicht immer mit Rollen und hast keine one source of truth Plan, den du immer checkst und updatest." | The coordinator card already says read the card, start every thread with a Roster role, read the plan before every reply; the project chat has no hooks, so these stay promises there. A thread start without a role is locked by rule-guard; a reply that skipped the plan is not visible to any hook. | Open, see below. |
| 4 | (coordinator, 12:43Z) The card says "then write_custom_view", but the project chat has no such tool, so the Custom view of PLAN.json goes stale. | The card names a tool the coordinator surface lacks. | Proposed below. |

## Proposed fixes (not built here)

- **3, plan check:** the card's first-reply header already carries `plan <done>/<all>`; extend the reply check the coordinator can see (the header) to every reply that names a PR or item, so a reply without a fresh plan count shows the skip. Needs a hook on the coordinator surface, which does not exist yet; until then the card line stays the rule.
- **4, stale Custom view:** move the view out of the coordinator. Whoever writes PLAN.json (the Planner thread, which has Bash) renders the view in the same step, or a daily routine (`create_trigger`) renders it from PLAN.json; the card line drops `write_custom_view`. One line in the card, one in `roles/project-manager.md` (Masterplan).
