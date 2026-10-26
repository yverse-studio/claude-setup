# Two-figure scenes in Blender 5.1 (stills and loops)

The how-to for any scene with two rigged figures (from the animator's working guide, 2026-10-21). Paths are the
laptop library (`GameAssetLibrary`, see `docs/game-pipeline.md`); project specifics (slot lists, the
characters' key names) live in the private game repo and the laptop README.

## Setup

- Blender headless: `blender.exe -b --factory-startup`. At most 2 Blender processes at once on 16 GB RAM
  (~3.4 GB each); more and jobs die without a message.
- Figures: one `.blend` per character (`characters\CH_<name>\Blend\<name>.blend`). Back up before any change
  (`<name>_backup_<date>.blend`). Never rename or delete bones or weights: the bone maps depend on them.
- Bone maps: `rigs\interaction\core\bone_maps\<char>.json`, one per rig.

## The system (`rigs\interaction\`)

- `core\`: the engine (`engine.py`, `build_scene.py`, `run_scenes.py`, `config.py`, `secondary.py`,
  `apply_interaction.py`, `rooms.json`, `defaults.json`).
- `<action>\`: one folder per pose/action: `<action>.py` (pose per variant), `<action>.json` (persons, roles,
  `accepts_anchors`, `camera_default`, variants, defaults), README, `preview.png`. New folder = new action.
- `projects\<project>.json`: slot → action, variant, anchor, figures, outfit (`hide_A`), overrides, output folder.
- Commands: `python rigs\interaction\core\run_scenes.py <slot> --pos` (test, no render) · `<slot>` (preview)
  · `<slot> --loop` (48-frame loop + webm + frame strip). Contact sheet: `scenes\<project>\<chapter>\make_contact.py`.
- Output: `scenes\<project>\<chapter>\<slot>\` (`.blend`, `_preview.png`, `_strip.png`, `.webm`, `_check.json`).

## Order per scene

1. `--pos`, then read `_check.json` (hand distance mm, vertices inside furniture, partner clipping, feet/knee/hip z).
2. Preview, look at it downscaled. 3. Loop, look at the 8-frame strip. Never "done" without the strip.

## Gate and workflow (2026-10-26, night scenes)

- Cheap agents build and measure; the coordinator is the one expensive gate. It compares each sheet with the
  reference board and the reference loop strip at original size (small strips lie) and scores a table of five stars:
  contact, body, hands, picture/readability, motion, each with its measured numbers (`_check.json`).
  Only 5/5 is rendered at 1080p; "good enough for the test chapter" is not 5/5 (a 3.5/5 finish was rendered once
  and had to be redone). Gate rules: `operator/gate.md`.
- Test frames: headless 960x540 with the real light of the final render, then yskills approves, then 1080p.
  Fake light is fine, but a night room is dark and warm, never bright. A headless render looks different from the
  GUI (world strength, lights, view transform not saved in the file): compare one frame of each before trusting either.
- Geometry first, in the side view (stick figure): axis angles and heights are decided there, then `--pos`, one cheap
  preview with a crop beside the board, fix, gate, render. At most 3-4 rounds per scene; if the side view is wrong,
  fine values in the POV never fix it.
- Iterate live (Blender GUI + MCP), where the result is seen at once; headless only for the gate sheet and the render.
- One render at a time on the 7-16 GB laptop (two parallel renders crashed after 2-4 h each). Never edit
  `projects/*.json` while `run_scenes` renders: every clip re-reads it.
- Every sheet has a close-up of each hand (one scene went out with hands turned 180° and nobody saw it) and the
  side view next to the POV (the side shows what the POV hides).

## Pose the origin first, then parent the pair to `SCENE_ROOT` and set the root on a furniture anchor
  (`surface_edge`, `seat`, `seat_front`, `wall_or_glass`, `floor`). Move furniture per scene with `room_move`.
- Linked objects have an identity matrix until the first depsgraph update: update, then measure.
- Rotate via `LAT(ch)` (rig-independent), never `ch.left`. Armature `rotation_mode = XYZ`.
- Always set facing explicitly (`face(ch, ±1)`), or partners stand back to back.
- Standing feet: `ground()` (ankles at rest height). Match heights only with `crouch_to()` (bend knees), never
  by lowering a figure.
- Lying: pose standing, then rotate the object. Hair is rigid: rotate hair roots down per pose.
- Natural: weight on one leg/hip, back arched or rounded to the load, head follows the gaze, hands visibly carry
  weight. Compare against reference pictures every time.

## Contact and collision

- Bodies are rigid to Blender; contact = solver + shape keys.
- Solver (BVH): clipping limbs rotate away (joint limit `limb_max` ~25°, lock load-bearing legs with `lock`);
  a clipping torso moves only along a fixed `solve_axis` (normals flip on deep overlap), at most `move_max` ~0.12 m.
  Soft tissue may press in `soft` ~15-20 mm.
- Then re-grip the hands and raycast them onto the nearest surface (wrist ~2 cm above it). No guard zone around
  hand targets, or hands sink in.
- Real pressing (chest, seat, sitting) comes from the figure's own shape keys/bones, driven by the contact.

## Motion

- Rest pose = the extreme point; the loop moves away from it: slow out (~60 % of the time, smoothstep), fast
  back (ease-in), a hard impact frame. 1 Hz slow, 2 Hz fast. Seamless: frame N = frame 0, not doubled.
- The whole body reacts: the spine as a delayed wave from bottom to top, the head nods after, arms slide a
  little, counter-motion in the pelvis; the partner leans with it.
- Secondary (soft body parts, `secondary.py`): 3 frames lag, slight overshoot, 2 damped after-swings; hair last.
- Mover rule: only the person who works in the reference moves; the other holds still except breathing and
  follow-through. The camera impacts only when the POV carrier is the one pushing.
- Natural, not mechanical: every move eases in and out (3+ frames soft at each end, no linear ramps), keys Bezier or
  auto-clamped; arcs, not straight lines (the head lift curves); overlap (head 1-2 frames behind the spine, soft
  parts 2-4 frames behind with one overshoot); small side actions (breathing, a blink every 2-3 s, 1-2° head sway);
  two strokes in a loop are never identical; motion blur on (shutter 0.3) in fast phases.
- Never symmetric: head tilted 3-5°, one shoulder lower, hands not mirrored, weight on one side, one line of action
  from knees over the back to the head, hands loose (fingers fanned, slightly curled, never flat), nothing
  parallel to the frame edge. Resting arms lie relaxed on the lap or thighs (elbow low, wrist loose), never raised
  and never hanging.
- Transitions: clip seams (intro to loop, loop to finish) match speed and direction; the head's speed curve
  (mm/frame) has no jump above 30 % (a 1.5 cm/frame step is a fail); loop seam: all sine parts with period 48 or
  a divisor, ramps constant over the seam, the seam frame a copy of its twin. Smooth per-frame solver noise
  (ring PCA, IK, 0.3-1 mm jitter) after keying with a 3-frame Gauss/F-curve smooth; camera breathing and drift are
  smooth sines only.
- Intro: a calm tease, not a run-up. Eye contact, hands rest on the chest or lap, knead or lift briefly, let go
  (the parts fall and swing 2x), only then the action starts and eases into the loop; nothing faster than 1 cm/frame,
  no arms thrown up at the start. 4-6 s in the game, 2-3 s at the very least. Intro beats are listed per scene
  (look 0 s, hands 0 s, release 3.0 s, mouth 3.75 s, first stroke 4.6 s).
- Loops A and B per scene: other expression, depth and tempo, soft change (6-12 frame blend or a shared seam frame).
- No loop alone: the ending is its own clip (speed up, hold, fading tremble, eyes close, slump, slow release,
  3-5 s) plus a still from its last frame.

## Camera

- Default close POV: the partner's eye height (head bone + ~0.09 up, + ~0.07-0.15 forward), body fills
  70-100 % of frame, face at the back, torso in front. Hide the POV figure's own head for the camera only
  (vertex group/holdout), `clip_start` small (~0.05), or the other figure turns see-through.
- Lens 24-32 mm, depth of field f/2 on her face. Camera moves: slight handheld drift plus a small push on the
  beat, seamless; optional Dutch tilt. Side view only as a second shot.
- In the game: cut between close / medium / side every 2-4 s.
- Image language (from the references, yskills 2026-10-26):
  - The face (head, gaze) is in frame in every camera. From behind, no look into the lens is needed: focus on the
    back/hips, head in frame, and she looks back over the shoulder now and then (loop B).
  - POV may cheat hard: camera forward and 0.2-0.3 m lower, in front of the carrier's body, lens 22-28 mm; the
    carrier's face never in frame, his share of the picture 15 % at most (mask his legs and pelvis, spread the
    partner's legs a bit); one clear focus per scene.
  - The figure fills 80-100 % of the frame; in a loop the camera is still but tilted (Dutch 10-20°) and close, motion
    comes from the body. Dutch for cuts and the fast clip.
  - Dark warm toon skin: 2-3 steps, small hard highlights, coloured rim, dark warm background, never blown out.
    One garment still on reads more real than fully bare.
  - Camera lives: breathing, drift, Dutch sway as smooth sines; the impact is a push of 1-2 cm at the lowest point,
    4 frames back (only when the carrier pushes).

## Look

- EEVEE, TAA 64, 1920x1080, 24 fps, view transform Standard. Room lights + a warm key (~25-40 W, more burns
  skin white) + a coloured rim (pink/blue, ~70-110 W) + a dark purple world.
- Skin matte by default (owner's call 2026-10-21); gloss optional via the material's `skin_gloss` input.
  Freestyle outlines ~1.4 px, in POV on the main figure only.
- Partial clothing (stockings, open jacket, pushed-up top) frames the body better than none; plan the outfit's
  progression across scenes.

## Face

- Gaze into the camera by default. Expression changes every 4-6 s with a 0.3 s blend. Build a small expression
  table per character from its own face keys (smirk, smile, half-closed eyes, teasing, shy, blush, sweat, tears,
  eyes closed, mouth open) and keep it in the character's README.

## Export

- `ffmpeg -framerate 24 -i <scene>_%03d.png -vf "scale=1920:1080,format=yuv420p" -c:v libvpx-vp9 -b:v 0 -crf 30 -an <slot>.webm`
- mp4/2K later as a second preset (`libx264`, `scale=2560:1440`).

## Mistakes that happened (don't repeat)

Partners facing away (no `face()`). A figure lowered into furniture instead of bending knees. A solver without
limits twisted legs. Hands inside bodies (guard zone). Camera inside the own head / partner see-through
(`clip_start`). Too much light, white skin. Side views instead of POV. Only the pelvis moving.
Hands turned 180° (finger convention, below). A 3.5/5 clip rendered "for the test chapter". Per-frame
`keyframe_insert` while solving. Light changes left out of the saved file (headless render brighter than the GUI).

## Scripting traps (2026-10-26)

Rig conventions (finger axis, IK switches, ring groups, group names) are in
[`blender-body`](../.claude/skills/blender-body/SKILL.md), Rig conventions.

- Openings and contact depth come from a ring vertex group plus a path, never a heuristic ("most moved vertices"
  finds the throat tube). Ring centre and normal from the group (PCA); the head bone's Y is the skull axis, not the
  gaze. Before every measurement set all mouth/cheek keys to fixed values, or the ring normal drifts by cm.
  Staggered chain bend (first link at most 12°, second 25°, third the rest); stop hard when skin vertices leave the
  ring inside the shaft capsule (r ~1.5 cm), and measure only camera-visible vertices.
- `pb.matrix = ...` on rotated parents writes scale into the pose (hair explodes, ring normal wanders). Write
  `(parent * rest)^-1 * M` as quaternion/location with `scale = 1`, and reset scale in the reset function.
  Set `pb.matrix` for a palm-on-surface, then key it, or the action resets the pose at render.
- Never `keyframe_insert` while solving (the next `update()` evaluates the action and overwrites the pose): collect
  values per frame and write them at the end with `Action.fcurve_ensure_for_datablock` (Blender 5). Actions get
  Fake User. After a module reload create state dicts with `globals().get(...)`.
- Library overrides: constraints and shrinkwraps made fresh in the scene do not take hold, constraints from the figure
  file do (IK switches and poles included); new vertex groups and modifier settings on override objects are lost on
  reload (mask only with groups that exist); `light.data.energy` on override lights is not saved, `hide_render` is.
  After a room library resync check floor/walls for empty (white) material slots.
- Hands near a surface: raycast to the skin, palm +3 mm, then turn each finger joint back until it is within 2 mm
  (`finger_clip`); targets within arm length (else `hands_snap` > 100 mm); fixed grip presets, no finger back-solve;
  elbow pole search (24 angles) against arm penetration. A hand on a breast binds to the breast bone and drives the
  dent key by distance (0 at 12 cm, 1 at 3 cm).
- Loops need a seam test, an `align_tol` jump check (a threshold that spins the head 15° when crossed) and a mesh
  with inward normals counted as inside = `(p - loc)·n > 0`. A mesh with negative volume (inverted normals) makes the
  solver push the figures 25 cm apart: flip it. Never cut masks through the body (open edges shine through).

## One-shot direction

Every solution (hands, collision, openings, intro tease, loop A/B, camera, effects) becomes a reusable script in
`rigs\interaction\core` with JSON parameters, so a scene is a chain of scripts. The goal is a small HUD (people 1-4,
characters, room, action, optional furniture, ticks for intro/loop/finish) that builds the scene, opens Blender to
adjust it, renders the clips after saving and puts them in the game. The base exists: `run_scenes.py`,
`projects/<project>.json`, `<action>/<action>.json`, `rooms.json`. Before building a heavy part, look at how existing
scene tools solve it (VaM, sandbox games, pose editors, Blender pose-library add-ons) and copy before inventing.

## Recipe: the mund scene from zero (state 2026-10-26)

A fresh agent follows this with claude-setup plus the laptop handoffs, no questions. Handoffs (read-only sources, in
`GameAssetLibrary\`): `rigs\interaction\HANDOFF.md` (sections 6-8 gate, image language, engineering lessons; 9a vision;
9e order), `characters\CH_rika\Blend\HANDOFF.md` ("Rig v2"), `scenes\companyxy\ch01\INTEGRATION.md` (player).

1. Models: Rika `characters\CH_rika\Blend\rika.blend` (Rig v2), the man `characters\CH_male\male.blend` (v2.2, 1.90 m,
   normals out), room `environment\rooms\office_night`. Check first: bone maps (`rika_now.json`, `mh_male.json`:
   names), `core\test_openings.py` (0 hits, stop ~61 mm), finger-axis measurement, then `--pos` with numbers.
2. Geometry in the side view (she kneels at the desk edge, he leans back, shaft 15-30° up); face 45-55° to the camera,
   camera at his eyes +0.15 forward, lens 22. Then `python rigs\interaction\core\run_scenes.py <slot> --pos`.
3. Timeline (frames at 24 fps): intro 1-144 (close-up tease, hands to the chest 44-96, mouth opens, first stroke), loop
   145-192 (48, seamless), finish 193-268 (burst 24, hold with breathing, still). Render order: `intro=1-144
   loop=145-192 finish=193-268`; B camera extra (`--camera Camera_B --hide ... --mask mh_body:Penis_2`).
4. Mover = her, through the spine (bend about the cross axis, head counter-turn, roll ±4°, knees and hands fixed
   from frame 49), depth from the opening script per frame, strokes alternate (49 mm, 58 mm); camera still except
   breathing, Dutch ~7°, sway; soft parts as keys on the breast bones (3 frames lag, 2nd harmonic) because Wiggle 2
   does not run headless.
5. Look: dark warm night (world ~0.12, key ~70 W, cold rim), toon skin; headless test frames 960x540, fixed lights saved
   in the file. Effects (finish) from a reusable generator with presets and JSON, visible in the still.
6. Gate: sheets (A, B, hands close-ups, speed curve, loop strip next to the reference strip) -> five-star table ->
   yskills -> 1080p, 24-32 samples, one render at a time -> copy to the game, rebuild the contact sheet.
7. Known open points are listed at the end of `rigs\interaction\HANDOFF.md` section 9d/9e; do not repeat the listed
   mistakes below.
