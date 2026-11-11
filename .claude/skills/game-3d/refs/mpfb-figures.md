# Realistic NPCs with MPFB2, headless in the cloud (2026-11-11, vacation-game night market)

Free, CC0 output, no laptop, about 10 s per figure. Scripts: [`../scripts/mpfb/`](../scripts/mpfb/). LOD and crowd budgets:
[`crowds-and-lod.md`](crowds-and-lod.md). Body rules (base first, pose test): [`blender-body`](../../blender-body/SKILL.md).

## Setup (once per container, about 3 min)
`bash scripts/mpfb/setup.sh`: Blender as a Python module (`pip install bpy`, 5.3), the MPFB extension from extensions.blender.org,
the CC0 asset packs from files.makehumancommunity.org (system assets 280 MB: ranged parallel download; `files2.` fails TLS behind
the cloud proxy). MPFB is GPL-3.0 as a tool; the packs are CC0, so the GLBs carry no licence duty. Skip packs with "genitals" skins.

## One figure = one recipe json
`python3.13 build_figure.py recipe.json outdir` -> `<name>.glb` (all LODs, one `game_engine` skeleton of 53 bones, one material, one
atlas), `.blend`, colour and normal atlas PNGs. Recipe: MPFB macros (`gender`, `age` 0.5 = 25 y, 0.7 = about 50, `height`, `weight`,
`race`), `skin`, `skin_tint`, `hair`, `hair_tint`, `clothes` (inner first: on equal MakeClothes `z_depth`, later = outer), `lods`
(default 10k/5k/2k/700), `drop_lod0` for crowd files, `atlas` px. Render check: `render_sheet.py file.blend out.png`, hole check `holes.py file.blend` (front, 3/4, side,
back, lower LODs, face). Ship: `node optimize-figures.mjs in.glb out.glb <colourPx> <normalPx|0>` (ETC1S colour, UASTC normal, meshopt).

## What the script does, and why (each line cost a gate point)
- Atlas without baking: each part's own 0..1 texture is pasted into one cell, its UVs moved into the cell, tints multiplied in.
- Body under clothes (round 5, the fix for hem slits and skin through cloth): covered = a ray along the normal hits a garment
  within 8 cm, or MPFB's own `Delete.*` group, or skin poking out of a tight garment (garment surface within 2.5 cm, facing the
  same way, not at a hem; never neck or head). Covered and more than 4 cm from every hem (open garment boundary) is deleted;
  every covered vertex is sunk under the innermost garment (8 mm at the hem, more inside), and the near-hem ring is sunk a
  little more per LOD (`lod_sink`). The body runs after garment layering, so it is sunk under the garment as it ships.
  Deleting everything covered opened slits at every hem (rounds 1-4); measuring depth to the outer shirt instead of the inner
  waistband let hips show through.
- Eyes and mouth get decimation weight 0.02 within 4 cm (`eye_radius`, `eye_weight`) on LODs of 5k and more; weight 0
  blocks decimation entirely, and locking them at 2k or 700 starves the rest of the mesh. Brows and lashes (about 560 tris) get
  weight 0 down to 2k and are deleted on the 700 LOD: decimating them broke brows into specks (round 5). Garment hems 0.3, UV
  seams 0.4 (a collapse across a seam smears the print), lips 0.1 on far LODs.
- Small open loops in a garment (under 25 cm, pockets) are filled with the neighbour UV.
- An inner garment is sunk 12 mm under the outer one, never deleted (deleting left dark holes at the hem; untouched, waistbands poked through).
- LODs come from the joined mesh with Decimate's vertex group set to a weight map (1 everywhere, 0.25 on head, neck and
  hands, see eyes and hems above): no neck seam, no spiked heads. Never weld it by distance first: welding tore the eyelids and frayed hems (round 3). Decimating each part on its own (round 1-2)
  opened collars and seams; splitting the head off left a visible seam line at the neck.
- Max 4 weights, normalised; only deform-bone groups survive (three.js reads JOINTS_0 only).

## Traps
- Gate history (vacation-game 2026-11-11): rounds 1-4 stuck at 3.0 of 4.8 on clothing edges; round 5 (hem-margin mask) 3.7;
  round 6 (face cards, seams, lips) 4.2, the best. Still open at 4.8: crotch slits at LOD2/3, LOD3 head patches, mouth-corner
  marks. Next: closed far-LOD shells (voxel remesh plus a bake from LOD0) for LOD2/3, and a per-figure check render of the
  mouth and crotch before the gate. Re-UVing the mouth cavity by distance alone recoloured cheeks (round 7): select by normal.
- Far-LOD shells (round 8, `scripts/mpfb/shell_lods.py`: solidify, voxel remesh, biggest piece, decimate, smart UV, bake from
  the near LOD): 8 of 9 figures got clean, closed LOD2/3 (crotch slits, shin and hip wedges gone), but the round scored 3.9.
  One figure baked black triangles and a forehead hole (bake rays that miss leave black texels: count near-black texels
  after the bake and fail the figure), a 700-tri head can collapse into a flat card (check the 3/4 view), and the build
  change shipped with it (inner garment sunk 12 mm) opened skin slivers at a belt. Ship shells per figure and keep the
  best round's LOD0: never let a far-LOD fix ride along with a near-LOD change in one gate.
- Check holes before a gate: `holes.py file.blend` renders each LOD on magenta and fails on background seen through the figure.
- meshoptimizer `simplifyWithAttributes` per part tears UV seams worse than Decimate on the joined mesh; do not use it for figures.
- `Object3D.clone()` of a skinned GLB keeps the skin on the cached skeleton: the figure vanishes. Use `SkeletonUtils.clone`.
- An FBX can carry `AmbientColor`; three's FBXLoader turns it into a hidden AmbientLight, and cloning the model clones the light
  (the Rocketbox crowd lit a whole street with 7 of them). Grep `AmbientColor` before you trust a scene's light.
- Leave figures out of a `PMREMGenerator.fromScene` env bake: a body next to the probe darkens the whole env map.
- Pose signs on the A-pose rest (bone-local Euler, the same in Blender and three.js): `upperarm_l` z -0.72 / `upperarm_r` z +0.72
  lower the arms, x swings forward, `lowerarm_*` x bends the elbow forward.
- Shirts with the MakeHuman logo (`female_casualsuit02`, `male_casualsuit0x`) read as placeholders; use `*_crude_t-shirt_*` with a tint.
  Thin card hair (`short03`, `short04`, `ponytail01`, `bob01`) shows scalp; `short01`, `short02`, `long01`, `toigo_blunt_bob` hold up.
