# Low-poly best practice and asset sources (2026-10-25)

Method: WebSearch only, no page fetched. Search returned mostly secondary guides, so many
lines are "Common practice". Tags: V = Verified (primary source seen in results),
C = Common practice (secondary), U = Unverified (no source found, treat as a guess).
Before relying on any number, open the primary URL once.

## Part A. Low-poly best practice

### A1. Triangle budgets (no primary source gives hard numbers; budgets are engine/project specific)

| Item | Number | Tag | Source |
|---|---|---|---|
| Mobile character | 3,000 to 10,000 tris | C | https://www.sloyd.ai/glossary/polygon-count |
| Mobile prop | 300 to 1,500 tris | C | https://www.sloyd.ai/glossary/polygon-count |
| PC/console character | 20,000 to 80,000 tris | C | https://www.sloyd.ai/glossary/polygon-count |
| Polycount members, mobile: character ~1k to 3k tris with 512 px maps, props ~250 | forum opinion | C | https://polycount.com/discussion/185065/poly-budget |
| Shaders and overdraw hurt mobile more than tri count | forum opinion | C | same Polycount thread |
| AAA reference: CryEngine HUNT main character LOD0 35k to 70k, LOD3 5k to 8k tris | V (engine doc, AAA scale, not web) | V | https://cryengine.com/docs/static/engines/cryengine-5/categories/23756816/pages/23307976 |
| Web (three.js) scene total, per prop, per character | no primary number found | U | none. Practical rule: budget draw calls and texture memory first (A5, A7); stylised web game with characters at 2k to 8k tris and a scene under ~200k tris is a safe starting guess |
| Polycount wiki Polygon Count page | not returned by search, figures unchecked | U | https://wiki.polycount.com/wiki/Polygon_Count (open it manually) |

Proposed project defaults (our decision, not a source claim): character 3k to 8k tris, prop 100 to 1,500, scene
under 150k visible tris on web, 1 material per object, 512 to 1024 px textures.

### A2. Flat vs toon shading

- three.js toon: `MeshToonMaterial` with `gradientMap`; minFilter and magFilter must be `NearestFilter`, default null. V. https://threejs.org/docs/pages/MeshToonMaterial.html
- Typical gradientMap is a 3 to 5 pixel DataTexture of grey steps (e.g. 0, 128, 255). C. https://tessl.io/registry/skills/github/cloudai-x/threejs-skills/threejs-materials
- Flat/unlit look in glTF: `KHR_materials_unlit` ("Shadeless" in the Blender exporter). V. https://docs.blender.org/manual/en/5.2/addons/scene_gltf2.html
- Blender toon: Shader to RGB node (Eevee only) into a Color Ramp set to Constant interpolation gives hard bands. V. https://docs.blender.org/manual/en/4.0/render/shader_nodes/converter/shader_to_rgb.html (Constant ramp recipe: C, https://blog.gskinner.com/archives/2020/05/shader-rgb-node.html)
- Shader to RGB breaks the PBR chain (AO, soft shadows, SSR, SSS unpredictable). V, same Blender manual page.
- A Shader-to-RGB toon material does NOT export to glTF. U (no source confirms; exporter only reads Principled BSDF and unlit, see A8). Rebuild it as MeshToonMaterial in three.js or bake.

### A3. Palette / gradient-atlas textures and vertex colours

- One small palette texture (e.g. 64x64 or 256x256 colour grid) shared by all props, UVs placed on colour cells, gives one material and one draw call for the whole kit. C. Kenney kits use this style (https://kenney.nl/assets). U for exact sizes.
- Vertex colours: glTF supports `COLOR_0`; three.js uses it with `vertexColors: true`. Not confirmed by a search result. U. Check https://threejs.org/docs/ (Material.vertexColors) and the glTF spec https://registry.khronos.org/glTF/specs/2.0/glTF-2.0.html
- Textures are usually 80 percent or more of a GLB and all of the GPU memory, so palette atlases pay off. C. https://app.cinevva.com/guides/optimize-glb-for-web

### A4. LOD

- Godot: GeometryInstance visibility range per object defines LOD switching (3.x docs; Godot 4 adds automatic mesh LOD on import, not seen in results). V for visibility range. https://docs.godotengine.org/en/3.1/tutorials/3d/3d_performance_and_limitations.html
- For stylised low-poly web games with under ~5k tris per object, LOD is usually not worth it; instancing and culling matter more. Common practice, no source. U.
- Unity LOD Group: not searched, U. https://docs.unity3d.com/Manual/class-LODGroup.html

### A5. Instancing and draw calls

- three.js: every mesh is a draw call, merge geometry first; `InstancedMesh` for many copies of the same geometry+material = one draw call. V (manual) https://threejs.org/manual/en/optimize-lots-of-objects ; trade-off wording C: https://discourse.threejs.org/t/how-to-optimize-objects-in-three-js-methods-of-optimization/2242
- Merged geometry loses per-object frustum culling, so merge only parts smaller than the viewport. C, same Discourse thread.
- Rule of thumb: instancing for 100+ identical objects, merging for static non-identical parts. C. https://smithery.ai/skills/Bbeierle12/r3f-performance
- Godot: MultiMesh draws thousands of instances in one call, but all instances always render and you must supply the AABB. V. https://godot-pl.readthedocs.io/pl/4.x/classes/class_multimesh.html
- Godot: keep transparent objects to a minimum, join meshes ahead of time, not at runtime. V (3.x page). https://docs.godotengine.org/en/3.1/tutorials/3d/3d_performance_and_limitations.html
- Draw call budget numbers (e.g. under 100 on mobile web): no primary source found. U. Practical target: under 100 draw calls on mobile, under 300 on desktop (our guess).
- Godot mobile: use the Mobile renderer, not Forward+. C. https://slicker.me/godot/mobile-optimization.html

### A6. Rigging, weights, topology

- Unity "Standard" skin weights = 4 bones per vertex, the default and recommended for performance; Custom allows 1 to 32 with higher cost. V. https://docs.unity3d.com/es/2020.1/Manual/FBXImporter-Rig.html (same page, English version: docs.unity3d.com/Manual/FBXImporter-Rig.html)
- Cap influences at 4 per vertex for web too (glTF `JOINTS_0/WEIGHTS_0` is one vec4 by default). C, the glTF spec allows more sets only via extra attributes: https://registry.khronos.org/glTF/specs/2.0/glTF-2.0.html
- VRM 1.0 requires 15 humanoid bones (head, hips, spine, upper/lower arms, hands, upper/lower legs, feet); neck and chest required only in VRM 0. V. https://vrm.dev/vrm1/humanoid/
- Mixamo bone names map to VRM humanoid names via a retarget table (three-vrm style). C. https://huggingface.co/spaces/AIbee999/CharacterGen_test/blob/604b72580a799f334d82bcc49c9075dce80694f4/render_script/three-js/src/mixamoVRMRigMap.js
- Mixamo auto-rigger "65 bones": not verified. U.
- Joint topology (2 to 3 edge loops at elbows/knees, avoid triangles on bending zones): standard practice, no primary source returned. U. Check https://wiki.polycount.com/
- Bone count budget for mobile (e.g. 30 to 60 bones): no source. U.
- Unity humanoid Avatar maps a simplified humanoid onto your skeleton. V. same Unity Rig page.

### A7. glTF export and optimisation

- gltf-transform: `optimize` runs the common steps in one command; defaults may not suit every scene, check `optimize -h`. V. https://gltf-transform.dev/cli
- Meshopt covers geometry, morph targets and keyframe animation; Draco does geometry only, so animated characters should use Meshopt. C (README + guide). https://www.npmjs.com/package/vaps-transform and https://app.cinevva.com/guides/optimize-glb-for-web
- Draco: slightly smaller, slower decode, decoder about 10x larger. C. https://app.cinevva.com/guides/optimize-glb-for-web
- Extensions: `KHR_draco_mesh_compression`, `EXT_meshopt_compression`. C, same guide; primary spec list: https://github.com/KhronosGroup/glTF/tree/main/extensions
- Textures: resize first, then WebP (download size) or KTX2/Basis (GPU memory). C. https://app.cinevva.com/guides/optimize-glb-for-web . Suggested command: `gltf-transform optimize in.glb out.glb --compress meshopt --texture-compress webp` (flags vary by version, C).
- Simplify, weld, prune are inside `optimize`. C. https://community.khronos.org/t/gltf-multiple-bin/111141

### A8. Blender glTF exporter limits

- Exports Metal/Rough PBR and Shadeless (KHR_materials_unlit) only; image textures PNG/JPEG; roughness from green, metallic from blue channel; tangent-space normals only; emission via Principled input. V. https://docs.blender.org/manual/en/5.2/addons/scene_gltf2.html
- Procedural nodes (noise, voronoi, wave) are not exported by FBX or USD, and MaterialX export is partial. V (Blender bug tracker / devtalk). https://devtalk.blender.org/t/exporting-procedural-texture-nodes-as-usd/31513 and https://projects.blender.org/blender/blender/issues/112864 . Bake to textures instead.

### A9. TikTok claims re-checked

1. "Stylised FX from about 5 nodes (noise/voronoi) in shader/geometry nodes": plausible as a Blender render recipe, no source tests "5 nodes". U for the count.
   - Mapping-node location is cheaper than animating Noise 4D W: partly holds. Blender manual says higher dimensions mean higher render time, so 4D costs more than 3D. V (manual). https://docs.blender.org/manual/en/2.91/render/shader_nodes/textures/noise.html . No benchmark of W vs Mapping found; the cost difference is inference. U.
   - W morphs the pattern in place, location drifts it directionally, so they look different, not interchangeable. C. https://cgcookie.com/community/8856-want-to-know-more-about-4d-textures
   - "Carries to game engines": FALSE for the nodes themselves. Procedural noise/voronoi do not export (A8). It only carries if baked to textures or rebuilt as an engine shader (three.js ShaderMaterial/TSL, Godot shader, Unity Shader Graph). V.
2. "Buy, generate, then model" for character bodies: sensible cost/risk order for zero budget only if "buy" means free CC0/licensed bodies first. Rig compatibility (VRM/Mixamo, A6) and licence clarity (Part B) favour a bought or CC0 base; AI output often needs retopology and has licence clauses. Opinion, C. Our rule: free base (Quaternius, Kenney, VRoid) -> AI only for props/concepts -> hand modelling for the signature character.
3. "Blockout in Blender -> AI video-to-video for camera/timing control": plausible. Runway Aleph does video-to-video edits, restyling and new angles; blockout as depth/camera reference is argued by a vendor FAQ with no named test. C. https://nofilmschool.com/runway-new-aleph-video-model and https://invideo.io/faq/why-do-filmmakers-use-low-poly-blender-blockouts-as/ . No tested end-to-end Blender->Aleph guide found; test one 5 s shot first. Note: results drift in identity/props, so keep the blockout render with simple flat colours and check the tool's licence for commercial use.

## Part B. Source decision table

Defaults: zero budget. FREE = no money needed. Contexts: G = game, A = animation (3D short, own render), V = video (live/edited).

### B1. Table

| Source class | Examples | Cost | Licence check before use | Quality ceiling | Pick when |
|---|---|---|---|---|---|
| Free CC0 | Kenney, Quaternius, Poly Haven, ambientCG | FREE | Confirm CC0 on the asset page; CC0 = commercial use, no attribution (Poly Haven: V https://polyhaven.com/license ; Kenney, Quaternius, ambientCG: C https://app.cinevva.com/guides/game-assets-guide) | Consistent stylised low-poly kits, PBR textures and HDRIs; no unique hero characters | Always first for G props/textures, A and V backgrounds and HDRIs |
| Free mixed licence | Poly Pizza, OpenGameArt, itch.io free, Sketchfab CC | FREE | Per asset: Poly Pizza mostly CC-BY (credit needed) some CC0; OpenGameArt mixes CC0/CC-BY/CC-BY-SA/GPL (GPL/SA can force your game's licence, avoid); itch.io: read the creator's terms. C. https://app.cinevva.com/guides/game-assets-guide | Variable | When CC0 has no match. Log author, URL, licence for each file in a credits file |
| Paid marketplaces | Fab (replaces Sketchfab Store), Unity Asset Store, CGTrader, BOOTH, Gumroad, itch.io | 5 to 100+ EUR | Fab: Standard licence or CC-BY, sellers must tag "CreatedWithAI" (V https://80.lv/articles/epic-games-adresses-ai-generated-content-plaguing-fab); read https://www.fab.com/eula. Sketchfab Store is being migrated to Fab (C, https://www.unrealengine.com/blog/fab-content-marketplace-launches-in-october-publishing-portal-opens-today). Unity: assets usable in your game and in other engines per Unity support, but no redistribution as standalone items or extractable from the final product (V https://support.unity.com/hc/en-us/articles/34387186019988-Can-I-use-assets-from-the-Asset-Store-with-other-engines). Publisher custom terms can override (C). CGTrader, Gumroad, itch: U, read each licence | High: hero characters, animation packs | Only after asking yskills (real money = ask first). Pick for a hero character or animation set that no free source has |
| VRM / VRoid / BOOTH | VRoid Hub, BOOTH, VRoid Studio | FREE to paid | VRM carries per-model conditions: corporate use, individual commercial use, redistribution of altered models, religious/political, hateful use (V https://developer.vroid.com/en/guidelines/conditions_of_use.html). BOOTH items vary: some allow commercial use but ban resale or redistribution of files; some ban AI training, NFTs; some need VRoid Hub download disabled (C, e.g. https://booth.pm/en/items/8842392 and https://booth.pm/en/items/7034844). Read the item description, keep a screenshot | Good anime humanoids, VRM rig ready | G or V with a humanoid avatar; check the "commercial use" box in the model's own metadata |
| Mixamo | Adobe Mixamo (animations, auto-rig) | FREE (Adobe ID) | Free for paid and unpaid projects; do NOT redistribute raw character/animation files (asset packs, stores); Additional Terms ban using output to train AI (C+V https://community.adobe.com/questions-696/mixamo-faq-licensing-royalties-ownership-eula-and-tos-589400 and https://wwwimages2.adobe.com/content/dam/cc/en/legal/servicetou/Mixamo-Addl-Terms-en_US-20210623.pdf) | Generic but usable motion | G/A/V body animation. Never publish the FBX in an open repo |
| AI 3D, open source | TRELLIS (MIT; TRELLIS.2 no territory/revenue clause), Hunyuan3D 2.x | FREE (own GPU or free Spaces) | TRELLIS: MIT, ship with notice. Hunyuan3D 2.1: Tencent licence excludes EU, UK, South Korea, so unusable for us if we are in the EU (V https://huggingface.co/tencent/Hunyuan3D-2/blob/main/LICENSE ; C https://www.creativeainews.com/articles/best-open-source-ai-3d-models-2026/). Check output copyright law for your country | Props/blobs OK, needs retopology and UV cleanup; hands/faces weak | Concept props, background clutter. Not for hero/rigged characters |
| AI 3D, hosted | Meshy, Tripo | FREE tier limited; paid ~10 to 20 USD/month (U, check) | Meshy Free: CC BY 4.0, commercial use allowed but credit Meshy, models become public; paid: private ownership, no credit (V help center https://intercom.help/meshy/en/articles/16102098-can-i-use-meshy-assets-commercially). Tripo Free: sources conflict (CC BY with credit vs non-commercial); treat as non-commercial until the ToS is read (C https://www.tripo3d.ai/blog/commercial-use-ai-3d-models vs https://www.tripo3d.ai/game-development/3d-assets-license-game-development) | Same as above, faster | Prototypes only on free tier; do not ship Tripo free assets |
| AI audio/music | Suno etc. | not researched | Read ToS, U | | Skip until needed |
| Free music/sfx | Kenney audio (CC0), Pixabay Music, Freesound, incompetech, OpenGameArt | FREE | Kenney CC0. Pixabay Content License: commercial, no credit, no resale of standalone file. Freesound: per file CC0/CC-BY/CC-BY-NC, reject NC. incompetech: CC-BY 4.0 with credit line, or about 30 USD per track for no credit. GPL audio on OpenGameArt: avoid (all C https://app.cinevva.com/guides/free-sound-effects-music) | Generic stock | G/A/V default. Keep credits file |
| Hand modelling in Blender | Blender (GPL; your own output is yours) | FREE (time) | Own work, no licence issue; keep any reference/texture sources CC0 | Highest, matches taste exactly, costs the most time | Signature character, brand-defining props, anything that must be unique |

### B2. Criteria to choose (in order)

1. Licence clear for commercial + shipped game? If not clear: skip. (G needs redistribution rights because the asset ships to players inside the bundle; A/V only need use-in-output, so licences are looser.)
2. Free? Prefer CC0, then CC-BY with a credits file, then the rest.
3. Style fit with our palette/shading (A2, A3) and rig fit (VRM or Mixamo humanoid, A6).
4. Effort to adapt (retopology, UV, rig) versus effort to model from scratch.
5. Risk: AI output, mixed-licence packs, GPL/SA, NC, EU-excluding licences.

### B3. Context defaults

- (a) Game: CC0 kits for world + props, Mixamo/CC0 packs for animation (not redistributed in repo), hand-modelled hero in Blender, free music from Kenney/Pixabay.
- (b) Animation: Poly Haven HDRIs and textures, Quaternius/Kenney props, VRoid or hand-modelled character, Mixamo or hand-keyed motion.
- (c) Video: lowest licensing friction, AI props OK for background, check each tool's output terms when published commercially.

### B4. Record every asset

For each file store: name, URL, author, licence and version, date, a screenshot of terms (BOOTH, hosted AI), and whether it ships in the bundle. Without this the licence check cannot be repeated.

## Gaps for a follow-up

- Hard budgets from primary docs (Unity, Godot 4, Khronos) for tris, bones, draw calls.
- Official licence pages of Kenney, Quaternius, ambientCG, OpenGameArt, Poly Pizza, CGTrader, Gumroad, itch.io.
- Tripo and Meshy actual ToS text (help-centre summaries only).
- Fab EULA text (https://www.fab.com/eula) and VRoid Hub terms.
- A tested Blender blockout -> AI video-to-video workflow.
