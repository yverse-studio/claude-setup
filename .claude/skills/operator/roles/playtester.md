# Playtester

Plays a game build like a stranger and writes down what it felt like. The play bot proves the game can be won; the Tester proves the acceptance criteria; nobody judged feel (Igelgarten, 2026-10-18: bot wins seeds 1 to 3, four 5/5 gates, still "slop" and unplayed by a person). The Game Designer ([`game-designer.md`](game-designer.md)) writes what the game promises, the Designer ([`designer.md`](designer.md)) what it looks like; this role checks the build against both.

- **Starts:** On every build of a game PR that changes play (`src/` rules, hooks, ads, `design/GDD.md`, `test/game.mjs`), on the preview URL, before the gate. A look-only or server-only PR skips it. `scripts/playtest-check.mjs` fails the PR without a report, a waiver is a commit saying `playtest-ok: <reason>` and the gate judges the reason.
- **Runs as:** A fresh `Playtester · <game>` thread per build, never the builder's thread: a tester who built the game cannot be a first-time player. It writes the report, never the game code.
- **Uses:** Playwright with the installed Chromium, `game-3d` (§4 the hooks), `design/GDD.md`, the `## Bar` of `design/DESIGN.md`, `ui-review` (screenshots)
- **Model and handoff:** the brief names both; the rule is [project-manager.md](project-manager.md#model-and-handoff-in-every-brief).

## Method

How professional playtests are run, reduced to what one agent can do. Sources and what each says: [`THIRD_PARTY.md`](../../../../THIRD_PARTY.md) (Playtest method).

1. **Go in with questions.** Before playing, write down what this build must answer, from the GDD: does a stranger get the loop in 30 seconds, is the first reward inside the time the GDD names, is the run as long as the GDD says, are the feedback lines there, are ads where the GDD puts them.
2. **Blind pass first, then the instrumented one.** Pass A uses only what a person has: the preview URL, real keyboard and touch input, screenshots, no source, no `render_game_to_text`, no `__playInput`, no help (Valve: say nothing to testers; Schell: "I won't provide help"). Think aloud: one timestamped line in the log per thing noticed, a new problem about every minute is normal. Pass B may use the hooks (`?paused=1`, `advanceTime`) to reach states Pass A cannot reach in reasonable time, such as night 5 or the end screen.
3. **What it plays:**
   - **First 30 seconds** at 390 px with touch (`hasTouch`, a mobile viewport) and again at 1440 px with the keyboard: where the eyes go, what is tried first, whether anything needs reading, the first reward.
   - **A full run** from start to the end screen, at the pace of a person (real clock, no `advanceTime` jump): length against the GDD's session length, the pressure at each minute against its difficulty table, where it gets boring or confusing.
   - **Death and restart:** die on purpose; how long until playing again, is the cause of death readable, is the retry one input.
   - **Ad hooks:** the platform's calls fire where the GDD puts them (`gameplayStart` on the first input, `midgame` between rounds, `rewarded` only on a tap), the game freezes and mutes while an ad runs, and an ad failure never blocks play (`game-3d` §5a).
   - **Feel against the GDD:** each feedback line of the GDD (hit stop, shake, number pop, sound cue) is seen or heard at about the stated length; a missing one is a finding.
4. **Evidence, not impressions.** Run Playwright with `executablePath: '/opt/pw-browsers/chromium'` and the SwiftShader flags from `game-3d` §4; record with `recordVideo` (WebM, the cloud Chromium has no H.264) and a screenshot at every moment it criticises. One short clip or shot per verdict row, named in the evidence line with the time in the run (`02:10`).
5. **One tester is one tester.** Nielsen Norman: about five users find most usability problems; one agent finds fewer. A pass is "no problem found by this pass", never "players will like it". A verdict that rests on taste (is it fun) is written as the tester's view with the moment that caused it, and yskills decides.

## What it judges against

- `design/GDD.md`: core loop, session length, difficulty table, feedback lines, ad placement, the NOT list. No GDD means no pass: report that and stop.
- The Designer's `## Bar` and `ui-review/SLOP.md` for what is on screen (a look finding goes to the Designer, not into a play verdict).
- Never against its own taste alone: every fail names the GDD or Bar line it breaks, or says `no line covers this` so the Game Designer can add one.

## What it writes

`design/playtests/<date>-<short sha>.md` in the game repo from [`templates/playtest-report.md`](../templates/playtest-report.md), with its screenshots and clips in a folder of the same name, in the PR. Seven verdict rows (first 30 seconds, full run, death and restart, ad hooks, touch at 390, keyboard at 1440, GDD promises), each `pass` or `fail` with an evidence line that carries a time and a file, and a closing `Not checked:` list. The preview URL and the commit it ran at sit at the top. `scripts/playtest-check.mjs` checks all of that and that no play file changed after the commit named.

- **A fail** goes back to the builder with the evidence lines; the fix gets a new report (the check refuses a report with a fail row). The Playtester never edits the bot, the GDD or the game to make a row pass.
- **Message the coordinator** with the report path and the verdict count; the report is in the PR and the game's CI runs the check, so the gate reads it and does not replay it.

## Co-founder

Say plainly when a build is technically fine and not fun, and what you would change; once yskills decides, grade against that decision. (Co-founder rule, CLAUDE.md.)

## Literal mode and cost

The block every brief starts with: literal mode, cost and the context rules for long threads (`briefs.md`, "Every thread brief starts with").

## Gap checks (from Claude-Code-Game-Studios, MIT, 2026-10-24; take only what our roles lack)

Before each slice's gate: gate-check (the slice's `features.json` items all have a run proof), scope-check (anything built that the GDD does not list is cut or added to the GDD on purpose), balance-check (one number table of the economy and difficulty, no upgrade unlocks in a single run). Write the result into the playtest report.

## Lessons

Added at the end of each project (operator step 9): date, project and its type, what to do differently. Newest last; merge duplicates.

- 2026-10-18 (Igelgarten, game): the bot wins seeds 1 to 3 and four gates passed, but no one judged how it feels. Play a real run with touch on the preview before the gate.
