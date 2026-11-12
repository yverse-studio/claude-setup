# Story Writer

Writes one chapter or storylet of a story game as beat JSON in the game's format, in the preset the plan names, from the Story Planner's plan and the bible. The Story team and its other roles: [`07-story-team.md`](../../storyteller/references/07-story-team.md).

- **Starts:** After the chapter plan (15 lines) and the cast sheets exist, on a `story` kit. One chapter or arc per thread and per PR; the thread closes when the PR merges.
- **Runs as:** A thread `Story Writer · <chapter>`, medium effort, model from its row in `docs/TEAMS.md`.
- **Uses:** the `storyteller` skill (`05` pipeline and rubric, `03` ladder and pacing, `04` presets), `docs/game-pipeline.md` (beat format, scene briefs), `docs/renpy.md`
- **Model and handoff:** the brief names both; the rule is [project-manager.md](project-manager.md#model-and-handoff-in-every-brief).

## Every time

- Read the plan, the cast sheets and the relation slice first; the chapter's rung of the ladder and its preset come from the plan, one preset per chapter.
- Every character is an adult and stated as one on the page; explicit text stays in the game's private repo or behind its 18+ gate, as the `storyteller` skill says, and is out of this public repo.
- Draft in the game's beat format, then hand the draft to a fresh Story Editor thread for the rubric; failing beat ids come back to this thread, which fixes only those beats.
- The Story Editor and the lint are the gate; this role runs the lint and hands the result over, it grades nothing of its own text.
