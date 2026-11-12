---
name: game-ux
description: "Use when a game has first-person or follow camera, mouse look, HUD, menus or stiff idle NPCs: controls, camera, onboarding, NPC idle life, accessibility floor."
---

# Game UX: controls, camera, screen, people in the scene

Fills the gap between `game-3d` (engine, assets, tests) and the Designer's web UI (`impeccable`,
`ui-review`): how a player moves, looks, is told what to do, and what the people in the world do
while nobody talks to them. Audit 2026-11-12 (vacation-game): the Game Designer and Programmer had
no recipe for first-person or mouse look (the only controller page was third person), no HUD or
onboarding rules, no accessibility floor and nothing on idle NPC behaviour. Numbers marked [judgement]
are tuned by eye, change them when a screenshot or a playtest says so.

## Who uses it

- **Game Designer:** writes the answers into `design/GDD.md` (`## Controls`, with the baseline rows; HUD and
  people notes: `operator/templates/game-design.md`) and the HUD wireframe as text or HTML in
  `design/UX.md`. There is no dedicated in-canvas UI tool: checks are screenshots from the game camera at
  390 and 1440 px (`ui-review`, `design-critic`), `impeccable` for type, contrast and spacing of DOM overlays,
  `a11y-architect` for the accessibility pass.
- **Programmer:** builds sections 1 to 3; the look math is plain TypeScript with no renderer import.
- **Playtester:** the checks in section 5.

## 1. Controls and camera

The floor every game ships with (camera-relative WASD on any layout, rebinding, sensitivity, auto-camera toggle, gamepad,
options menu, key hints, Deck rules) is [`refs/controls-baseline.md`](refs/controls-baseline.md) with its playtest row;
the bullets below are how to build it.

One input layer (`src/input.ts`) turns keyboard, mouse, touch and gamepad into intents (`move`, `look`, `interact`,
`pause`); levels and rules read intents, never raw events.

- **First person:** yaw turns the body, pitch only the camera head, pitch clamped to about -70 to +70 degrees (as `game-3d/starter/walkable-room.md`),
  roll never. Eye height 1.55 to 1.7 m, near 0.05; FOV and its axis: baseline row 4. Never draw the player body when
  the figure is not part of the story (yskills 2026-11-10).
- **Mouse look on desktop:** Pointer Lock (`canvas.requestPointerLock()` from a click, never on load). Ask for
  `{ unadjustedMovement: true }` and catch the error to fall back to the OS-adjusted deltas (MDN, web.dev). Read
  `movementX`/`movementY`, no smoothing and no acceleration on the look. Handle `pointerlockchange`: a lost lock
  (Esc is the browser's default release) pauses the game and shows a "click to continue" panel; an iframe needs
  `allow-pointer-lock` in its sandbox. Where the lock is refused (embed, permission), drag-to-look with its own sensitivity (baseline row 4)
  is the fallback, so every build is playable without a lock.
- **Touch and gamepad:** values and mapping live in baseline rows 6 and 10, not here.
- **Move feel:** walk speed in baseline row 12, velocity eased with `v += (target - v) * (1 - exp(-10 dt))`, capsule or
  grid collision that slides along walls (`game-3d/starter/walkable-room.md`), no head bob by default
  (an option, off) and no camera smoothing on the look.
- **Third person:** follow camera with a spring arm that shortens on the first hit
  (`game-3d/refs/gamedev-skills/camera-systems`). A hard cut resets the smoothing.
- **Game feel** on actions (pickups, deals, hits): `game-3d/refs/gamedev-skills/game-feel` and the GDD's
  Feel and feedback lines; feedback inside 100 ms of the input [judgement].
- **Settings, saved:** baseline row 7: one settings object with a unit test for load, save and clamp.

## 2. Screen and onboarding

- **First 60 seconds:** one visible goal in the world, the first input gets a response in under 500 ms, no wall
  of text before play. Teach by doing: the first action is the core verb. Sources agree on the 60 to 90 second window
  but are vendor blogs, so the Game Designer sets the real number in the GDD and the Playtester measures it.
- **Prompts name the device in use:** "Click" or "Tap" or the pad glyph, swapped on the last input type; the key
  letter is read from the binding, never hard-coded in the copy.
- **Diegetic first:** a stall's price on the stall, a goal as a marker in the world, before a HUD bar. HUD is
  what is left: kept to the screen edges and out of the centre of view.
- **Panels:** one open at a time, Esc or a tap outside closes, pause always reachable (`game-3d` section 2, `src/ui/`).
- **Text:** UI in the game's languages from keys (the repo's i18n), no text baked into images.

## 3. People in the scene

A figure that stands in a T-pose or in one loop reads as a prop. Minimum for every NPC [judgement, tune by playtest]:

- three or more idle clips per figure, picked at random every 4 to 10 s with a random start phase, so two figures
  never share a frame; breathing and blinking on top;
- head and eyes turn to the player inside about 4 m and look away after 2 to 3 s;
- a job loop for people with a role (a vendor straightens goods, calls out, counts money), a walk or wait loop for
  passers-by, stride speed from the distance walked;
- crowds: instanced skinning with per-instance speed 0.8 to 1.2 [judgement] and phase (`game-3d/refs/crowds-and-lod.md`);
  people keep 0.6 m personal space [judgement] and give way instead of overlapping (`game-3d/starter/learnings.md`, walkers);
- a vendor or companion reacts within 1 s when the player arrives, stops, or leaves.

Test: the play hook exports every NPC's clip name and time; a unit test fails when two NPCs within 3 m share a clip
and a start time, or one clip plays longer than 12 s without a switch.

## 4. Accessibility floor (Game Accessibility Guidelines, Basic tier)

Adjustable FOV with a sensible default (baseline row 7); head bob and screen shake switchable off (mouse smoothing and
camera/controller mismatch are known motion-sickness triggers); every control remappable (remap the action, not
only swap two keys); subtitles for all important speech; contrast and text size readable at the smallest target frame (baseline row 9); settings saved;
never convey a state by colour alone. Beyond this floor, take the guidelines' Intermediate list per game.

## 5. Test recipe

- **Pure look math** in a pure module with no renderer import (`applyLook(state, dx, dy, sens, invertY)` returns a new state, pitch
  clamped); Vitest covers clamp, invert, wrap of yaw. No `Math.random`: idle choice takes the game's seeded RNG.
- **Hooks:** `window.__lookBy(dx, dy)` and `render_game_to_text()` carrying yaw, pitch, position and NPC clips,
  so a headless test can turn and walk without a real pointer lock. A real lock in headless Chromium is not
  verified here; the Playtester's blind pass uses the drag fallback and says so in `Not checked:`.
- **Playtester checks:** the table in [`refs/controls-baseline.md`](refs/controls-baseline.md); plus mouse look reaches
  every interactable the GDD lists, Esc and a lost lock pause and recover, NPCs visibly do something in a 30 s watch
  (clip names from the hook), first reward and first goal inside the GDD's seconds.

## Sources (read 2026-11-12)

- MDN Pointer Lock API and `requestPointerLock()`: https://developer.mozilla.org/en-US/docs/Web/API/Pointer_Lock_API
- web.dev, unadjusted mouse movement (Chrome 88+): https://web.dev/articles/disable-mouse-acceleration
- Game Accessibility Guidelines, Basic: https://gameaccessibilityguidelines.com/basic/
- Onboarding window of 60 to 90 s, one visible goal, response under half a second: vendor blogs only (e.g. https://rowatcher.com/news/roblox-onboarding-in-90-seconds-or-your-game-is-already-dead), opinion, not measured.
- Not found in a search: sourced numbers for NPC idle timing and gaze; section 3 is our own [judgement].
