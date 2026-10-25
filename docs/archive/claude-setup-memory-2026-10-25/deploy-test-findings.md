---
name: deploy-test-findings
description: 2026-10-08 deploy-test runs 1-9 of the new-project workflow; the 8000008 "disconnected from your Git account" cause was Cloudflare's stale repo list, fixed by PR 101 (repo connection first, retries) and PR 102 (build outcome); run 9 went live
metadata:
  type: project
  modified: 2026-10-08T19:47:52.142Z
---

Thread "deploy test" (2026-10-08 18:38-19:48 UTC), nine runs of `new-project.yml` for project `deploy-test` (d1 false). Run 9 went live (https://deploy-test.yverse.workers.dev).

Fixed on the way (all merged): PR 93 registers `CLOUDFLARE_BUILD_TOKEN` in a fresh account; PR 94 retries the trigger lookup; PR 95 first build via deploy hook; PR 97 logs every Builds API answer sanitized; PR 98 hook paths use the script tag; PR 100 stops loudly when the connect call fails; PR 101 saves the repo connection first (`PUT /builds/repos/connections`), tries numeric ids then names, retries only on 404/8000008 for up to 2 minutes, and fails with the GitHub-side fix; PR 102 judges a build by `build_outcome`, not `status` ("stopped" was read as a failure).

Real cause of 8000008 "This project is disconnected from your Git account" (runs 7, 8): Cloudflare had not picked up the repo the workflow created after the GitHub app was linked; the org link itself was fine. yskills fixed it by hand: GitHub org → Settings → Installations → Cloudflare Workers and Pages → Configure → Repository access toggled to "Only select repositories" and back to "All repositories" → Save. The public Builds API lists no connected Git accounts or repos and has no re-sync call (checked in cloudflare/api-schemas `/builds/` paths); the connection upsert is the only probe.

Leftovers from the test, still to delete when yskills says so: repo yverse-studio/deploy-test, Worker `deploy-test`, build token `claude-setup-builds`, branch `new/deploy-test`.

**How to apply:** if a new project's run fails with "Workers Builds does not see <org>/<name>", send yskills the GitHub installation-settings toggle above (publish skill §A has it), then push the branch again. Related: [[auto-deploy-workflow]].
