---
name: rc-folder-approval
description: Remote Control on the Claude laptop user needs one folder approval per claude.ai project (C:\Users\Claude\Documents\GitHub), not per repo; yskills approves it, Claude cannot
metadata:
  type: project
  modified: 2026-10-08T18:59:37.427Z
---

yskills (2026-10-08 18:56) will always allow Claude's laptop Remote Control session and asked whether more folders or a per-project setting are needed.

Answer given: every repo is cloned under `C:\Users\Claude\Documents\GitHub`, so one approval of that folder in a claude.ai project's settings (Resources > Devices) covers all projects worked on there, present and future. Approval is yskills' consent, so a thread cannot set it; yskills set this project's default device to the Claude user's RC environment on 2026-10-08 18:58, so threads here start without a card; Company XY still needs the same one-time pick in its own settings. Written into claude-setup `docs/pc-claude-user.md` (PR 95). Claude Code's own safety prompts (deletes, secrets) still appear and cannot be pre-approved.

**How to apply:** never ask for extra folder approvals; clone new repos under that folder. Related: [[auto-deploy-workflow]], [[no-allow-prompts]].
