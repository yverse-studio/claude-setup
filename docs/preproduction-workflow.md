# Pre-production workflow for a story game (concept to production)

The fixed order before anything is modelled, rendered or animated. Every story or game project follows it, and
every lesson that costs a re-do is written back here. Research 2026-11-12 (sources at the end); evidence from
GameDev (CompanyXY) is generic here, product content stays in the project.

## The order (each stage ends with a lock; nothing later starts on an unlocked stage)

| # | Stage | Output (one file each) | Lock |
|---|---|---|---|
| 0 | Concept | one page: logline, tone, content line, hook, number of leads, device | owner card |
| 1 | Cast bible | one sheet per character from [`templates/character-bible.md`](templates/character-bible.md) | owner approves each sheet |
| 2 | Look bible (visual dev) | per character: base body, silhouette numbers, palette, signature outfit, expression list; one style page for the game | owner approves the bare body and the look, as in [`character-workflow.md`](character-workflow.md) |
| 3 | World bible | places with a room list, calendar, rules of the place, recurring props | owner card |
| 4 | Season outline | one line per chapter: goal, ladder rung, who is on page, flags set, sets needed | planner plan, owner card for the arc |
| 5 | Pilot plan | one chapter plan: beats, shots, refs, asset needs, derived from 1 to 4 | plan gate ([`game-pipeline.md`](game-pipeline.md)) |
| 6 | Vertical slice | the pilot built end to end through the real pipeline | release gate of the pilot |
| 7 | Production waves | later chapters repeat the frozen recipe | per-chapter gate |

Stages 1 to 4 are text and sheets, cheap and fast to change. From stage 5 on every change costs renders, so the
owner's taste calls (body, look, who is in the cast) are asked before it, never guessed.

## What the pros do (and what we take)

| Source | What they do | We take |
|---|---|---|
| TV series bible (Final Draft, StudioBinder, No Film School) | Logline, tone, world, character breakdowns, pilot synopsis, season arc; the bible starts as the pitch and becomes the room's archive | The stage order 0 to 4; the bible stays alive and every writer reads it. Fields per character: want vs need, contradiction, voice, red lines |
| Series bible length (Final Draft, Pipeline Artists) | Under-built and over-built both fail; a 40+ page character bible is too much for a pitch | One page per character, not a novel; depth only where the plot uses it |
| Visual novel production (VisDev model sheets, sprite guides) | Lock silhouette, palette, finish and expression list before painting; one base design times 8 to 30 expressions times outfits sizes the asset list | Stage 2: the look bible fixes body, silhouette and the expression and outfit list, so the asset list is computed, not discovered |
| Asset list as production bible (game pre-production sources) | The asset list is the output of planning; scripts in one place, assets in a table, code in the engine | `needs.md` is generated from stages 1 to 5; builders get only the misses |
| Japanese light novel to anime (Mipon, ANN interviews) | The illustrator makes the basic character designs from the manuscript; series composition fixes the season frame and scripts; the character designer adapts the art for animation | Design follows the written cast sheet; one person owns the season frame (the Planner); designs are adapted, not reinvented per scene |
| Being a DIK and the harem genre | Several leads with points per route, early hooks, choices that move one lead and cost another | Already in the `storyteller` skill (`01` to `05`); the search did not find a primary source on how its makers plan, so nothing is claimed beyond that skill |

## Our run against that order (CompanyXY, from PLAN.json, `plans/cast-und-routen.md`, `outfits/*.md`, the lessons of 2026-11-12)

| Stage | What we had | Gap | Cost |
|---|---|---|---|
| 0 Concept | goal and content line in memory and `TASTE.md` | none | |
| 1 Cast | `cast-und-routen.md`: name, age, archetype, role, routes, relations | no body type, height, measurements, hair or eye colour as numbers, no voice and never-list in one place | looks were argued per round |
| 2 Look | per-character outfit files and face specs came after the first models; bases were decided on 11-11 and 11-12, months of rounds in | body before outfit was not written down; one character passed three gates on a body nobody had approved; ten rounds on one garment; the "missing pieces" list grew while building | most of the 19 rows in `LESSONS-2026-11-12.md` |
| 3 World | stock room photos, a story index, 49 sets listed late | room list was derived per chapter, not locked up front | sets rebuilt per chapter |
| 4 Season | 13-chapter list, ladder, 169 flags | flags and sets per chapter exist; look and outfit needs per chapter did not feed the asset list | late FEHLT list |
| 5 Pilot | `KAPITEL-PLAN-c01-v3.md` with a plan gate | good, but it was written after builds had started | re-plan |
| 6 Slice | chapter 1 is the pilot | works as intended once stages 1 and 2 are locked first | |

## Concrete improvements (standing rules)

1. **Cast sheet before any model.** A thread may not start a body, face or outfit job for a character that has no
   approved sheet from the template. The sheet holds the numbers the gate's silhouette row checks.
2. **Look lock card.** One card per character: base, preset, silhouette numbers, signature outfit, palette. The owner
   answers once; the answer is copied into the sheet and `PLAN.json`. Body first, then outfits (`character-workflow.md`).
3. **Compute the asset list.** `needs.md` and the wardrobe "missing" list are derived from the cast sheets, the season
   outline and the chapter plans before the first build, not collected while building.
4. **Change log after the freeze.** After a stage is locked, a change is one line in that stage's file (what, why,
   who decided, which assets it reopens). No silent edits.
5. **Vertical slice first.** Chapter 1 runs through every pipeline step before chapters 2 to 13 are planned in detail.
6. **Lessons feed the plan.** Every lesson line names its home in the same turn: a rule goes to this page or the
   playbook of the role, a number to the sheet, a tool gap to `PLAN.json`. The standing plan is `PLAN.json` plus this order.

## Sources (read 2026-11-12, WebSearch snippets only, not full pages)

- Final Draft: <https://www.finaldraft.com/blog/10-easy-steps-to-developing-your-tv-show-bible>
- StudioBinder: <https://www.studiobinder.com/blog/what-is-a-show-bible/>
- No Film School template: <https://nofilmschool.com/show-bible-template>
- Pipeline Artists, series bible length: <https://pipelineartists.com/can-we-all-calm-down-with-the-series-bible/>
- VN character sheet and sprite scope: <https://www.bookwriter.vip/vn-character-sheet-designer>
- VisDev model sheets: <https://animation.binus.ac.id/?p=5101>
- VN development guide: <https://www.twoandahalfstudios.com/2020/02/the-beginners-guide-to-visual-novel-development>
- Light novel to anime staff roles: <https://animenewsnetwork.com/interview/2021-12-22/the-staff-of-the-world-finest-assassin/.180834>, <https://mipon.org/wandering-witch-interview/>

Not checked: Being a DIK's own production process (no primary source found), Kadokawa's internal plot meetings (no
source found), full pages behind every link (snippets only).
