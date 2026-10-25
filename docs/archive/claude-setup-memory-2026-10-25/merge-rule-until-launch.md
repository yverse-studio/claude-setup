---
name: merge-rule-until-launch
description: Merge rule as of 2026-10-06 - "Merge everything": the gate merges every PR at 5/5 itself, launch included; only claude-setup PRs wait for yskills' tap
metadata:
  type: feedback
  modified: 2026-10-06T15:30:30.063Z
---

2026-10-06 15:26, yskills tapped "Merge everything" on the merge-rule card. The gate thread merges every PR at 5/5 itself, launch and live money included. Written into claude-setup #27 (CLAUDE.md, operator SKILL.md, gate.md, briefs.md, WORKFLOW.md). It replaces #18's "yskills taps Merge" rule and #26's "small, clear PRs merge themselves" rule.

Exception: claude-setup PRs still wait for yskills, because Claude Code's permission check blocks thread merges there. If auto mode refuses a merge elsewhere, ask for the tap and don't try another way.

**Why:** yskills kept saying "merge everything" and chose it on the card.
**How to apply:** at 5/5, merge (squash) and name the merge in the thread. Related: [[dashboard-and-team-mod]], [[claude-setup-repo]].
