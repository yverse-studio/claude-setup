# Controls baseline: what every game ships with

The floor for any game with a player-moved camera or character (3D, 2.5D, top-down). `SKILL.md` §1 says how to
build the input layer; this file says what the player must get. No value here belongs to one game: a project
writes its own numbers in `design/GDD.md` (Controls and camera) and tunes them by playtest. Numbers marked
[judgement] are starting points, not measured on a reference game; the first human test replaces them
(origin: vacation-game airport audit, 2026-11-12, where every number was set by Claude and none by a human).

## The baseline (a game is not "controls done" before each row is a yes or a written exception)

| # | Row | Baseline |
|---|---|---|
| 1 | Move relative to camera | WASD and arrows move relative to where the camera looks. Bind the physical key (`KeyboardEvent.code`), never `key`, so AZERTY, QWERTZ and Dvorak keep the same hand shape; show the key name from the layout in prompts (`navigator.keyboard.getLayoutMap()` where it exists, else the code's letter) |
| 2 | Turn the camera | Mouse look (pointer lock, drag fallback) or right-drag orbit, plus Q/E as a keyboard turn so a player with no mouse is not locked out; context menu suppressed on the canvas |
| 3 | Rebinding | Every action rebindable in a menu, a new key for the action (not only swapping two), conflicts shown, reset to default, saved. Hints and glyphs update after a rebind (Xbox XAG 107; Game Accessibility Guidelines, Basic) |
| 4 | Sensitivity and invert | Look sensitivity slider (default [judgement] 0.3 to 0.4 deg per px, range 0.1 to 1.0), invert Y, separate stick sensitivity |
| 5 | Auto-camera toggle | A camera that swings back or recentres on its own can be switched off; default on for a walking game, off for anything with aiming |
| 6 | Gamepad | Gamepad API, `mapping === 'standard'`: left stick move, right stick camera, A confirm or interact, B back, Y secondary, Start pause; dead zone [judgement] 0.15, radial not per axis; a non-standard pad shows a "press the button" mapping step. Hot-plug (`gamepadconnected`) and glyphs follow the last device used |
| 7 | Options menu | One screen, reachable from the title and in play: Controls (rows 3 to 5), Camera (FOV, bob, shake), Accessibility (reduced motion, text size, subtitles, hold/tap toggles), Audio, Language. Saved locally, one settings object with a load/save/clamp unit test |
| 8 | Key hints | Quiet, always-on hints at the action itself (the key by the card, the glyph on the prompt), swapped to the active device; the first minute teaches by doing, not by a list |
| 9 | Accessibility floor | `prefers-reduced-motion` honoured and overridable in the menu; no hold-only action without a toggle; no action needs two hands on keyboard at once without an alternative; nothing told by colour alone; contrast and size readable at 907x510 (`SKILL.md` §4) |
| 10 | Touch | Left thumb walk, right thumb look or tap-to-move, 44 px targets; same settings object |
| 11 | Steam Deck | When Steam is a target: the default controller layout reaches all content without changing in-game settings, on-screen glyphs match the active device and never show mouse or keyboard glyphs while a pad is used, text readable at 30 cm, text entry works with a pad only (Steamworks Steam Deck compatibility, read 2026-11-12) |

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
   what rows 1 and 2 do), then gamepad (row 6), then hints (row 8). A per-chapter control fix is a smell: controls
   are one PR for every chapter, never inside a chapter PR.
2. Glyph and key names come from the binding, never from copy.

## Playtest row (copy into the Playtester's `keyboard at 1440` and `touch at 390` rows)

| Check | Pass when |
|---|---|
| Layout | with the browser's layout set to AZERTY (or by sending `KeyboardEvent` codes), the same physical keys move |
| Camera | mouse look or right-drag and Q/E all turn the camera; the context menu does not open |
| Rebind | one action rebound in the menu works at once, survives a reload, and its hint shows the new key |
| Sensitivity, invert | the slider changes degrees per px, invert flips Y, both read from the hook |
| Auto-camera | switching it off keeps the view where the player left it for 5 s |
| Gamepad | with a standard pad (or mocked `navigator.getGamepads`) the left stick walks, the right stick turns, A, B and Start do their jobs; dead zone holds at 0.1 |
| Options | opens from the title and from play, no state lost, every value saved |
| Hints | the active device's key or glyph shows at each action; after a pad press the glyph changes |
| Reduced motion | the OS flag and the menu toggle both stop bob, shake and blink |

A check that needs real hardware (a physical pad, a real pointer lock) is listed in `Not checked:`, not ticked.
