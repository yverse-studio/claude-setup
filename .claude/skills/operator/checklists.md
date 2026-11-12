# Gate checklists (game kit)

One fixed list per topic. A Reviewer brief names its topic on a `Topic:` line; that Reviewer is given its topic's list and the
Scored gates section of `gate.md` as its whole job, not the code playbook (M48, plan 2026-11-12). The brief generator
(`scripts/brief.mjs --topic <name>`) writes the line, team-guard refuses an unknown topic. A heading below is a topic name.

How to read a list: the numbered rows are the rubric of the score rule (`gate.md`, Scored gates), worded the same in every
round. Each row is judged as a pair, the new version beside the reference (the plan's MAIN reference, or the previous best)
on the same camera, and the verdict gives per row the measured number or the named view, the source file, and pass or fail.
A row with no number and no view in the verdict counts as "not checked" and fails. Rows marked **K.O.** are hard checks: a
fail there makes the version ineligible at any score. A number marked *(set here)* is a target this file introduces; the
others come from the home linked in the row.

## Garment

1. **Clearance per piece (K.O.):** smallest signed clearance 0 mm or more and 0 % of vertices inside, at rest, in the big pose and at each slider extreme; numbers from `clearance.py` or `clipping.mjs` ([`docs/clothing-pipeline.md`](../../../docs/clothing-pipeline.md), Done report).
2. **Every body state (K.O.):** `node scripts/pipeline-gates.mjs fit <measure.json>` prints OK: one state per `BT_` preset and per `CH_` key, none deeper than the 4 mm offset.
3. **Silhouette (K.O.):** girth and gap at each height the project's style sheet lists, bare and dressed, inside the style range; the body preset and its value stand in the measurement file (`gate.md`, Asset PRs, Silhouette row).
4. **Motion poses:** arm raised past the shoulder, sit and stride, front and side cams: the sleeve follows the arm bone and the hem the thigh, with no webbing from armpit to waist or between the legs (named views; clearance row per pose as in row 1).
5. **Look switches and drivers:** `pipeline-gates.mjs look <look_states.json>` and `drivers <drivers.json>` print OK.
6. **Reuse proof:** a downloaded piece shows its `clothes_dupe.py` line (HAVE or NEW); a built one names the library search that found nothing that fits.
7. **Fabric and colour:** contact sheet with 4 angles at 390 and 1440 px, office lights, mid-tone background: no washed-out fabric, white blotches, gaps or tears at hems; a recoloured texture keeps a luminance range of at least 80 % of its source *(set here; flat recolour, plan section 10)*.
8. **Previews:** `pipeline-gates.mjs previews <folder>` finds no `thumb.jpg` older than the final render.

## Hair

1. **Clearance (K.O.):** hair against scalp, face, shoulders and garments: smallest clearance 0 mm or more, 0 % inside, at rest and with every follow key at 1 (`clearance.py` report, same limit as Garment row 1).
2. **Every body state:** the hair is in the `fit` check of the character it is worn on (Garment row 2).
3. **Hairline and parting:** front, 3/4, side and top cams at 1:1 crops beside the reference: no scalp gap or bald patch, parting on the reference side (named views).
4. **Colour:** root, mid and tip sampled on the render and on the reference, each pair within ΔE2000 10 *(set here)*; checked in the game export as the game renders it (three-vrm), and in Blender.
5. **Motion:** fringe and side strands lag the head by 2 to 3 frames, the eyes stay uncovered for more than half the loop ([`roles/animator.md`](roles/animator.md), Motion quality gate, row 5).
6. **In frame and rendered:** crown inside the frame on the sheet; the hair visible in every render that needs it (`hide_render` off), listed yes or no.
7. **Order:** the hair's PASS row exists before the owner sees any picture of it (`gate.md`, Owner-facing results; Saki hair, plan section 10).

## Character

1. **Cast sheet (K.O.):** `node scripts/pipeline-gates.mjs sheet <SHEET.md>` prints OK (measures, silhouette numbers, look lock; [`docs/preproduction-workflow.md`](../../../docs/preproduction-workflow.md)).
2. **Body base and preset (K.O.):** one of `BT_small_curvy`, `BT_normal_curvy`, `BT_tall_curvy` and its preset value, named in the measurement file ([`docs/character-workflow.md`](../../../docs/character-workflow.md)).
3. **Silhouette (K.O.):** the bare body's girth and gap at each style-sheet height inside the style range (Garment row 3, bare only).
4. **Likeness:** a reviewer who gets only the comparison sheet and the reference says yes or no on face, hair, body and outfits; four yes to pass (`character-workflow.md`, step 6).
5. **Eyes in the export:** in the three-vrm render, the iris colour differs from the eye white by ΔE2000 20 or more *(set here)* and the highlight does not cover the iris.
6. **Body numbers, when the body changed:** each row of the target table in the `blender-body` skill (bust, joints, openings, motion, back, neck) with its measured number, in the Reviewer order of `blender-body/checklists.md`.
7. **Posed frames:** from-below, arm up plus head tilt, sway mid-frame: no tube neck, groin fold, knee pinch, and the bust root attached (named views).
8. **Sheet files:** `<slug>-v<n>-sheet-1440.png`, `-sheet-390.png` and `-face.png`, reference beside render, mid-tone background.

## HUD/UI

1. **Reference (K.O.):** the plan's link to the owner's reference card (M28), or 3 to 6 captures in `design/reference/`; each HUD element names the capture it takes from ([`roles/designer.md`](roles/designer.md), Art direction first).
2. **Design check:** `node .claude/skills/ui-review/scripts/design-check.mjs` passes (Direction with three captures, palette, type scale, `## Bar`).
3. **Palette match:** 5 or more colours sampled from the HUD screenshot each map to a role of the `## Palette` table within ΔE2000 10 *(set here)*; mean HUD panel luminance within 15 % of the reference capture's *(set here; the all-black HUD, plan section 10)*.
4. **Contrast:** every text pair 4.5:1, large text and UI parts 3:1; in grayscale the player, danger and pickups still read (named view).
5. **Slop:** `design-critic` names 0 patterns from [`SLOP.md`](../ui-review/SLOP.md), pattern 14 (web-dashboard HUD) included.
6. **Sizes:** screenshots at 390 and 1440 px, 320 px walked: no sideways scroll, targets 24 px or more, 44 px for the main action.
7. **Motion:** press state within 100 ms, transitions 150 to 400 ms ease-out, `prefers-reduced-motion` lands on the end state (designer.md, UI/UX bar).
8. **Play before look (K.O.):** the playtest report passes its Controls and World life rows on this build (`gate.md`, Game PRs).
9. **Recoloured art:** each recoloured sprite or icon keeps a luminance range of at least 80 % of its source *(set here)* (`texture-recolour`, #446).

## Animation

1. **Strip:** 6 or more frames at 960x540 including first and last, viewed at original size, from 2 or more angles ([`roles/animator.md`](roles/animator.md)).
2. **Timing stated:** frame rate, length in frames and seconds, and the key frames of each pose (for example a 48-frame loop at 24 fps = 2.0 s), written in the verdict.
3. **Loop seam:** the last frame's pose equals the first (largest bone delta 1 mm or less *(set here)*), and the hip speed across the seam is within 10 % of the frames beside it *(set here)*.
4. **Stroke and follow timing:** slow out, fast in; head lead and spine wave lag 1 to 3 frames behind the hips; soft parts swing 10 to 14 degrees, lag 2 to 4 frames and settle within 6 to 8 frames (animator.md, Motion quality gate, rows 1 and 3).
5. **Contact (K.O.):** per contact pair, the worst penetration over every frame of every clip, 2 mm or less and only where contact is meant, with its frame number (animator.md, Contact gate, row 1).
6. **Cameras:** a 1:1 close cam on each contact at its worst frame, plus one non-POV camera per clip.
7. **Opacity and completeness:** every body and prop opaque, and every object the scene needs listed visible yes or no in one non-POV frame (Contact gate, rows 3 and 5).
8. **Floor and limbs:** planted feet within 5 mm of the floor in `_check.json` *(set here)*; elbow and knee poles checked from a second camera.
9. **Face and hands:** one blink every 3 to 5 s and none on the seam frame; finger curl differs by 10 to 15 degrees between loop halves.
10. **Captured game clips:** 0 repeated frames by per-frame mean difference ([`video-studio/learnings.md`](../video-studio/learnings.md), 2026-11-12).

## Scene render

1. **Five rows:** contact, body, hands, picture and readability, motion, each with its numbers from `_check.json` ([`docs/two-figure-scenes.md`](../../../docs/two-figure-scenes.md), Gate and workflow).
2. **Same cameras:** the round scores the same cameras and frames as the round before, old | new on one sheet, judged in both orders A|B and B|A (`gate.md`, Scored gates, rows 3 and 4).
3. **Per camera against the reference:** each camera beside the reference board and the reference loop strip at original size (named views, one line per camera).
4. **Machine numbers:** `_check.json` hand distance in mm, 0 vertices inside furniture, partner clipping 2 mm or less, feet, knee and hip z.
5. **Framing:** head, hands and feet in shot where the pose needs them; face and hands visible from the main camera.
6. **Light:** test frames use the final render's light at 960x540; a night room reads dark and warm beside the reference board (named view).
7. **Completeness and opacity:** as Animation row 7.
8. **Previews and order:** `pipeline-gates.mjs previews <folder>` OK; 1080p starts only from the version the score rule picked after a PASS.

## Asset-Intake

1. **Search first:** the report names the library search (`docs/FIND.md` or `catalog.json`) and its result; a wearable download shows its `clothes_dupe.py` line (HAVE or NEW).
2. **Licence (K.O.):** `source/` holds the untouched download and its licence file; the `catalog.json` licence field names the licence and the source URL, and the licence allows commercial use in the EU ([`docs/laptop-folders.md`](../../../docs/laptop-folders.md); EU exclusions as in the `blender-body` skill, route 2).
3. **Made by the lane:** the folder came from `python tools/laptop/new.py <kind> <name>` and `tidy_check.py` prints ok.
4. **Converted and sane:** the engine format (GLB, VRM or `.blend`) opens headless; size within 2 % of the source's stated size *(set here)*; normals face outward.
5. **Every body base, for wearables (K.O.):** one preview per `BT_` base and per `CH_` key, and `pipeline-gates.mjs fit` prints OK; previews newer than the fit (`previews` OK).
6. **Rating:** the catalog `rating` field is set; an 18+ asset sits under an `nsfw/` folder and appears on no git server and in no cloud project file.
7. **Routing:** body, face, hair and clothes go through the Character TD; props, rooms, sounds and anims to the role that owns their kind (plan section 15).
8. **Placed, with proof:** per asset the report lists folder path, catalog id and preview path; a list of downloads alone fails.
