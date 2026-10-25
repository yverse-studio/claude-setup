---
name: deploy-keys-not-in-env-vars
description: Deploy keys never go in cloud env vars; threads can't create repos, set GitHub secrets or upload Worker assets (checked 2026-10-05); deploys now via Workers Builds
metadata:
  type: project
  modified: 2026-10-05T07:03:34.223Z
---

2026-10-05, thread "Hands-off publish": yskills wanted Claude to create the repo, build, merge and publish without per-project secrets. Checked first-hand:
- Repo creation: the proxy binds sessions to configured repos (POST /user/repos gives 403). yskills clicks github.com/new; Claude then attaches the repo with add_repo.
- GitHub Actions secrets and runs paths give 403 through the proxy, so threads can't set secrets.
- Workers Builds has no API for connecting a repo (workers-sdk #12058).
- Free GitHub orgs can't share secrets with private repos.
- An injected Cloudflare credential breaks `wrangler` asset uploads with a 401.
- Env-var keys were rejected: Anthropic's env-var field says no secrets, and threads can reach any host (webhook.site and pastebin both returned 200), so a hijacked thread could exfiltrate the key. yskills first tapped "Claude deploys", then asked "can hackers get them?"; the decision was reversed to GitHub secrets.
- The auto-mode classifier flags removing CI deploy jobs as "CI Bypass".

**How to apply:** SUPERSEDED 08:50 by [[workers-builds-deploys]] (no GitHub secrets at all). The findings above still hold. Don't re-propose env-var keys. Related: [[cloudflare-keys-in-cloud-env]], [[github-repo-creation]], [[cloudflare-pr-previews]].

2026-10-05 07:40: yskills connected Cloudflare Workers Builds (GitHub app) to duo-test. A test branch build failed, and its previews are versions of the live Worker (live D1 and Stripe keys). Claude advised disconnecting it and keeping GitHub secrets. It only fits sites with no data or keys, like MyPage, and even then the build command has to be set by hand. The injected cloud Cloudflare key was deleted by yskills the same morning.

UPDATE 07:50: switching to Cloudflare Workers Builds + Worker Previews (launched 2026-09-22). PRs get isolated previews (a `previews` block in wrangler.jsonc with its own D1 and secrets; previews don't inherit production), Cloudflare deploys main, and there are no GitHub secrets. Needs wrangler >= 4.147. Migrations need D1 Edit on the build token, plus a deploy command running `wrangler d1 migrations apply <db name> --remote`. yskills was told to stop the GitHub key steps and to add a read-only key (injected API credential) so threads can read build logs.

SETTLED 08:50: Workers Builds + Worker Previews, see [[workers-builds-deploys]].
