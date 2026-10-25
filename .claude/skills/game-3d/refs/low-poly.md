# Low-poly best practice (research 2026-10-25)

Report with every URL: `/mnt/project-files/claude-setup/research/2026-10-25-low-poly-and-sources.md`. Tags: **V** primary source seen, **C** secondary or common practice, **U** no source, our choice. Open the primary page once before leaning on a number. Where to get assets: [`asset-sources.md`](asset-sources.md).

## Budgets (no primary source gives hard numbers; they depend on engine and target)
| Item | Number | Tag |
|---|---|---|
| Mobile character | 3k to 10k tris (Polycount members: 1k to 3k with 512 px maps) | C |
| Mobile prop | 300 to 1.5k tris | C |
| PC / console character | 20k to 80k tris | C |
| Our defaults for web (our choice) | character 3k to 8k, prop 100 to 1.5k, scene under 150k visible tris, 1 material per object, 512 to 1024 px textures, under 100 draw calls mobile / 300 desktop | U |
Overdraw and shaders hurt mobile more than triangle count (C). Budget draw calls and texture memory first.

## Shading
- three.js toon: `MeshToonMaterial` with a `gradientMap` (3 to 5 grey steps); the map needs `NearestFilter` (V, threejs.org/docs MeshToonMaterial).
- Flat/unlit in glTF: `KHR_materials_unlit` (Blender exporter "Shadeless") (V, Blender manual glTF page).
- Blender toon: Shader to RGB (Eevee only) into a Constant Color Ramp (V). It breaks the PBR chain and does not export to glTF (U): rebuild as `MeshToonMaterial` or bake.
- Palette: one small colour-grid texture shared by a whole kit = one material, one draw call (C; Kenney kits). Vertex colours (`COLOR_0`, `vertexColors: true`): check the glTF spec and three.js docs (U).

## Instancing and LOD
- Every mesh is a draw call: merge static geometry, `InstancedMesh` for 100+ copies (V, threejs.org manual optimize-lots-of-objects). Merging loses per-object culling, so merge only parts smaller than the screen (C).
- Godot `MultiMesh` draws thousands of instances in one call; all always render (V). Godot visibility range does LOD (V, 3.x docs).
- Stylised objects under about 5k tris rarely need LOD; instancing and culling matter more (U).

## Rigging for animation
- 4 bone influences per vertex is the default and the cheap setting (V, Unity FBX importer docs); glTF skinning carries 4 per `JOINTS_0` set (C).
- VRM 1.0 requires 15 humanoid bones (V, vrm.dev/vrm1/humanoid). Mixamo names map to VRM names with a retarget table (C).
- 2 to 3 edge loops at elbows and knees, no triangles in bending zones (U, standard practice; check the Polycount wiki).

## glTF export and size
- `gltf-transform optimize in.glb out.glb --compress meshopt --texture-compress webp` (V for `optimize`, C for flags; flags vary by version). Meshopt, not Draco, for animated characters (C). Textures are most of a GLB and all of GPU memory: resize first, then WebP or KTX2.
- Blender's glTF exporter reads Principled BSDF and unlit only; procedural nodes (noise, voronoi, wave) do not export (V). **Bake them to textures or rebuild the shader in the engine.**

## Re-checked video lessons
- "Animate the Mapping node's location instead of the 4D noise W": 4D costs more render time than 3D (V, Blender manual), but no benchmark compares the two and W morphs in place while location drifts, so they look different. Good for renders. **It does not carry to game engines**: the nodes do not export (above). Recipe: [`vfx-nodes.md`](vfx-nodes.md).
- "Blockout in Blender, then AI video-to-video": plausible (Runway Aleph and similar), no tested end-to-end guide found (C). Try one 5 s shot first. See `video-studio/people-video.md`.
- Our cloud test (2026-10-25) built a node fire, a blockout and posed VRM characters headless: `video-studio/templates/blender-pov/README.md`.
