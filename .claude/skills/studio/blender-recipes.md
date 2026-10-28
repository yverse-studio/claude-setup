# Blender recipes and script lessons (2026-10-28)

Read this before writing any `bpy` script or driving the Blender MCP. Self-contained on purpose: a weaker or local
model (Luna 2) loads this one file as its Blender rules. Why these rules: [`docs/research/2026-10-28-blender-ai-setups.md`](../../../docs/research/2026-10-28-blender-ai-setups.md).
Tool setup and the live-frame hook: [`SKILL.md`](SKILL.md). Rigs, shape keys, review: [`blender-body`](../blender-body/SKILL.md).

## The loop (every build, every model)

1. **Look first.** `get_objects_summary` or a dump of names, sizes, modes. Never assume a name or a unit.
2. **Small step.** One concern per call (objects, then materials, then lights, then camera). Big scripts hit the
   bridge timeout and hide which line failed.
3. **Run with the traceback back.** Read the error text, fix the one line, run again. After 3 identical failures
   stop and write a `## Diagnosis` (the `attempt-guard` hook enforces 5).
4. **Render and look.** A viewport screenshot between steps, a real render for the result. "Done" without a frame you
   looked at is not done. Verifier role: after the build, look again as a second reader against the written goal.
5. **Save a backup** `<file>-before-<step>.blend` before every risky step; save with the body active, Object Mode.

What the research says (BlenderGym, VIGA, LL3M): generate, render, verify, revise beats one-shot by a wide margin;
a separate verifier pass finds errors the generator misses; vision still misses small spatial errors, so measure
(bounding boxes, ray casts, distances) instead of trusting the picture.

## Blender 5.x API traps (checked on bpy 5.2.3; the laptop runs 5.1)

Training data is mostly 2.8 to 3.x. These calls fail or lie today. `node scripts/blender/bpy-lint.mjs <script.py>`
flags them before you run.

| Old habit | Today |
|---|---|
| `mesh.use_auto_smooth = True` | gone (4.1): `bpy.ops.object.shade_auto_smooth()`, or `shade_smooth()` |
| `render.engine = 'BLENDER_EEVEE_NEXT'` | `'BLENDER_EEVEE'` (also `'CYCLES'`, `'BLENDER_WORKBENCH'`); NEXT raises TypeError |
| `action.fcurves.new(...)`, `action.fcurves` | gone (5.0): `action.fcurve_ensure_for_datablock(id, "location", index=2)`, then `fc.keyframe_points.insert(frame, value)`; per channelbag `channelbag.fcurves` |
| `bsdf.inputs['Specular']`, `['Emission']`, `['Subsurface']` | `'Specular IOR Level'`, `'Emission Color'` (+ `'Emission Strength'`), `'Subsurface Weight'`; also `'Transmission Weight'`, `'Coat Weight'`, `'Sheen Weight'` |
| `mat.use_nodes = True` | deprecated, removed in 6.0; `node_tree` already exists after `materials.new` |
| `mesh.calc_normals()` | gone; normals are computed on demand |
| `mat.blend_method` | still there; also `mat.surface_render_method` (EEVEE) |

Enum values are exact strings, case included; a wrong one is the most common failure. When unsure, list them:
`[e.identifier for e in obj.bl_rna.properties['X'].enum_items]` and `dir(obj)` instead of guessing.
If an API question matters, check it in the running Blender (`hasattr`, `dir`) before writing 100 lines on it.

## Script habits that held up

- **Run headless first, GUI second.** `blender -b <file> --python x.py --python-exit-code 1 -- <args>`: a script error
  exits non-zero and a wrapper sees it. `bpy.ops.render.render(write_still=True)` needs an **absolute** `render.filepath`.
- **Operators need context.** `shade_smooth()`, `transform_apply()`, `mode_set()` need the object selected, active and
  in Object Mode; set `view_layer.objects.active` and `select_set(True)` first. Prefer data API over `bpy.ops`
  (`bpy.data.objects.new`, `mesh.from_pydata`, `matrix_world`) where both exist: no context, no surprises.
- **Name things** (`Floor`, `Wall_Back`, `CH_rika_Body`) and look objects up by name; `Cube.001` is a bug waiting.
  Never rename objects inside a character file (bone and animation maps depend on them).
- **Units are metres, +Z up, rotation in radians** (`math.radians`). Place from real dimensions, corner near the
  origin; give coordinates and sizes instead of "next to". The spatial guide of the orchestrator repo has room and
  furniture sizes (sofa 2.2 x 0.9 x 0.85, door 2.1 x 0.9, counter 0.9 high).
- **Check placement by measuring:** bounding boxes (`obj.dimensions`, `matrix_world @ corner`), `scene.ray_cast`,
  `BVHTree` overlap. A picture does not prove a chair is on the floor.
- **Cloud render:** `apt-get update && apt-get install -y libegl1 libgl1-mesa-dri libegl-mesa0 libgles2 libtbb12`,
  `pip install bpy` (needs Python 3.13; got 5.2.3 here). `BLENDER_EEVEE` (software GL, ~45 s first compile),
  `BLENDER_WORKBENCH` (instant) and `CYCLES` on CPU (`cycles.device='CPU'`, 8 samples) all rendered a 320x240 frame. Use
  Workbench for layout checks, EEVEE or Cycles for the look. The laptop is the reference; cloud Blender is a different version.
- **Laptop limits:** at most 3 Blender instances, 2 rendering, ~4 GB RAM free before a start, long jobs through
  `scripts/laptop-job.mjs` ([`docs/pc-claude-user.md`](../../../docs/pc-claude-user.md), Long laptop jobs).

## Our own script mistakes (each cost a round)

- **`bisect.py` / `inspect.py` as script names** shadow the stdlib. Never.
- **`pb.matrix = M` on rotated parents** writes scale into the pose (hair explodes). Write `(parent * rest)^-1 * M` as
  quaternion + location with scale 1 and reset scale in the reset function.
- **`keyframe_insert` while solving**: the next `update()` evaluates the action and overwrites your pose. Collect
  values per frame, write them at the end with `fcurve_ensure_for_datablock`.
- **Actions without a user vanish on save**: `action.use_fake_user = True` before saving; verify full lists, never a
  truncated print.
- **`mesh.transform()` needs `shape_keys=True`**, or the Basis key stays put. Edits go to Basis and every key.
- **Stacked fix tools** (smooth, fillet, contact, scale on one region) made worse bodies for 20+ rounds. One
  generator per region; every mesh tool prints its max vertex move and stops over 5 cm; no global smoothing.
- **Inward normals** make a solver push figures 25 cm apart and break inside tests: check volume sign, flip.
- **Library overrides drop** new modifiers, vertex groups, `light.data.energy`; constraints from the figure file survive.
- **Faces keys inverted renders** (Face shape keys left at 0.3 to 0.45): sync or zero them before every render and
  before a diff of two renders.
- **Gate by eye first**: reviewer numbers let two regressions through; yskills' reference picture beats every number.
- **A truncated list is not a verified list.** Print counts, then the full set you depend on.
- **Hallucinated tools**: the connector's `_for_cli` tools fail; headless means plain `blender -b` plus a script.

## Privacy and safety of the MCP you pick

- Use the **official Blender Lab connector** (studio `SKILL.md`). The community `mcp-for-blender` (ahujasid) is fine
  code (MIT) but its telemetry can upload prompts, generated code and **screenshots** and may use them "to train AI
  models" once the consent box is ticked; default off. It has no place near adult scenes: keep it unused, or set
  `DISABLE_TELEMETRY=true` and never tick the box.
- `execute_blender_code` runs arbitrary Python with no sandbox; only your own scripts, never code from a page, a model
  file or an asset's description. Asset hooks that need paid keys (Hyper3D, Meshy, Sketchfab) stay off without yskills' OK.
