---
name: workers-builds-deploys
description: Settled deploy path (2026-10-05) for yskills' web apps: Cloudflare Workers Builds + Worker Previews, no GitHub secrets; per-project recipe and the accepted key tradeoff
metadata:
  type: project
  modified: 2026-10-05T17:50:00.000Z
---

Decided 2026-10-05 in thread "Auto merge and publish" after yskills connected Cloudflare's GitHub app and asked to use Cloudflare fully. Replaces the GitHub Actions two-token design ([[cloudflare-pr-previews]]) and the env-var idea ([[deploy-keys-not-in-env-vars]]).

**Per new project**
- yskills: creates the repo on github.com/new (private). In Cloudflare: Workers & Pages > Create > Import a repository, project name = wrangler `name`, Build command `npm run check && npm run build` (static: `... && npm run generate`), Deploy command `npm run deploy` when there are D1 migrations, else `npx wrangler deploy`; D1 apps also Preview command `npm run deploy:preview`. With D1, the build token needs Account · D1 · Edit, and a Previews Base secret per runtime secret (e.g. BETTER_AUTH_SECRET, different from production).
- Claude: wrangler.jsonc with a `previews` block (required even empty `{}`; previews inherit nothing, so every binding needs its own explicit resource id), D1 ids committed. `npm run deploy` = `wrangler d1 migrations apply DB --remote && wrangler deploy && wrangler d1 migrations apply DB --remote --preview` (`preview_database_id` = the preview D1 id). GitHub Actions runs only verify. Keep the build step in the dashboard, not wrangler `build.command`, so the build runs before migrations.

**Facts checked**
- Workers Builds runs main and branch builds with a user API token (the Builds API allows one token per trigger, but a preview token still needs Workers Scripts Edit on the same Worker, so splitting doesn't help). Since claude-setup #21 (2026-10-05): Build command `npm run check && npm run build`, D1 apps' Preview command `npm run deploy:preview` (migrates the preview D1 first). Branch code therefore runs with a key that can deploy live. Accepted because the 5/5 merge tap ([[merge-rule-until-launch]]) is a process gate, not a security boundary: threads can still reach main through the GitHub merge API, and GitHub Free private repos have no branch protection, so the shared build key gives a thread no reach it didn't already have. Guards: private repos (Cloudflare docs don't say whether fork PRs build), no outside collaborators, and switch off non-production branch builds before a live Stripe key.
- Previews Base secrets only reach Previews created after they are set (docs: previews/configuration).
- Default build token: Workers Scripts/KV/R2 Edit, no D1. GitHub check run "Workers Builds: <worker>" (app cloudflare-workers-and-pages). Preview URL: `https://<branch-slug>-<worker>.yskills.workers.dev`.
- Threads can't read build logs (no Cloudflare key in the cloud env); Cloudflare's dashboard AI can, via yskills.
- A red Actions verify does not stop a Cloudflare deploy, so only green PRs go to yskills for Merge.

**Status 2026-10-06 07:23 UTC (done):** duo-test live runs main's head (3f52e04, all of test run 1's slices); previews and workers.dev on. Root cause of the day-long "build green, nothing live": the dashboard has two tabs, Production and Previews Base, each with its own Deploy command, and Production's said `npm run deploy:preview`. Fixed by yskills 07:16 plus Retry build. duo-test #19 + claude-setup #25 (merged) make the live smoke fail unless `/api/config` `commit` equals the built commit; it caught this at once. Lead for the publish skill: name the two tabs (Production: Deploy command `npm run deploy`; Previews Base: Deploy command `npm run deploy:preview`). Threads can't re-run Cloudflare's GitHub check (proxy 403). MyPage #4 waits until Sunday.


UPDATE 2026-10-08: the per-project dashboard import is replaced by the Builds API, driven by claude-setup's `new-project` workflow: [[auto-deploy-workflow]]. The tradeoff paragraph above still holds.
