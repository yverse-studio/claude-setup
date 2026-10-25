---
name: cloudflare-keys-in-cloud-env
description: Where yskills' Cloudflare keys live for cloud threads and why the first test failed (2026-10-04)
metadata:
  type: project
  modified: 2026-10-04T21:31:13.352Z
---

2026-10-04 18:05: yskills added Cloudflare keys to the project's custom cloud environment as API credentials (not env vars), meant for all future threads. The proxy injects them on requests to *.cloudflare.com; threads see no CLOUDFLARE_* env vars and never handle the value.

First test failed: api.cloudflare.com answered "Missing Authorization header", so the injection used the header names from yskills' curl (`CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID`), which Cloudflare ignores. Fix asked of yskills: header `Authorization`, value `Bearer <token>`; the account id is not a header (it goes in the URL path). After the fix, test with `curl https://api.cloudflare.com/client/v4/user/tokens/verify` (user token) and `/client/v4/accounts` to learn account and scope.

Retest 2026-10-04 21:40 in a fresh thread after yskills's 21:36 fix: still "Missing Authorization header" on /user/tokens/verify, and /accounts asks for X-Auth-Email/Key, so no auth header arrives at all. The session's proxy list shows the credential under host `*.api.cloudflare.com`; inferred cause: that wildcard doesn't match the apex `api.cloudflare.com`. Ask: host `api.cloudflare.com` exactly, header `Authorization`, value `Bearer <token>`, then test again in a new thread (credentials load at session start). Probing api.stripe.com to compare was blocked by auto mode (credential exploration); don't retry.

WORKS since 21:42 (confirmed again in a fresh thread at 21:43, so it loads at session start too): yskills set host `api.cloudflare.com` (credential named "cloudflare"); the change applied to the running thread without a restart. Token active, one account "Yskills.collab@outlook.com's Account" (workers.dev subdomain `yskills`). Reads Workers (duo-test, duo-test-preview, ideaworld, mothertok, tellmey, thestrongest, tiktokisland, yxie-portfolio) and D1 (duo-test, duo-test-preview, tiktokisland, tellmey-stats). Write scope not tested.

Network (same check): api.cloudflare.com and *.workers.dev are reachable from cloud threads now, so the old "add *.yskills.workers.dev" ask is done.

Limit found 2026-10-04 22:02 (MyPage): `wrangler deploy` of static assets fails through this proxy. The asset upload (`/workers/assets/upload`) authenticates with a short-lived upload JWT in the Authorization header, and the proxy overwrites it with the API token, so every upload gets a 401 ("malformed response"). API reads and whoami work. Deploys with assets must run in GitHub Actions with a repo secret.

**Why:** memory's earlier rule was keys only in GitHub secrets; yskills chose the cloud environment for this one. Risk: any thread (and any code it runs) can call Cloudflare with that token, so it should stay least-privilege.
**How to apply:** threads call the Cloudflare API or wrangler directly through the proxy instead of routing through GitHub Actions, once the header is fixed. GitHub secrets still drive CI deploys. See [[cloudflare-preview-token]].
