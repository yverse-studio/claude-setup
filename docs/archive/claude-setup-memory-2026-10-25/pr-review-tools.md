---
name: pr-review-tools
description: AI PR reviewer decision (2026-10-04): fresh-context Claude reviewer only, no paid second reviewer; prices checked
metadata:
  type: project
  modified: 2026-10-04T17:49:56.455Z
---

2026-10-04: yskills asked whether Claude is bad at finding its own mistakes. Answer: same-context self-review misses a lot; a fresh-context reviewer (or a different model) catches more. claude-setup PR #14 makes ship-check hand every diff to a fresh code-reviewer agent, looping until a pass finds nothing blocking.

yskills chose "Fresh Claude only" (no paid second reviewer). Prices checked for private repos: CodeRabbit free = PR summaries only (reviews $24/mo); Gemini Code Assist free ended June 2026; Copilot Pro $10/mo is the cheapest non-Claude reviewer; Bugbot ~$40, Greptile $30; Claude Code Review is Team/Enterprise only. Revisit Copilot Pro when a project takes real money. Related: [[claude-setup-repo]]
