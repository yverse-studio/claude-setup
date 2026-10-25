---
name: game-3d-path
description: Decided 2026-10-07: 3D games are built with three.js + Electron for Steam (no Unity/Unreal, Godot only for consoles); plan at /mnt/project-files/game-dev/PLAN.md, skill game-3d in claude-setup
metadata:
  type: project
  modified: 2026-10-07T08:20:31.228Z
---

yskills declared the HQ office the test run for 3D game building (2026-10-07 08:07); the next real project turns their vacation photos and stories into a cozy walk-around game that can go to Steam.

- Verdict (Researcher thread, card posted, recommended): three.js in the browser, Electron + steamworks.js for Steam. Reason: cloud threads can only run and screenshot a browser engine; Unity/Unreal need the editor on yskills' PC. Godot stays the fallback for consoles.
- Plan: /mnt/project-files/game-dev/PLAN.md (engine table, photo paths: rebuild in style first, Gaussian splats via Spark as postcards, AI props one at a time; asset layout; cloud tests; Steam steps with costs: 100 $ per game, 30 % cut, coming-soon 2 weeks, release 30 days after fee, content survey for Germany).
- Skill: `.claude/skills/game-3d` in claude-setup (PR 52, merged 2026-10-07 08:29; refs/ holds vetted packs from gamedev-skills and threejs-game-skills; literal-mode rule and reference-first brief step inside) with `scripts/check-assets.mjs` (manifest licence checker, in CI) and templates (shots, Electron main, electron-builder, steam-deploy pinned to v3.0.4 SHA, platform.ts).
- Only yskills: Steamworks account, tax interview (W-8BEN, Gewerbe), fee, first upload, release click, GPU splat training on the PC.

**How to apply:** every new 3D game thread reads the `game-3d` skill first; the HQ office thread follows its lessons list (walk controller with three-mesh-bvh, assets manifest, shared VRMA moves, perf budget, scene/entities/systems split). Related: [[hq-game-plan]], [[game-and-3d-tools]].
