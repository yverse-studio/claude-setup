# Research behind this setup (2026-10-03)

## The base: Everything Claude Code

"The hackathon winner" is Affaan Mustafa's Everything Claude Code (now `affaan-m/ECC`, v2.2.3,
MIT). It won an Anthropic hackathon and is the most-starred Claude Code setup.
Sources: [36kr](https://eu.36kr.com/en/p/3823966768943239),
[Augment](https://www.augmentcode.com/learn/everything-claude-code-github),
[ROBOCO](https://roboco.io/en/posts/everything-claude-code-distilled/).

Measured with `claude plugin details ecc@ecc`: the full plugin has 387 skills and 68 agents and
adds **~44.8k tokens to every session**, mostly for stacks yskills doesn't use (Kotlin, Laravel,
healthcare, supply chain...). Plugin skills can't be switched off one by one (`skillOverrides`
ignores plugin skills), so this repo vendors a curated subset (`config/ecc.json`) and installs
ECC's hook runtime through its own installer. Hook changes from ECC's defaults:

- GateGuard off: it blocks the first edit and command of each session until Claude restates
  facts; slow for an owner who wants things done.
- tmux reminders and dev-server rewriting off: they assume tmux, which Windows and VS Code
  setups usually lack.

## Plugins

From Anthropic's marketplace `claude-plugins-official` (auto-added by Claude Code, ~315
plugins). Always-on token costs were measured with `claude plugin details`; see
`config/plugins.json`. Notable calls:

- **superpowers** is the most broadly endorsed methodology plugin and the only community one in
  the official marketplace. It covers TDD and planning, so ECC's `tdd-workflow` is left out.
- **pr-review-toolkit** (2k tokens) overlaps `code-review` + ECC reviewers: left out.
- **mattpocock-skills** (1.6k tokens, 25 skills) overlaps superpowers: left out; easy to add.
- **posthog** costs ~30k tokens always-on, so it and the other product plugins (Stripe,
  Cloudflare, Sentry, Firebase, Supabase, Vercel) are installed but off, enabled per project.
- `chrome-devtools-mcp` was dropped on 2026-10-05: Playwright covers headless checks, and the two together loaded ~54 browser tools. `code-review` and `claude-api` were dropped the same day because Claude Code bundles them.

Sources: [Anthropic marketplaces](https://code.claude.com/docs/en/plugins/anthropic-marketplaces),
[discover plugins](https://code.claude.com/docs/en/discover-plugins),
[ZTM](https://zerotomastery.io/blog/best-claude-code-plugins/),
[composio](https://composio.dev/content/top-claude-code-plugins),
[turbodocx](https://www.turbodocx.com/blog/best-claude-code-skills-plugins-mcp-servers).

## MCP servers

MCP tools are deferred by default (tool search), so they cost little until used. Context7,
Playwright and Chrome DevTools come in through their plugins. Remote servers for later
products, all OAuth via `/mcp`: Stripe `https://mcp.stripe.com`, Sentry
`https://mcp.sentry.dev/mcp`, Vercel `https://mcp.vercel.com`, PostHog
`https://mcp.posthog.com/mcp`, Supabase `https://mcp.supabase.com/mcp`, Linear
`https://mcp.linear.app/mcp`. GitHub MCP needs a personal access token; the `gh` CLI covers the
same ground without one, so it is not installed.
Source: [MCP docs](https://code.claude.com/docs/en/mcp).

## Browser

- **Your own Chrome:** Claude in Chrome extension (v1.0.36+), then `claude --chrome`; `/chrome`
  for status and "enabled by default". Shares your logged-in sessions; needs a Pro/Max/Team plan
  login (not an API key); not under WSL.
  [Docs](https://code.claude.com/docs/en/chrome)
- **Headless / separate Chrome:** Playwright MCP (screenshots, e2e) and Chrome DevTools MCP
  (console, network, performance traces).

## Settings

- `permissions.defaultMode: "auto"` (a classifier approves safe actions; default since v2.1.283;
  only honored in user settings). [Docs](https://code.claude.com/docs/en/permission-modes)
- `effortLevel: "high"`, `alwaysThinkingEnabled: true`.
- Best-practice notes applied in `CLAUDE.md`: keep it short, give Claude a way to verify
  its work, `/clear` between tasks, subagents for big reads.
  [Docs](https://code.claude.com/docs/en/best-practices)

## Videos

YouTube pages and transcript sites were blocked from this environment (403/429), so no
transcript was read. Found but not watched: "Claude Code Official Plugins: Stop Wasting Setup
Time on the Wrong Tools", "Claude Code Setup That Actually Works", "Matt Pocock's EXACT System
To 10x Your Claude Skills". One video ("Top 5 Claude Code Plugins", Nick Automates) was read via
its [written version](https://justbeingresourceful.com/2026/08/21/5-claude-code-plugins-worth-installing-in-2026-and-the-fine-print-on-the-unlimited-tokens-claim/);
its picks: claude-code-setup (included), claude-mem (ECC's session hooks cover this), Headroom,
OmniRoute (its "unlimited tokens" claim is misleading).

## Autonomous projects (2026-10-05)

Added from these sources:

- **A separate evaluator** that tests the running app against criteria written before the
  build. Anthropic kept this piece even on newer models; self-grading agents score their own
  work too generously, fixed with hard pass/fail thresholds. Hence the `evaluator` agent and
  the 5/5 gate as five yes/no checks, not a star score.
  [Harness design for long-running apps](https://www.anthropic.com/engineering/harness-design-long-running-apps)
- **Progress in files, a feature list with a `passes` flag per feature** that only the tester
  flips (agents edit JSON less casually than Markdown), and a fresh context per job.
  [Effective harnesses for long-running agents](https://www.anthropic.com/engineering/effective-harnesses-for-long-running-agents)
- **Simplest shape that works:** Anthropic dropped sprint splitting with newer Opus models; a
  small site gets one build thread, only real apps get slices. Earlier notes here found 98% of
  tokens went to threads re-reading their own history, hence one thread per job and no revived
  idle threads. [ECC long-form guide](https://github.com/affaan-m/ECC/blob/main/the-longform-guide.md)
- **Worker Previews** per branch with their own bindings and secrets.
  [Cloudflare blog](https://blog.cloudflare.com/worker-previews/)
- **Project threads, routines, cloud environments:**
  [Claude projects](https://code.claude.com/docs/en/claude-projects),
  [routines](https://code.claude.com/docs/en/routines),
  [Claude Code on the web](https://code.claude.com/docs/en/claude-code-on-the-web)
- **Skill search:** [skills.sh](https://vercel.com/docs/agent-resources/skills) (`npx skills
  find`, Vercel's `find-skills`; community and unvetted) and the claude.ai Anthropic Directory
  (SearchPlugins, SearchSkills, SearchMcpRegistry in cloud threads). The Directory has
  Anthropic's legal plugins (`privacy-legal`, `ip-legal`, `ai-governance-legal`, from
  anthropics/claude-for-legal), the `Marketing` plugin, Figma, Canva and Adobe connectors;
  `find.mjs` can't see those. Blender's official connector wasn't in the registry: PC only.
- **Not worth adding:** Spec Kit, BMAD, OpenSpec (PLAN.md plus features.json cover them);
  managed Claude Code Review (Team/Enterprise only, $15-25 per PR; `ship-check` covers it);
  `/ultraplan` was removed in September 2026; memory plugins and Obsidian (the repo is the
  memory; ECC hooks from the PC install don't run in cloud threads).
- **For the later video project** (autocut, no repo yet):
  [FireRed-OpenStoryline](https://github.com/FireRedTeam/FireRed-OpenStoryline) (Apache-2.0,
  style skills) and [VideoDB Director](https://github.com/video-db/Director) (MIT, agent
  structure; don't depend on its paid cloud).

## Rejected and open (from the reports, 2026-10-25)

So nobody proposes them again, or loses an open gap:

- 2026-10-24 (setup overhaul): kits as plugins rejected for now (saves about 700 tokens a session; auto-load of `enabledPlugins` unconfirmed; a multi-repo cloud thread loads no repo plugins); an LLM `qa-gate` with claude-code-action rejected (needs an API key or an OAuth token that eats the Max limit, and no project holds secrets in GitHub). Org rulesets need the GitHub Team plan on private repos.
- 2026-10-18 (setup-research, 13 setups ranked): skipped with reason: gstack and oh-my-claudecode hook runtimes (own TypeScript runtime), spec-kit CLI and its human-gate bugfix flow (against auto-run), agency-agents marketing roles (generic), theme-factory presets (anti-slop), Pocock git-guardrails (blocks every push, our threads must push), GSD model profiles (the Models line does it), SDD WebFetch cache (we avoid WebFetch). Matt Pocock's co-author was not found in 7 searches.
- 2026-10-18 (web-social roster): the Release step (changelog, version and a live check after the merge; `gate.md` has only the undo table) is an open gap, to decide after the Content Designer and Analytics roles; it may fit as a section of an existing file instead of a role.
- 2026-10-18 (3D route): the two YouTube links on 3D base models were never watched (cloud got 429 / bot check; no cookies by rule); the fix is a laptop RC session, which needs a card.
- 2026-10-10 (model and tools): no "indexed folder structure for workflows like payment" exists (queries listed in the report); the coordinator model is the Models line in `docs/WORKFLOW.md` (now `docs/TEAMS.md`).
- 2026-10-08 (Luna audit): `luna-monorepo` is the live Luna (Docker + Caddy); `aissistant` and `personal-luna` are stale duplicates, suggested for archive (`trayding-bot` still reads `aissistant`); `ARCHITECTURE-3-REPOS-DE.md` in the monorepo describes the old 3 repos and needs a rewrite on yskills' call.
