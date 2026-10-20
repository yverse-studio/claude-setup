# Game pipeline handbook (characters, animation, scenes, story, Ren'Py)

The one page a new thread or chat reads before any work on a render-based story game (CompanyXY
chapter 1 first; every later game the same way). It says where every file lives, how each step
is done and what we learned. It needs repo access (claude-setup) and, for 3D work, laptop access
(the folders below). State: 2026-10-20.

**Keep it current.** Whoever adds or moves a folder, changes a step or learns a lesson updates
this page in the same PR or turn (rule: `CLAUDE.md`, Work for the future). A path here that no
longer matches the laptop is a bug: fix the page, not your memory.

## Where things live

The folder tree, the scene slots and the step-by-step for building a scene by hand live in **one place**:
`GameAssetLibrary\README.md` on the laptop (a copy for cloud threads: `/mnt/project-files/companyxy/docs/GameAssetLibrary-README.md`).
That README is for yskills and is the home of every laptop path; this page only names the main ones and
links it. Update both in the same turn when a folder changes.

| What | Where |
|---|---|
| Asset library | laptop `C:\Users\Claude\Documents\GameAssetLibrary` (not in git; `catalog.json` one entry per asset) |
| Female base template (only file in its folder) | `characters\CH_Base\female\Blend\base_female_v4.blend`; tools and work log in `..\_work\` (`sets.py`, `cg_lib.py`, `poses.py`, `body_aware.py`, `HANDOFF.md`) |
| A character | `characters\CH_<name>\` (Rika: `CH_rika`; man: `CH_male\male.blend`) |
| Rooms | `environment\rooms\<room>\<room>.blend` (built by `_work\sets.py`) |
| Shots | `scenes\<game>\<chapter>\<shot>\<shot>.blend` + `compare.png`; overview `scenes\companyxy\ch01\overview.png` |
| Animation | `animations\retarget\ANIMATIONEN.md` (+ `retarget.py`, `maps\`); packs in `animations\AN_<name>\` |
| Two-person rig | `rigs\interaction\` (`README.md`, `kiss\`) |
| Ren'Py game | laptop `GitHub\CompanyXY-Spiel\CompanyXY-1.0-pc\` (`game\art\`, `game\art\loops\`, slots in `game\slots.rpy`); zips in `/mnt/project-files/companyxy/game/` |
| Story guide + plan | `/mnt/project-files/companyxy/story/storyteller/` (`09-story-plan.md`); Rika's ten chapters: company-xy branch `story-rika-fanservice` |
| Body building guide + lessons | `/mnt/project-files/companyxy/patches/base-body/` (`GUIDE.md`, `LESSONS.md`); posing `characters/POSEN-ANLEITUNG.md` |

Explicit slot names and scene contents stay out of git (company-xy PR 80 rule): they live in the laptop
README and the private `nacht-kapitel1.rpy` only.

## Blender basics on the laptop

- Blender 5.1 at `C:\Program Files\Blender Foundation\Blender 5.1\blender.exe` (not on PATH).
  Run headless: `blender -b <file> --python <script>.py -- <args>`; the Blender MCP `_for_cli`
  tools fail.
- Cloud Blender (no laptop): `apt-get install libegl1 libgl1-mesa-dri libegl-mesa0 libgles2`,
  `pip install bpy scipy pillow`. github.com is blocked in the cloud; raw.githubusercontent.com
  and extensions.blender.org work.
- Before every risky step save a backup `<file>-before-<step>.blend`. Save with the body mesh
  active and only selected, Layout tab, Object Mode.

## Characters

The base is Yumeka's own file (body, rig, hair, clothes) with our adult head, straight rest pose,
tail and wings removed, scaled uniformly to 1.65 m (rig and body together; bones and weights
untouched). Face kit 447 keys + 15 emotion keys; breast and five butt sliders on the body. A new
character = slider values + head + hair + outfit on this base, never a new body. Method and
review: `docs/character-workflow.md`, `blender-body` skill. A character file is a copy of the base in
`characters\CH_<name>\<name>.blend` (Rika: `CH_rika\rika.blend`); `CH_rika\RIKA-FINAL.blend` is the old
MakeHuman archive, not used for scenes. 18+ scenes use a base copy in adult or office clothes or none, never
Yumeka's school outfit; the Booth characters as delivered never go into 18+ scenes. Yumeka's licence allows
modification and 18+ with a content rating, no redistribution; check before any release. Claude threads do
not make the explicit renders; yskills makes them himself on `rika.blend`.

## Put an animation on a character

Full steps and the clip table: `GameAssetLibrary\animations\retarget\ANIMATIONEN.md`. Short:

1. New clip: put the FBX in `animations\AN_<pack>\source\`, add a `catalog.json` entry.
2. Bone map: copy `retarget\maps\mixamo_to_yumeka.json`, fix the target bone names for a new rig.
3. Bake: `blender -b <char.blend> --python retarget.py -- bake <map.json> <out.blend> <clip.fbx>... [--floor meshA,meshB]`.
   Clips land as actions `MX_<clip>` (fake user, 24 fps) in the character file.
4. Arm fix: `... -- armfix <out.blend> <action>...` (the body is wider than the Mixamo X Bot).
5. QA: `... -- strip <action> <png> --outfit office` (8 frames + `##GATE`: lowest shoe point,
   arm verts inside the body). Look at the strip yourself.
6. Loop: `loop_window.py -- <name> <frames> <actions>...` picks the best seamless window
   (`Dance_Tease` is the example).
7. Add the row to the clip table in `ANIMATIONEN.md`.

Two people (kiss, bed scenes): templates name roles, not bones. Give each character one bone map
in `rigs\interaction\kiss\bone_maps\<name>.json` (copy `yumeka_v4.json`), then
`blender -b --factory-startup --python rigs\interaction\kiss\apply_interaction.py -- <scene>.json <charA.blend> <charB.blend> out.blend`.
The solver links the characters as library overrides and scales contacts by `height_m`;
characters are never edited. Details: `rigs\interaction\README.md`, scene sheets in `animations\Nsfw\`.

Free mocap in the cloud: 75 CMU BVH clips + `scripts/retarget_cmu_to_mixamo.py` in
`/mnt/project-files/companyxy/patches/base-body/library/assets/` (`SOURCES.md`).

## Build a scene (a still or a loop)

1. New `.blend` under `scenes\<game>\<chapter>\<shot>\`. Link the room from `environment\rooms\`
   (a new room: build it in `sets.py`, save it there), link the characters, make library overrides to pose.
   By script instead: copy a shot script from `_work\` (`cg_desk_pact.py` still, `loop_stretch.py` loop);
   scripts never save into the base.
2. Pose from a clip frame or by hand (`POSEN-ANLEITUNG.md`); for two people use the solver.
3. Render at 1920x1080 (sprites 700x1000, transparent); loops as seamless WebM VP9.
4. Check before anyone sees it: `body_aware.overlap()` (flags anything over 2 mm; `##GATE ... bad 0`),
   all views, feet planted, arms outside the body; a loop needs a 6+ frame strip including first and last frame.
5. Export the finished file into the game under its slot name (list: `game\slots.rpy`), then rebuild
   `scenes\companyxy\ch01\overview.png` with `make_overview.py`.

## Story and chapters

- Read before writing: `storyteller/README.md`, the cast and plan (`09-story-plan.md`), and search
  every branch for chapters that already exist (`git ls-tree -r --name-only <branch>`); Rika has ten.
- One Ren'Py file per chapter (`kapitel<N>.rpy`), optional 18+ night in its own file
  (`nacht-kapitel<N>.rpy`) behind an in-game 18+ prompt. UI text German.
- Content line and adult rule: company-xy `TASTE.md` and the project instructions; every
  character is an adult.

## The Ren'Py game

Setup, art slots, playthrough test, build and laptop delivery: `docs/renpy.md` (template in
`docs/renpy-template/`). Slots: `game/art/<name>.png|webp|jpg`, `game/art/loops/<name>.webm`;
a missing file shows a labelled placeholder, a dropped-in file replaces it with no code change.

Next structural step (yskills 2026-10-20 13:57): the game gets its own repo with the source in
git (`game/` scripts, `ASSETS.txt`, tests), `*.rpyc`, `cache/`, `saves/`, `log.txt` and built zips
ignored, big art in Git LFS or kept in the library, and `renpy.sh <proj> lint` + the playthrough
test in CI. Until then the source lives only as zips on the laptop and in project files.

## Lessons (each one cost a round)

- Never report a clip or still as done unseen: check a frame strip (arms, hands, clipping, loop
  seam, feet planted). Idle_Flirt went out with floating arms and a drifting body.
- Every still or clip gets an overlap check: a cardigan went through the body, a cup through a
  tray, toes showed through shoes.
- Open every `.blend` fresh as saved and check every workspace tab with the body active.
  Broken bones and empty tabs were found by yskills, not by us.
- Start the built game once before saying it works; a template file crashed only the build.
- Rest pose stands straight (Yumeka's); a forward-leaning rest skews every comparison.
- Ref beside the model in the same view every round; side view first; fail a round that got worse
  in any view than the best round.
- One shape key per form; pose correctives as one full target shape driven by bone angle. No
  stacked fix keys, no global smoothing. Test every model's own keys at 0 and 1 first.
- `mesh.transform()` needs `shape_keys=True`, or the Basis key stays put.
- In `Yumeka.blend` the body is `Yumeka_Body`; the object called `Body` is the head. Use
  `Yumeka.blend`, not `Rika Aizawa.blend` (its rest pose does not match its mesh).
- Reuse first: existing models, rigs, clips, chapters and game patterns before anything new;
  research licence and tools before spending budget.
- Builders fill context fast: hand off by 200k with a `HANDOFF.md` entry.
