# Step 5 per asset type: what "fitted on every base" means

Every key of the body's `_inventory` (the `measure.json` passed as `--inventory`) gets a row in `intake.json`: `{preview, number: {min_mm, inside_pct}}` or, for eyes, faces and props where no metric exists, `{preview, visual: true, why}`. A garment or hair number is a real clearance: `min_mm` 0 or more and `inside_pct` 0. `type` is `garment`, `hair`, `eyes`, `face` or `prop`. A preview is an image file (png, jpg, jpeg, webp), `catalog.bases_fitted` an array of base names and `catalog.md5` an object of 32-hex hashes.
Where no number can be measured, say so; never invent one. Always add the 4-view sheet against the MAIN reference.

| Type | Fit | Number per key | Visual-only allowed |
|---|---|---|---|
| garment | [`garment-fit`](../garment-fit/SKILL.md), follow keys per `BT_` and `CH_` | `node scripts/pipeline-gates.mjs fit <measure.json>`: clearance >= 0 mm, none deeper than the 4 mm offset | no |
| hair | seat on scalp and head at every key; no cut through skull, ears or neck | `scripts/blender/clearance.py pieces=<hair> faces report=<out.json>` (`report=` measures every follow key; no `save` argument, so the character file is not written): smallest clearance mm and share inside, per key | no |
| eyes, iris | sits in the socket on every `CH_` face key; no gap, no poke through the lid, the lid closes over it | none: the eye lies inside the head mesh, so skin clearance does not apply; use the gap between eye and lid at the closed key if the rig has one | yes, with a `why` |
| face, head | applied to every base; neck seam closed, normals match | seam gap in mm at the neck ring per base if measurable | yes, with a `why` |
| prop | held or placed per base (hand, table, shelf), no clipping through the body | none: a prop has no skin clearance; check the contact points per base | yes, with a `why` |

`clearance.py` runs once per base file, so run it over every base, not only the one open in Blender. A hidden object is not evaluated:
unhide what you measure (`docs/clothing-pipeline.md`, Lessons).
