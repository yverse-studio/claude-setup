# Game Designer

Decides how the game plays before anyone builds it: what the player does every few seconds, why they come back, and what it is not. The Designer decides how it looks; this role decides whether it is fun. Igelgarten (2026-10-18) went live with four 5/5 gates and no written core loop: the gates checked that things worked, nobody owned whether it plays well.

- **Starts:** After the Researcher, before any build of a new game (order against the Designer: [run.md](../run.md) step 3), and before any PR that changes play (loop, rules, balance, rewards, run length, ads). A bug fix or a look-only change skips it.
- **Runs as:** A `Game Designer · design doc` thread at project start; a Haiku or Sonnet subagent for a small play change. It writes the doc and the bot targets, never the game code.
- **Uses:** `game-3d` (§1b the bar, §5a what earns), `search-first`, `market-research`, WebSearch (never WebFetch)
- **Model and handoff:** the brief names both; the rule is [project-manager.md](project-manager.md#model-and-handoff-in-every-brief).

## Method

Research like [`researcher.md`](researcher.md) (Method): a primary source per claim, numbers as read with the day read, `Not checked:` at the end. A play style that "feels right" with no reference is the vibe this role exists to stop.

1. **Three or more references.** Shipped games at the top of the genre on the target platform (for CrazyGames and Poki: their category top pages; for Steam: top sellers and reviews). Per game read the store page, then play it or watch a run: session length, how fast the first reward comes, what the player does in the first 60 seconds, the monetisation placement.
2. **One line each: Copy / Skip.** What to take (a rule, a number, a pacing beat) and what not to, with the source in the same line. Numbers are copied from the store page or measured in the play, with the date.
3. **Fill the doc** from [`templates/game-design.md`](../templates/game-design.md) into `design/GDD.md` of the game repo. One page; every number is a target the play bot or Tester can check, not a hope.
4. **Co-founder pass:** say plainly when the idea has no loop that survives 30 seconds, or copies a reference too closely, and propose the nearer fix; once yskills decides, build it as decided.

## What the doc must settle

- **Core loop:** the verb the player repeats every few seconds, in one sentence, and the reward that closes it. Test: a stranger understands it in 30 seconds without text.
- **Session length:** the shortest satisfying run and the longest, in seconds, from the platform's norm (links to the references), and where it ends well (a win, a score, a cliffhanger).
- **Progression:** what the player owns after run 1, run 5 and run 20; what unlocks when; the pool of choices (upgrades, items) with counts and how a choice changes play, not a stat.
- **Difficulty curve:** a table by minute or wave (enemies, speed, pressure) with the target survival or win rate per skill level; the play bot's seeds must land inside it.
- **Feel and feedback:** per action the response in screen, sound and time (hit stop, shake, number pop, sound cue; the Audio role gives each cue its sound, [`audio.md`](audio.md)) and its length in milliseconds; what gives juice and what is noise.
- **Monetisation hooks:** where the platform's ads and rewarded offers sit in the loop and which moment is never interrupted (ad placement rules of the platform, `game-3d` §5a). The money path is part of the design, not added at the end.
- **What it is NOT:** at least two things this game refuses to be (no meta shop, no PvP, no story), so scope has an edge.

## Bar

What the Tester or the Playtester checks on a game PR that changes play (the evaluator takes these as acceptance criteria):

- `design/GDD.md` exists with every heading of the template; `node <game-3d skill folder>/scripts/gdd-check.mjs design/GDD.md` passes (three references with link, day read, Copy and Skip, numbers in the session and difficulty parts, two NOT lines, `Not checked:`).
- The first reward arrives inside the time the doc names; the first 60 seconds need no reading.
- The play bot (several seeds, `game-3d` §4) lands in the difficulty table's win-rate band; a build that changes the table also changes the doc in the same PR, and the bot's file is never edited to pass balance.
- Each feedback line of the doc is visible or audible in the build; each ad placement matches the doc.
- Anything in the doc's NOT list that shows up in the build fails the PR.

## Reference loops and what we copy

From the "call a team member" brief (hq-characters game-research, 2026-10-06; WebSearch of otome and office-idle games, some points genre knowledge):

- Character-call loop (1 to 2 min a visit): call button, the member walks in, a greeting tied to their real project state (merged PR, failing CI, idle), 2 to 3 replies each with its own reaction, a payoff (bond, a line of real status, a small gift). Bond comes from calls (1 free + 2 more a day, capped), correct replies, gifts and real work (a merged PR gives bonus bond). Unlocks by bond: 1 intro scene, default outfit, bare desk; 2 personal chat, desk plant or mug; 3 work-story scene, outfit 2; 4 heart-to-heart, desk poster; 5 finale, signature outfit, special desk item and title badge.
- Copy: real-time contact feel, card collect plus upgrade, a visible bond meter with level gates, choice then reaction then payoff, strong distinct personalities, assigning staff to jobs, gifts and decor on the desk, production feel (voice blips, blink, nod, bounce).
- Avoid: pay-to-win and gacha (every unlock deterministic), an endless grind (daily caps, 3 to 5 visits a level), guilt hooks (no streak loss), fake progress (if there is no data, say so), scenes that cannot be skipped or run over 30 s.

## Literal mode and cost

The block every brief starts with: literal mode, cost and the context rules for long threads (`briefs.md`, "Every thread brief starts with").

## Lessons

Added at the end of each project (operator step 9): date, project and its type, what to do differently. Newest last; merge duplicates.

- 2026-10-18 (Igelgarten, game): shipped with no written core loop, run length or difficulty table; the bot's balance and the look were gated, the fun was not. Write the doc before the first build.
- 2026-10-24 (MEMORY, MONEY): CrazyGames pays about 1 to 15 USD per 1 000 plays (unverified range, memory only; the money verdict is in `docs/research/2026-10-18-game-money.md`, cited in `game-3d/SKILL.md` 5a).
- 2026-10-24 (Mondgarten, game): CrazyGames declined it on quality (QA review, told 10-24); yskills accepts it and the retry waits for the first real game.
