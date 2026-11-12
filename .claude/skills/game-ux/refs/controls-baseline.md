# Controls baseline: what every game ships with

The floor for any game with a player-moved camera or character. `SKILL.md` §1 says how to build it. Each value lives only in this file; other files link its row, never copy the number. No value here belongs to one game: a project writes
its own numbers in `design/GDD.md` (`## Controls`) and tunes them by playtest; [judgement] marks a starting point
no human has tested yet.

## The baseline (each row: yes, or a written exception)

| # | Row | Baseline |
|---|---|---|
| 1 | Move relative to camera | WASD and arrows move relative to where the camera looks. Bind the physical key (`KeyboardEvent.code`), never `key`, so AZERTY, QWERTZ and Dvorak keep the same hand shape; show the key name from the layout in prompts (`navigator.keyboard.getLayoutMap()` where it exists, else the code's letter) |
| 2 | Turn the camera | Mouse look (pointer lock, drag fallback) or right-drag orbit, plus Q/E as a keyboard turn so a player with no mouse is not locked out; context menu suppressed on the canvas |
| 3 | Rebinding | Every action rebindable in a menu, a new key for the action (not only swapping two), conflicts shown, reset to default, saved. Hints and glyphs update after a rebind (Xbox XAG 107; Game Accessibility Guidelines, Basic) |
| 4 | Sensitivity and invert | Mouse sensitivity in degrees per mouse count (`movementX` is raw counts with `unadjustedMovement`; without it, refused or unsupported, `movementX` is OS-adjusted, so the deg/count value must be re-tuned): default [judgement] 0.1, range 0.02 to 0.5, with cm per 360 deg at 800 CPI shown by the slider; drag-to-look and touch get their own value in degrees per CSS px (default [judgement] 0.2 to 0.25); invert Y; separate stick sensitivity. FOV is stored as the vertical `camera.fov` (default [judgement] 60 on desktop, about 90 horizontal at 16:9; on portrait derive vertical from at least 70 horizontal, about 102 vertical at 9:16 and 113 at 390x844, cap 115 [judgement]) and shown as horizontal 70 to 110 (on portrait the slider tops out at the cap, about 72 horizontal at 390x844 and 83 at 9:16, so a portrait build may hide the slider) |
| 5 | Auto-camera toggle | A camera that swings back or recentres on its own can be switched off; default on for a walking game, off for anything with aiming |
| 6 | Gamepad | Gamepad API, `mapping === 'standard'`: left stick move, right stick camera, A confirm or interact, B back, Y secondary, Start pause; scaled radial dead zone, inner 0.15 and outer 0.95 [judgement] (`out = dir * clamp((|v| - inner) / (outer - inner), 0, 1)`); right-stick response curve (exponent 2 [judgement], selectable linear) with its own sensitivity; vibration on/off in the options menu (row 7); a non-standard pad shows a "press the button" mapping step. Hot-plug (`gamepadconnected`) and glyphs follow the last device used |
| 7 | Options menu | One screen, reachable from the title and in play: Controls (rows 3 to 5), Camera (FOV, bob, shake), Accessibility (reduced motion, text size, subtitles, hold/tap toggles), Audio, Language. Saved locally, one settings object with a load/save/clamp unit test |
| 8 | Key hints | Quiet, always-on hints at the action itself (the key by the card, the glyph on the prompt), swapped to the active device; the first minute teaches by doing, not by a list |
| 9 | Accessibility floor | `prefers-reduced-motion` honoured and overridable in the menu; no hold-only action without a toggle; no action needs two hands on keyboard at once without an alternative; subtitles for all important speech; nothing told by colour alone; contrast and size readable at the smallest target frame (CrazyGames 907x510, Deck 1280x800, phone 390 px) |
| 10 | Touch | Left thumb walk, right thumb look or tap-to-move, 44 px targets; same settings object |
| 11 | Steam Deck | When Steam is a target: the default controller layout reaches all content without changing in-game settings, on-screen glyphs match the active device and never show mouse or keyboard glyphs while a pad is used, text readable at 30 cm, text entry works with a pad only (Steamworks Steam Deck compatibility, read 2026-11-12) |
| 12 | Run | A run or walk-speed toggle, unless the GDD says why not; walk speed 1.4 to 1.6 m/s [judgement] |

## Sources (read 2026-11-12; guidance, not a playtest)

- Xbox Accessibility Guideline 107, Input: remap everything in game, any input to any action, hints follow a remap,
  hold/tap options. https://learn.microsoft.com/en-us/gaming/accessibility/xbox-accessibility-guidelines/107
- Game Accessibility Guidelines, Basic: remappable controls, adjustable FOV, motion effects off, no colour-only
  information. https://gameaccessibilityguidelines.com/allow-controls-to-be-remapped-reconfigured
- Steamworks Steam Deck compatibility: https://partner.steamgames.com/doc/steamdeck/compat
- MDN Gamepad API: https://developer.mozilla.org/en-US/docs/Web/API/Gamepad_API/Using_the_Gamepad_API (dead zones are ours to write)
- Before writing the GDD, play one walking sim, one third-person adventure and one first-person PC game of the new
  game's mood and note sensitivity range, rebind screen, pad prompts, auto-camera. No sourced default sensitivity
  numbers exist; do not invent a "standard".

Build order: input layer, then the settings object (row 7), rows 3 and 4, gamepad (row 6), hints (row 8). Controls are
one PR for all levels, never inside a level's PR; glyph and key names come from the binding, never from copy.

## Playtest checks (where they go in the Playtester's report)

`Layout` to `Hold` go into the `Controls` row, the NPC watch (`game-ux` §3) into `World life`, the touch
check into `Touch 390` (the rows `playtest-check.mjs`, in claude-setup `publish/templates/new-game/scripts/`, and `gate.md` read).

| Check | Pass when |
|---|---|
| Layout | a dispatched keydown `{code: 'KeyW', key: 'z'}` moves forward; `KeyA`/`KeyD` strafe whatever `key` says |
| Camera | mouse look or right-drag and Q/E all turn the camera; the context menu does not open |
| Lock | Esc or a lost pointer lock pauses, a click resumes with no state lost |
| Reach | mouse or drag look reaches every interactable the GDD lists |
| Rebind | one action rebound in the menu works at once, survives a reload, and its hint shows the new key |
| Sensitivity, invert | `__lookBy(100, 0)` (mouse counts) changes yaw by 100 x the mouse sensitivity within 1 %; invert flips the pitch sign |
| Auto-camera | switching it off keeps the view where the player left it for 5 s |
| Gamepad | with a standard pad (or mocked `navigator.getGamepads`) the left stick walks, the right stick turns, A, B and Start do their jobs; a stick value 0.01 under the GDD's inner dead zone gives no move, vibration off silences the pad |
| Options | opens from the title and from play, no state lost, every value saved |
| Hints | the active device's key or glyph shows at each action; after a pad press the glyph changes |
| Reduced motion | the OS flag and the menu toggle both stop bob, shake and camera flashes |
| Hold | every hold action has a toggle |
| Touch (`Touch 390`) | at 390 px a left thumb stick or tap-to-move walks, a right-thumb drag turns, every target is at least 44 px |

A check that needs real hardware (a physical pad, a real pointer lock) is listed in `Not checked:`, not ticked.
