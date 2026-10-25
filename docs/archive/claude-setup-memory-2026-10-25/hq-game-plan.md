---
name: hq-game-plan
description: HQ game architect plan (2026-10-06): /mnt/project-files/hq-game/PLAN.md, final (auto-run picked 2026-10-06 17:07), five slice briefs in PLAN.md, sell verdict "not now"
metadata:
  type: project
  modified: 2026-10-06T16:47:40.045Z
---

Architect thread (Fable, 2026-10-06 16:48) wrote /mnt/project-files/hq-game/PLAN.md and posted four cards to yskills: scope (own v1 now, recommended), money source (live duo-test `GET /api/stats` summing Stripe-verified D1 rows, recommended), New project tap (db `requests/<id>` row plus send_message to the id in db doc `config/coordinator`, which every thread writes from get_channel_session_id at start and end; the coordinator has no db tools, so threads relay pending rows; the page resends on open), assets (Kenney Cube Pets 2.0 + Furniture Kit, CC0, recommended; owl→parrot, raccoon→beaver, bear→polar bear). Programmer thread's research is in /mnt/project-files/claude-setup/hq-game/findings.md.

Sell verdict: not realistic now (all comparable agent-office tools are free; a copy needs this exact setup); revisit after three real projects.

**How to apply:** yskills chose auto-run (no taps, recommended options taken). The coordinator starts five build threads from the plan's slices, CEO room first (CEO room, assets and tap on Opus, stats route and game loop on Sonnet), one at a time. Threads, not the coordinator, write `config/coordinator` and relay pending `requests` rows. Related: [[dashboard-and-team-mod]].
