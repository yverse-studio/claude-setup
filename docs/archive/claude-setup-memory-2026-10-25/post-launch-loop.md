---
name: post-launch-loop
description: The loop after launch (2026-10-07, claude-setup PR 68): app stores errors and feedback, loop.yml files them as GitHub issues, a daily reader routine pokes the coordinator; duo-test wiring is the next thread
metadata:
  type: project
---

Before PR 68 nothing looped after launch: no project had a routine (`list_triggers` empty), no app stored errors or feedback a thread could read. Design is in claude-setup `docs/LOOP.md` and templates in `.claude/skills/operator/templates/loop/`; plan in /mnt/project-files/claude-setup/loop/PLAN.md.

**Why:** yskills asked (2026-10-07 22:33) how errors and customer feedback come back; the reel's "own desktop" was judged not the gap, the way back from launch was.

**How to apply:** next thread "Programmer · duo-test loop" (Sonnet): error_event and feedback tables, POST /api/errors and /api/feedback, `errors[]`/`feedback[]` in /api/stats/report, Feedback link in the footer, scripts/loop.mjs and .github/workflows/loop.yml from the templates; then the PM creates the daily reader routine (templates/loop/routine.md). Hands for yskills: GitHub environment `loop` on duo-test with REPORT_URL and STATS_REPORT_TOKEN. Paste list: gate.md "last PR before launch: check 2 walks loop-1 to loop-4". Related: [[claude-setup-repo]].
