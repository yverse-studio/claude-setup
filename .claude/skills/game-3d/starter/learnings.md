# Learnings digest (3D figures and games)

From Company XY's figure work, 2026-10-06 to 10-08: the HQ office animals, ten figures and Mira
(versions v2 to v12). Kept: what a new project would otherwise relearn. Dropped: per-version
history, one-off bug hunts, research that led nowhere. Add a line only when it recurs; newest last
in each section.

## How yskills judges 3D work

- **Test before showing.** Every picture was rendered and looked at frame by frame first; untested
  IK handles once tore Mira's hands off on yskills' screen. Every reply names what is still weak.
- **Start from the best finished work, never from scratch.** Find the best free model and the
  workflow its makers used, then restyle. Hand-tuned code on a weak base never reached the bar.
- The bar is AAA character art (Baldur's Gate level materials, BlobCG-smooth anime 3D), cute
  cartoon for chibis and animals (Animal Crossing, TFT). "Looks AI" or "broken" means start over
  from a better base, not tweak.
- Picture sets go in this order: inspiration, bare model in underwear, outfits, chibi. Compare
  variants side by side (base vs styled); yskills answers "more" or "ok".
- One plan, one instruction: settle tool choices between threads before yskills gets a manual
  step. yskills is not a confident Blender user: pose figures for them and give simple drag
  handles (hips, hands, feet).
- Content line: adult figures, lingerie and swimwear; full nudity, full anatomical detail,
  always under clothes; underwear can be switched off in delivered files.
- paid assets; but no money used; free library plus own work.

## Decisions (reuse unless a game has a reason not to)

- **Format VRM** (VRM 0 for VRoid bases): runs in three.js, Unity (UniVRM) and Godot (godot-vrm),
  so an engine change later needs no rebuild. Engine three.js (`../SKILL.md` §1); Godot is the free
  path if a game outgrows the browser.
- **Figures are recipes built headless**: recipe JSON → Blender script → VRM, in cloud threads.
  No headless anime character builder exists (VRoid Studio has no API, Ready Player Me shut down
  2026-01-31, Character Creator has no glTF export), so ours is base + library + assembly script.
- **Two outputs per figure**: full size and chibi; a decimated crowd LOD later.
- **Layers like pro character files**: intact body, underwear objects, outfit objects, one
  armature, Mask modifiers for clipping ([figures.md](figures.md)).
- **Moves are shared files** (VRMA, Quaternius UAL CC0); Mixamo only with yskills' Adobe account.
- **Library outside git** (635 MB) with a pinned, hashed index; binaries never in the repo.
- If quality must jump later, the step up is one paid pro base with a fitted-outfit market (BOOTH
  VRChat bases, about 60 to 120 € for a figure plus outfits): yskills buys, everything else stays.
- 2026-10-07 (research/characters-formats): formats and when each wins: VRM for anime humans you swap freely; GLB for furniture, animals and props; FBX only when a store or Roblox needs it; an engine-native format works only in its own engine. That is why VRM stays the one character format (the old link `research/characters-formats.md` is not in the repo).
- 2026-10-07 (research/characters-formats): per engine: three-vrm loads VRM and VRMA directly; Godot via godot-vrm (MIT); Unity via UniVRM (most mature); Unreal via VRM4U (works, heavy); Roblox has no VRM, it needs FBX or glTF rigged as R15 and imported in Studio, and VRM to R15 is work per character. Pick browser or Godot, not Roblox, when characters matter.
- 2026-10-07 (hq-characters HANDOFF, research/characters-formats): Honey Select 2 works as one base body with hundreds of morph sliders, swappable hair and clothes, a character saved as a PNG card that holds the slider numbers, and moves and scenes inside the game; VRoid Studio is the free equivalent. An in-game slider creator is a big project, only worth it if the game is about creating characters. The in-HQ creator plan, in slices: body dials = a saved remix displacement, hair/eye/skin/outfit colours, outfit swaps by extra .vrm. Faces stay VRoid's; a true parts creator is weeks of work and needs an asset library. Honey Select 2 cards never (PNG with embedded Unity data, proprietary 18+).

## Settings that worked

- Blender: `bpy` 5.2.2 on python3.13, VRM add-on 4.7.2, Cycles CPU (no EGL/GPU in the cloud),
  AgX. Subdivision is always the last modifier; low cage (2k to 10k verts) for crisp silhouettes.
- Light: dark world ~0.2, warm key, low fill, strong cool rim from behind; in three.js add
  `AgXToneMapping` and SSAO/N8AO. Pastel scenes: tone mapping off, hex colours through
  `convertSRGBToLinear()` under sRGB output.
- MToon chibi and skin values: [chibi-roadmap.md](chibi-roadmap.md) §6. Full-size skin: warm shade
  (skin × (0.95, 0.72, 0.68)), soft toony 0.3 to 0.5, faint skin-tone rim.
- Springs: `vrm.update(delta)` in seconds, delta clamped to 50 ms, colliders unscaled; bust
  `CARRY` 0.6 and `unsag`; finger curl 0.35 in the dance.
- Walkers: A* over a floor grid from the furniture boxes, give way instead of overlap, stride
  follows distance walked, ease in and out at about 1 m/s.
- 2026-10-06 (hq-cozy HANDOFF): cozy pastel render recipe: toon gradient softened to 4 steps, brown outlines, pastel planks and brick, golden sun by day, lamp shades plus pendant glow and a lavender ceiling at dusk and night, a darker night ambient, the kit repainted by material name from one COZY_KIT map.
- 2026-10-18 (igelgarten DESIGN, designer-handoff): flat diorama look in three.js (Igelgarten v3): flat toon materials, depth as flat value layers separated by translucent fog bands, a three-step hard-edged lantern pool, no bloom, blur or gradient, the hero the only light thing.

## Pitfalls (each one cost a round)

- Scaling bones or limbs to restyle (chibi v4-v7) looks broken; use shape keys with soft falloff.
- Clothes painted on the skin or body faces deleted: rejected; layers only.
- Garment edges from face selection come out stair-stepped; cut with `bisect_plane`.
- Garment weights copied loosely let a leg piece follow the other leg (boots webbed between the
  feet); lock each leg piece to its own side, cut bridges between the legs.
- Straps modelled as ribbons float over hollows; cut them from the body surface.
- Blender's Auto IK tears VRoid limbs (bones unconnected); use explicit IK handles. Blender 5
  hides bones with `PoseBone.hide`.
- VRM 0 models face +z: x and z bone rotations mirror (flipped arms, flat fingers).
- MToon matcap lit hair in white stripes; screen-space outlines in three-vrm 1.0.10 still thin with
  distance, so use world mode.
- A running build rewrites its output: copy a file out before baking from it.
- The project share re-encodes PNGs on write: pin images by upstream hash, check only presence.
- Base64 grows a third: size upload caps for that. Cloud Chromium has no H.264: test video as WebM.
- Login sites (BOOTH, VRoid Hub, Sketchfab) and adult-gated downloads can't be automated, and
  Claude Code's safety check blocks some; never work around it, ask yskills to download.
- Never give yskills Blender MCP setup steps; keep Blender's Auto Run Python Scripts off and never
  auto-allow run-code.
- Load every model in a real browser scene with a sample file before review; Blender stills
  don't show three-vrm's outline, spring or shading bugs.
- 2026-10-07 (hq-characters HANDOFF): VRoid clothing presets (.vroidcustomitem) only apply inside the VRoid Studio desktop GUI; headless routes are a full VRM whose outfit fits, or a texture repaint of the existing meshes.
- 2026-10-07 (hq-characters remix REPORT): upload sizes: a VRoid sample is 14.2 MB (textures 5.9 MB, geometry with 41 face blendshapes 3.7 MB); the in-browser shrink rebuilds the GLB with every texture over 1024 px scaled to 1024 (canvas PNG, 4-byte-aligned views) and lands at 9.6 MB.
- 2026-10-07 (hq-characters HANDOFF): a loader test that waits 14 s is too short for a 14 MB VRM; wait 25 s or load the shrunk file.
