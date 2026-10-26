---
name: auto-deploy-workflow
description: Since 2026-10-08 a new project is created and deployed by claude-setup's new-project workflow (push branch new/<name>); Cloudflare's Builds API connects repos, no dashboard click; what yskills must set up once
metadata:
  type: project
  modified: 2026-10-08T17:31:36.970Z
---

Decided 2026-10-08 in thread "Architect: auto deploy" (claude-setup PR 90, research in
/mnt/project-files/claude-setup/research/auto-deploy.md). Supersedes the "one import click per
repo" in [[workers-builds-deploys]] and the "yskills creates the repo" step in [[github-repo-creation]].

- Cloudflare's Workers Builds API connects a repo and creates the build config (`POST
  /accounts/{id}/builds/workers`, repo connection, triggers, build tokens, logs). Needs a
  **user-scoped** token (Workers Builds Configuration Edit, Workers Scripts Edit, D1 Edit, Account
  Settings Read) and the Cloudflare GitHub App installed once per GitHub account or org.
- Checked from a cloud thread 2026-10-08: api.cloudflare.com reachable (dash.cloudflare.com not);
  `create_repository` 403; `run_workflow` (workflow_dispatch) 403; Actions list/get/logs work.
- The trigger a thread can use: push branch `new/<name>` with `projects/<name>.json` to
  claude-setup; the workflow creates the repo in org `yverse-studio`, D1 `<name>` and
  `<name>-preview` (EU), the Worker (workers.dev + previews on, random BETTER_AUTH_SECRET for
  Previews Base and production), the builds connection, runs the first build, deletes the branch.
  Then `add_repo` the result. Steps and the once-only hands list: publish skill, §A new project.
- Keys live as Actions secrets in claude-setup (`CLOUDFLARE_API_TOKEN`, `PROJECTS_GITHUB_TOKEN`)
  and variable `CLOUDFLARE_ACCOUNT_ID`; builds deploy with the existing build token, never the
  setup token. Push access to claude-setup = key access (GitHub Free, no environment protection),
  accepted as the same class as the build token tradeoff.

UPDATE 17:50: yskills made a Cloudflare account for Claude (10-08 17:17); the five steps happen in that account; a fresh account needs secret `CLOUDFLARE_BUILD_TOKEN` (second token, Workers Scripts + D1 Edit) which the first run registers as build token (PR 91). No connectors or plugins needed in the cloud. On the laptop (Claude user, RC with --chrome): Cloudflare's official plugin (`/plugin marketplace add cloudflare/skills`, `/plugin install cloudflare@cloudflare`, OAuth in Claude's Chrome) gives full Cloudflare API power without a key in chat (developers.cloudflare.com/agent-setup/claude-code). Domains out of scope for now (yskills 17:17).

**How to apply:** for a new app, no github.com/new and no Cloudflare import ask; run the
workflow by pushing the branch, once yskills has done the five one-time steps (org, apps, two
tokens, secrets). Until then the run fails on the first missing secret and the thread sends that
one step with its link.
