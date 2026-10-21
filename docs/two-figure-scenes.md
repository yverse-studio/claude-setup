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

## Pose

- Pose around the origin first, then parent the pair to `SCENE_ROOT` and set the root on a furniture anchor
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
- No loop alone: the ending is its own clip (speed up, hold, fading tremble, eyes close, slump, slow release,
  3-5 s) plus a still from its last frame.

## Camera

- Default close POV: the partner's eye height (head bone + ~0.09 up, + ~0.07-0.15 forward), body fills
  70-100 % of frame, face at the back, torso in front. Hide the POV figure's own head for the camera only
  (vertex group/holdout), `clip_start` small (~0.05), or the other figure turns see-through.
- Lens 24-32 mm, depth of field f/2 on her face. Camera moves: slight handheld drift plus a small push on the
  beat, seamless; optional Dutch tilt. Side view only as a second shot.
- In the game: cut between close / medium / side every 2-4 s.

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
