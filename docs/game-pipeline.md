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
`GameAssetLibrary\README.md` on the laptop (references zip `Downloads\CompanyXY-Referenzen.zip` listed there; a copy for cloud threads: `/mnt/project-files/companyxy/docs/GameAssetLibrary-README.md`).
That README is for yskills and is the home of every laptop path; this page only names the main ones and
links it. Update both in the same turn when a folder changes.

| What | Where |
|---|---|
| Asset library | laptop `C:\Users\Claude\Documents\GameAssetLibrary` (not in git; `catalog.json` one entry per asset) |
| Female base template (only file in its folder) | `characters\CH_Base\female\Blend\base_female_v4.blend`; tools and work log in `..\_work\` (`sets.py`, `cg_lib.py`, `poses.py`, `body_aware.py`, `HANDOFF.md`) |
| A character | `characters\CH_<name>\` (Rika: `CH_rika\Blend\rika.blend`; man: `CH_male\male.blend`) |
| Rooms | `environment\rooms\<room>\<room>.blend` + `_preview.png` (built by `_work\sets.py`, saved by `save_rooms.py`; office_night has `Camera_POV_stand`, `Camera_POV_sit`, `Camera_Side`) |
| Shots | `scenes\<game>\<chapter>\<shot>\<shot>.blend` + `compare.png`; overview `scenes\companyxy\ch01\overview.png` |
| Animation | `animations\retarget\ANIMATIONEN.md` (+ `retarget.py`, `maps\`); packs in `animations\AN_<name>\` |
| Two-person rig | `rigs\interaction\kiss\` (`README.md`, `kiss.json`, `apply_interaction.py`, `bone_maps\`) |
| Ren'Py game | private repo `yverse-studio/companyxy-spiel` (`game/` source, `story/<char>/` chapters, `story/briefs/` scene list + briefs); playable build on the laptop `GitHub\CompanyXY-Spiel\CompanyXY-1.0-pc\` (art in `game\art\`, `game\art\loops\`, slots in `game\slots.rpy`) |
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

Our female base is `characters\CH_Base\female\Blend\base_female_v4.blend`: body, rig, hair and clothes
with our adult head, straight rest pose, scaled uniformly to 1.65 m (rig and body together; bones and weights
untouched). Face kit 447 keys + 15 emotion keys; breast and five butt sliders on the body. A new character =
copy of the base in `characters\CH_<name>\Blend\<name>.blend` + slider values, head, hair, outfit, never a new
body. Rika (18, adult, our first figure): `CH_rika\Blend\rika.blend`, profile `CH_rika\README.md`, rebuilt by
`CH_Base\female\_work\build_rika.py`. Object names inside the files keep their original prefix (scripts and
bone maps depend on them; find the body as `*_Body`); never rename them by hand. The body source and its
licence are named only in `CH_Base\LICENCE-SOURCE.txt` (no redistribution of the model, check before any
release). 18+ scenes use a base copy in adult or office clothes or none, never school-uniform pieces; bought
characters as delivered never go into 18+ scenes. Clothes are fitted once per base and dressed by script:
`docs/clothing-pipeline.md`. Method and review: `docs/character-workflow.md`,
`blender-body` skill.

## Put an animation on a character

Full steps and the clip table: `GameAssetLibrary\animations\retarget\ANIMATIONEN.md`. Short:

1. New clip: put the FBX in `animations\AN_<pack>\source\`, add a `catalog.json` entry.
2. Bone map: copy `retarget\maps\mixamo_to_rika.json`, fix the target bone names for a new rig.
3. Bake: `blender -b <char.blend> --python retarget.py -- bake <map.json> <out.blend> <clip.fbx>... [--floor meshA,meshB]`.
   Clips land as actions `MX_<clip>` (fake user, 24 fps) in the character file.
4. Arm fix: `... -- armfix <out.blend> <action>...` (the body is wider than the Mixamo X Bot).
5. QA: `... -- strip <action> <png> --outfit office` (8 frames + `##GATE`: lowest shoe point,
   arm verts inside the body). Look at the strip yourself.
6. Loop: `loop_window.py -- <name> <frames> <actions>...` picks the best seamless window
   (`Dance_Tease` is the example).
7. Add the row to the clip table in `ANIMATIONEN.md`.

Hand-keyed motion goes on a control rig (Rigify or IK/FK controls) that drives the deform bones,
never keys on the deform (skin) bones directly; retarget bakes above are the exception. Before a new
kind of task (rig, cloth, physics), look up how artists do it without AI and follow that method.

Two people (kiss, bed scenes): templates name roles, not bones. Give each character one bone map
in `rigs\interaction\kiss\bone_maps\<name>.json` (copy `rika.json`), then
`blender -b --factory-startup --python rigs\interaction\kiss\apply_interaction.py -- <scene>.json <charA.blend> <charB.blend> out.blend`.
The solver links the characters as library overrides and scales contacts by `height_m`;
characters are never edited. Details: `rigs\interaction\kiss\README.md`, scene sheets in `animations\Nsfw\`.

Free mocap in the cloud: 75 CMU BVH clips + `scripts/retarget_cmu_to_mixamo.py` in
`/mnt/project-files/companyxy/patches/base-body/library/assets/` (`SOURCES.md`).

## Build a scene (a still or a loop)

Two figures (poses, contact solver, motion, POV camera, look, export): `docs/two-figure-scenes.md`.

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

## Scene brief (what the animator gets per scene)

One file per game: a scene table (chapter, beat, slot, type), then one brief per animated scene:
- **Slot**: `<char>_c<NN>_<what>` = `game/art/<slot>.png` (still) or `game/art/loops/<slot>.webm` (loop).
- **Type**: still, loop (length in frames at 24 fps, seam frame) or loop + finish (finish length).
- **Room**: existing room file from `environment\rooms\` or a new-room spec (size, furniture with
  positions, light sources, time of day, props).
- **Characters**: file per character, outfit state at start and end, hair state.
- **Action**: per phase, pose and motion with timing; existing clips to start from.
- **Camera**: which camera (POV stand or sit, side, close), lens, framing.
- **Shape keys and expressions**: by name from the laptop README; values per phase.
- **Sound** cues, and **checks**: feet planted, no clipping, loop seam, hands.

## The chapter 1 night scenes (yskills builds them himself)

Claude threads do not render these; they only keep this recipe right. Five seamless loops (one per position)
and five stills (kiss, three endings, after). The exact file names are in the game source, block `init 2`
of `game/nacht-kapitel1.rpy` (laptop game folder, or `/mnt/project-files/companyxy/game/` for cloud
threads), and in `GameAssetLibrary\README.md` (section on the night scenes); they stay out of git.

1. Save a new file as `scenes\companyxy\ch01\<slot>\<slot>.blend`.
2. File > Link: room `environment\rooms\office_night\office_night.blend` (10th floor, desk, chief chair,
   window wall with skyline; preview `office_night_preview.png`), Rika `characters\CH_rika\Blend\rika.blend`,
   the man `characters\CH_male\male.blend` (1.90 m in scenes); Object > Library Override > Make to pose.
3. Cameras already in the room: `Camera_POV_stand` (eye 1.78 m), `Camera_POV_sit` (1.27 m), `Camera_Side`,
   `Camera_Render`. Output 1920x1080.
4. Pose by hand or from an `MX_*` action; references: `C:\Users\Claude\Downloads\CompanyXY-Referenzen.zip`
   (`INHALT.txt` lists the folders).
5. Check: nothing inside a body, feet planted, loop's first frame = last frame.
6. Stills: PNG 1920x1080 into the game's `game\art\`. Loops: render a PNG sequence, then
   `ffmpeg -framerate 24 -i f_%03d.png -vf "scale=1920:1080,format=yuv420p" -c:v libvpx-vp9 -b:v 0 -crf 30 <slot>.webm`
   into `game\art\loops\`. Restart the game: the placeholder is replaced.

## Story and chapters

- Load the `storyteller` skill. Read the game repo's cast and plan, and search every branch for
  chapters that already exist (`git ls-tree -r --name-only <branch>`) before writing new ones.
- One Ren'Py file per chapter (`kapitel<N>.rpy`), optional 18+ night in its own file
  (`nacht-kapitel<N>.rpy`) behind an in-game 18+ prompt. UI text German.
- Content line and adult rule: company-xy `TASTE.md` and the project instructions; every
  character is an adult.

## The Ren'Py game

Setup, art slots, playthrough test, build and laptop delivery: `docs/renpy.md` (template in
`docs/renpy-template/`). Slots: `game/art/<name>.png|webp|jpg`, `game/art/loops/<name>.webm`;
a missing file shows a labelled placeholder, a dropped-in file replaces it with no code change.

The game has its own private repo, `yverse-studio/companyxy-spiel` (since 2026-10-21): `game/` scripts,
`ASSETS.txt`, tests and the story; `*.rpyc`, `cache/`, `saves/`, `log.txt` and built zips ignored; big art stays
in the library. A new story game copies this layout.

## Lessons (each one cost a round)

- Never report a clip or still as done unseen: check a frame strip (arms, hands, clipping, loop
  seam, feet planted). Idle_Flirt went out with floating arms and a drifting body.
- Every still or clip gets an overlap check: a cardigan went through the body, a cup through a
  tray, toes showed through shoes.
- Open every `.blend` fresh as saved and check every workspace tab with the body active.
  Broken bones and empty tabs were found by yskills, not by us.
- Start the built game once before saying it works; a template file crashed only the build.
- Rest pose stands straight; a forward-leaning rest skews every comparison.
- Ref beside the model in the same view every round; side view first; fail a round that got worse
  in any view than the best round.
- One shape key per form; pose correctives as one full target shape driven by bone angle. No
  stacked fix keys, no global smoothing. Test every model's own keys at 0 and 1 first.
- `mesh.transform()` needs `shape_keys=True`, or the Basis key stays put.
- In the base the body mesh is `*_Body`; the object called `Body` is the head.
- Reuse first: existing models, rigs, clips, chapters and game patterns before anything new;
  research licence and tools before spending budget.
- Builders fill context fast: hand off by 350k with a `HANDOFF.md` entry.
- Check what the body already has first: every model job starts with an inventory of existing shape keys,
  geometry, painted details, weights and materials, and improves those. Grafting new anatomy geometry over
  detail the body already had wasted a whole budget (10-21); the fix that stuck opened the existing
  painted detail with sliders that read closed at 0, plus a vertex group for the region.
- Soft-body keys (squeeze, push-up, hand dents, sit-flatten, POV head) go on the character file as one named
  key each, driven where a bone angle decides; list them in the laptop README so the animator finds them.
- Blender drops actions with no user on save: set `use_fake_user = True` on every action before saving, and
  verify full lists, never a truncated print.
- Renames happen all at once or not at all, with the bone/animation maps updated in the same step; a half
  rename broke the animator's maps (10-21). Adopted models are named after the current character.
- New downloads land in `GameAssetLibrary\temp` (the inbox): unpack, keep only what is needed, sort into the
  library with licence and catalog entry, then empty temp.
- Back up a file before a body change as `<name>_before-<change>.blend`; scale uniformly, never touch bones
  or weights.
