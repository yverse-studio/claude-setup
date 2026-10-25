# People video (a person that looks real), route and honest ceiling (2026-10-25)

yskills asked for a real-life-looking person in POV and element-bending clips. Claude has no video model and the cloud has no GPU, so there are three tiers. Names, prices and licences checked by search on 2026-10-25; re-check before paying.

| Tier | How | Cost | Ceiling |
|---|---|---|---|
| 0 Cloud, now | Blender `bpy` + our VRM characters + node VFX (`templates/blender-pov/`) | 0 | stylised 3D, game-blockout look; not photoreal |
| 1 Free, laptop GPU | Wan 2.2 (Apache-2.0) in ComfyUI via Remote Control: TI2V-5B fits about 8 GB VRAM with offloading or GGUF at 672x384, 33 frames; 14B GGUF image-to-video about 3 min per 5 s at 480p | 0, needs the laptop GPU model checked first | clearly below paid models; LTX-Video: licence and VRAM not verified |
| 2 Cheap, hosted | per-second API via fal.ai or the vendor: MiniMax H3 Max about 0.05 USD/s (480p), H3 about 0.08 USD/s (768p), Kling v2.5 Turbo Pro image-to-video about 0.07 USD/s on fal; a 6 s clip about 0.3 to 0.5 USD | money: card first (CLAUDE.md) | the realistic look; faces and hands still drift |

Sources: https://www.runflow.io/blog/comfyui-wan-2-2-image-to-video , https://docs.comfy.org/tutorials/video/wan , https://invideo.io/blog/ai-video-model-pricing , https://costbench.com/compare/fal-vs-kling-api/ . Prices are third-party snapshots, the vendor page decides.

Rules: a person from a model needs the AI label (`market` §4); original worlds only, no Avatar, One Piece or Harry Potter names; a real person's face only with their consent.
Realistic human base for tier 0 (MPFB or MakeHuman) was not tested: do it before promising a real-life look from Blender; expect uncanny skin without a render pass of hours.
Own people generator: not a thing Claude can build cheaply. Tier 1 is that route (open weights on his GPU).

## Which styles each tier reaches
See the per-style table in `formats.md`.
