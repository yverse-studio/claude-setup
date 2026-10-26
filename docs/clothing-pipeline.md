# Clothing pipeline (fit once per base, every character wears it)

How a garment goes from a download or a self-built piece to every character, so the work scales.
Researched 2026-10-26 (Daz Auto-Fit, VRChat outfits per base avatar, slider-based character
creators, Blender linking). Where files live: [`game-pipeline.md`](game-pipeline.md); how a
character is built: [`character-workflow.md`](character-workflow.md).

## How the pros do it

- **Daz / VaM**: a garment is rigged once to a base figure. Fitting copies the body's morphs onto
  the garment by **matching name** ("auto follow"), so a body slider moves the clothes too. A
  character is just a set of morphs on the base, so it inherits every fitted garment for free.
- **VRChat avatars**: outfits are sold **per base avatar** (one fitted version per base, never per
  user). The outfit's shape keys are kept in sync with the body's keys of the same name, and the
  body is shrunk or hidden under the cloth to stop poke-through.
- **Character-creator games and studios**: few bases, one topology each; body sliders are morph
  targets; every garment carries the same morph targets (made by transfer from the body, then
  corrected by hand where it pulls). Hair and clothes are separate parts on the one skeleton.

Rule that follows: **fit per base, never per character.** Characters differ only by key values.

## The pipeline

1. **Source** (`clothes\CL_<item>\source\`): the download or self-built file, untouched, plus the
   licence note. Never edited, so a refit can always start again.
2. **Clean** (`clothes\CL_<item>\files\CL_<item>.blend`): one object per piece, applied scale,
   sensible topology, UVs and materials checked. Base-independent.
3. **Fit** (`clothes\CL_<item>\fitted\<base>.blend`), once per base, by `_tools\refit.py`:
   - shape to the base at rest (Shrinkwrap/Surface Deform, then a hand pass), offset 2-4 mm;
   - **weights** copied from the body (Data Transfer, nearest face interpolated), parented to the
     base armature with an Armature modifier;
   - **follow keys**: every body key that changes the silhouette (sliders, breast/butt keys,
     soft and corrective keys) transferred onto the garment under the **same name**
     (Surface Deform bound at rest, bake each key as a shape key), then corrected where it stretches;
   - **hide mask**: a body vertex group `Hide_CL_<item>` for skin fully under opaque cloth
     (Mask modifier on the body, switched with the garment), never deleted faces;
   - **cloth set** (only for loose pieces: skirt, dress hem, open shirt): pin group from the
     weights, cloth and collision settings saved, nothing baked.
   - Check: every follow key at 0 and at 1, each slider at its extremes, a frame strip of the
     idle and one big pose; poke-through test with the numbers of the Done report below.
4. **Dress** a character with `_tools\dress.py <character> CL_<item>`: brings the fitted garment
   from `fitted\<base>.blend` into the character file, points its armature at the character rig and
   adds drivers so each follow key copies the character body's key of the same name. Re-running
   it after a refit updates every character; the fitted file stays the only truth.
5. **Physics in a scene**: loose pieces get their cloth bake per shot in the scene file (cache in
   the scene folder), tight pieces just follow the rig. Real-time jiggle and sim belong to the
   engine, not the garment file.

## Moving or re-dressing existing garments

Clothes moved onto a model clipped through the body, because the brief said "no
visual change" and this page only described new garments. Moving, re-dressing or refitting a
garment that already exists (to a new base, character, rig or file) is **a new fit**: steps 3 and 4
run in full, including the poke-through check of step 3.

- "No visual change" or "compare before and after" never waives clipping. A pixel-identical result
  proves only that the old fit was copied; if the old fit clipped, identical is still broken.
  The before/after proof ("Prove a move", Lessons) comes after the clipping numbers below, never instead.
- A brief that says otherwise does not change this rule (`briefs.md`, Every thread brief starts with).

## Done report (required numbers)

The done report of every garment fit or move lists, **per piece**, the **clearance**: the signed
distance from each garment vertex to the body surface (positive = outside), as the smallest value in
mm and the share of vertices below 0 in %. Measured on the evaluated mesh at rest, in the one big
pose, and with each slider at each of its extremes, one at a time. Limit, everywhere: smallest
clearance 0 mm or more and 0 % of vertices inside (the 2-4 mm fit offset of step 3 is the margin).
A piece without its row is not done, a row over the limit fails the report. The render sheet (idle,
big pose, back, close-up of each hem, seam and the body parts under the garment) goes beside it.
The gate checks both (`gate.md`, Asset PRs).

## Characters from a base

- A character file is a copy of the base plus key values, head, hair, outfits. Anything the
  character's body has beyond the sliders is stored as **one key on the base**, named
  `CH_<name>` (the character "morph"); garments get it as a follow key like any slider. So a new
  character never needs its own refit.
- A new base only when the topology or rig differs (man vs woman, a stylised or very different
  build). A second woman with another figure is a `CH_<name>` key on the female base, not a base.
- Typical set: female base, male base; a third only for a different style or topology.

## Linking or appending

- Blender linking + Library Override works for armatures and objects, but shape keys driven
  across a linked file have been fragile for years (drivers pointing at the wrong object, override
  order). So `dress.py` **appends** the fitted garment and rebinds drivers; the fitted file is the
  single source and re-running the script is the update. Try link + override only after a test
  that every follow key still moves in the saved, reopened file.
- Mark each fitted garment collection as an **asset** in a catalog per base
  (`Clothes/<base>/<item>`) so it can be found and dragged in, but dressing still goes through
  the script.

## Names and storage

- Folder and collection `CL_<item>` (short, lower-case item, no source name);
  objects `CL_<item>__<piece>`; fitted file named after the base; body mask group `Hide_CL_<item>`;
  follow keys = the body key names exactly; character key `CH_<name>`.
- One entry per garment in the library catalog: source, licence, bases fitted, date, md5 of each
  fitted file, which characters wear it.
- Versioning: `.blend` files do not diff or merge, so whoever edits one owns it until it is saved.
  A dated backup (`_backup\<file>_YYYY-MM-DD.blend`) before every fit plus the md5 in the catalog is
  enough for one person; Git LFS (with file locking) only when the library is shared, and it costs
  storage and bandwidth quota.

## Lessons

- A body-cut shell (garment cut out of the body mesh) never follows sliders or physics; always a
  separate garment mesh on the rig.
- Fit after the body is final: every later body key needs a new follow key on every garment, so
  add body keys in batches and re-run the fit for all garments in one go.
- Moving embedded garments into the library (first done 2026-10-26, Rika/Saki, 64 pieces): the dress script
  replaces objects of the same name and keeps their names, collections, visibility, materials and the values
  of the garment's own keys (corrections like `Fit`); looks, wear scripts and scenes then stay exactly as before.
- Compute a garment's `CH_<name>` key at that character's slider values: her fit minus the base fit, plus
  value x (her key delta - base key delta) for every active slider. Otherwise a scaled character sits mm off.
- Patterns on "Generated" texture coordinates move when the garment's rest size changes (a `CH_` key does
  that): put patterns on UVs or object coordinates.
- Prove a move with evaluated vertex positions (rest, a pose, sliders at 1) before vs after, plus one render
  per look; zero difference is reachable for the character the garment was fitted on. It never replaces the
  clipping numbers (Moving or re-dressing, above).
