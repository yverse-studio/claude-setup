---
name: garment-fit
description: "Use when a garment is fitted, refitted, moved or dressed onto a 3D character base: prefit_garment.py, fit_garment.py, FIT_SW binding, Foot_In_Shoe, CH_ and BT_ keys."
---

# Garment fit: one fit per base, every character wears it

Home of the rules: claude-setup `docs/clothing-pipeline.md` (steps, numbers, names) and the fit gate in `operator/gate.md` (Pipeline gates). This skill is the order of work and the traps; it restates no number. Role: `Character TD` (claude-setup `operator/roles/character-td.md`).

## Order

1. **Reuse check.** `python clothes_dupe.py <url or id>` before a download (exit 1 = HAVE, use it); `python clothes_dupe.py` for the whole wardrobe. Then look for a gate-passed `clothes\CL_*` piece of that kind and refit it. Docs first: the character's `CH_<name>\README.md` and the shape-key inventory.
2. **Prefit** (`tools/laptop/prefit_garment.py`, the pipeline placement steps). `preview <spec.json> <item>` writes front and side PNGs; `build <spec.json> <item>` writes `fitted/<base>.blend`. The spec per item: `file`, `pieces`, `s` (uniform scale), `rotx`/`rotz`, `d`, `decimate`, `tight`, `offset`, `center`. Rough placement only: the fit finishes it.
3. **Fit** (`tools/laptop/fit_garment.py`), run headless on the base file with `-P fit_garment.py -- measure|fit <out.json> all|CL_<item> ...`. `measure` first (the before numbers), then `fit`. What a fit does per piece (weights, clearance, follow keys, the `Hide_CL_<item>` body mask) is step 3 of `docs/clothing-pipeline.md`; the script's docstring lists its sub-steps.
4. **Measure** every state: rest, each follow key at 1 alone, each slider extreme, every `BT_` preset, every `CH_` key (each heroine with her real values), idle and the big pose. Then `scripts/blender/clearance.py` of claude-setup for the done report. A `BT_` or `CH_` key on the body that the report did not measure is a failure, not a pass: the gate lists what was NOT measured.
5. **Dress** with `dress.py <character> CL_<item>` (appends, rebinds drivers). Backup and catalog entry: `docs/clothing-pipeline.md`, Names and storage.

## The traps

The full list lives in `docs/clothing-pipeline.md` (Lessons); read it before a refit. Only what this order of work adds:

- **FIT_SW binding.** The fit adds `FIT_SUB` (Simple subdivision, before the Armature) and two `FIT_SW0/1` Shrinkwrap modifiers after the Armature (offset: the pipeline's fit offset). Their target is set per character by `dress.py`; the fitted file stores it empty. A Shrinkwrap with no target does nothing and passes silently: check the target after dressing.
- **Foot_In_Shoe.** Footwear is fitted and measured with `Foot_In_Shoe = 1`; the character driver sets it while any shoe renders. Never copy it as a follow key. A driver with a dead variable lets the shoe pass at 0: run the driver dump check of the pipeline gates.
- **CH_ keys.** Bake and measure every `CH_<name>` of the base, not only the heroines you are working on: a fit that knew two characters made the others clip (companyxy report 2026-11-12).

## Done report

Per piece the clearance row (smallest mm, share inside) for each state above, the inventory of `BT_` and `CH_` keys, the comparison sheet, `Skills used: garment-fit` and `Docs read:`. You hand the numbers to the gate; you do not judge the look.
