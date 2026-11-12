# Controls baseline: what every game ships with

The floor for any game with a player-moved camera or character (3D, 2.5D, top-down). `SKILL.md` §1 says how to
build the input layer; this file says what the player must get. No value here belongs to one game: a project
writes its own numbers in `design/GDD.md` (`## Controls`) and tunes them by playtest. Numbers marked
[judgement] are starting points, not measured on a reference game; the first human test replaces them
(origin: one game's controls audit, 2026-11-12, where every number was set by Claude and none by a human).

## The baseline (a game is not "controls done" before each row is a yes or a written exception)

| # | Row | Baseline |
|---|---|---|
| 1 | Move relative to camera | WASD and arrows move relative to where the camera looks. Bind the physical key (`KeyboardEvent.code`), never `key`, so AZERTY, QWERTZ and Dvorak keep the same hand shape; show the key name from the layout in prompts (`navigator.keyboard.getLayoutMap()` where it exists, else the code's letter) |
| 2 | Turn the camera | Mouse look (pointer lock, drag fallback) or right-drag orbit, plus Q/E as a keyboard turn so a player with no mouse is not locked out; context menu suppressed on the canvas |
| 3 | Rebinding | Every action rebindable in a menu, a new key for the action (not only swapping two), conflicts shown, reset to default, saved. Hints and glyphs update after a rebind (Xbox XAG 107; Game Accessibility Guidelines, Basic) |
| 4 | Sensitivity and invert | Mouse sensitivity in degrees per mouse count (`movementX` is raw counts with `unadjustedMovement`): default [judgement] 0.1, range 0.02 to 0.5, with cm per 360 deg at 800 CPI shown by the slider; drag-to-look and touch get their own value in degrees per CSS px (default [judgement] 0.2 to 0.25); invert Y; separate stick sensitivity. FOV is stored as the vertical `camera.fov` (default [judgement] 60 on desktop, about 90 horizontal at 16:9; on portrait derive vertical from at least 70 horizontal, about 102 vertical at 9:16, and cap it at 100) and shown as horizontal 70 to 110 |
| 5 | Auto-camera toggle | A camera that swings back or recentres on its own can be switched off; default on for a walking game, off for anything with aiming |
| 6 | Gamepad | Gamepad API, `mapping === 'standard'`: left stick move, right stick camera, A confirm or interact, B back, Y secondary, Start pause; scaled radial dead zone, inner 0.15 and outer 0.95 [judgement] (`out = dir * clamp((|v| - inner) / (outer - inner), 0, 1)`); a non-standard pad shows a "press the button" mapping step. Hot-plug (`gamepadconnected`) and glyphs follow the last device used |
| 7 | Options menu | One screen, reachable from the title and in play: Controls (rows 3 to 5), Camera (FOV, bob, shake), Accessibility (reduced motion, text size, subtitles, hold/tap toggles), Audio, Language. Saved locally, one settings object with a load/save/clamp unit test |
| 8 | Key hints | Quiet, always-on hints at the action itself (the key by the card, the glyph on the prompt), swapped to the active device; the first minute teaches by doing, not by a list |
| 9 | Accessibility floor | `prefers-reduced-motion` honoured and overridable in the menu; no hold-only action without a toggle; no action needs two hands on keyboard at once without an alternative; nothing told by colour alone; contrast and size readable at the smallest target frame (CrazyGames 907x510, Deck 1280x800, phone 390 px) (`SKILL.md` §4) |
| 10 | Touch | Left thumb walk, right thumb look or tap-to-move, 44 px targets; same settings object |
| 11 | Steam Deck | When Steam is a target: the default controller layout reaches all content without changing in-game settings, on-screen glyphs match the active device and never show mouse or keyboard glyphs while a pad is used, text readable at 30 cm, text entry works with a pad only (Steamworks Steam Deck compatibility, read 2026-11-12) |
| 12 | Run | A run or walk-speed toggle, unless the GDD says why not; walk speed 1.4 to 1.6 m/s [judgement] |

## Benchmarked against

Written from the published guidance, not from a playtest. A game name here is a pointer to look at, not a claim that
its values are copied.

- **Xbox Accessibility Guidelines 107 (Input):** in-game remapping of all controls, even where the platform remaps;
  assign any input to any action; update hints after a remap; hold versus tap and auto-hold options.
  https://learn.microsoft.com/en-us/gaming/accessibility/xbox-accessibility-guidelines/107
- **Game Accessibility Guidelines, Basic tier:** remappable controls, adjustable FOV, motion effects off, no
  colour-only information. https://gameaccessibilityguidelines.com/allow-controls-to-be-remapped-reconfigured
- **Steamworks, Steam Deck compatibility:** controller default config, glyph matching, legibility, text input.
  https://partner.steamgames.com/doc/steamdeck/compat
- **MDN Gamepad API:** `mapping === 'standard'`, four axes (left x/y, right x/y), triggers are buttons; dead zones are
  ours to write. https://developer.mozilla.org/en-US/docs/Web/API/Gamepad_API/Using_the_Gamepad_API
- **Look at in play, then write what you saw in the GDD:** one walking sim, one third-person adventure and one PC
  first-person game of the same mood as the new game; note sensitivity range, rebind screen shape, gamepad prompts,
  auto-camera behaviour. (A search found no sourced default sensitivity numbers; do not invent a "standard".)

## Build order when a game starts late on this

1. Input layer to intents (`SKILL.md` §1), then the settings object (row 7), then rows 3 and 4 (a menu that changes
   what rows 1 and 2 do), then gamepad (row 6), then hints (row 8). A per-level control fix is a smell: controls
   are one PR for every level or chapter, never inside one level's PR.
2. Glyph and key names come from the binding, never from copy.

## Playtest checks (where they go in the Playtester's report)

`Layout` to `Reduced motion` go into the `Controls` row, the NPC watch (`game-ux` §3) into `World life`, the touch
check into `Touch 390` (the rows `scripts/playtest-check.mjs` and `gate.md` read).

| Check | Pass when |
|---|---|
| Layout | a dispatched keydown `{code: 'KeyW', key: 'z'}` moves forward; `KeyA`/`KeyD` strafe whatever `key` says |
| Camera | mouse look or right-drag and Q/E all turn the camera; the context menu does not open |
| Rebind | one action rebound in the menu works at once, survives a reload, and its hint shows the new key |
| Sensitivity, invert | `__lookBy(100, 0)` changes yaw by 100 x sensitivity within 1 %; invert flips the pitch sign |
| Auto-camera | switching it off keeps the view where the player left it for 5 s |
| Gamepad | with a standard pad (or mocked `navigator.getGamepads`) the left stick walks, the right stick turns, A, B and Start do their jobs; a stick value 0.01 under the GDD's inner dead zone gives no move |
| Options | opens from the title and from play, no state lost, every value saved |
| Hints | the active device's key or glyph shows at each action; after a pad press the glyph changes |
| Reduced motion | the OS flag and the menu toggle both stop bob, shake and camera flashes |
| Hold | every hold action has a toggle |
| Touch (`Touch 390`) | at 390 px a left thumb stick or tap-to-move walks, a right-thumb drag turns, every target is at least 44 px |

A check that needs real hardware (a physical pad, a real pointer lock) is listed in `Not checked:`, not ticked.
