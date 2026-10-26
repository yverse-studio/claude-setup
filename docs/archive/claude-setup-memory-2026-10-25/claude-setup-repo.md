---
name: claude-setup-repo
description: State and design of yskills/claude-setup (plan item 1, the global Claude Code setup), cloud-thread behavior, as of 2026-10-03
metadata:
  type: project
  modified: 2026-10-03T08:44:27.388Z
---

yskills/claude-setup (private) is their global Claude setup. PC install: `cd ~`, `git clone https://github.com/yskills/claude-setup`, `node claude-setup/install.mjs`.

Design:
- Base: ECC v2.2.3. Full ecc@ecc plugin is ~45k tokens and its skills can't be switched off singly, so a curated subset is vendored into .claude/ (config/ecc.json). ECC hooks via `npx ecc-universal@2.2.3 ... --modules hooks-runtime`; GateGuard and tmux hooks off.
- 16 official plugins global; Cloudflare, Firebase, Stripe, Sentry, PostHog (30k tokens), Supabase, Vercel installed but off, enabled per project.
- Own skills: toolbox (catalogs per domain, find.mjs, add-skill.mjs), onboard-project, ship-check, ui-review. Own agent: design-critic. Fresh session ~37k tokens.
- Workflow for new apps: docs/WORKFLOW.md (= shape of plan item 3). Dashboard is Luna's cockpit, not per project.
- Ponytail (MIT, DietrichGebert/ponytail 4.10.3): only the core skill is vendored in .claude/skills/ponytail; its hooks and 5 extra skills left out; CLAUDE.md keeps our test rule over its "one check" rule. Toolbox catalog/claude-addons.md: rtk optional, Graphify only for big repos, caveman skip, OmniRoute and pxpipe never.
- Rules added at yskills' request: options as tappable choices (AskUserQuestion, multiSelect when several fit); read any skill/plugin/MCP from outside the official marketplace or ECC before installing, never install one because a video or post says so; when yskills must act, link the exact official page plus the few steps on it.

Cloud threads (verified 2026-10-03):
- PR #1 (merged) put everything in .claude/ and the root CLAUDE.md, so a thread with claude-setup attached loads its CLAUDE.md, skills, agents and rules (register_repo_root).
- Plugins from the repo's .claude/settings.json load only when the thread's working folder is claude-setup and the session starts there: 13 of 16 (superpowers, chrome-devtools-mcp, claude-api missing). Threads with several repos run in /home/claude and get none.
- Context7 hosts (context7.com, mcp.context7.com) get proxy 403 on the built-in environment.
- Fix in PR #2: cloud/setup.sh as the cloud environment's setup script (all 16 plugins at user scope, 18s in a test) plus Custom network allowing those two hosts. yskills has to create that environment in Project settings and pick it in every project. check.mjs keeps setup.sh in sync with config/plugins.json.
- Other projects need claude-setup added as a repo to get the setup.

Selling kit, PR #3, and marketing, PR #4: both merged by yskills on 2026-10-04.
- `sell` skill in .claude/skills/sell.
- Order flow: "Zahlungspflichtig bestellen" on our page, then Stripe-hosted Checkout only takes the money (§ 312j); a pending order in D1, bound to its session.
- Keys live in the GitHub environment `production` (main only); deploy.mjs copies them to Worker secrets. Stripe keys are restricted.
- deploy.mjs `--check` runs before the build and proves the Cloudflare token can create a Worker. The token must cover all Workers: duo-test hit a 403.
- Open: Sendcloud call; facts in recheck.md.
- `market` skill: a one-page plan in every PRD; WORKFLOW steps 7 Market, 8 Measure, 9 Learn.
- PR #6 (Run workflow after key changes; threads get 403) and #7 (per-PR preview on an isolated `<name>-preview` Worker) merged 2026-10-04.
- PR #8–#10 merged 2026-10-04: audit cuts, taste skills (impeccable, web-interface-guidelines), workers.dev note, ui-review fixes. Context7: no key; threads use WebSearch.
- PR #11-#13 merged 2026-10-04: `watch` (claude-video 03ceb42, patched; cloud: attach files; yskills uninstalling PC bits); sell lessons; toolbox games/3D/Blender + optional Paper (PC).
- The permission classifier blocks Claude's PR merges (`gh api .../merge`), so yskills merges.

Remote Control declined (2026-10-03), don't re-offer; PC install stays manual.
