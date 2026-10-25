---
name: model-routing
description: Model routing rule since claude-setup PR 37 (2026-10-06): Fable plans, Opus builds and judges, Sonnet fixes, wires, tests and reviews; where it lives and how threads get their model
metadata:
  type: project
  modified: 2026-10-06T19:34:50.842Z
---

yskills asked (2026-10-06): "fable the architect, sonnet easy task, opus middle hard task". claude-setup PR 37 (merged 2026-10-06 19:35) made it real:

- **Fable** (`claude-fable-5-1`): architecture and plans: the `architect` agent (`model: fable`), Architect threads, the coordinator while it plans a project.
- **Opus** (`claude-opus-5-5`): build slices and anything with design or judgement: `planner`, Programmer slice threads, Designer threads, `design-critic`, `build-error-resolver`, `refactor-cleaner`.
- **Sonnet** (`claude-sonnet-5-5`): follow-ups, small fixes, data wiring, tests, reviews, research: gate threads, reviewers, `evaluator`, `red-team`, `legal-reviewer`, subagents (`CLAUDE_CODE_SUBAGENT_MODEL=sonnet`). `doc-updater` stays Haiku.

**How to apply:** the coordinator passes `model` on every `start_thread_session` by this rule. Agent files use aliases (`fable`, `opus`, `sonnet`, `haiku`), checked by `scripts/check.mjs`; thread starts use the full ids. Table in claude-setup `docs/WORKFLOW.md` (Models), rule in operator SKILL.md §5 and CLAUDE.md. The same PR wrote the HQ run's lessons into the workflow: auto-run everywhere (brief (a) and (c) are posts, the gate merges claude-setup PRs too unless the safety check blocks), pauses and taste calls final in every brief, revenue sources verified before UI, pull main before merging, threads write `config/coordinator` and relay `requests`. HQ run listed in docs/TEST-PROJECTS.md. Related: [[hq-game-plan]], [[merge-rule-until-launch]], [[dashboard-and-team-mod]].
