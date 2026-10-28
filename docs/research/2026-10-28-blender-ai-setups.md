# Best Blender AI setups and what makes them work (research, 2026-10-28)

Method (inferred from this session's steps, https://github.com/ahujasid/blender-mcp): web search for the landscape, then the README and source of each candidate read from raw.githubusercontent.com, and every API claim run against `bpy` 5.2.3 in the cloud container. Our own lessons were mined from this repo. Confidence tags: V = read in source or run here, C = a source says it, U = unverified.

## Verdict (short)

- Keep the **official Blender Lab connector** as the live bridge (V that it is already our choice, `.claude/skills/studio/SKILL.md:15`; Blender 5.1+ per the add-on manifest, C: https://www.strayspark.studio/blog/official-blender-mcp-server-comparison-2026).
- The tool is not the bottleneck. What separates good setups is the **generate, render, verify, revise loop**, a **version-correct API reference**, and **measured placement** (C: https://arxiv.org/abs/2504.01786, https://arxiv.org/pdf/2601.11109, https://arxiv.org/html/2508.08228v1).
- Do **not** install community `mcp-for-blender` (ahujasid) for our work: V in source that telemetry can upload prompts, code and screenshots and may train AI models when the consent box is ticked (https://raw.githubusercontent.com/ahujasid/blender-mcp/main/README.md, section Telemetry Control; code `server.py:736-740`). Default is off, but our scenes are private adult work, so no.
- Fold into our own setup: `.claude/skills/studio/blender-recipes.md:1` (loop, 5.x API traps, our script mistakes) and `scripts/blender/bpy-lint.mjs:1` (flags removed APIs before a run).

## The candidates

| Setup | What it is | What makes it work | Verdict |
|---|---|---|---|
| Blender Lab connector (official, April 2026) | Add-on plus MCP server by Blender Lab, https://projects.blender.org/lab/blender_mcp | Maintained with Blender, runs Python in the live scene (C: https://aiproductivity.ai/news/claude-blender-mcp-connector-3d-scenes/) | **Use** (already installed on the laptop, `docs/pc-claude-user.md:18`) |
| ahujasid blender-mcp (`mcp-for-blender` 2.2.4, MIT) | Socket add-on plus MCP server, `execute_blender_code`, viewport screenshot (800 px default), Poly Haven, Sketchfab, Hyper3D, Meshy, Poly Pizza hooks | Simple and wide; tools in small steps, absolute render paths (C: https://glama.ai/mcp/servers/ahujasid/blender-mcp/tools/get_viewport_screenshot); `pyproject.toml` runs `mcp>=1.26` and `httpx` | **Skip**: telemetry opt-in uploads screenshots (V, source above); asset hooks need paid keys; the idea is already in the official one |
| mlolson blender-orchestrator | MCP with a spatial layer: real-world dimension table (55+ objects), collision checks, ASCII top/side floor plans, lighting and camera tools, `SCENE_BUILDING_GUIDE.md` (V: https://raw.githubusercontent.com/mlolson/blender-orchestrator/main/README.md) | Fixes the worst LLM weakness, placement, by giving numbers and checks instead of pictures | **Copy the ideas**, not the server: dimensions table and measured collision go into our recipes; not installed (outside server, unreviewed) |
| VIGA (MIT, Jan 2026) | One agent alternating generator and verifier with evolving memory of plans, code diffs and renders; BlenderBench (V: https://raw.githubusercontent.com/Fugtemypt123/VIGA/main/README.md; paper https://arxiv.org/pdf/2601.11109) | Write, run, render, compare, revise; verifier looks from several camera angles; no finetuning | **Copy the loop** (done in the recipes); heavy install (conda, SAM, GPU), not needed |
| LL3M (threedle, multi-agent) | Planner, coder, critic and verifier agents write interpretable bpy; a retrieval layer injects version-specific Blender API docs (V: https://raw.githubusercontent.com/threedle/ll3m/main/README.md; C: https://arxiv.org/html/2508.08228v1) | Docs retrieval cuts hallucinated API calls; critic plus verifier catch what the coder misses; paper model Sonnet 3.7 is retired | **Copy the pattern**: our API-traps table is the "docs layer"; the lint is the cheap guard |
| BlenderGym (CVPR 2025) | 245 start/goal pairs, five editing tasks (C: https://arxiv.org/abs/2504.01786) | Shows generator-verifier loops beat one shot and compute is best split between generating and verifying | Evidence only |
| Hermes agent Blender skill, claudekit-blender-mcp, sandraschi, blend-ai | Community wrappers with screenshot, render, turntable tools (C: https://tessl.io/registry/skills/github/NousResearch/hermes-agent/blender-mcp, `docs/research/2026-10-25-creator-video-styles.md:39`) | Same pattern, different tool counts | **Skip**, no gain over the official one |

## What actually fails (so the setup targets it)

- Spatial placement, geometry nodes across versions, rigging, weight paint, IK and animation timing need human correction; scene setup, props, lights and cameras work (C: https://www.mindstudio.ai/blog/claude-blender-mcp-real-world-performance, one undated blog, treat as direction only).
- Version drift: training data is Blender 2.8 to 3.x. Run here on 5.2.3: `use_auto_smooth`, `Action.fcurves`, `calc_normals` and `BLENDER_EEVEE_NEXT` all fail; Principled inputs were renamed (V: bpy 5.2.3 run of `/tmp/claude-0/bv_check.py`, table in `.claude/skills/studio/blender-recipes.md:22`).
- Silent errors: pass `--python-exit-code 1` for batch runs and read the traceback (C: https://projects.blender.org/archive/blender-archive/commit/8a295553f7fef22b67e3cb3be4d9881cfadedafc).
- Large scripts time out the bridge; split into steps (C: https://glama.ai/mcp/servers/@IAmMarcellus/BlenderMCP/tree/fffd2d916f608a6024668c7672566cce55277e69).
- The vision critic misses subtle spatial artifacts, so measure (C: https://api.emergentmind.com/papers/2508.08228).

## What we did about it

- New: `.claude/skills/studio/blender-recipes.md:1` (one self-contained file a weaker model can load), `scripts/blender/bpy-lint.mjs` plus `scripts/blender/bpy-lint.test.mjs`.
- Cloud Blender verified end to end: `pip install bpy` gives 5.2.3, and EEVEE, Workbench and Cycles CPU each rendered a frame once the EGL libraries from `docs/game-pipeline.md:40` were installed (V, this session). The laptop runs 5.1, so version-sensitive scripts get a `hasattr` check.
- Own past mistakes collected from `docs/two-figure-scenes.md:150-180`, `.claude/skills/blender-body/references/method.md:34-54`, `docs/game-pipeline.md:206-235` and `docs/pc-claude-user.md:71`.
- Luna 2 hand-off: it loads `blender-recipes.md` as its Blender rules; the Blender Lab add-on needs no Anthropic model, any MCP client can drive it (inferred from MCP being model-neutral).

## Sources

- https://github.com/ahujasid/blender-mcp (raw README, `addon.py`, `server.py`, `pyproject.toml` read)
- https://github.com/mlolson/blender-orchestrator , https://github.com/Fugtemypt123/VIGA , https://github.com/threedle/ll3m (READMEs read)
- https://arxiv.org/abs/2504.01786 , https://arxiv.org/pdf/2601.11109 , https://arxiv.org/html/2508.08228v1
- https://www.mindstudio.ai/blog/claude-blender-mcp-real-world-performance , https://www.strayspark.studio/blog/official-blender-mcp-server-comparison-2026 , https://aiproductivity.ai/news/claude-blender-mcp-connector-3d-scenes/

Not checked:
- The Blender Lab page itself (Cloudflare block 403 from the cloud), so the official connector's tool list and 5.1 floor rest on third-party posts.
- Whether the Blender Lab add-on works with a non-Anthropic MCP client such as Luna 2's; test on the laptop.
- Auto-Rig Pro, MANI NPR, Hyper3D, Meshy paid features (paid, not touched).
- The orchestrator's and VIGA's code beyond the READMEs; nothing was installed or run.
