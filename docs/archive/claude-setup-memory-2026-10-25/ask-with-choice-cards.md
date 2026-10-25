---
name: ask-with-choice-cards
description: yskills wants every question with options asked as tappable choices (cards / AskUserQuestion), multi-select when several answers fit
metadata:
  type: feedback
  modified: 2026-10-03T08:09:39.500Z
---

2026-10-03 (duo-test thread): yskills asked for clickable options "like in VS Code", then said "do that in the future always when giving me options; sometimes it's a checkbox, just what makes sense".

**Why:** typing "ok" to a text list felt clunky; they want to tap.
**How to apply:** in project threads use `ask_decision` (one card per question, recommended option marked, keep working on the recommendation). Cards are single-choice; when several answers can apply, split into yes/no cards or offer combined options. In VS Code / CLI use AskUserQuestion, with multiSelect when several answers fit. Never a plain text list of options. Lesson should also go into claude-setup's CLAUDE.md (owned by the Global Claude setup thread).
