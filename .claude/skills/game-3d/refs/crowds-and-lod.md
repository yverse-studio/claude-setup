# Realistic figures: SFW game base, LOD chain, crowds (research 2026-11-10)

From the vacation-game research (troll-realism look, three.js, phone target, 20 MB first load).
Report with every link: vacation-game project files `research/sfw-base-lod-crowds.md` (German) and
`research/raw/r1..r3`. Tags: **V** primary source read, **C** secondary or forum, **U** our choice, not yet measured.
Stylised low-poly figures: [`low-poly.md`](low-poly.md) still applies (LOD rarely pays under about 5k tris).

## SFW game base from an own base body
- Pros delete body faces under clothing: CC4 Hide Body Mesh (V, Reallusion manual), Unreal Mutable Remove Unseen (C), MetaHuman body masks (C). For a fixed figure: copy the source, delete anatomy, model underwear on the high mesh, retopo, bake. The NSFW source never reaches a game folder or repo (U).
- Budgets read: MetaHuman body 30.5k / 7.6k / 3.35k / 1.5k vertices for LOD0-3, mobile at most LOD3 (V, Epic MetaHuman LOD spec). Rocketbox under 10k tris, 53 body bones, hipoly to ultralowpoly levels (V, Frontiers paper 10.3389/frvir.2020.561558), MIT (V, Rocketbox README).
- Skin weights: three.js reads only JOINTS_0/WEIGHTS_0 (V, GLTFLoader.js), so the 4-influence rule in [`low-poly.md`](low-poly.md) (Rigging) is hard: limit to 4 and normalise in Blender before export. Morph targets are unlimited in glTF; three.js keeps them in a float texture, about vertices x 16 B per target (V, WebGLMorphtargets.js).
- Instances share one geometry, so bake body-type shape keys into separate crowd meshes (U).

## LOD chain
- Unreal auto-LOD presets: 4 LODs at 50 % tris each (HighDetail 6), switch by screen size (V, UE docs). three.js `THREE.LOD` switches by distance with `hysteresis`, no cross-fade (V).
- gltfpack simplifies skinned or morphed meshes with `Regularize` and keeps JOINTS/WEIGHTS (V, meshoptimizer `gltf/mesh.cpp`); it drops `MSFT_lod` (V). glTF-Transform has separate `etc1s` (colour) and `uastc` (normal, ORM) commands, Khronos recommends that split (V, KTX Artist Guide); the gltfpack README shows no per-slot split for `-tc`.
- Our defaults for realistic web figures (U): 10k / 5k / 2k / 700 tris; all LODs of a character in one GLB with one skeleton and one texture (else texture and skeleton load four times); props may ship one file per LOD so LOD0 streams after the first frame. Imposters for trees, buildings, far stalls; far humans are silhouette cards.

## Crowds
- AC Unity (GDC 2015 abstract, V): at most 40 real AIs and 120 high-res models, up to 10,000 crowd NPCs, a pool swaps cheap for good models unnoticed. Unreal City Sample: far crowd as vertex-animated static meshes (AnimToTexture), skeletal up close (C). GPU Gems 3 ch. 2: bone matrices of all frames in a texture, per-instance time, LOD and colour (V).
- Plain three.js `SkinnedMesh` does not scale: one report fell below 60 fps past about 200 meshes on a laptop, 75 % of CPU in mixer and skeleton updates (C, three.js forum). Budget 8-12 real skinned figures on a phone (U).
- VAT memory grows with vertices x frames x clips (several MB per figure and LOD); a bone texture is about 10x smaller and serves every LOD of the same skeleton (U, estimate). With a shared studio skeleton, prefer bones: first `@three.ez/instanced-mesh` (InstancedMesh2, MIT, skinning, LOD, culling), then an own GPU Gems bone-texture shader if a phone needs it. OpenVAT is GPL-3.0 (tool only); do not copy unlicensed instanced-skinning repos.
- Three tiers (U, to be measured): near 8-12 `SkinnedMesh` every frame (LOD1, 5k, when the crowd is full); mid 60-100 instanced LOD2, animation 15 fps, AI 10 Hz; far 100-150 instanced LOD3, 8 fps, AI 2-5 Hz or on rails; slots re-assigned every 0.25 s by distance with 10 % hysteresis. Variety: 3-4 bases x baked body types x colour mask x scale 0.92-1.08 x clip offset and speed x hat/head swap. No shadows past the near tier, a blob decal instead.
- Scene budget on a phone (U): at most 150 draw calls and 300k visible tris (`renderer.info`). This is above the 150k stylised default in [`low-poly.md`](low-poly.md) and SKILL.md because realistic crowds need it. Tier sum: 10 x 5k + 80 x 2k + 150 x 700 is about 315k; cut mid or far counts first.
- Before building a crowd, run a spike on a mid-range phone (200 instances, fps counter, `renderer.info`); no primary source gives phone fps for any of these methods.
