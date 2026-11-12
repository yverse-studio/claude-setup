# MASTERPLAN: the detail file of a project's one living plan

Copy to `/mnt/project-files/MASTERPLAN.md` when an item of `PLAN.json` has more rows than the plan's 25 items hold (rule: `.claude/skills/operator/roles/project-manager.md`, Masterplan, item 11). `PLAN.json` keeps the road to the goal, one item per milestone; this file keeps the rows under them as detail (gate score, gate file, blocker), and each milestone heading names its item id. Status of an item lives only in `PLAN.json`. Network mount: trailing-slash path, re-read about 10 s after writing, edit only your own row.

Goal and order: <the owner's order of work, with its date>.
Last full check against files: <date, who, which files were read>.

## The workflow (fixed order, no step is skipped)

<The project's steps in order, one line each, and what closes each step. Example for a character in a render game: 1 base body (the owner decides, asked on a card) · 2 body gated · 3 outfit from the wardrobe, fitted per base · 4 stills · 5 animations · 6 into the game. A step starts only when the one before it is done.>

## Rules (short; the home is the Masterplan rule)

1. On gate pass: score and gate file into your row in the same step, then set your item with `plan.mjs`. No entry without a gate file; a fail writes the round and the score.
2. P0 = on the critical path of the current milestone, P1 = needed but blocks nothing, P2 = later. Nobody works a P1 or P2 row while a P0 row of their skill is in READY NOW.
3. Round budget: 3 gate rounds per row. After the third fail the row says `STOP r3` and the coordinator re-plans it (reuse, cut scope or defer).
4. A blocked row names its blocker row; the thread takes the next READY NOW row.
5. Decision rows first: what only the owner can decide (which base, which style, which scope) is a row with `✓ owner` or an open card. No row that depends on it starts before that.
6. A change edits the row and adds one line to the change log. This file is never the status source.

Status: `✓` done and gated · `◐` in work · `○` open and ready · `⛔` blocked (blocker named) · `P` parked · `?` not found in a file.

## READY NOW (unblocked P0 rows, in order)

| # | Row | Why now |
|---|---|---|
| 1 | <id and title> | <what made it ready> |

## Milestones

| M | Goal | State | Done when |
|---|---|---|---|
| M1 | <goal> | ◐ 3 of 12 | <the check that closes it> |
| M2 | <later goal> | P | parked until M1 |

## M1 · <goal>

### Decisions (owner, before any dependent row)

| ID | Question | In the files now | Decided by the owner | Status |
|---|---|---|---|---|
| D-1 | <question> | <measured state and where> | <his words and date, or open> | ✓ owner |

### Tasks

| ID | P | Task | Status | Gate / evidence | Owner thread | Blocked by |
|---|---|---|---|---|---|---|
| T-1 | P0 | <task> | ✓ 4.8 | <gate file> | [<thread title>](#cmsg_example) | – |
| T-2 | P0 | <task> | ⛔ | – | [<thread title>](#cmsg_example) | D-1 |

## Waiting for the owner

| # | What | Unblocks |
|---|---|---|
| 1 | <card or step, with its link> | <rows> |

## Change log (newest first)

- <date time> · <what changed and why>
