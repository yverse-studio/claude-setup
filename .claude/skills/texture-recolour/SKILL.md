---
name: texture-recolour
description: "Use when one part of a garment or prop texture gets another colour: ID mask from UV islands, HSV change only inside the mask, before/after crop as proof."
---

# Texture recolour: change one part, prove nothing else moved

Role: `Character TD` (claude-setup `operator/roles/character-td.md`). Tool: `scripts/recolour.py` in this skill (numpy and Pillow, any texture size, alpha kept; tests in `scripts/test_recolour.py`, run in CI).

## Method

1. **Export the mesh with its UVs** as `.obj` (one object per piece) and take the texture as a PNG (any size).
2. **List the islands.** `python recolour.py tex.png mesh.obj --list` prints each UV island (faces that share a UV vertex are one island) with its pixel area. Pick the islands that are the part to recolour (a collar, a strap).
3. **Recolour.** `python recolour.py tex.png mesh.obj --islands 0,2 --hue 120 [--sat 1.0 --val 1.0 --grow 2] --out out/`. The ID mask is the rasterised triangles of the picked islands; `--grow` widens the mask itself by a few pixels to cover seam padding, so "nothing outside the mask changes" still holds.
4. **Prove it.** The script writes `recoloured.png`, `mask.png` and `before_after.png` (a crop around the mask, before left, after right) and prints `changed_outside_mask`; the exit code is 1 unless that is 0. Put the crop and the number in the done report.

## Rules

- HSV only inside the mask, never a global adjustment or a colour-replace over the whole image. Masked adjustments can leak at extreme values, so the byte comparison outside the mask is the test.
- The hue shift is weighted by saturation: a near-grey pixel (specular, white stitching, grey metal) gets no tint, because its hue is noise. Value (brightness) is kept unless `--val` is given, so shading and detail survive.
- Hue arithmetic on uint8 overflows; the script works in float and rounds back once.
- A texture shared by several characters is recoloured per look in a copy, never in the library source; the fitted file stays the one truth (claude-setup `docs/clothing-pipeline.md`).
- Patterns on Generated texture coordinates are not in the texture: say so in the report instead of recolouring them.
- Not yet covered (no verified recipe): feathered island edges and padding beyond `--grow`. Add them with a test if a seam shows.
- You run the script and hand the crop and numbers to the gate; whether the new colour looks right is the gate's and yskills' call (claude-setup `operator/gate.md`, Asset PRs).
