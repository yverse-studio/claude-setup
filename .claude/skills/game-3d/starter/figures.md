# Full-size figure pipeline

Summary of company-xy `tools/vrm/` (the source of truth: its README and `characters/mira/HANDOFF.md`).
Read those before changing a script; this page says what exists and why.

## Tools

Headless Blender through `bpy` 5.2.2 on python3.13 plus the VRM add-on 4.7.2 (extensions.blender.org,
installed into `user_default`). Builds run with `PATH=<dir where python3 is python3.13>:$PATH`.
No GPU in cloud threads: renders are Cycles CPU. In Cycles stills, pure white is the background
showing through, not shading.

| Script | Does |
|---|---|
| `assemble.py <build dir> <id> <out.blend>` | one scene per figure: intact body, `Under_*` and `Wear_*`/`Cloth_*` layers on one armature, Mask modifiers, `Outfit`/`Kleidung` switches |
| `dress.py <in.vrm> <out.vrm> '<layers>'` | refits library garments to a VRoid body, re-skins them to her bones, hides covered skin, toon pass |
| `fabric.py` | weave per cloth type, turned hems with stitching, darker folds, varied roughness |
| `face.py` | expression mixes (`EXPRESSIONS`), face normals from a head ellipsoid, blush |
| `look.py`, `shots.py` | studio material and light rig; stills (3/4, front, back, face) |
| `dance.py <figure.vrm> <out.json>` | 1 s loop from Quaternius `Dance_Loop`, retargeted, spring bones baked |
| `handles.py`, `live_view.py` | IK drag handles for yskills; a visible Blender that reloads the live folder |
| `check_layers.py` | must print ok: outfits switch cleanly, nothing tears in a wide stance, arms up, crouch |
| `chibi_koban.py` | the chibi ([chibi-roadmap.md](chibi-roadmap.md)) |
| `fetch-library.sh`, `make_library.py`, `inspect_glb.py`, `sheet.mjs` | library fetch, index, header check, contact sheet |

## Layer rule (every main figure)

1. **Body:** one complete, intact skin mesh. Nothing painted on, no faces deleted. Smooth,
   non-explicit base under the underwear.
2. **Underwear:** its own objects (`Under_*`, stockings as real meshes) on the same armature.
3. **Outfits:** their own objects on top.
4. **Clipping:** one `Mask` modifier per outfit layer on the body hides only the skin that garment
   covers (two-sided normal-line ray test, eroded one ring); the last centimetre under a hem stays
   so a standing-off waistband shows skin, not the inside of the skirt.
5. **Switches:** armature properties drive garment visibility and masks with simple-expression
   drivers (work with Auto Run off). Underwear has no off switch in delivered files.

NPCs may be one combined mesh where that is standard game practice. The pro garment stack (studied
on Blender Studio rigs and the study file): `Armature → CorrectiveSmooth → (Surface Deform +
Shrinkwrap for tight fits) → Mask → Subdivision last`. Tight outfits get 4 to 6 corrective shape
keys (chest forward, shoulders down, thigh forward); VRM has no drivers, so the game sets them from
bone angles.

## Straps and tight cloth

Cut straps, tops and briefs **out of the body surface**: duplicate, two `bisect_plane` cuts at ±
width/2, delete the rest, Solidify 2.5 mm, Subdivision 1. Sell tightness with a 1.8 mm skin indent
under the strap and a 0.6 mm bulge beside it, plus a contact-shadow line in the texture. Where real
fabric bridges a hollow (cleavage), smooth a local vertex group ~10 iterations and Shrinkwrap
`OUTSIDE_SURFACE`; smoothing the whole piece breaks open edges.

## Faces

Persona 5 keeps 3D faces simple and adds 2D overlays; Genshin/HSR/ZZZ mix brow/eye/mouth part keys
and use a face SDF shadow map. Ours: VRoid `BRW_`/`EYE_`/`MTH_` part mixes (never only the `ALL_`
presets), ellipsoid face normals, blush layer, 2D stickers for comedy.

| Game event | Expression |
|---|---|
| Greeting | Freude 0.6, wave, head tilt |
| Praise | Freude + Roete, small hop |
| Task done | Stolz, nod |
| Task failed | Traurig, sweat-drop sticker |
| Money earned | Freude + sparkle eyes, cheer |
| Idle | her default mood, blink every 2 to 6 s, look-at follows the cursor |
| Teased | Ueberrascht, then Wuetend 0.4 + Roete |
| Goodbye | Zwinkern, wave |

Still missing for all figures: `><` eyes, pout, tears, the face SDF shadow in MToon.

- 2026-10-06 (hq-game PLAN): animals act out real state: working = idle at the desk with a typing bob, done = dance, blocked = gesture-negative, waiting for yskills = gesture-positive facing the camera, idle = static or nap (Kenney Cube Pets clips, see [models.md](models.md)).

## Physics and motion

- Game: VRM spring bones on bust, hair and skirt with sphere colliders (head, chest, hips, thighs);
  colliders unscaled, small hit radius. Bust carries 60 % of the upper chest's motion (`CARRY`) and
  has its settled ~30° sag removed (`unsag`), or lively clips swing it through ~64°.
- Blender: jiggle by small pinned cloth proxies plus an inflated collision cage, so arms and
  clothes never sink in. Wiggle 2 (GPL add-on) to find spring values.
- Moves are shared clips (VRMA, Quaternius UAL), crossfade 0.2 to 0.3 s; arms kept outside the
  torso and bust by measuring the skinned meshes.

## Look (what yskills' reference pictures share)

Dark world (strength ~0.2), warm soft key, low fill, **strong cool rim** from behind; AgX view
transform. Skin: subsurface 1.0 (radius about 1 / 0.45 / 0.25), dual specular lobes, light coat
(0.2) for the glossy sheen, AO multiplied into colour. Cloth: cotton roughness ~0.87 with a little
sheen, satin ~0.26, translucency on thin fabric, weave normal/bump maps, lace as an alpha shell.
In three.js: `MeshPhysicalMaterial` sheen 0.5 to 1 for satin, `AgXToneMapping`, SSAO/N8AO for
contact shadow under straps and bust. Full size target ≤100k triangles after Subdivision 1.

## Quality bar (each line already reached yskills once)

- Start from the best finished free base, never from scratch; copy techniques, never files.
- Keep the base's proportions; style with smooth shape keys, hands, feet and joints untouched.
- Layers, not paint; never delete body faces.
- Garment weights come from the body, each leg piece locked to its own leg (boots once webbed
  between the feet), skirts smoothed to swing as one piece. `check_layers.py` ok.
- No holes at hems; real footwear with soles on the floor.
- Cloth reads as its material (satin glides, denim has twill, leather grain).
- Elegant means long, fitted, smooth, with a slit, not a boxy mini.
- Faces read at a glance; brows visible over bangs.
- Render, look at every frame as an AAA character artist would, fix, then show; name what is weak.
- Content line: sexy lingerie; the base is a smooth high detailed nude body with working genitals

## Headless VRM remix (no Blender)

How the HQ remix (Vita becomes Kira, `remix.mjs`, 2026-10-07) reshapes a rigged VRM in Node with no Blender and no paid service. The code (`remix.mjs`, `params.json`, `viewer.html`, `shots.mjs`, `office.mjs`) lives only in `/mnt/project-files/claude-setup/hq-characters/remix/`; keep that folder.

- 2026-10-07 (hq-characters remix REPORT): body reshape = a smooth displacement field of positions: bust = an ellipsoid fitted to the `J_Sec_*_Bust` weights; hips, waist and thighs = bands from the hip, spine, chest and leg bones; zero near neck and wrists; normals follow the field's Jacobian; 8 spring-bone colliders refitted. Skin and baked clothes at one spot move alike, so there are no seams or spikes.
- 2026-10-07 (hq-characters remix REPORT): the body poked through the coarse neon overlay at the bust; fix = a wider bust field plus a cloth-lift pass (overlay corners lifted where skin would show, 50 vertices). The lift only covers cloth over SKIN in the same mesh.
- 2026-10-07 (hq-characters remix REPORT): height = scale the skeleton's Root node (x1.06 moves the head bone 1.466 to 1.554 m); HQ r147 sizes cards by the unskinned box, so the height shows.
- 2026-10-07 (hq-characters remix REPORT, params.json): recolour by material name: hue / hueTo / sat / light, plus `tint` (colourise by brightness) for white or grey sources (white hair cannot go red by hue shift). A suit painted into `Body_00_SKIN` needs a recolour of the non-skin pixels. Shared textures (`Matcap_Rim`) stay. Every texture at most 1024 px.
- 2026-10-07 (hq-characters remix REPORT): limits: the VRM 1.0 path (VRMC_vrm meta, VRMC_springBone, MToon factors) is untested for lack of a file; the embedded portrait stays the original's (render one in `viewer.html`, about 30 lines); not checked in motion (arms hang close to the wider hips).
- 2026-10-07 (hq-characters remix REPORT): hard, hair swap between VRoid models: the hair is skinned to the model's own HairJoint bones with its own spring groups and colliders; merge skins, nodes, inverse bind matrices, spring bones and materials, then fit another head, about 1 to 2 days.
- 2026-10-07 (hq-characters remix REPORT): face variety: VRoid has no shape keys for face proportions (the 41 face targets are expressions). Cheap variety = swap eye, brow, lash and eyeline textures between VRoid models (same UV layout), about 0.5 day; changing face geometry is hard.
- 2026-10-07 (hq-characters remix REPORT, HANDOFF): ten distinct people from two bases (F and G): shape plus colour variants take about 2 h (5 s build plus one look each) but look like siblings; distinct people need face-texture swaps (+0.5 day) plus more licence-clean VRoid bases or a hair transplant (+1 to 2 days). Plan: 3 bases x shape x colour x face-texture swaps, named originals after the references.
- 2026-10-07 (hq-characters HANDOFF): rejected: a Node `remix.mjs` approach for the ten originals (a translucent mask sat over G's lower face); the ten were built with numpy + Pillow `remix.py` by skin weights, set by `roster.json` + `build.sh` (those scripts were on branches that never merged).
- 2026-10-07 (hq-characters HANDOFF): untested idea, texture-space outfit painting: a per-texel 3D position and body-part map of the VRoid body texture (`bodymap.py`), garments painted as 3D shapes (tops, briefs, stockings, jeans, bodysuit; stripes, dots, lace, denim), skin repainted first, then garments, and a `cover()` check that refuses any outfit leaving chest or hips bare. Written, never run or screenshot.
