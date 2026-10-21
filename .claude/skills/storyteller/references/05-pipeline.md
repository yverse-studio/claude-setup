# 05 · The generation pipeline (what's SOTA in 2026 and what we take)

Research 2026-10-17 (sources in `sources.md`). Techniques ranked by what works in practice for chapter JSON written by an LLM:

1. **Plan → draft → revise, hierarchical** (Re3 / DOC lineage, Dramatron prompt chaining; R2-Write 2026 for the reflect-and-revise step). Outline first, draft each beat with the outline and state in the prompt, then a revision pass. Never one-shot a chapter.
2. **Bible files as the single source of truth**, injected as a slice per beat (NstAgent 2026 keeps structured state over 10k to 100k words this way; NovelAI lorebook and SillyTavern World Info are the same pattern in products).
3. **State tracking with a critic** (SCORE 2025): after each chapter a state delta is extracted and checked against the bible. The drafter never writes state directly.
4. **LLM-as-judge with a fixed rubric, three runs averaged** (LLM Review 2026; Kim and Oh 2025 found LLM judges more consistent than humans on creative rubrics, weaker on culture-specific taste, which is why yskills stays the taste gate).
5. **Style by exemplars plus short rules** (register-analysis prompting 2025, SynDec 2025; personal-style work at EMNLP 2025 shows rules alone fail). Hence `04-style-presets.md`.
6. **Storylets with qualities** (Emily Short, Failbetter): content as short passages unlocked by state, not by position. The game's chapter `when` block with `bondMin`, `favour`, `hours` already is a storylet condition; the harem layer (`06`) adds cross-heroine conditions.
7. **Revisit-safe state** (Ink / Yarn): state changes on transitions or guarded by a seen flag. The chapter format already sets flags only in answers, read only after set (tests enforce it).

## Files (the bible), one home each, under `content/story/bible/` in the repo (proposal)

- `world.md`: the company, the floors, the spots (ceo.desk … home.bedroom), the calendar (launch, Friday bar, the outing), rules of the place.
- `cast/<slug>.md`: one sheet per woman (`06` has the first draft of all twelve): archetype, why him, what she hides, owned scene type, jealousy tell, voice (five tics, three lines she would never say), body sheet for the explicit presets (plain words, real comparisons), her hard "no", arc stage, what she knows.
- `relations.md`: per woman the bond level (1 to 10 = chapter), route lock, flags that matter across stories (`mira.trio`, `*.du`), what each knows about the others.
- `styles/<preset>.md`: the seven presets of `04`.
- `state.json` (generated): the running state after each merged chapter, written by the critic step.

The game's roster (`characters/roster.json`) and `figures-ahead.json` stay the mechanical truth (colours, bases, hello lines); the cast sheet links to them and must not contradict them. The reader found four hair/eye mismatches between roster and chapter text (Hinata, Rias, Rangiku, Nami); the cast sheet fixes which is right and a test should pin it.

## The run (one chapter)

1. **Plan** (Story Planner, Opus): chapter goal, rung from the ladder, heroines on page, comedic engine, preset, intended state delta, 2 to 3 choices at the turn. Output 15 lines. Check against `03` numbers (one rung, no rival sharing an owned scene, misunderstanding age).
2. **Draft** (Story Writer, Sonnet by default, Opus for heat 4 to 5 and finales): the beat JSON in the game format (`say`/`goto`/`move`/`choice`/`event`, figure lines ≤ 160 chars, emotions from the allowed list, `bond` and `remember` events, `end` last). Prompt = plan + cast slices for those on page + relations slice + preset + the two exemplar beats + the banned list.
3. **Critique** (Story Editor, Sonnet, three runs, Opus verdict on a finale): rubric below, 0 to 5 each; a 3 or lower on any row sends it back with the failing beat ids.
4. **State** (Haiku): extract the delta (rung reached, flags set, facts remembered, what each woman now knows) and diff it against the plan; mismatch goes back to the writer.
5. **Lint** (script, `content/story/check.mjs` plus a new `story-lint.mjs`): schema, chars, AI tells, heat-level words outside the private range, "Sie/du" consistency per relation state.
6. **Commit**: one chapter per PR, screenshots of the chapter in the game at 390 and 1440, the gate as for any PR.

## Critic rubric (score 0 to 5, fail at ≤ 3)

| Row | Question |
|---|---|
| Rung | Does the chapter climb exactly one ladder rung, and in the last third? |
| Voice | Would her lines pass a blind test against her cast sheet? Does she say nothing on her never-list? |
| Knowledge | Does anyone know something their relations slice says they don't? |
| Engine | Is there one laugh that comes from character, and does any misunderstanding have a real cause? |
| Body | Are positions tracked, is there one private thought per present character, is the header present? |
| Heat | Is the heat level inside the chapter's band, with explicit beats only in the private range? |
| Choice | Does each answer change state or route, not just wording, and does the path check hold? |
| Tells | Zero banned tells. |
| Caption | Does every beat stand alone under an animated scene (one moment, 2 to 4 sentences)? |

## Banned tells (lint list)

"nicht nur … sondern auch" / "not X but Y" and negative parallelism · hypophora (a question the narrator answers) · em dash chains (soft warning, max 1 per 30 beats) · symmetric triads · a fact restated across three sentences · even paragraph cadence (vary beat lengths 1 to 4 sentences) · "a testament to", "delve", "tapestry", "ein Hauch von" as filler · blushes named instead of shown · the narrator explaining a joke · ending a beat or scene on a question · adjective strings of three or more.

## Choices that matter (Potter via Short, Being a DIK)

Each answer moves one woman's score and may cost another's (Being a DIK: points add to one, subtract from a rival). Two answers that converge must say so in the consequence text. A choice is a fork only when the plan names what it forks; otherwise it is flavour and scores 0 to 1. Route lock on the chapter 10 night (`goto home.bedroom`); rival romance storylets close, rival friendship storylets stay open.
