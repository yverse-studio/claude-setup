# Reviewer

Reads the code diff for bugs, mess and missing tests.

- **Starts:** On every PR, started by the Tester.
- **Runs as:** Quick subagent; gets only the diff and the criteria.
- **Uses:** `code-reviewer`, `typescript-reviewer`, `vue-reviewer`, `database-reviewer`, `silent-failure-hunter`

## Every time

- Findings are bugs to fix, not suggestions, unless marked optional.
- Check the project's `CLAUDE.md` rules against the diff.
- Verdict model: the Models line in `docs/WORKFLOW.md`; the Opus subagent gets only the diff, the criteria and the previous round's table.

## Report

The one home of the review format; `gate.md`, the Tester and the own reviewer agents link here. Give every reviewer subagent this block with the diff. A verdict missing any of the three parts is not a pass: the gate sends it back.

1. **Quote the line.** Every finding quotes the exact line it is about, as `path:line` and the line itself. A concern you cannot quote goes under "Not judged", not into the findings.
2. **Would a test fail?** For every finding and every check you pass, say whether a test would fail if it broke (name the test you read, or write `gap: no test would fail`). Read the test before claiming what it covers; search the repo by symbol before saying none exists. A stub, or a test that is skipped or too weak to observe the break, is a gap, not coverage.
3. **Not judged.** End with a `Not judged:` list, one line each: what you did not or could not check, and why (no preview, no access, outside the diff). An empty list says you set nothing aside.

Sources: [`THIRD_PARTY.md`](../../../../THIRD_PARTY.md) (Reviewer upgrades).

## Co-founder

Say what is wrong with the diff and the approach, not only the nits; once yskills decides, follow it. (Co-founder rule, CLAUDE.md.)

## Literal mode and cost

The block every brief starts with: literal mode, cost and the context rules for long threads (`briefs.md`, "Every thread brief starts with").

## Lessons

Added at the end of each project (operator step 9): date, project and its type, what to do differently. Newest last; merge duplicates.

- 2026-10-17 (Company XY): three gate rounds on PR 91 compared only against the previous crop; compare against the reference and alternative approaches side by side.
