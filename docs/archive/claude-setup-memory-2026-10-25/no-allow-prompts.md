---
name: no-allow-prompts
description: yskills does not want to press Allow on web-page prompts; research in cloud threads uses WebSearch, not WebFetch
metadata:
  type: feedback
  modified: 2026-10-03T12:15:19.899Z
---

On 2026-10-03 yskills asked "i dont want to press allow once all the time cant you just get access?" after a research agent made ~40 WebFetch calls, each one an Allow prompt (the cloud's provenance check for URLs nobody posted in chat; it cannot be switched off from a thread, and Claude may not grant itself access).

**Why:** every unposted-URL fetch in a cloud thread interrupts them; an unanswered one expires after a while and the call fails.

**How to apply:** in cloud threads research with WebSearch and Context7, and tell every subagent or workflow agent to do the same in its prompt. Fetch a page only when one fact depends on it, and say so. If prompts still appear, tell them they can ignore them. The rule is also in claude-setup's CLAUDE.md (PR #2). Related: [[claude-setup-repo]].

They also declined the Remote Control card on 2026-10-03 (12:12); do not offer it again unless they bring it up.
