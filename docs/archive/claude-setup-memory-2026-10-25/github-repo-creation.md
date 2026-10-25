---
name: github-repo-creation
description: Threads can't create GitHub repos (403); since 2026-10-08 the new-project workflow creates them (auto-deploy-workflow), add_repo attaches
metadata:
  type: project
  modified: 2026-10-05T17:43:27.788Z
---

Threads can't create GitHub repos: mcp__github__create_repository returns 403 "Resource not accessible by integration" (2026-10-03), and POST /user/repos returns 403 through the cloud proxy (2026-10-05). yskills creates each private repo at github.com/new, then a thread attaches it with add_repo.

**Why:** the cloud proxy binds each session to its configured repos, so repo creation from a thread is refused.
**How to apply:** for a new project, send yskills https://github.com/new and the repo name, ask for a private repo, and once it exists attach it with add_repo. Related: [[workers-builds-deploys]], [[deploy-keys-not-in-env-vars]], [[claude-setup-repo]].


UPDATE 2026-10-08: repo creation now happens in claude-setup's `new-project` workflow with a fine-grained token scoped to org `yverse-studio`; see [[auto-deploy-workflow]]. github.com/new is only the fallback until yskills's five one-time steps are done.
