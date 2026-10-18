# Playtest: <game>, <date>

Written by the Playtester for one build, kept in `design/playtests/<date>-<short sha>.md` with its
screenshots and clips in a folder of the same name. Method and rules:
[`roles/playtester.md`](../roles/playtester.md). `scripts/playtest-check.mjs` checks this file.

Preview: <https url of the Worker Preview that was played>
Commit: <sha the preview was built from>

## Verdicts
Each row: `pass` or `fail`, and an evidence line with the time in the run (`mm:ss`) and a file in
this report's folder (png, jpg or webm). A fail names the GDD or Bar line it breaks.

| Area | Verdict | Evidence |
|---|---|---|
| First 30 seconds | <pass or fail> | <00:00 what happened, file> |
| Full run | <pass or fail> | <00:00 what happened, file> |
| Death and restart | <pass or fail> | <00:00 what happened, file> |
| Ad hooks | <pass or fail> | <00:00 what happened, file> |
| Touch 390 | <pass or fail> | <00:00 what happened, file> |
| Keyboard 1440 | <pass or fail> | <00:00 what happened, file> |
| GDD promises | <pass or fail> | <00:00 what happened, file> |

## Think-aloud log
One line per thing noticed, `mm:ss` first: what was tried, what was expected, what happened.

## Findings
Ranked, each with the moment, the file and the GDD or Bar line it breaks (or `no line covers this`).

Not checked:
- <what was not played or reached, and why>
