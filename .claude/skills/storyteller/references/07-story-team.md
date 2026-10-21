# 07 · The Story team (a standing team in the company, roles and models)

yskills (2026-10-17): the story planner is part of a new team, like a real company, with a story writer and so on; later it helps the game and the ads for the page. Below: how narrative teams are staffed in the industry, then our version per `docs/WORKFLOW.md` (models table) and the operator skill (one thread per PR, playbooks in `roles/`).

## How real studios do it

Game narrative (AAA and VN studios, Being a DIK is a two-person team doing all of it): **Narrative Director** (the bible, the endgame contract, taste), **Narrative Designer** (systems: flags, routes, affection meters, storylet conditions), **Writer** (prose and dialogue, per character or per chapter), **Editor / Script Doctor** (continuity, voice, cuts), **Localisation** (de/en), **Marketing copy** (the store page, trailers, social posts, written by the same bible so the voice matches). Light-novel houses (Kadokawa Sneaker Bunko) run author + editor + illustrator, the editor owning pacing and the market read. The SOTA LLM pipelines (`05`) map onto the same split: planner, drafter, critic, state keeper.

## Our Story team (threads, not people; titles "Role · what")

| Role | Does | Model (WORKFLOW.md tier) | Playbook home |
|---|---|---|---|
| **Story Director** (project manager of the team) | owns the bible, the endgame contract, the archetype map, the heat bands, the order of PRs; posts `Done:` lines and cards; the only one who talks taste with yskills | Opus (plan of the whole story once with Fable, the three Fable cases) | `operator/roles/story-director.md` (new) |
| **Story Planner** | one chapter or storylet plan (15 lines) from the ladder and the engines; checks the pacing numbers | Opus | `story-planner.md` |
| **Story Writer** | the beat JSON in preset, one chapter per PR; cast and relation slices in the prompt | Sonnet; Opus for heat 4 to 5, finales and pacts | `story-writer.md` |
| **Spicy Writer** (yskills 2026-10-17: "our spicy story writer, very explicit like it is now") | the nights, the pacts, the mornings after and the sexting beats, presets tender and filthy only, private side behind the 18+ gate; takes the plan and the cast body sheets, hands back beats the Editor checks for voice and continuity like any other; never softens, never fades (STORY-BRIEF) | Opus (Fable only when yskills names it) | `story-writer.md` (Spicy section) |
| **Story Editor** (critic) | the rubric, three runs, failing beat ids back to the writer; Sie/du and knowledge continuity | Sonnet; Opus verdict on finales and round 2 | `story-editor.md` |
| **Continuity** (state keeper) | state delta, relations update, cast-sheet facts, path check | Haiku | inside `story-editor.md` |
| **Narrative Designer** | storylet conditions, flags, route locks, affection thresholds, the JSON schema and `story-lint.mjs`; the bridge to the game's `story.js` and later the 3D scene triggers | Sonnet, Opus subagent before committing to a schema | `story-designer.md` |
| **Copywriter** (ads and the page) | preset "ad": store page, teaser posts, trailer captions, the character cards for the site; public, heat 0 to 1, from the same bible | Sonnet | `operator/roles/marketer.md` gets a "Story copy" section |
| **Localiser** | en from de, voice kept per cast sheet; `i18n-sync` | Haiku, Sonnet for dialogue | `story-writer.md` (Localisation) |
| Tester / gate | as every PR: `check.mjs`, lint, screenshots of the chapter in the game, 5/5 | Sonnet | existing `tester.md`, `gate.md` |

Rules carried over: one thread per PR, closed when done; Fable never for drafting or review; the Director is the one voice to yskills; Designer threads vote galleries stay for visuals (a scene storyboard is a Designer job, not Story).

## How the team plugs into the game and the ads later

- **Chibi gags**: the Narrative Designer maps `style: "chibi"` beat groups to the chibi figure set and a fixed gag camera; the Writer writes them (preset H), the Spicy Writer never does.
- **Game**: every beat already captions an animated scene (STORY-BRIEF Ergänzung). The Narrative Designer owns the mapping beat → pose/scene tag (`move`, `tag` keys exist) so the scene kit (PR 91) consumes the same files. When the 3D scenes come (Being a DIK style), the Writer adds `tag` per beat and the Designer keeps the pose catalogue (`refs/private/POSE-CATALOG.md`) in sync.
- **Ads**: the Copywriter writes from `cast/<slug>.md` and preset "ad", never from a chapter, so nothing private leaks; the Director approves; the Marketer thread ships it (`market` skill). A character teaser = her device line, her owned scene, one image from the vote gallery.
- **New harem story** (another product): copy `01` to `05` as is, write a new `06` (device, lineup, endgame contract, archetype map), new bible, same team.

## First staffing (when yskills says go)

Story Director thread opens with the archetype map card (`06` B) and the PR order (`06` E); first PR = cast sheets. Budget per chapter at the tiers above: one Opus plan, one Sonnet draft, three Sonnet critic runs, one Haiku state pass; a finale doubles the Opus share.
