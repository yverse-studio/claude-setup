# Master base: one mesh for every woman

Plan (yskills approved 2026-10-19): the finished Rika body is the MASTER BASE. Other women are
body-shape presets (shape keys) on the same mesh, rig, openings and shader. Source:
`library/heads-standard/HEAD-SWAP.md`, `characters/rika/head/`.

- Order: body 5/5, openings, face and hair, ONE reference-level animation, a few scenes.
- **Head swap standard**: the body owns the neck and ends in ONE seam ring (36 verts, int point
  attribute `seam`). A head asset has the same ring, same bone names (`mixamorig:Head_06`,
  `Neck_05`), Armature then Subdivision (boundary smooth ALL). Hair, eyes, brows are separate
  objects. Faces are shape-key presets on one head topology. Ring offset fades over 35 mm; weights
  copy the ring then blend to Head = 1. Any head fits any body of the family.
- Animation: video-to-mocap from reference clips, retarget to the rig, hand clean-up (hands,
  contact, jiggle); CMU BVH and Mixamo fill gaps (`library/assets/SOURCES.md`). Mixamo: bake
  animations, never ship raw FBX packs. Jiggle: Wiggle 2 first.
- A body from another family runs `stage1.py` with its own neck plane.

## Licence rules
Ship only CC0, CC-BY (with credit: author, title, link, licence, "changed"), MakeHuman/MPFB2-derived
and our own script output. CMU mocap ships (credit). Daz, Illusion/Koikatsu, CBBE/BodySlide, VaM,
MetaHuman and paid packs are study only: look and measure, never copy a mesh, never commit or
upload. Any downloadable model may be pulled for study. His reference pictures never go in git.

## Content line
Adult characters only, adult face and proportions, whatever the art style. A canonically
school-age or school-coded source character is never model, face, identity or reference frame;
state the line once and do the nearest adult thing. Explicit material stays on the private side.
