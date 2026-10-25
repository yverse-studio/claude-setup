---
name: cloudflare-pr-previews
description: OLD GitHub Actions PR previews (separate preview Worker + per-Worker account token), replaced 2026-10-05 by Worker Previews; token facts still valid
metadata:
  type: reference
  modified: 2026-10-05T02:30:32.661Z
---

duo-test PR #10 (merged 2026-10-04 17:38) gives every same-repo PR a preview link: a version of a separate Worker `duo-test-preview` (wrangler `env.preview`) with its own empty D1, auth secret and rate limit, no Stripe/Google/mail keys. Main deploy (`deploy.mjs --preview`) creates/updates that Worker; the first run created it fine.

Facts checked against Cloudflare docs (raw.githubusercontent.com/cloudflare/cloudflare-docs is reachable from threads; developers.cloudflare.com is not):
- Token: an **account API token** (dashboard > Manage account > Account API tokens) with the Workers role **Editor** scoped to the one Worker. "Workers Scripts Edit" is the legacy account-wide permission. Per-Worker scope only works for a Worker that already exists; creating one needs product-level Admin, so the main deploy creates it first.
- wrangler envs don't inherit bindings (D1, ratelimits, KV...); a D1 binding with no name and no id is sent as type "inherit" on `versions upload`, so PR uploads need no D1 access.
- Any same-repo PR that edits a workflow gets every repo-level secret; live keys belong in the `production` environment limited to main.

- Dashboard wording confirmed by the 2026-09-15 Cloudflare changelog "granular-worker-permissions": Manage Account > Account API Tokens (https://dash.cloudflare.com/?to=/:account/api-tokens) > Create Token, scope **Specified Workers**, role **Editor**, Continue to summary > Create Token. Steps sent to yskills 2026-10-05.

**How to apply:** don't reuse for new apps: [[workers-builds-deploys]] replaced it 2026-10-05 (duo-test PR #14). Per-Worker account tokens are still the way to scope a key to one Worker, but Workers Builds can't use them yet. Earlier note: the claude-setup `sell` template's preview env (empty database_id) is broken and was reported to the coordinator. Related: [[cloud-network-blocks-deploys]], [[official-links-for-user-steps]].
