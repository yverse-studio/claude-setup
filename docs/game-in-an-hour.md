# Game in an hour (playbook for the next Ren'Py story game)

Goal: a new game (the vacation game is the first user) needs **only new story, characters and animation**.
Everything below was done and checked in the CompanyXY test chapter (2026-11-02). What is not proven yet is
listed at the end and must not be treated as a rule. Genre patterns only: no meshes, textures, names or code
from another game (teardowns are read for patterns, `GameAssetLibrary\_research\game-teardowns-use-for-company-2026-11-02.md`).

Home of the rest: building a still or loop `docs/game-pipeline.md`; two figures `docs/two-figure-scenes.md`;
18+ content stays off every git remote (game-pipeline.md, "No sexual content on GitHub").

## 0. Start (5 min)

1. New project folder under `Games\<name>\`, copy `docs/renpy-template/` (`slots.rpy`, `testcases.example.rpy`) and
   from the CompanyXY play copy these four files: `game/szene.rpy`, `game/szene_ton.rpy`, `game/characters.rpy`,
   `game/characters.json`. The engine files hold no story; one copy of truth = the newest CompanyXY game folder.
2. Edit `characters.json` only: one entry per figure (`name`, `var`, `color`, `sprite`, `slot_prefix`). Scripts read
   `CHARS[key]["name"]` / `char_name(key)`, never a literal name. A rename later is one JSON edit.
3. `renpy.exe <project> lint` must be clean before anything else.

## 1. Structure (what goes where)

| Part | File | Rule |
|---|---|---|
| Characters, names | `characters.json` + `characters.rpy` (`init -10`) | no literal names in scripts |
| Image/loop slots | `slots.rpy` | `slot_image` / `slot_loop` / `slot_anim`: a missing file shows a placeholder, so the game always runs |
| Scene player | `szene.rpy` | `call szene_spielen(slot, intro=, loop=, schnell=, finish=, wechsel=, raum=, blick=)` |
| Sound | `szene_ton.rpy` | files by name in `audio/szene/`, missing = silent |
| Story | `kapitelNN.rpy` | one file per chapter or route, choices set values, scenes ask them |
| Tests | `testcases.rpy` | see 4 |

Order rule: `define`s of speakers run in file order. A table that holds `Character` objects needs `init 5 python`
(found when `nacht-kapitel1.rpy` sorted before `script.rpy`).

## 2. Scene and clip pipeline (animation side)

A scene is a **slot name** plus files in `game/art/loops/`, nothing else:

`<slot>_intro.webm` (once), `<slot>_loop.webm` (camera A), `<slot>_B_loop.webm` (camera B), `<slot>_fast.webm`,
`<slot>_finish.webm` (once, last frame = the still `art/<still>.png`). VP9, 24 fps, 1920x1080, no sound.

- **Three views** per slot, same names with the view in the middle: `<slot>_xray_loop.webm` (body transparent),
  `<slot>_nur_loop.webm` (only the contact visible). Any part may be missing in a view: the player shows "normal"
  for that part. Render time only, no code per view.
- **Camera A/B**: automatic cut every 4-8 s (A/B), or locked by the player (Kamera: Auto/A/B). Clip pair has equal length.
- The Blender side (clip library, retarget, contact gate, strip OK before any full render) is the animator's recipe:
  `GameAssetLibrary\animations\retarget\ANIMATIONEN.md`, `scenes\companyxy\ch01\SZENE-REZEPT.md`.
- New loops are copied into `game/art/loops/` only after the gate; the game never waits for them.

## 3. UI and gameplay patterns that worked

- **Phases**: intro -> loop (A/B cut, line per cut) -> fast ("Schneller" or auto after 12 s) -> finish (burst, then
  lines) -> still, then normal dialogue. One screen with small buttons top right; a click anywhere advances.
- **Choice of scene** by a menu that only lists what the clip state allows (`nacht_offen()`): clothing in the clip
  decides which scenes can follow, text must say what the clip shows.
- **Look-intro** (`blick=[...]`): before the clip the room fades to dark, the camera creeps in (9 s zoom) and 1-3
  lines of eye contact run. It needs no clip, so it works on day one; real intro clips follow it.
- **Reaction insert**: a face still over the running clip every 60 s (1.5 s).
- **Never black**: clips switch with a 1-frame dissolve and the first clip is laid over the old image.

## 4. Testing without disturbing anyone

- Static: `renpy.exe <project> lint`.
- Logic without playback: a `label test_x` with `python:` asserts that writes `test-passed.txt`, run by
  `testcase x: run Start("test_x") / click until "<end text>" / $ renpy.quit()`.
- Full run: `CXY_TEST=1 SDL_AUDIODRIVER=dummy SDL_VIDEO_WINDOW_POS=-3000,0 renpy.exe <project> test default`.
  `CXY_TEST=1` is required: without it the game waits at the name input (`renpy.input`) and the test hangs.
  Muted and off-screen: no sound, no window on the user's screen. Ren'Py has no true headless mode
  (`SDL_VIDEODRIVER=dummy` fails with "Invalid window").
- In the test language a bare string line is the click target (`"Ansicht:"`), not `click "Ansicht:"`;
  `click until "x"` clicks anywhere until the text shows, so on a screen with buttons it advances the scene.
- A test that ends the process must write `test-passed.txt`; check it, because a stuck test looks quiet.

## 5. The hour (checklist for a new game)

1. (5 min) Start as in 0. Characters and names in the JSON.
2. (15 min) Story outline: chapters as files, one menu per decision, values not text flags.
3. (20 min) Scenes as slots (`slot_anim`) with placeholder art; every scene called through `szene_spielen`
   with `blick`, `intro`, `loop`, `schnell`, `finish` lines.
4. (10 min) Lint, one `testcase` that clicks the chapter through (one `click until "<line>"` per choice).
5. (10 min) Hand the animator the slot list (names, lengths, views); real files drop into `art/loops/` later.

## Not proven yet (do not rely on)

- The three views and camera lock with **real** xray/nur clips: the logic is tested, the clips do not exist yet.
- The look-intro's feel in play (only the code path ran under test).
- Anything from the teardowns not built here: event+condition story files, role-casting, SFW/NSFW packages,
  routine NPCs. They are candidate patterns (`game-teardowns-use-for-company-2026-11-02.md`), not rules.
- A full game in one hour: the steps are from the test chapter; nobody has timed a second game yet.
