# Walkable room (third-person cozy scene)

From the HQ office research (`/mnt/project-files/claude-setup/hq-office/office-research.md`, 2026-10-07). Numbers marked [judgement] are tuned by eye, not sourced; change them when a screenshot says so. The walker rules (A* floor grid, give way, stride) are in [learnings.md](learnings.md).

## Camera and controller

- 2026-10-07 (office-research): numbers [judgement]: eye 1.55 m, FOV 70 on desktop and 75 on a portrait phone, near 0.05, far 60, walk 1.6 m/s with no sprint, velocity smoothing `v += (target - v) * (1 - exp(-10 dt))`, no look smoothing on touch, no head bob (at most 1 cm sway at 2 Hz), pitch clamped to +-70 deg, device pixel ratio capped at 2.
- 2026-10-07 (office-research): one custom controller for both devices: drag or touch to look, WASD or a left virtual joystick to move, a right-half drag to look. `PointerLockControls` is desktop-only; a 40-line own joystick avoids a dependency. Tap-to-walk (A* on the same grid) only as a separate mode, never together with the joystick.
- 2026-10-07 (office-research, hq-office HANDOFF): third person with a wall-aware follow camera is more forgiving than first person in a small room (Unpacking uses a fixed isometric camera); keep a first-person switch if cheap.

## Collision

- 2026-10-07 (office-research): for a flat furnished office use a 2D occupancy grid (0.1 m cells) from furniture bounding-box footprints plus wall segments; the player is a circle of r 0.25 m, resolved axis by axis for wall sliding; footprints come from the asset registry. `three-mesh-bvh` only for stairs or several floors.
- Conflict, not settled: `../SKILL.md` §3 and the HQ game plan (`game-dev/PLAN.md`) say capsule plus `three-mesh-bvh`; the office research says grid first. Default to the grid for a flat room, BVH when the level has height.

## Light

- 2026-10-07 (office-research): day: HemisphereLight (warm sky, peach ground, 0.6) plus one warm low DirectionalLight with a 2048 PCFSoft shadow map in a tight frustum, ACES and sRGB. Night: a dim blue hemisphere, 3 to 4 warm PointLights (one casts a shadow), emissive lampshades, sprite glows as fake bloom, no postprocessing on phones. Skip outlines; an inverted hull on hero props only is optional.
- Note: ACES conflicts with the pastel rule (tone mapping off, `convertSRGBToLinear()`; ACES washed the pastels to grey, [learnings.md](learnings.md)). For a pastel room use the pastel rule; ACES is for the realistic-leaning day preset.
- 2026-10-07 (office-research): a baked Blender lightmap looks best (Bruno Simon's portfolio: a Blender bake plus a few physics toys) but costs a pipeline and file size: only for a final hero room, start real-time.
- 2026-10-07 (office-research) [judgement]: what makes a cozy room feel natural: a low-contrast pastel palette with one warm key, soft shadows, rounded bevelled meshes, no head bob, a slow walk, smooth acceleration, small props everywhere, warm light pools at night.

## Kit modules

- 2026-10-07 (office-research): reusable modules: `player.js` (input, smoothing, config), `collision.js`, `assets.js` (loader plus `register({id, url, licence, author, source, footprint})`, fails the test on a missing licence), `light.js` (dayPreset, nightPreset), `scene.js` (DPR cap, resize, visibility pause, fps and draw-call overlay). Each game = `index.html` + `game.js`; `assets/<pack>/` with a `LICENCE.txt` copied from the download page.
