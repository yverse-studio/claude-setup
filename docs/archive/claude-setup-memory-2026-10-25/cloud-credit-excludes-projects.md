---
name: cloud-credit-excludes-projects
description: The $100 cloud-session credit does not cover Projects (this project's threads), so they run on the plan's 5-hour limit
metadata:
  type: project
  modified: 2026-10-04T21:34:16.387Z
---

Found 2026-10-04 (usage thread): Anthropic's promo credit for cloud sessions ($100 Pro, $250 Max, claim by 2026-10-07, expires 2026-11-04) applies only to regular cloud sessions started at claude.ai/code. Its terms exclude Projects and Routines, Remote Control, chat and Cowork. So every thread in this project spends the plan's 5-hour and weekly limits, which is why all sessions stopped together (07:36, 11:45, 18:06 UTC on 2026-10-04) while the credit sat at about $75 left. Source: WebSearch of the launch coverage quoting the help page; not read on the official page itself.

**How to apply:** don't tell yskills the credit keeps project threads going. Options: big solo coding jobs as plain claude.ai/code sessions (credit applies), paid usage credits with a cap at claude.ai Settings > Usage, or spend less (short-lived threads first; Sonnet 5.5 is half the Opus 5.5 price but cache reads cost the same, so under 2x for us). Usage report 18:05: 523M tokens, 98% cache read, two long threads = 77%. Related: [[claude-setup-repo]].
