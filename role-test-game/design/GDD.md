# Game design: Kofferlauf

One page, written by the Game Designer (#732) before the first build. Template: claude-setup
`.claude/skills/operator/templates/game-design.md`; bar: `.claude/skills/operator/roles/game-designer.md`.
Scope source: `/mnt/project-files/claude-setup/plans/2026-11-22-sota-roles-plan.md` (Track C, gate goals 1 to 7).
The repo `role-test-game` does not exist yet; the Programmer copies this file and `UX.md` to `design/` of the repo.
Every number below is a target the play bot (`test/game.mjs`) or the Tester checks.

## Real moment
none: invented. Kofferlauf is a role test game (plan Track C), not a level from yskills' life.

## Core loop
Walk the figure to the nearest suitcase; touching it picks it up (no key; contact = figure centre within 0.7 m of the suitcase centre on the ground plane, capsule 0.35 m plus suitcase half-length 0.35 m; at 1.0 m nothing happens), the counter goes up, and the
next suitcase is the one to look for. Five pick-ups before 60 s ends the run with a win; the clock at 0 ends it with a loss.
The loop closes every 6 to 12 s (one suitcase). 30-second test: a stranger sees a figure, a timer, "0/5"
and a suitcase on the ground 5 m ahead, walks into it, sees "1/5", and gets it without reading anything.

## Controls
View: third person, follow camera behind and above the figure (distance 4.5 m, height 2.2 m, looks at 1.2 m above
the feet), spring arm shortens on the first hit with a wall or car (`game-ux` §1, Third person). Vertical FOV 60 desktop,
portrait derived per baseline row 4. The figure turns to face its move direction in 120 ms.
One row per `game-ux/refs/controls-baseline.md` row:

1. Move relative to camera: yes. WASD and arrows by `KeyboardEvent.code`; prompts show the layout's letter.
2. Turn the camera: yes. Right-drag orbit on desktop (no pointer lock: a third-person collect game needs a free cursor for the title and pause panels), Q/E turn 90 deg/s, context menu suppressed on the canvas. Drag fallback on touch (row 10).
3. Rebinding: exception. A 60 s single-screen role test; no options beyond row 7's short list. Recorded as a known gap for a real launch.
4. Sensitivity and invert: yes, drag only: 0.22 deg per CSS px default, range 0.05 to 0.6, invert Y off by default. Pitch clamped -10 to +45 deg.
5. Auto-camera toggle: yes, default on (walking game): the camera eases back behind the figure after 1.5 s with no look input; off keeps the view.
6. Gamepad: yes, standard mapping only: left stick move, right stick camera, Start pause, A restart on the end screen; dead zone inner 0.15, outer 0.95. No vibration (nothing to vibrate). Non-standard pads: not supported, listed under Not checked.
7. Options menu: yes, short: drag sensitivity, invert Y, auto-camera, reduced motion. One saved settings object with a load/save/clamp unit test. No audio or language rows (no sound, English only for the test).
8. Key hints: yes, one line under the start button ("WASD / Stick to walk, Shift to run") swapped to the device last used; no tutorial screen.
9. Accessibility floor: yes. `prefers-reduced-motion` stops the counter bump and the last-10-s pulse; Shift run is a toggle, not a hold; the timer turning red also gets a number (never colour alone); HUD readable at 390 px and 907x510.
10. Touch: yes. Touch stick `data-testid=stick` always drawn at rest bottom left (120 px ring, 44 px knob) and jumps to where the left thumb lands, right half drag turns the camera; restart and pause buttons 56 px.
11. Steam Deck: n/a, web only (no Steam target).
12. Run: yes. Walk 1.5 m/s, run 3.0 m/s (Shift toggle, or stick pushed past 0.9). Velocity eases to target in 150 ms. No head bob.

Interactables: the five suitcases only. Collision: figure capsule radius 0.35 m against the plot edge, two parked cars, four bins and one bench (boxes, `three-mesh-bvh` not needed).

## Session length
Shortest satisfying run: about 28 s (a bot that runs the shortest path at 3.0 m/s; target 25 to 35 s).
Longest run: 60 s, hard cap; the clock at 0 ends the run. A first-time walker who never runs finishes in about 45 s.
The run ends well either way: win screen "5/5 in 38.4 s" with best time, or "Time's up: 3/5" with what was missing; both offer Restart (R / A / tap) that starts the next run in under 1 s.
Basis: Crazy Taxi's arcade run starts with a 60 s clock (References). Gate goal 3: the timer ends a run at 60 s.

## Progression
No unlocks and no pool of choices by design (Not this): a role test with one screen.
After run 1: a best time (or best count, if lost) saved in `localStorage` behind `save.ts`. After run 5: the player
has seen layouts 1 to 5 (one fixed seeded layout per run, cycling 1-5, so the bot and the Tester can replay one). After run 20: nothing new; the best time per layout is the only thing owned.
Pool of choices: 0. Layouts: 5 seeds; each places the five suitcases at least 4 m apart, the first one 4 to 6 m in front of the spawn and in view.

## Difficulty curve
| Seconds of the run | Pressure | Target win rate |
|---|---|---|
| 0 to 10 | first suitcase in view 4 to 6 m ahead, no obstacle between | 100 % of players have 1/5 by 10 s |
| 10 to 30 | suitcases 2 to 3 behind a car or bin, 8 to 14 m apart, the camera must turn once | a first-time player has 3/5 at 30 s in 80 % of runs |
| 30 to 50 | suitcases 4 and 5 at the plot's far corners, shortest path 15 to 20 m with one detour | first-time walker 70 to 85 % win; a runner over 95 % |
| 50 to 60 | timer red with the number, pulse once per second | bot: every seed wins with at least 15 s left; `min` in `test/game.mjs` is 5 suitcases |

Layout rule the Programmer tests in `rules.ts`: shortest route through all five (from spawn, greedy nearest) is 55 to 75 m on every seed, so a walker at 1.5 m/s needs 37 to 50 s plus turning.

## Feel and feedback
No sound in this game (Audio left out on purpose, plan Track C); every cue is on screen.
- Pick-up: the suitcase scales 1 to 0 and lifts 0.3 m in 150 ms; the counter bumps to 120 % and back in 200 ms; feedback starts in under 100 ms of the touch.
- Walk/idle: the walk clip `AN_rb_walk` (1.07 s loop) plays while moving, its time scale follows speed (1.0 at 1.5 m/s, 1.6 at 3.0 m/s); `AN_rb_idle` (4 s loop) after 200 ms standing; crossfade 200 ms.
- Last 10 s: the timer turns red, gets one decimal and pulses at 1 Hz (no pulse with reduced motion).
- Win: time freezes, the camera eases up to 6 m over 600 ms, the win panel fades in at 300 ms.
- Loss: the clock shows 0.0, input stops, the end panel appears at once (no slow-mo).
- Bumping an obstacle: the figure stops, no shake (shake is noise in a 60 s game).

## Screen, people, map
HUD: timer top left (large, `60.0` counting down), "Suitcases 0/5" top right, pause button top right under it (all devices; Esc, P and Start too).
First goal: the first suitcase is in view at spawn, picked up by second 5 for the bot, by second 10 for a person.
Prompts: one line on the title panel, device-named ("Click to start" / "Tap to start" / "Press A"); no prompt during play.
People: none. The plot is empty on purpose (`game-ux` §3 idle NPC rules do not apply; listed in Not this). Crowd density 0.
Map: no map; the plot is 24 x 24 m of street with kerb, two parked cars, four bins, one bench, fenced on all sides (CC0 props only if the budget allows, else grey boxes in style `real` jank).
Wireframe: `design/UX.md`.
Play hooks and test ids: the Tester's contract in `/mnt/project-files/claude-setup/role-test/tester-journey.md` (Hook contract) is the one shape: `__gameReady`; `render_game_to_text()` returns `{mode: title|play|paused|won|lost, timeLeft, collected, suitcases:[{x,z,taken}], player:{x,z,clip: idle|walk}, camera:{x,y,z}}`, plus `player.yaw` and `layout` (1-5) from this doc; `advanceTime(ms)`; `__playInput(x, z)`; `__lookBy(dx, dy)`; DOM `[data-testid=stick]`, `pause` (shown on every device), `restart`, `win`, `lose`.
States: `title` shows the figure idle, five suitcases and `60.0`; the first move input (key, stick or `__playInput`) starts `play` with no click (the first action is the core verb, `game-ux` §2); the Start button does the same.

## Monetisation hooks
None in this build: the Worker site has no ads (no Impressum or Datenschutz for ads; Legal and Marketer left out, plan Track C).
If it ever goes to CrazyGames: `midgame()` only after the end panel, at most once every 3 runs; no rewarded offer. The 60 s run is never interrupted.

## Not this
- No NPCs, enemies or traffic: the only thing that moves is the figure.
- No sound or music (Audio left out on purpose).
- No shop, unlocks, upgrades or score beyond the time.
- No story, no dialogue, no text beyond HUD, title and end panels.
- No physics props: suitcases do not tumble, cars do not move.

## References
- Crazy Taxi (https://en.wikipedia.org/wiki/Crazy_Taxi_(video_game) and https://segaretro.org/Crazy_Taxi, read 2026-11-22): arcade rules start the run with a 60 s clock, extended by time bonuses for quick deliveries; each fare has its own timer. Copy: the 60 s run with one visible goal at a time and a big clock. Skip: the time bonus and the per-fare timer (gate goal 3 wants a hard 60 s end, and two clocks are too much for a one-screen test).
- Totally Reliable Delivery Service (https://store.steampowered.com/app/1011670/Totally_Reliable_Delivery_Service/, read 2026-11-22): Steam store copy calls it a ragdoll physics delivery game; Mostly Positive (1,530 reviews on the Czech page as listed by search), Metacritic 64 per SteamDB. Copy: the "troll realism" mood of stiff stock people carrying luggage-like parcels, which matches style `real` in GAME-EXPORT.md. Skip: ragdoll physics and multiplayer (cost far over a 60 s test).
- Pop Match 3D (https://www.crazygames.com/game/pop-match-3d, read 2026-11-22): CrazyGames 3D game, released July 2025 on Unity 6 per the search summary, clear sets of items before a timer runs out. Copy: the timer plus counter HUD of a web-portal collect game and the instant restart. Skip: the matching rule and collectible unlocks (Not this: no unlocks).

Not checked:
- None of the three references was played or watched for this doc; the numbers are from search summaries of the listed pages on 2026-11-22, not from the pages opened in full (`game-designer.md` Method step 1 asks for a play or a run video).
- Start step of the playbook (9-option reference sheet shown to yskills before filling) was not done: the concept, figure and gate goals were fixed by the plan; asking would only stall a role test. A real game does it.
- The 45 s walker estimate and the 70 to 85 % win band are design guesses; the bot measures them after the build.
- Clip lengths read from `idle.json` (4.0 s) and `walk.json` (1.07 s), both clip name "Take 001", 52 tracks; that the clips bind to `player.fbx` bones in three.js is not checked here.
- Texture sha256 differ from `CH_rb_male_adult_01.STATUS.md` (plan, known); the Programmer writes real hashes.
- Rebinding (baseline row 3) and non-standard gamepads are left out; a real launch needs them.
