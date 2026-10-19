# Method: building a body (Miss Galaxy line)

Source: `patches/base-body/` (LESSONS.md, GUIDE.md, `characters/luna/proof/compare-15/ERROR-SEARCH.md`,
`proof/mg13..mg15/GATE.md`). Read those only for a detail; this page is the working summary.

## Order
1. Pick the base (Miss Galaxy: Sketchfab `miss-galaxy-32ca79bf7c4043dcbc36d28b22436303`, Loves_Art,
   CC-BY, nude, 75-bone Mixamo rig with breast bones; `/mnt/project-files/miss_galaxy.zip`).
2. Bust and butt: **scale the base's own form evenly** (bust 1.4x plus a bit fuller, butt 1.25x),
   all extra keys off. Only if that fails add one key.
3. One shape key per form (bust, butt, waist, hips, thighs, squat), authored from a json, mirrored.
4. Subdivision Surface after the Armature; pose correctives on bone angle.
5. Stance: check the rest skeleton for lean-forward and tiptoe, fix to **upright, flat feet** before
   anything else (mg15).
6. Openings (vulva, anus, nipples and areola): a **clean quad patch first**, then the opening with
   its own open and spread keys. No dent in the bust from the nipple ring: ring key small (mg13
   bullseye came from a ring dip twice too deep).
7. Hand in early: front, side, back, 3/4 plus diff, figure frame first, three posed frames, numbers last.

## yskills' shape targets (his eye, from his reference pictures)
- Bust front: narrow top, flat upper chest, **widest at nipple height or below**, full round U
  bottom, two balls touching, soft valley, no dent, no teardrop, outer edge runs into the arm with
  no notch.
- Bust side: compact round ball, apex mid-height, big round underside **curling back** to the ribs,
  flat chest gap above the ball. Reference side view has arms down. Numbers: apex z 1.18, underside
  z 1.09, 120 mm domes, upper pole bow about 31 mm convex.
- Butt: a round peach, **high shelf** right under the lumbar (z 1.12), peak z 0.77, depth 190 mm
  behind the lumbar, clean cleft, soft crease under each cheek.
- Squat: two round spheres sitting on the heels with an under-curve, high shelf, far cheek a full
  sphere past the hip; not tall columns. Torso leans forward.
- Waist 144 mm at z 1.12, hips 344 mm at z 0.80. Side view is his best view; smoothness over
  outline error.

## Never again (from ERROR-SEARCH, shortened)
1. No head or neck tools (scale, depth, trapezius forms, neck relax) after the base is chosen.
2. No tool stacked on a bust that already carries another tool's deltas (tilt, contact, valley fill,
   cleavage, scale, forms-on-bust). A bust change is ONE generator or a scaled base, nothing else.
3. No contact tool with a sheet option; every mesh tool prints its max vertex move and aborts over 5 cm.
4. No global smoothing; local bands only, 150 to 300 iterations, relief re-applied after.
5. No profile fit on a trace edited the same hour; trace changes are smooth and announced.
6. No "fill forms" (lumbar, etc.) on top of a profile fit.
7. No base switch without a same-size ref | base sheet in five views and a bust and neck crop at 2x
   passing first. (Hinata cost two rounds and lost the outline, back relief and hands.)
8. Render: sync Face keys before every render; crown in frame; same cameras; posed set every round.
9. No round changes more than one region.
10. Head/height ratio of the ref is 1/7.3; over 1/6.3 fails before scoring; a base that is 10 % off is not a base.

## Facts that bit
- `drender4` zeroes non-Face keys: bake keys or use real skin; `SKINTONE=1` or real skin.
- When a crease appears, render each key alone before fixing.
- Shape keys on weights: weights move with the verts, the rig stays fine when the base is scaled.
- Miss Galaxy `walking` action leaves a broken rest pose: `frame_set(1)` before `animation_data_clear`.
  Armature `Object_5`, body `Object_82`, hide `Icosphere`.
- Never name a script `bisect.py` or `inspect.py`.

## Cloud Blender setup (about two minutes)
```
apt-get update && apt-get install -y libegl1 libgl1-mesa-dri libegl-mesa0 libgles2 libtbb12
python3.13 -m pip install bpy scipy pillow numpy matplotlib
```
