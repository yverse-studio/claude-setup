---
name: cloud-network-blocks-deploys
description: Built-in cloud environment blocks api.cloudflare.com, workers.cloudflare.com and api.stripe.com, so threads deploy via GitHub Actions secrets, not wrangler
metadata:
  type: project
  modified: 2026-10-03T08:55:25.636Z
---

Checked 2026-10-03 in the duo-test thread: the proxy answers 403 for api.cloudflare.com, workers.cloudflare.com, dash.cloudflare.com and api.stripe.com (npm registry works). `wrangler deploy` cannot run from a project thread on the built-in environment, with or without a token.

**How to apply:** deploy from GitHub Actions on merge to main, with repo secrets CLOUDFLARE_API_TOKEN (template "Edit Cloudflare Workers" plus Account D1 Edit), CLOUDFLARE_ACCOUNT_ID and any payment keys; read the workers.dev URL from the job log. Deploying straight from threads would need a custom cloud environment allowing those hosts plus the token as an environment variable. Related: [[official-links-for-user-steps]], [[cloud-thread-plugins]].
