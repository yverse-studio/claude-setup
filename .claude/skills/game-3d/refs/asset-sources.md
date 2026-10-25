# Pick the best source for the job (research 2026-10-25)

No vendor is hard-coded: choose by the criteria below, then log it. Every row's URLs and the open gaps are in `/mnt/project-files/claude-setup/research/2026-10-25-low-poly-and-sources.md`. Zero budget is the default; money means a card first (CLAUDE.md). Contexts: **G** game, **A** animation (own render), **V** video.

## Criteria, in order
1. Licence clear for commercial use **and shipping**? G needs redistribution rights (the asset ships in the bundle); A and V only need use in the output. Not clear: skip.
2. Free? CC0 first, then CC-BY with a credits file, then the rest.
3. Style fit (shading and palette: [`low-poly.md`](low-poly.md)) and rig fit (VRM or Mixamo humanoid).
4. Effort to adapt (retopology, UV, rig) against modelling it.
5. Risk: AI output, mixed-licence packs, GPL/SA, NC, region-excluding licences.

## Table
| Source class | Cost | Licence check before use | Ceiling | Pick when |
|---|---|---|---|---|
| Free CC0 stores (Kenney, Quaternius, Poly Haven, ambientCG) | free | confirm CC0 on the asset page | consistent low-poly kits, PBR textures, HDRIs; no unique hero | first choice for G props and textures, A and V backgrounds |
| Free mixed licence (Poly Pizza, OpenGameArt, itch.io free, Sketchfab CC) | free | per asset: CC-BY needs credit; GPL and CC-BY-SA can bind the game, avoid; NC rejected | variable | CC0 has no match |
| Paid marketplaces (Fab, Unity Asset Store, CGTrader, Gumroad, itch.io, BOOTH) | 5 to 100+ EUR | read the item's terms and the store EULA: use in a game yes, redistributing the raw asset no; items may ban resale, AI training, NFTs; keep a screenshot | high, hero characters and animation sets | no free source has it; yskills' word first (money) |
| VRM sources (VRoid Hub, VRoid Studio, marketplaces) | free to paid | the model's own VRM meta (commercial use, redistribution, allowed users) plus the item page | anime humanoid, rig ready | G or V with a VRM avatar |
| Mixamo | free (Adobe ID) | no redistribution of raw files; output must not train AI | generic usable motion | body animation; never commit the FBX |
| AI 3D, open weights (TRELLIS MIT; Hunyuan3D 2.1 excludes EU, UK, South Korea) | free, own GPU | read the licence for your country | props and blobs, needs retopology; weak hands and faces | concept props, clutter; not rigged heroes |
| AI 3D, hosted (Meshy, Tripo) | free tier, paid about 10 to 20 USD/month (U) | Meshy Free is CC-BY with credit and public models; Tripo free terms conflict, treat as non-commercial | same, faster | prototypes only on the free tier |
| Free music and sfx (Kenney audio, Pixabay, Freesound, incompetech) | free | Freesound per file, reject NC; incompetech CC-BY needs the credit line; avoid GPL audio | generic stock | default for G, A, V |
| Hand modelling in Blender | time | own work; keep references CC0 | highest | the signature character, brand props |

## Defaults per use
- **Game:** CC0 kits for world and props, CC0 or Mixamo motion (not committed), hand-modelled or VRM hero, Kenney or Pixabay music.
- **Animation:** Poly Haven HDRIs and textures, Quaternius or Kenney props, VRoid or hand-modelled character, Mixamo or hand-keyed motion.
- **Video:** least licence friction; AI props fine in the background; check each tool's output terms before publishing commercially.

## Record every asset
Name, URL, author, licence and version, date, a screenshot of the terms (marketplaces, hosted AI), and whether it ships in the bundle. `scripts/check-assets.mjs` checks the manifest. Login sites and adult-gated downloads stay yskills' hands.
