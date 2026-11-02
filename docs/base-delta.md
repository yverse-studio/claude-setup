# Base + delta (characters)

The one rule (yskills 2026-10-26, fixed): **a body improvement always goes into the base, never into one character.**
A character is the base plus a small delta of details (face, hair, features, textures, proportions). Every
figure then gets every body fix on the next rebuild, and nobody repairs the same body five times. How a
figure is first made: [`character-workflow.md`](character-workflow.md); garments: [`clothing-pipeline.md`](clothing-pipeline.md).

## Rules (what is checked)

1. **One topology, one rig per base.** Characters from the same base keep its vertex order, bone names and shape-key
   names. A change that breaks that is a new base (see Topology break).
2. **Scale is always 1** on every armature and every mesh, and on every parent above them. Height and proportions
   live only in (a) the proportion key `CH_<name>` on the base meshes (value 1) and (b) the rest-pose bone offsets.
   Never object scale, never "apply scale" on a finished figure. `scripts/blender/scale_lint.py` reports offenders.
3. **A proportion may change a bone's length, never its orientation.** Today the proportion is a uniform factor `k`
   (Saki 1.04236 = 1.72 m on the 1.65 m base). Per-segment proportions (legs, torso, neck, arm length against girth) are
   the next step; they extend the same delta field (`proportion.kind`), the rebuild stays the same.
4. **The modeller contract** for the base: never rename, no topology change, only add (keys, groups, bones). Backup and md5
   before every write; every write is measured by the rebuild proof below.
5. **Key `co` equals Basis** before any bmesh write or save (up to 6.8 mm drift was found in Face and Body).
6. **Laptop: Blender jobs check room first** (running `blender.exe` including the animator's, and free RAM; start only with more than 4 GB
   free, else wait): the one home is `pc-claude-user.md` (Blender limits). `delta_rebuild.py` does the RAM check itself.

## What a delta holds

`characters/CH_<name>/delta/<name>.delta.json`, written by `delta.py extract`, human-readable:

| Field | Meaning |
|---|---|
| `proportion` | `kind: uniform`, `scale k`, `anchor` (origin) |
| `keys` | Non-zero shape-key values per object (`body`, `face`, `hair:<Part>`): breasts, eye shape, hair length ... |
| `own_keys` | Keys the character has and the base lacks (kept by the rebuild) |
| `bones.residual_mm` | Bones that are not base x k (poles, hand edits), for review |
| `materials` | Hash per character material and whether it differs from the base (tint, face atlas): the details live in the character file |
| `arm_props` | Armature custom properties (character, age, outfits) |
| `drift` | Where the file's geometry is not base x k (stale base, hand edits): the rebuild overwrites it, read it before the first rebuild |

Not in the delta, because the character file keeps them: outfits and looks, actions, materials and textures, own objects.

## Rebuild (`scripts/blender/delta.py`, copy in `_tools/`)

`delta.py sync` re-applies the current base onto a character file: rig rest pose x k (bones the base gained are added), every base
shape key and weight on body, face and hair, key `CH_<name>` = basis x k at value 1, mesh `co` = Basis, key values from the delta.
Keys that are new in the base arrive at the base's value, keys the character already has keep the character's value.
A character mesh with an old topology (Saki's face had 91 extra vertices from an older mouth) is swapped for the current base mesh
and keeps its material slots and key values. Then `dress.py <char> all` refits every outfit and keeps the looks.

```bash
python -I _tools/delta_rebuild.py rika saki --dress --extract          # live files are never written; results in --out
python -I _tools/delta_rebuild.py rika saki --marker --dress --extract # the proof run
```

## Proof (what "perfect" means here)

`delta_rebuild.py --marker` makes a test base with one body vertex +1 mm in every key and one bone +1 mm, rebuilds every character
from it and checks, separately from the code that built them (`delta_verify.py`, plain numpy on dumps):

- the marker arrived (vertex +1 mm in Basis, identity key +k mm, bone +k mm),
- every bone is base x k with the base roll and parent; every base shape key equals the base; `CH_<name>` equals basis x k at 1;
  mesh `co` equals Basis; all base weight groups equal; key values equal the delta; every scale is 1,
- the delta read back from the rebuilt file equals the stored delta (scale, key values, own keys),
- `--live` shows what the rebuild changed against the old file (informational: the old file's drift).

Then render a comparison sheet and run `scripts/blender/clearance.py` on the dressed result: visible in the final render means
error, an invisible measurement value does not block (yskills 2026-10-26).

## Topology break (a future base v5)

Deltas are mostly names and numbers, so they survive. Anything stored per vertex (an own morph) moves with
`scripts/blender/delta_migrate.py`: nearest surface point on the old base, barycentric blend of the displacement, written as an own key.
Bones carry over by name. Then rebuild and prove as above.

## Scale migration for existing files

`scripts/blender/migrate_scale.py -- <out.blend>` applies a scale k into the rest pose, multiplies the location curves of the
actions the armature plays by k, and fails if any bone moves more than 0.5 mm in 5 sampled frames. The input is never written.
Used for files made before the rule (the animator's live night scene).
