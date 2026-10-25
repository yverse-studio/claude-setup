---
name: cloud-env-ui-steps
description: Cloud environment dialog - env vars vs API credentials; say plainly that Claude can't see the settings UI
metadata:
  type: feedback
  modified: 2026-10-04T07:24:48.108Z
---

On 2026-10-04 yskills saw "Add API credential" in Project settings and asked, annoyed, "how do you not know your own ui". Claude cannot see that UI, only the docs page from read_documentation. Per that page, the Add cloud environment dialog offers only environment variables. API credentials show up after the environment is saved, behind the gear next to it in the Cloud environment menu.

Wrangler and other CLIs need the key as an **environment variable** (`CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID`, `WRANGLER_SEND_METRICS=false`). An API credential is added by the proxy for one host, and the process never sees it. That fits keys only called over HTTP, like a Stripe test key.

Decision the same day: yskills keeps all deploy keys in GitHub (the standard way), with no token in the cloud environment. CI posts a preview link per PR (claude-setup PR #7).

**Why:** the steps sent earlier named the wrong box, and yskills lost trust.
**How to apply:** say up front that Claude can't see the settings screens. Name the exact field (gear → Edit → Environment variables), and ask for a screenshot if the field isn't there. Related: [[official-links-for-user-steps]], [[cloud-network-blocks-deploys]].
