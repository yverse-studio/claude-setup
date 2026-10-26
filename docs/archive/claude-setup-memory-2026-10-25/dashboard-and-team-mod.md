---
name: dashboard-and-team-mod
description: Claude Setup HQ dashboard artifact (db rows pm/now, phases, team), the team mod, context guard and the merge-everything rule, from claude-setup #27 (2026-10-06)
metadata:
  type: project
  modified: 2026-10-06T17:24:31.567Z
---

- This project's live dashboard: https://claude.ai/artifact/TmQ7UpL6EPjXKkpR9S4kJT ("Claude Setup HQ"). Pages Office (3D three.js office, nine role desks: Project Manager, Researcher, Designer, Programmer, Tester, Reviewer, Security, Legal, Marketer; desk picked by role word) / Plan (levels) / For you / Projects (`projects/<id>`: name, state, progress, note, dashboard, live, here). Pinned. duo-test's own: https://claude.ai/artifact/F4Ypnf1hWCUHryfWwLtrPH. Template update in claude-setup #28. Data via ArtifactData: `pm/now` (summary, next[], you[{what,link}], live[]), `phases/<id>` (name, order, state done|active|next, why, goals[{name,done,total,link}]), `team/<id>` (name, role, state working|blocked|waiting|idle|done, task, next, with[], link, linkLabel, preview, order). Writes need `if_version`. yskills asked for phases with goal progress bars and simple pages (2026-10-06). Keep it current when threads start, finish or block.
- Template for every project: claude-setup `.claude/skills/operator/templates/dashboard.html`; the operator publishes it at project start.
- `team` mod (claude-setup `mods/team`): only shows in Claude Code on yskills' PC (terminal or desktop), never in the project app or phone. Installed by `node install.mjs` after #27 merges. yskills expected to see the desktop UI change; explain this plainly.
- Context guard hook (`global/context-guard.mjs`, inlined in cloud/setup.sh): warns at +80k context, hand-off at +150k. Needs the cloud setup script re-pasted after #27 merges.
- Merge rule (card tapped 2026-10-06 15:26): "Merge everything": the gate merges every PR at 5/5, launch and live money included. claude-setup PRs still need yskills' tap (Claude Code's safety check blocks thread merges there).
- Caveman rejected again 2026-10-06: output is ~2% of tokens, so terse wording doesn't help.

Related: [[claude-setup-repo]], [[cloud-credit-excludes-projects]].

- Roles learn: operator `roles/<role>.md` playbooks get dated lessons at each project's end (claude-setup #28). onboard-project gives existing repos (Luna) an office too. yskills asked 2026-10-06 that roles and dashboard carry over to every next project, not one thread.

- 2026-10-06 16:40 (claude-setup #28, HQ v8): HQ is the one all-projects home (yskills asked for an all-project dashboard with money). Opens on Company view (this month / all time € / needs-you totals, a row per project with level, €, working, needs-you, Enter office), then a full-screen office with game HUD (level plate, coin pill, to-do bell) and dock Company/Office/Plan/Team/To-dos. `projects/<id>` gained revenueMonth, revenueTotal (EUR), working, you[]; each project's PM keeps them current. Luna's cockpit links to HQ instead of copying it. Bigger office (22x17): PM glass office, meeting room, phone booths, kitchen, lounge. Animals: PM Bear, Researcher Owl, Designer Cat, Programmer Raccoon, Tester Rabbit, Reviewer Penguin, Security Dog, Legal Fox, Marketer Panda.
- Vision (yskills 16:30): HQ grows into a game yskills "plays" that is a real business. Plan: /mnt/project-files/hq-game/PLAN.md, 5 slices, one fresh thread each.
- 2026-10-06 17:25 (claude-setup #29 merged, HQ v9, slice 1): HQ opens at yskills' desk, first person, Kenney Furniture Kit (laptop opens Company, phone To-dos, whiteboard Plan, chart money, door team office). Every template publish must pass `files: {"office-kit.js": "templates/office-kit.js"}` or HQ falls back to Company. Rules live in `<script id="hq-rules">`, tested by `node --test scripts/hq-rules.test.mjs` in CI.
- 2026-10-06 17:50 (claude-setup #30 merged, HQ v10, slice 2): team office animals are Kenney Cube Pets (polar bear PM, parrot, cat, beaver, bunny, penguin, dog, fox, panda) packed in `pets-kit.js` (scripts/pets-kit.mjs). Every publish now passes `files: {"office-kit.js": ..., "pets-kit.js": ...}`. Threads write `config/coordinator` {session, at} and `pm/now.session` at start and finish.
- 2026-10-06 18:10 (claude-setup #31, HQ v12, slice 2 redo): yskills rejected Cube Pets ("not good, cuter, cartoon, maybe pixel"). Team is now hand-drawn pixel-art chibi animals on canvas sprites (`team-art` script, `HQ.poseAt`), pets-kit.js deleted. Publish files: `{"office-kit.js": "templates/office-kit.js", "pets-kit.js": null}` (the null only matters once; later just office-kit.js).
