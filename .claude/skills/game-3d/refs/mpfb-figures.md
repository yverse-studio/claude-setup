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
(default 10k/5k/2k/700), `drop_lod0` for crowd files, `atlas` px. Render check: `render_sheet.py file.blend out.png` (front, 3/4, side,
back, lower LODs, face). Ship: `node optimize-figures.mjs in.glb out.glb <colourPx> <normalPx|0>` (ETC1S colour, UASTC normal, meshopt).

## What the script does, and why (each line cost a gate point)
- Atlas without baking: each part's own 0..1 texture is pasted into one cell, its UVs moved into the cell, tints multiplied in.
- Body faces under clothes go by ray along the normal (4 cm); a kept margin let skin poke through at every LOD.
- An inner garment is sunk 12 mm under the outer one, never deleted (deleting left dark holes at the hem; untouched, waistbands poked through).
- LODs come from the joined, welded mesh with Decimate's vertex group set to a weight map (1 everywhere, 0.25 on head, neck and
  hands): shared borders collapse together, so no gaps, no neck seam, no spiked heads. Decimating each part on its own (round 1-2)
  opened collars and seams; splitting the head off left a visible seam line at the neck.
- Max 4 weights, normalised; only deform-bone groups survive (three.js reads JOINTS_0 only).

## Traps
- `Object3D.clone()` of a skinned GLB keeps the skin on the cached skeleton: the figure vanishes. Use `SkeletonUtils.clone`.
- An FBX can carry `AmbientColor`; three's FBXLoader turns it into a hidden AmbientLight, and cloning the model clones the light
  (the Rocketbox crowd lit a whole street with 7 of them). Grep `AmbientColor` before you trust a scene's light.
- Leave figures out of a `PMREMGenerator.fromScene` env bake: a body next to the probe darkens the whole env map.
- Pose signs on the A-pose rest (bone-local Euler, the same in Blender and three.js): `upperarm_l` z -0.72 / `upperarm_r` z +0.72
  lower the arms, x swings forward, `lowerarm_*` x bends the elbow forward.
- Shirts with the MakeHuman logo (`female_casualsuit02`, `male_casualsuit0x`) read as placeholders; use `*_crude_t-shirt_*` with a tint.
  Thin card hair (`short03`, `short04`, `ponytail01`, `bob01`) shows scalp; `short01`, `short02`, `long01`, `toigo_blunt_bob` hold up.
