# Company XY brief

The standing explanation of what Company XY is. Every thread reads this and the project memory
first and does not re-ask the settled points below. The public files stay clean: explicit
material is private, behind the 18+ gate, and never goes in this repo.

## What it is

- A CEO-simulator HQ page (the company side) plus a 3D adult-fiction game (the main product).
- The game is in the style of "Being a DIK" / blobcg: many animated 3D scenes per story, a slow
  burn that grows into explicit scenes. It is not a picture game.
- Explicit material lives privately behind the 18+ gate. Public files stay clean.

## Cast rules

- Every character is an original adult fictional character: inspired by, not a copy of.
- Every character has an adult age stated in the text. The player is an adult.
- No minors ever, in any form.
- Family cameos (for example Hinata's sister) stay non-sexual.

## Order of work

Burnice first, then Hinata, then Nicole. Nothing else until yskills says so.

## The 3D workflow

CC0 MakeHuman base, a parametric recipe, one shared 163-bone rig. Every character runs a
compare-first loop: yskills' reference on the left, our model on the right, judged per trait
(5 traits). The bare body is made perfect first, then skin, then face, hair and expressions, then
rig, IK and gravity jiggle, then poses against references. Outfits are garment parts built in a
separate cloth thread. Every thread reviews its own work and reports only at 5/5.

The technical how-to (build commands, mistakes and fixes, placement rules, size sliders, library
and creator goal) is not repeated here: `/mnt/project-files/companyxy/patches/base-body/GUIDE.md`.

## Library goal

A reusable library of characters, clothes and poses, plus a repeatable character-creator
workflow, ideally usable without AI. General steps: `docs/character-workflow.md`.

## Where things live

- `/mnt/project-files/companyxy/patches/base-body/`: `GUIDE.md`, `mh/PLAN.md`,
  `characters/<id>/PLAN.md`
- `/mnt/project-files/companyxy/research/`
- In `company-xy`: `content/story/` and `docs/STORY-BRIEF.md` (read it before story work)
