---
name: blender-body
description: "Use for any 3D character body, rig or review work in Blender: picking a base, shape keys, posed tests, hand-in sheets, grading a body. Born from 13 failed Luna rounds."
---

# Blender body: build and review a rigged character body

Why this exists: Luna's body took 13 rounds (lc1 to lc13, 2026-10-18) and ended with yskills
asking what had been learned. The rounds stacked edits on a mesh nobody
owned, graded outlines instead of looking, and never posed the body. This skill is the answer.
Every 3D builder and reviewer thread loads it. Blender setup and views: [`studio`](../studio/SKILL.md);
the character order (reference, brief, sheet, gate): [`docs/character-workflow.md`](../../../docs/character-workflow.md).
The per-round lists live in [`checklists.md`](checklists.md): builder checklist, reviewer checklist,
hand-in sheet contract.

## The rules (each one cost a round)

1. **Pick a base that already looks right, then shape it.** Take a rigged body that is close to the
   target (our own best old model, or a licence-clean rigged body such as the CC0 MakeHuman/MPFB2
   one) and move it with shape keys. Never grow a body out of stacked edits on a mesh no one owns
   (Luna lc3 to lc11). Decide the base in the first hour, write it in LIVE STATE, say which build it
   is. Once head and neck are right, they are **locked**: no tool touches vertices above the
   collarbone again (lc3 head x0.95 and +2.5 cm, lc4 head back, lc11 chest trim at the neck base
   turned a slim neck into a short thick one).
2. **One named shape key per region** (bust, waist, hips, butt, back, thighs), authored from
   parameters (a json next to the blend), mirrored. A bad key is switched off or regenerated from
   its parameters, **never patched** with a second tool. Keep a **band-ownership map** in LIVE STATE
   (which key owns which z band); two keys never own the same band. Fillets and smooth passes are
   not keys: they were what made the Luna neck ring and the bust seam (see rule 7).
3. **Body and rig together.** Every body change is a shape key on the rigged mesh; the rig and its
   weights stay fixed; after each key the weights around it (neck, armpit, bust root, groin, knee)
   are re-checked. Shape on an unrigged mesh shows its deformation errors only when the animator
   plays a clip (Luna: tube neck, groin flap, knee pinch, found in the Rika test clip, the lock-in rule came at lc12). The **pose test runs every
   round**: from-below frame (camera low, her above it), sway mid-frame, arm up plus head tilt.
   Fail = no tube neck, no groin fold, no knee pinch, bust root stays on the chest.
4. **Grade by eye first, numbers last.** Order: bust front crop at full
   resolution vs best round and ref (the standing gate), neck crop old|new vs ref, zoom triples REF|best|new at 2x, raking raw renders in five
   views (front, side, back, back 3/4, posed). Overlay and tracker numbers are builder hints. A
   reviewer who graded on numbers let two bust regressions through (lc10, lc11) and the user caught
   them. The user's pins outrank any reviewer number. Bust and upper chest: fill, never cut.
5. **Never hand in a regression.** The builder runs every gate (neck, bust, zoom, poses) before
   anyone else sees the round. A failed gate is said in one line and the round is not handed in.
   The best round so far is always the baseline to beat, shown beside the new one.
6. **Reference hygiene.** Profile and silhouette fits run only on the verified ref trace. A
   re-trace is compared to the original by eye before any tool uses it (a hand-traced edge sat
   6 to 21 mm behind the ref skin and sent a round the wrong way). Registration (chin and sole, or
   skeleton points) is the same for ref, best and new. Judge the model itself, overlays second.
7. **Tool hygiene.**
   - Every mesh tool prints its **max vertex move** and stops over 5 cm.
   - Edits go to Basis **and every shape key**. Face expression keys stay in sync with body edits
     (`luna_facekeysync.py`: stored Face key values 0.3 to 0.45 inverted every edit in renders for
     five rounds). When an edit does not show in a render, evaluate the depsgraph mesh with and
     without the keys before blaming the tool.
   - Smoothing is local Taubin in narrow bands (6 cm round a 1 to 2 mm step, fillets 25 to 40 mm wide), never global; a 400-iteration pass made the
     neck ring. Contact tools never push vertices through the body (lc11 pulled 96 deep chest
     verts up to 20 cm and the stretched sheets drew a hand shape on the back). Groove radius at least 3 cm, amplitudes 5 to 6 mm, never above 15 mm.
   - Never name a script `bisect.py` or `inspect.py` in the work folder (shadows the stdlib).
8. **Thread hygiene.** One builder and one reviewer until the score is 5/5; a builder thread lasts
   one round or less, then hands off. A brief names **only** the LIVE STATE block, the contract
   blocks and the top 3 items of the current plan; a builder that reads whole study libraries fills
   its context on one item (a Luna builder stopped at its 210k context budget with nothing handed in). Hand-in comes
   first in the plan, research second. Cloud Blender setup is about two minutes:
   `apt-get update && apt-get install -y libegl1 libgl1-mesa-dri libegl-mesa0 libgles2 libtbb12`,
   `python3.13 -m pip install bpy scipy pillow numpy matplotlib`.
9. **Content line.** Adult characters only, adult face and proportions, no minors ever. Nude
   bodies and explicit poses live on the private side behind the 18+ gate; public files and the
   hand-in sheets that go to public places stay clean; his references never go into git.

## Technique (how the pros do it, what we copy)

Research: `/mnt/project-files/companyxy/patches/base-body/library/agent-3d-study/PRO-ADULT-BODY.md`
(sources, numbers) and `APPLY-LC14.md` (ordered rounds A to E). Read the sections you need, not
the file. Every pro pipeline (Daz, Virt-a-Mate, Koikatsu, CBBE/BodySlide, MetaHuman) is one fixed
topology, **independent morph sliders** (deltas from the base, so two sliders add and never
re-shape each other), corrective morphs on joints, grafted openings, spring bones for soft parts,
normal maps for fine anatomy.

| Part | Method | Gate (after the eye) |
|---|---|---|
| Bust | `breast_flat` key (Laplacian fill of the chest wall) + ONE generator: an ellipsoid dome per breast, ray-height smooth union, k per direction (under 10, inner 14, upper 22, outer 30 mm), nipple and areola primitive on the apex; all from a json | ellipsoid RMS under 1.5 mm; mirror error under 0.5 mm; no concave window collarbone to apex; gap between domes 0 to 6 mm; pole ratio 48:52 to 52:48; apex and internipple per the ref |
| Joints | half-angle helper bones (`knee_help`, `groin_help`, `neck_help`, Copy Rotation 0.5), twist on the 02 bones, JCM-style corrective keys per joint, direction and angle (neck back 30 / fwd 35 / twist 45; hip flex 57, 115, abduct 85, back 35; knee 90, 155), driver SWING_TWIST local space | ring cross-section 0.92 to 1.05x rest at neck, thigh root, knee; no self-overlap in the 6 cm band; no fold deeper than 3 mm on raking light |
| Openings | a welded graft: hole, ring patch, inner tube, cap, bridge, weight transfer, open and spread keys | vulva open 6 +-1 mm, spread 20 to 25 mm across the crest, anus open 10 to 14 mm, tube depth 6 / 3 cm; no back faces in the key 0 and key 1 renders (backface-red debug material, SAMPLES 3); no shading seam at the bridge on raking light; round lips with 3 to 4 mm radius |
| Bust and butt motion | 1 to 3 bones per side, weight from the dome height (root 0, apex 1), spring bones | sway clip: apex travel 8 to 15 mm, root under 2 mm, no arm interpenetration |
| Back detail | calm geometry plus a baked normal map for blades, groove, dimples, lat edge | silhouette bands unchanged within 0.5 mm |
| Neck | clean tapered cylinder on the neck bones, 20 mm fillets into trapezius and jaw, nothing else touches it | crop vs ref: long and slim, no ring, no shelf, plus a bent head frame (new base only; a locked neck is not touched) |

**Licence.** Ship only our CC0 MakeHuman-derived body and the output of our own scripts (plus
Blender/GPL tool output; MB-Lab only via the official build with CC BY 4.0 and credit). Daz, VaM,
Illusion/Koikatsu, CBBE/BodySlide, MetaHuman, Wild Life and Subverse assets are **study only**: look
and measure, never copy a mesh; his private reference pictures are never uploaded anywhere.

## Worked example: where Luna went wrong and what fixed it

| Round | Mistake | Rule |
|---|---|---|
| lc3 to lc4 | head scaled and moved, trapezius cut | 1 |
| lc6 to lc10 | Face keys inverted every hand and smooth edit in renders | 7 |
| lc10, lc11 | tilt, contact, cleavage, forms and profile stacked on the bust; reviewer let both through on numbers | 2, 4 |
| lc11 | chest trim at the neck base, 400-iteration smooth | 1, 7 |
| lc12 | side fit on a wrong trace plus lumbar fill forms | 6 |
| lc1 to lc13 | no posed frame until the animator's clip showed 11 errors | 3 |
| 2026-10-18 14:35 | user's decision: Hinata rigged base; its neck, bust shape and rig stay, shape keys on top (waist, hips, butt; bust scaled from Hinata's own breast mesh, no stuck-on spheres) | 1, 2 |

Files: `characters/luna/REVIEWER-TO-BUILDER.md` (contract and verdicts), `BUILDER-HANDOFF.md` (LIVE
STATE blocks), `REVIEWER-HANDOFF.md`, `proof/rika-test/ERRORS.md` (the 11 posed errors), tools
`characters/luna/tools/handin-cloud.sh`, `quickcheck.sh`, `luna_facekeysync.py`, and `tools/ref-tracker/trk2/t3/zoom5.py`, all under
`/mnt/project-files/companyxy/patches/base-body/`.
