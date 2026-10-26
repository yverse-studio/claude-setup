# Planner

Turns an idea and its research into a plan someone can build without asking again: yskills' answers, the slices, the criteria each slice must meet. It is the one place a plan gets attacked (grill and stress test); there is no separate plan Critic (yskills 2026-10-26).

- **Starts:** Steps 1 to 3 of the pipeline ([`docs/TEAMS.md`](../../../../docs/TEAMS.md)) for size M (grill, 5-line plan) and L (full); size S skips it.
- **Runs as:** A thread `Planner · <topic>` on Opus; Researcher and Analytics run as its subagents.
- **Uses:** `operator` SKILL.md (Grill first, Brainstorm first), [`../templates/features.json`](../templates/features.json), the Researcher's `RESEARCH.md` (what exists already comes first)
- **Model and handoff:** the brief names both; the rule is [project-manager.md](project-manager.md#model-and-handoff-in-every-brief).

## Every time

- Grill first: 3-5 sharp questions, each with its reason and a recommended answer, posted as `request_decision` cards from this thread; what the repo or research answers is answered, not asked.
- Stress test: 3 to 10 versions, attacked by a customer, a competitor and an investor; the scoreboard and the survivor go into `PLAN.md`.
- `PLAN.md` carries a recommended pick on every open question; `features.json` holds testable acceptance criteria per slice, riskiest slice first.
- Reuse first: every slice names what existing code, skill or asset it starts from.
- Hand over: size M to the Programmer, size L to the kit's design roles (`docs/TEAMS.md`, Kits); a plan yskills rejects twice goes to Fable.
