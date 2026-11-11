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
- Round 9 (4.4, best): round-6 near LODs plus shells for 8 of 9 figures plus `scripts/mpfb/fix_faces.py` on the near LOD
  before the shells bake (`smooth` relaxes the nostril-to-lip-corner crease, `hairline` lowers hair over a notch found with
  front rays, `tuck` folds belt loops under the shirt hem and gives exposed waist-skin scraps the waistband colour). Two
  tries that failed: flattening the mouth cavity into a plate (it poked through the lips as fangs) and a smooth that took
  cavity vertices as neighbours (it dragged the lips in). Open at 4.8: brows as soft alpha cards, matte hair, elder rebake.
- Round 10 (4.5): grade faces from the engine, not Blender Workbench (`scripts/mpfb/engine_faces.cjs` against a page
  that swaps any figure into the hero spot); Workbench hid blown-out skin and showed gloss the engine does not have. Our
  optimizer ships one MASK 0.5 material, so MPFB brow cards cut out as hard black dashes: `fix_faces.py brows` recolours
  the brow cell from forehead skin to brown by alpha and cuts at 8 %. `haircontrast` flattens hair texels toward their mean,
  `scalp` paints skin under the hair (ray along the normal hits hair within 3 cm) in the hair colour. Deleting hair cards in
  front of a face can leave an opaque slab of the card behind: check both views after `cheekcards`.
- Round 11 (4.6): hair-card cleanup deletes only whole small islands (`cheekcards`, under 150 verts); deleting single
  faces opened the hair's inner layer as a dark slab. Scalp paint near the hairline (`SCALPNEAR`) fills white gaps. Shells
  re-cast with a snapped cage (`shell_lods.py` `SNAP`, `CAGE`, `RAY`) and a magenta sentinel that flags bake misses. Before a
  gate, render every changed figure at every LOD in the engine (`BODY=1 engine_faces.cjs` for full body). Open: a white ankle
  shard on two men at all far LODs (not normals, not bake misses).
- Rounds 12-13 (4.6, then 4.7 best): a far-LOD bake reads hidden inner layers (white sock under the trouser hem baked as
  shards): `shell_lods.py HIDDEN=0.07 HIDZ=0.35` drops faces that sit under another layer from the bake source, and overlapping
  smart-UV faces get their own islands before the bake. Long-hair figures whose shells fail keep decimated far LODs, but with a
  head budget (`redec.py`, `HEADF=0.5`): round jaw and real lips instead of a wedge. Painting scalp skin per face in hair colour
  makes a blocky stepped hairline: `unpaint.py` gives uncovered forehead faces their skin UVs back from an untouched LOD and
  `fix_faces.py fringe` blurs the hair alpha at the forehead and cuts again (soft, closed edge). Hands open on a held prop read as
  claws: curl the fingers (+x on this rig) round its back. Check the back hem in neutral Blender light; the scene is too dark.
- Round 14: a saw-tooth fringe needs a wide blur (`fringe FRINGES=20 FRINGEX=0.12 FRINGEZ=0.16` on 2048 px; 9 px changed nothing
  in the engine). Single hair-card wisps hanging over the forehead go with `wisps.py <blend> 12 0.04` (max island verts, depth below the hair top). Far-LOD lips:
  remapping mouth faces to one skin texel (`fix_faces.py liptone`) leaves flat pale wedges; `mouthcut.py <blend> <LOD index>` instead
  gives each red corner the UV of its nearest skin corner on the same face, so the skin gradient carries on and a thin lip stays.
  A shell bake takes the first hit, so see-through hair-card texels bake as a dark blotch with white specks over the forehead:
  `shell_lods.py ALPHACUT=0.5` drops mostly transparent faces from the bake source.
- Rounds 16-18 (4.7, LOD chain 4.5 to 4.75): a far shell's head gets too few texels for eyes; `shell_lods.py HEADUV=2.5` unwraps
  the head on its own and scales its islands up before packing. A far head that stays faceted at 700 triangles gets a bigger
  budget for that one figure (`redec.py T3=900 HEADF3=0.6`); smoothing its face pushed the eyes out, a bigger head share alone
  tore the shoulder. A hard red far lip: `lippatch.py <blend> <LOD index> 64` paints a soft muted-rose patch with a skin margin
  into a free corner of the shared atlas and maps the mouth faces into it (`SPREAD=2.2` keeps the corners inside the rose).
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
