# The three briefs

Besides the gate's summaries (2 failed rounds) and a probe that
misses its go number, yskills reads three
messages per project. Each is posted with its recommended pick and work continues at once
(auto-run, CLAUDE.md); nothing waits for yskills except the steps only their hands can do (keys, domain). Fixed templates, so they read the same every time. Short lines, no prose. German
labels only if yskills writes German in that project.

## (a) After the plan

Co-founder: the plan states Claude's own view too (what it would change or drop and why); yskills's decision is carried out as said.

```
Plan: <name>, <one line: what it does>
Für wen: <who>, <how many like them, source>
Geld: <how it earns, price>, <break-even: n paying users / month>
Beweis: <3 signs people already pay for this, with sources | none → recommend no or smaller | not meant to earn>
Probe: landing page + waitlist, <channel>, <n> days; go at <go number>, else a kill/change card
Größe: <small site: 1 build | app: n slices, riskiest first: <slice 1>>
Slices: 1. <name> 2. <name> ...
Rechtliches: <must-haves from the legal team, e.g. Impressum, Datenschutz, no cookie banner needed>
Keys: <none | what will be needed, each asked by a key card when its slice gets there>
Repo: `yverse-studio/<name>`, made by the `new-project` workflow, live at https://<name>.yverse.workers.dev
Kosten: ~<€/month to run> + ~<tokens or $ to build>, estimate
Risiko: <the one thing most likely to fail>

ok / no
```

## (b) Design pick

The Project Manager posts it in the project chat (vote rule in CLAUDE.md, How to work). Send 2-3
directions as live drafts in one vote gallery (`roles/designer.md`, Vote gallery), each with
a two-word name and one line on the feel, built from yskills' references and the `ui-review`
skill's `TASTE.md`. Then tap options: the directions, plus "none, try again". yskills can also
answer in words or pictures ("this one but darker", a screenshot): the design team revises and
sends the next round. Each lasting like or dislike becomes a line in `TASTE.md`.

Below the pick: nothing to set up. The `new-project` workflow (publish skill) made the repo,
the databases and the deploy before the scaffold; test keys come later by key card, when the
slice that uses them starts. Building starts at once (auto-run).

## (c) Before launch

```
Launch: <name>
Preview: <url>
Gate: 5/5 on every PR so far (<n> merged); last PR <link> at 5/5, unmerged
Screens: <phone + desktop images attached>
Legal: <legal-reviewer result: pass, or what is open>
Live keys needed: <list with deep links, or none>
Branch builds off before live keys: <yes | not needed, no live keys>
Offene Risiken: <max 3 lines>

The gate merges <link> at 5/5, which goes live (auto-run). Set the keys above when you want real money; until then test mode. no = stop before the merge
```

## Key card (any time a slice needs a key or account)

Not a brief: no ok/no, just steps. One key per card, starting from the screen yskills is on now,
naming the exact permissions (e.g. Checkout Sessions, Customers, Subscriptions: Write; Charges:
Read), with no "if not done yet" branches. Test run 1's combined Stripe card took three rounds.

```
Need: <what for, in user words, e.g. "so people can pay">
1. Open <exact deep link to the settings page>
2. <click path, exact field values>
3. Copy <what> and add it at <exact place>, name <SECRET_NAME>
Then reply "done". Meanwhile: <what the slice keeps building>
```

## Every thread brief starts with

```
Literal mode: yskills' words are orders, done as said. No "yes, but", no offers, no alternatives
when they ask for one thing; impossible or unsafe = one plain line, then the nearest thing done.
Shortest reply. No extra subagents, research, screenshots or re-reads. Models as in
docs/WORKFLOW.md (Models). Never repeat an answer another thread already gave.
Context (long threads: builds, test runs, renders, fetches; 1M tokens is the most a thread gets):
1. Heavy steps run in `Agent` sub-workers that return a short summary and file paths.
2. Logs are tailed (`tail -n 30`, `grep` for errors), never printed whole.
3. Open only reduced images (about 1000 px wide), one at a time, to chase a named flaw.
4. Hand off at a milestone, never mid-step: at the context guard's warning finish the step, write the handoff file, stop;
   never start a new unit past it (`global/context-guard.mjs`). Keep the handoff and saved artefacts
   current at every milestone so a successor thread on the same branch and PR loses nothing.
5. One task per thread; a flaw in shared code is fixed once, by its owner, and the others merge it.
```

## A figure brief (any 3D character)

Follows [`docs/character-workflow.md`](../../../docs/character-workflow.md): it names the
reference picture, the diagnosis list, the build order and the comparison sheet as the only way
to show yskills the result.

The context rules sit in the block above, so every brief of every role carries them. A figure
brief adds the figure paths: [`docs/character-workflow.md`](../../../docs/character-workflow.md),
Context budget (patches folder, `characters/<slug>/HANDOFF.md`, "<figure> figure 2").
