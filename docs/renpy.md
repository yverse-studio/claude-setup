# Ren'Py visual novels

Learned building the CompanyXY chapter 1 (2026-10-20). Use it for any story game with renders,
choices and loops (Being a DIK / Summertime Saga style). Where the art, clips and scenes come
from: `docs/game-pipeline.md`.

## Before writing a line

Search every branch of the project's repos for story that already exists
(`git ls-tree -r --name-only <branch> | grep -i <character>` over `git branch -r`) and read the
story bible and plan. CompanyXY already had ten finished Rika chapters on a branch when this game
was written from scratch, and the rewrite cost yskills tokens and trust. Build from what exists.
Ask yskills only about real forks: engine, which route or chapter first, and how explicit a scene
should be.

## Set up in the cloud

- SDK: `curl -LO https://www.renpy.org/dl/8.3.7/renpy-8.3.7-sdk.tar.bz2` (renpy.org is reachable;
  github.com is not). Unpack, no install step.
- New project: copy `renpy-8.3.7-sdk/gui/game` to `<proj>/game`, then
  `./renpy.sh launcher generate_gui <proj> --start --width 1920 --height 1080 --accent "#..." --boring "#..." --language german`.
- Then delete `game/guisupport.rpy` and `game/testcases.rpy` from the template. `guisupport.rpy`
  imports the launcher-only `gui7` module: it works inside the SDK and crashes the shipped
  build on start (`No module named 'gui7'`). The launcher removes it; the CLI path does not.
- German UI: copy `launcher/game/tl/german/{common,screens,error}.rpy` into `game/tl/german/` and set
  the language.
- Set `config.name`, `build.name`, `config.save_directory` in `options.rpy`.

## Art slots before the art exists

Write the story against placeholder slots so it plays from day one. Look up
`game/art/<name>.png|webp|jpg` and `game/art/loops/<name>.webm` with `renpy.loadable()` at init. If the
file is missing, register a labelled `Solid` + `Text` placeholder that shows the expected file name.
Dropping the real file in replaces the placeholder with no code change. Keep art out of `game/images/`:
auto-images there would clash with the slot names. Ship an `ASSETS.txt` that lists every slot. Template: `docs/renpy-template/slots.rpy`; playthrough
example: `docs/renpy-template/testcases.example.rpy`.

## Animated scenes (intro, loops, finish)

One player label per game, never per-scene code: clips register by name (`<slot>_intro`, `_loop`, `_B_loop`,
`_fast`, `_finish` in `game/art/loops/`), missing parts drop out, and the label plays intro → A/B loops (hard cut
every 4-8 s) → fast → finish → still, with short auto lines in a small screen at the bottom and the stage buttons in
a corner. Reference: companyxy-spiel `game/szene.rpy`. Lessons that cost a round:

- All clips `Movie(..., channel="szene", group="szene")`: the group keeps the last frame until the next clip has
  one, so cuts never flash black. Tempo comes from separate clips, never from playback speed.
- The first clip of a scene is shown over the old image (no `scene` clear): a Movie is transparent until its first
  frame decodes, so the old image covers that instead of 3 black frames.
- Drive the loop phase from one Python loop with `renpy.pause(t)` (click returns True, a screen button returns its
  `Return` value) and count the requested time, not the wall clock, so rollback and skip cannot hang it.
- Test with the real clips: record Xvfb with `ffmpeg -f x11grab`, then `signalstats` YAVG per frame finds black frames.

## Check before shipping

- `./renpy.sh <proj> lint`
- Full playthrough under Xvfb: `xvfb-run -a -s "-screen 0 1920x1080x24" ./renpy.sh <proj> test`
  with a `testcase default:` block. The test grammar has no `advance`. Use `click until "menu text"`,
  `click until label <name>`, `type "Ren"`, `type RETURN` (the keysym is the pygame name without `K_`),
  and `$ renpy.screenshot("/path.png")`. `click until "<plain text>"` hangs: `until` needs a focusable
  button.
- Build: `./renpy.sh launcher distribute <proj> --package pc --destination <dir>` (about 40 MB zip).
  **Start the built copy once**: unzip it, then run `xvfb-run -a ./<Name>.sh` and check that there is
  no `traceback.txt`. The SDK test alone missed the `gui7` crash.

## Get it onto yskills' laptop

The folder tools take files up to 30 MB. Split the zip (`split -b 20m`), commit the parts with
`device_commit_files`, then rejoin and unzip them in `device_bash` with `cat` and Python `zipfile`.
Deleting files on the device is off by default, so move stale files into an `_alt/` folder.
