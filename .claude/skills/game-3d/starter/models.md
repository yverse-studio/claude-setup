# Standard models and assets

What a new project may start from. "Ship" means it may go into a paid game with the credit shown;
"HQ only" means fine in yskills' private HQ but never in a sold product; "study" means look, learn,
never copy files. Licences are as the source states them and as the VRM meta says; read both again
before shipping (`../scripts/check-assets.mjs` enforces the meta). Library paths are under
`/mnt/project-files/companyxy/vrm-library/` (fetch elsewhere with `tools/vrm/fetch-library.sh`).

Picking a source, in this order (2026-10-24, low-poly-and-sources): licence clear for a shipped game (a game needs redistribution rights because the asset ships in the bundle; animation or video only need use-in-output), free (CC0, then CC-BY with a credits file), style fit, effort, risk (AI, mixed packs, GPL or share-alike, non-commercial, EU-excluding). Record every asset: name, URL, author, licence and version, date, a screenshot of the terms (BOOTH, hosted AI) and whether it ships in the bundle (`../templates/manifest.json`).

## Our own builds

| Model | What | Built from | Use | Where |
|---|---|---|---|---|
| Mira, full size | adult anime woman, layered (body, underwear, outfits), faces, springs, dance | pixiv VRoid sample "Victoria" (VRoid Hub terms: everyone, commercial, edits, no credit) + Shino hair (CC0) + **drophunter garments (personal non-profit)** | HQ only until the drophunter garments are swapped for own or CC0 garments; then ship | company-xy `characters/` recipe (`roster.json`, `build.sh`, `tools/vrm/assemble.py`); outputs in `characters/out/` (gitignored) |
| Mira, chibi | ~2.2-head office chibi, Mollig key, faces, everyday outfit | Koban Chibi Base (CC0) + Mira's hair, own garments | ship | `tools/vrm/chibi_koban.py`; sample `characters/mira/laptop/chibi.vrm` |
| Test body | plain humanoid with breast spring chains, three layer collections | own | ship (as a rig test, not a hero) | share `research/test-body/` |

The other nine office figures follow Mira's recipe once yskills approves her. A standard model is
rebuilt from its recipe, never hand-edited in a binary: the recipe is what new games reuse.

## Bases and bodies

| Asset | Licence | Use | Path |
|---|---|---|---|
| Koban Wanko Chibi Base Mesh 1.0 (VRM 0, 80 ARP bones, 61 shape keys) | CC0 as stated on its Gumroad page (no licence file in the zip; keep the page link) | ship | `chibi/koban-wanko/` |
| VRoid samples D, D Darkness, E (do not use as a hero: reads as a child, see below), F, G, Base Female/Male, Hair Samples, Shino, Fumiriya | CC0 (OpenGameArt) | ship | `opengameart-vroid-cc0/` |
| FLEUR, VULPEK, YUEJI | CC0 | ship | `karindou-shikigami/` |
| Blender Studio human base meshes v1.4.1 (17 bodies, all quad) | CC0 | ship | `blender-studio-cc/human-base-meshes-v1.4.1.blend` |
| Rain v3, Ellie, Victoria (Sprite Fright), Snow v4 | CC-BY 4.0, credit "Blender Studio (<name>)" | ship parts with credit; mainly craft reference (garment stacks, corrective keys, light rigs) | `blender-studio-cc/` (`manifest.json`) |
| MPFB 2 (MakeHuman in Blender, not in the library) | code GPLv3, generated figures CC0 | ship; best scriptable source for realistic bodies | install when a project needs it |
| Seed-san (VRM 1) | VRM Public Licence 1.0 | read its terms first | `vrm-c-samples/` |
| Alicia Solid | Niconi Solid licence | study | `vrm-c-samples/` |
| three-vrm-girl, Constraint Twist Sample, `test.vrma` | MIT repo; per-file VRM meta | ship after reading the meta | `pixiv-three-vrm/` |
| AvatarSample A, B, C | pixiv sample terms | read the meta | `vroid-samples-madjin/` |
| `fem_vroid`, `masc_vroid`, 8 unrigged clothing GLBs | unstated | study (shapes to model from) | `vroid-samples-madjin/` |
| Polygonal Mind Xmas chibis (Avatar03, Avatar10) | VRM meta: use only by an explicitly licensed person | study | `chibi/polygonalmind-xmas-chibis/` |

- 2026-10-07 (hq-characters remix REPORT, HANDOFF): VRoid sample facts: the material names are the same on E, F and G (`F00_000_00_FaceMouth_00_FACE`, `_EyeWhite`, `_FaceEyeline`, `_FaceEyelash`, `_FaceBrow`, `_EyeIris`, `_EyeHighlight`, `_Face_00_SKIN`, `_EyeExtra`; `F00_002_02_Body_00_SKIN`, `_Onepice_01_CLOTH`, `_Shoes_01_CLOTH`; `HairBack` and `Hair_00_HAIR_01..03`). G's body texture is the VRoid standard UV with white briefs and stockings painted in and no nipple detail; F's bodysuit is painted into the skin texture. E (Vivi) is a short figure (head bone 1.19 m) that reads as a child: left out, and the remix skips bust, hips and thighs below a 1.3 m head.

## Parts and moves

| Asset | Licence | Use | Path |
|---|---|---|---|
| Quaternius Universal Animation Library 1 + 2 (~90 clips, female mannequin) | CC0 | ship | `quaternius-ual/` |
| CharacterStudio drophunter traits (body, 10 hair, 10 tops, 9 bottoms, 10 shoes, jackets; VRM 1, one skeleton, grey, take any colour) | no licence file; meta personal non-profit | HQ only | `charstudio-drophunter/` |
| CharacterStudio Anata female + fantasy armour, robes, boots | meta: redistribution prohibited, private use | HQ only | `charstudio-anata-female/` |
| CharacterStudio loot animations (T-pose, idle, walk, wave FBX) | unstated | study | `charstudio-loot-animations/` |

No free source has a real bikini or lingerie mesh: those are our own cut-from-body garments
([figures.md](figures.md), Straps). A game that sells must replace every "HQ only" garment first.

- 2026-10-24 (low-poly-and-sources): Mixamo's additional terms ban using its output to train AI (free for paid and unpaid projects, Adobe ID needed); bake the animations, never ship the raw FBX packs.
- 2026-10-06 (hq-game findings, PLAN): Kenney Cube Pets 2.0 (CC0): 24 animated GLB animals, clips static, idle, walk, run, eat, dance, gesture-positive, gesture-negative; no owl, raccoon or brown bear; the texture is external (`Textures/colormap.png`), serve it next to the GLBs or remap with GLTFLoader `setURLModifier`; about 165 KB each. yskills rejected the look as not cute.
- 2026-10-06 (hq-game findings, PLAN): Kenney Furniture Kit (CC0): about 100 GLBs of about 15 KB, untextured, so give the materials the project palette; GLB loads need a loading state and a fallback box; upload through the artifact assets capability with the ids in a config doc.

## Never

- The Shadowheart file (yskills' download, company-xy local `assets/`, CC-BY-NC-ND game rip):
  study only, never reworked, pushed or shipped. Notes: share `research/shadowheart-study.md`.
- BlobCG: paid, adult, fan versions of other studios' characters; inspiration for the look only.
- Anything from BOOTH, VRoid Hub or Sketchfab that needs a login: yskills downloads it, and only
  after the licence is read. Paid assets need yskills' word first.
- Rule34-style aggregators and anything with underage-looking characters.

- 2026-10-18 (3d-route): licence rule for generated models: only output we may legally use, no kemono or Patreon rehosts.
- 2026-10-06 (hq-game findings): pixel-art alternative, low value: 2dPig Pixel Office (CC0, only 2 animals); LimeZu Modern Office is paid with a custom licence.

## Reading a licence

- 2026-10-24 (low-poly-and-sources): VRoid Hub and BOOTH licences are per model or item. VRoid conditions cover corporate use, individual commercial use, redistribution of altered models, religious or political use and hateful use; BOOTH items may ban resale, redistribution, AI training, NFTs, or require the VRoid Hub download to be disabled. Keep a screenshot of the item text.
- 2026-10-24 (low-poly-and-sources): free CC0 first: Kenney, Quaternius, Poly Haven (CC0 per polyhaven.com/license), ambientCG. Mixed: Poly Pizza is mostly CC-BY (credits file); OpenGameArt mixes CC0, CC-BY, CC-BY-SA and GPL, and GPL or share-alike can force the game's licence: avoid; itch.io: read the creator's terms.
- 2026-10-24 (low-poly-and-sources): paid marketplaces: Fab uses a Standard licence or CC-BY and sellers must tag CreatedWithAI; Unity Asset Store assets are usable in your game and in other engines but not redistributed standalone or extractable; CGTrader, Gumroad and itch: read each licence; only after asking yskills (real money).

## Environment kits (furniture and props)

- 2026-10-07 (hq-office office-research): verdict for a cozy office: KayKit Furniture Bits (CC0, 50+ models, OBJ/FBX/glTF, one 1024 px gradient atlas, chunky and cute) as the core; Kenney for gaps (kitchen, bathroom); Quaternius; Poly Pizza only CC0 singles (CC-BY needs credit, free API key); Sketchfab per model. Ship only the models used (a few MB).
