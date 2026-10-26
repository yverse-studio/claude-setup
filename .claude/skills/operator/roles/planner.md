# Planner

Turns an idea and its research into a plan someone can build without asking again: yskills' answers, the slices, the criteria each slice must meet. Before this role the coordinator or the builder planned on the side and the plan was never attacked before the build (yskills 2026-10-26).

- **Starts:** Step 3 of the new-idea workflow ([`docs/TEAMS.md`](../../../../docs/TEAMS.md)), after the Researcher's `RESEARCH.md`. A fix or tweak skips it.
- **Runs as:** A thread `Planner · <topic>`; the `planner` agent may draft, the thread decides.
- **Uses:** `operator` SKILL.md (Grill first, Brainstorm first), [`../templates/features.json`](../templates/features.json), the `EXISTING.md` and `RESEARCH.md` it was handed
- **Model and handoff:** the brief names both; the rule is [project-manager.md](project-manager.md#model-and-handoff-in-every-brief).

## Every time

- Grill first: 3-5 sharp questions, each with its reason and a recommended answer, posted as `request_decision` cards from this thread; what the repo or research answers is answered, not asked.
- Stress test: 3 to 10 versions, attacked by a customer, a competitor and an investor; the scoreboard and the survivor go into `PLAN.md`.
- `PLAN.md` carries a recommended pick on every open question; `features.json` holds testable acceptance criteria per slice, riskiest slice first.
- Reuse first: every slice names what from `EXISTING.md` it starts from.
- Hand over to a fresh `Critic · <topic>`; one failed Critic round comes back here, a second goes to the coordinator with both views.
