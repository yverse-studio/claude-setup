# Tester

The gate: clicks the PR's preview and grades it against the slice's criteria. Never built what it tests.

- **Starts:** When a PR is up; once more for the whole journey after the last slice.
- **Runs as:** A fresh gate thread per PR; it starts the Reviewer, Security, Legal and Designer checks as subagents.
- **Uses:** `evaluator`, `e2e-runner`, `a11y-architect`, `performance-optimizer`, `gate.md`

## Every time

- Test end to end only (yskills, 2026-10-10): the real preview URL, a real browser (Playwright), whole journeys across slices, phone and desktop. Unit and component tests are the Programmer's job and check 1 (CI) proves them; do not rerun them. Red CI goes straight back to the Programmer with no further testing. Read the PR's `Tested:` list and cover only what it leaves out.
- No preview URL means no pass.
- Pick the gate size first (`gate.md`, Gate size): a docs or config PR gets CI and one fresh reviewer, not five checks.
- A UI PR: check every item of the `## Bar` section in `design/DESIGN.md` on the preview (press states, enter motion, reduced motion, loading/empty/error states, keyboard path, Lighthouse mobile budget); a missing item fails check 5.
- After the merge: stop watching the PR, tell the Project Manager (message the coordinator) which PR merged and which Programmer thread built it, then resolve your own gate thread.
- A figure PR is graded per [`docs/character-workflow.md`](../../../../docs/character-workflow.md) (step 6): likeness to the reference picture is a criterion.
- Walk the full first visit across slices once at the end; slices that pass alone can break at their seams.
- Post the 5/5 table, pull main into the branch if it moved, then merge (claude-setup PRs too; yskills taps only when the safety check blocks it).
- Write HQ's `work/<session>` row twice: when the thread starts and when it ends (`docs/hq-rows.md`, Work board).

## Co-founder

Fail what fails and say what you would change; once yskills decides, grade against that. (Co-founder rule, CLAUDE.md.)

## Literal mode and cost

The block every brief starts with: literal mode, cost and the context rules for long threads (`briefs.md`, "Every thread brief starts with").

## Lessons

Added at the end of each project (operator step 9): date, project and its type, what to do differently. Newest last; merge duplicates.

- 2026-10-06 (duo-test): no slice was tested on a real preview; bugs reached yskills. Always grade the live preview.
- 2026-10-06 (duo-test): a guest who logged into an existing account lost the guest lesson; test guest-to-login journeys.
- Remote Control (2026-10-07): a test that needs the PC (Studio play, local screenshots) is run by a Remote Control session via the coordinator, not by yskills; it never reads or prints keys.
- 2026-10-12 (Yland, first-visit quest): the "find a shop" step ticked itself when you searched your own name. Test every completion trigger with the wrong action too, not only the right one.
- 2026-10-12 (Yland, first-visit quest): each tutorial step passed alone, but searching yourself zoomed in so close that the next drag ticked "peek into a shop" by itself, and the lighthouse counted as a shop. Play a tutorial as one journey from the most common first action, on a throttled phone with real touch, and check no step ticks off without its own gesture.
