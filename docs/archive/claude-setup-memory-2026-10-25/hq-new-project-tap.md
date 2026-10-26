---
name: hq-new-project-tap
description: HQ slice 5 (claude-setup PR 35, merged 2026-10-06): yellow notepad saves requests/<id> and send_messages the coordinator; threads keep config/coordinator and relay pending rows
metadata:
  type: project
  modified: 2026-10-06T18:40:16.982Z
---

HQ's desk notepad ("Neues Projekt") writes `requests/<id>` `{text, at, status}` (new, sent, relayed, started + link) and calls the Claude Code Remote connector's `send_message` to `config/coordinator.session` (fallback `pm/now.session`). The message reads "HQ request <id>: <idea> ...". HQ declares `mcp: {servers: [{server: "Claude Code Remote", tools: ["send_message"]}]}` next to db; every republish must keep it.

**Why:** the coordinator has no Artifact/ArtifactData tools, so it can't read HQ's db.
**How to apply:** every thread writes `config/coordinator` (get_channel_session_id) at start and finish, and at start relays `requests` rows that are new/sent without link, then sets them `relayed`. The coordinator starts one brainstorm thread per request id; that thread sets the row `started` with its link. Rules in operator SKILL.md. Unverified until yskills taps once on the pinned page (only their browser holds the connector consent). Related: [[hq-game-plan]], [[dashboard-and-team-mod]].
