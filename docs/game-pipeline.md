# Game pipeline handbook (characters, animation, scenes, story, Ren'Py)

The one page a new thread or chat reads before any work on a render-based story game (CompanyXY
chapter 1 first; every later game the same way). It says where every file lives, how each step
is done and what we learned. It needs repo access (claude-setup) and, for 3D work, laptop access
(the folders below). State: 2026-10-20.

**Keep it current.** Whoever adds or moves a folder, changes a step or learns a lesson updates
this page in the same PR or turn (rule: `CLAUDE.md`, Work for the future). A path here that no
longer matches the laptop is a bug: fix the page, not your memory.

Standing calls for every scene and character (adult main character, base + delta, generic scripts, refs, efficient renders): [`operator/roles/project-manager.md`](../.claude/skills/operator/roles/project-manager.md), Don't make him repeat.

Before any of this: the order concept, cast, look, world, outline, pilot is in [`preproduction-workflow.md`](preproduction-workflow.md); nothing is modelled for a character without an approved sheet.

## Where things live

The folder tree, the scene slots and the step-by-step for building a scene by hand live in **one place**:
`START.md` in the laptop's studio root (`STUDIO_ROOT`; the live map; asset folders: `lib\README.md`; references zip `Downloads\CompanyXY-Referenzen.zip` listed there; a copy for cloud threads: `/mnt/project-files/MAP.md` section 3, old to new table).
That README is for yskills and is the home of every laptop path; this page only names the main ones and
links it. Update both in the same turn when a folder changes.

| What | Where |
|---|---|
| Asset library | laptop `lib/` under `STUDIO_ROOT` (not in git; `catalog.json` in the root, one entry per asset) |
| Female base template (only file in its folder) | `lib\characters\CH_Base\female\Blend\base_female_v4.blend`; tools and work log in `..\_work\` (`sets.py`, `cg_lib.py`, `poses.py`, `body_aware.py`, `HANDOFF.md`) |
| A character | `lib\characters\CH_<name>\` (Rika: `CH_rika\Blend\rika.blend`; man: `CH_male\male.blend`) |
| Rooms | `lib\rooms\<room>\<room>.blend` + `_preview.png` (built by `_work\sets.py`, saved by `save_rooms.py`; office_night has `Camera_POV_stand`, `Camera_POV_sit`, `Camera_Side`) |
| Shots | `projects\games\<game>\<chapter>\<shot>\<shot>.blend` + `compare.png`; overview `projects\games\companyxy\ch01\overview.png` |
| Animation | `lib\anims\_retarget\ANIMATIONEN.md` (+ `retarget.py`, `maps\`); packs in `lib\anims\AN_<name>\` |
| Two-person rig | `lib\anims\sfw\pair\kiss\` (`README.md`, `kiss.json`, `apply_interaction.py`, `bone_maps\`) |
| Ren'Py game | private repo `yverse-studio/companyxy-spiel` (`game/` source, `story/<char>/` chapters, `story/briefs/` scene list + briefs); playable build on the laptop `projects/games/companyxy/build/` (the play copy) (art in `game\art\`, `game\art\loops\`, slots in `game\slots.rpy`) |
| Story guide + plan | `/mnt/project-files/companyxy/story/storyteller/` (`09-story-plan.md`); Rika's ten chapters: company-xy branch `story-rika-fanservice` |
| Body building guide + lessons | `/mnt/project-files/companyxy/patches/base-body/` (`GUIDE.md`, `LESSONS.md`); posing `characters/POSEN-ANLEITUNG.md` |

Explicit slot names and scene contents stay out of git (company-xy PR 80 rule): they live in the laptop
README and the private `nacht-kapitel1.rpy` only.

### One source, kept clean

Planned 2026-11-05, executed in stages (`rigs\` merged into `lib\anims\_engine\`; scripts live in `tools/`).

- One file per character, clip and scene, at its place in the README tree (`lib\characters\`, `lib\anims\`, `projects\games\`).
- Work happens in a dated copy `<name>_<date>_<reason>.blend` in the same folder and is written back into the target
  file at the end.
- The copy then goes to `_claude/_archive/<date>-<reason>/` or `_claude/trash/<date>/`; it never stays next to the original.
- No version chains (`_v1` ... `_v23`): at most the target, one working copy and one archive state.
- Render output and check strips live with the shot: `<shot>\render\`, `<shot>\checks\`.
- Before a thread ends it records in `docs/handoff/HANDOFF-CURRENT.md` (under `STUDIO_ROOT`) which file is current and where
  work continues.
- What is not in the README tree does not exist for the next thread.

**No sexual content on GitHub, private repos included** (2026-10-29: `yskills-claude` was suspended after explicit
clips, stills and proof strips sat in `companyxy-spiel`). GitHub's Acceptable Use Policies forbid "graphic depictions of
sexual acts including ... animation, computer-generated images, or text-based content" and its Terms let it scan private
repos for content that breaks them. So 18+ renders, loops, proof strips, gate sheets and explicit scene text never go
into any repo, branch or PR, not even "for review": they stay in `lib\`, `projects\` and the laptop play copy (the
game's `game/art/` and the 18+ `.rpy` files are git-ignored), and are shown to yskills as local files. Code, tools,
`position.json` numbers and neutral docs stay in git.

## Blender basics on the laptop

- Blender 5.2.3, never 5.1; its exe path is the one line of `tools/BLENDER_EXE.txt` under `STUDIO_ROOT` (not on PATH).
  Run headless: `blender -b <file> --python <script>.py -- <args>`; the Blender MCP `_for_cli`
  tools fail.
- Cloud Blender (no laptop): `apt-get install libegl1 libgl1-mesa-dri libegl-mesa0 libgles2`,
  `pip install bpy scipy pillow`. github.com is blocked in the cloud; raw.githubusercontent.com
  and extensions.blender.org work.
- Before every risky step save a backup `<file>-before-<step>.blend`. Save with the body mesh
  active and only selected, Layout tab, Object Mode.

## Characters

Our female base is `lib\characters\CH_Base\female\Blend\base_female_v4.blend`: body, rig, hair and clothes
with our adult head, straight rest pose, scaled uniformly to 1.65 m (rig and body together; bones and weights
untouched). Face kit 447 keys + 15 emotion keys; breast and five butt sliders on the body. A new character =
copy of the base in `characters\CH_<name>\Blend\<name>.blend` + slider values, head, hair, outfit, never a new
body. Rika (21, adult, our first figure): `CH_rika\Blend\rika.blend`, profile `CH_rika\README.md`, rebuilt by
`CH_Base\female\_work\build_rika.py`. Object names inside the files keep their original prefix (scripts and
bone maps depend on them; find the body as `*_Body`); never rename them by hand. The body source and its
licence are named only in `CH_Base\LICENCE-SOURCE.txt` (no redistribution of the model, check before any
release). 18+ scenes use a base copy in adult or office clothes or none; bought
characters as delivered never go into 18+ scenes. Clothes are fitted once per base and dressed by script:
`docs/clothing-pipeline.md`. Method and review: `docs/character-workflow.md`,
`blender-body` skill.

## Put an animation on a character

Full steps and the clip table: `lib\anims\_retarget\ANIMATIONEN.md`. Short:

1. New clip: put the FBX in `animations\AN_<pack>\source\`, add a `catalog.json` entry.
2. Bone map: copy `retarget\maps\mixamo_to_rika.json`, fix the target bone names for a new rig.
3. Bake: `blender -b <char.blend> --python retarget.py -- bake <map.json> <out.blend> <clip.fbx>... [--floor meshA,meshB]`.
   Clips land as actions `MX_<clip>` (fake user, 24 fps) in the character file.
4. Arm fix: `... -- armfix <out.blend> <action>...` (the body is wider than the Mixamo X Bot).
5. QA: `... -- strip <action> <png> --outfit office` (8 frames + `##GATE`: lowest shoe point,
   arm verts inside the body). Strip and numbers go to the gate.
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

## Chapter roles (who does what, per chapter)

A render-based story game is made chapter by chapter, like a VN studio (yskills 2026-11-10: "like a real project, every chapter grows the library and the workflow"). The story text is the only input; two Opus passes extract everything from it before anyone builds. Expensive models plan and gate, cheap models build ([`TEAMS.md`](TEAMS.md), Models).

| Step | Studio role | Our role, runs as, model | Hands over |
|---|---|---|---|
| 0 | Writer, script doctor | Story team (`storyteller` 07), threads | chapter text, Editor 5/5, scene tags and animation blocks in the text |
| 1 | Producer / line producer: script breakdown | `Planner · CH<n>` thread, Opus (the film `Producer` is no role on this kit) | `needs.md`: per scene set, cast and outfit state, props, clips; each library hit with its path, each miss a job with role and wave |
| 2 | Director / storyboard, reference researcher | `Designer · CH<n> shots` thread (the Designer as scene director), Opus; Researcher subagent, Sonnet | `shotlist.md` (one row per image or clip: slot, camera, pose, expression, outfit, light, sound cue, ref), `REFS.md` (per shot: ref file, what to copy), animation plan (intro, loop, finish beats) |
| 3 | Modeller, rigger, costume, cloth, environment, props | Character TD (body, face, hair, fitting, downloads), Costume Designer then Cloth Artist (a new garment), Environment Artist (rooms, props), Programmer (tools only); models per `TEAMS.md` (Roster) | only the misses of `needs.md`, each in the library with its gate passed |
| 4 | Layout / camera | planned in the shot list, done by the Animator | cameras as data per set, a framing check, a contact sheet with large labels |
| 5 | Lighting, render, animation | `Animator · <shot or clip>` with an Opus fix list per round | previews with the ref beside each shot |
| 6 | QA / dailies | one fixed gate thread per area, Opus, never the builder | `GATE.md` with marked images (`operator/gate.md`, Scored gates) |
| 7-9 | Render, sound, integration | Programmer, Sound Designer, Sonnet | finals, sound per the cue column, slots filled, 0 placeholders |
| 10 | Playtest | Tester with a Playtester subagent, Opus | every route played, screenshots |
| 11 | Pipeline TD (retro) | the chapter's Planner | new assets promoted into the library, one lesson line per surprise, the four planning files copied as the next chapter's start |

**One chapter plan, gated before any build** (yskills 2026-11-10): steps 1 and 2 write one `CHAPTER-PLAN.md` (chapter facts, rooms, shots, clips, asset jobs) on locked text, Opus at high effort. A fresh Opus plan gate passes it only when every beat has a shot, every row has a ref and numbers, every library asset is named by path, continuity holds, and a previz contact sheet (grey proxies in the real set and camera, 10 %) has been looked at beside the refs. Builders then get one brief per job with inputs and sha, exact values copied from the plan, one output path and a clean end; they read nothing else and decide nothing.

Researcher, Architect (the fix list), Continuity (a column in the shot list) and Playtester are subagents, never threads. Waves: a wave goes from build to integration as soon as its assets pass; the next wave builds meanwhile. Project paths and the current chapter's status live in the project's own copy of this table, never in git when the game is 18+.

## The chapter 1 night scenes (yskills builds them himself)

Claude threads do not render these; they only keep this recipe right. Five seamless loops (one per position)
and five stills (kiss, three endings, after). The exact file names are in the game source, block `init 2`
of `game/nacht-kapitel1.rpy` (laptop game folder, or `/mnt/project-files/companyxy/game/` for cloud
threads), and in `START.md` and `projects\games\companyxy\ch01\` (the night scenes); they stay out of git.

1. Save a new file as `scenes\companyxy\ch01\<slot>\<slot>.blend`.
2. File > Link: room `environment\rooms\office_night\office_night.blend` (10th floor, desk, chief chair,
   window wall with skyline; preview `office_night_preview.png`), Rika `characters\CH_rika\Blend\rika.blend`,
   the man `characters\CH_male\male.blend` (1.90 m in scenes); Object > Library Override > Make to pose.
3. Cameras already in the room: `Camera_POV_stand` (eye 1.78 m), `Camera_POV_sit` (1.27 m), `Camera_Side`,
   `Camera_Render`. Output 1920x1080.
4. Pose by hand or from an `MX_*` action; references: `CompanyXY-Referenzen.zip` in the Downloads folder
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

## Scene clips, player and sound

Clip slots, tempo stages, the player, the hide-the-man option and the sound layers live in the `storyteller` skill: [`08-scene-clips-and-sound.md`](../.claude/skills/storyteller/references/08-scene-clips-and-sound.md). Scene gate, camera and motion rules: [`two-figure-scenes.md`](two-figure-scenes.md).

## Lessons (each one cost a round)

- A clip is rendered only as the score rule's pick after a gate PASS on the gate sheet (`operator/gate.md`, Scored gates), never "good enough for now".
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
- Builders fill context fast: hand off at a trigger (`docs/WORKFLOW.md`, Handoff triggers) with a `HANDOFF.md` entry.
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
- New downloads land in `inbox/` (the inbox): unpack, keep only what is needed, sort into the
  library with licence and catalog entry, then empty temp.
- Back up a file before a body change as `<name>_before-<change>.blend`; scale uniformly, never touch bones
  or weights.
- Threads copy a tool into their round folder and fork it (GameDev 2026-11-10: 563 scripts, `clearance.py` in 5 versions, the registered one the oldest). Call tools through one front door (`scripts/cxy/`, `cxy <tool>`), fix the tool in place, and run `cxy inventory` at chapter end; a fork of a proven tool goes back into the one copy by its owner thread.
