# 04 · Voice and style presets (switchable per chapter)

A preset holds register only: words, rhythm, camera, what's on page. Facts come from the bible, never from a preset. Switch at chapter level, never mid-beat. Each preset = rules (5 to 10 lines) + 2 to 3 exemplar beats + the banned-tells list (`05-pipeline.md`). This is what the research calls out as the working method: exemplars plus short rules beat rules alone.

Common to all presets (STORY-BRIEF): `[Ort, Datum, Uhrzeit]` header per scene · close POV locked to one head · body language woven into dialogue · one italic private thought per character per scene · ambient noise in public scenes, silence in private ones · positions tracked through movement · never end on a question · varied sentence lengths · German first in the game, English second.

## Preset A · "Kadokawa cute" (default for chapters 1 to 7)

Light, warm, quick. Comedy from character, never from cruelty. Dialogue-led, short narrator beats, one physical detail per beat (what her hands do). Blushes are shown through action (she reorganises the pens), never named. Heat 0 to 2. Exemplar beat: *Sie stellt die zweite Tasse neben deine, ohne zu fragen, und dreht den Henkel nach rechts, so wie deine steht. „Ist mir aufgefallen", sagt sie zur Kaffeemaschine.*

## Preset B · "Slow-burn literary" (tension chapters 8 to 9)

Longer narrator beats, denser setting, scent layers, the Sanderson-level room. Subtext over text; the honest line lands because everything before it was withheld. Heat 2 to 3. Exemplar: *Der Regen hat den Innenhof in eine Platte aus Zinn verwandelt. Sie steht so nah, dass du das Shampoo riechst, Birne und etwas Herberes darunter, und keiner von euch macht den letzten halben Meter.*

## Preset C · "Tender" (first nights, mornings after)

Explicit and slow. Plain anatomical words, clinical specificity (shape, size compared to something real, texture, response), but the camera stays on faces as much as bodies. Sounds phonetic and soft. Heat 4 to 5. Exemplar in `../mira-kap10-akt.md` beats 1 to 9.

## Preset D · "Filthy" (when the beat is filthy)

Explicit and fast. Shorter beats, dirty talk in her voice (true to her file: the kuudere orders, the gyaru laughs, the tsundere swears), onomatopoeia committed, scents named (musk, sweat, "scharf und süß"), physical responses exact ("die Eier ziehen sich hoch"). Heat 5. No softening, no euphemism, no fade (project rule). Exemplar: `../mira-kap10-akt.md` beats 14 to 18.

## Preset E · "Comedy set piece" (outing, beach, double booking)

Ensemble, four or more on page, fast cuts, running gags, background chatter as a second track. Heat 1 to 2 with one spike (the swimsuit reveal, the shared futon) that the engine undercuts.

## Preset F · "Ad / teaser" (for the page, later)

Second person, present tense, 60 to 120 words, one hook, one image, the device in one line, no spoilers past rung 5, no explicit content (public). Ends on the next beat, not a question.

## Preset H · "Chibi gag" (funny scenes, yskills 2026-10-17)

The harem-anime cutaway: for a gag beat the figures drop into chibi (the game already has chibi figures, `chibi-turnaround.png`, the chibi face shots), the narrator steps back, the joke runs in three beats max (setup, the chibi reaction, the snap back to normal). Exaggerated reactions are allowed only here: steam, sparkle eyes, the sulk cloud, a chibi stomping off. Heat 0. Marked `style: "chibi"` on the beat group, never on a whole chapter; a chapter may hold two chibi cutaways at most, none in the night or in a tender scene. Exemplar: *Mitsuri hört „Tifas Chai", und für drei Sekunden ist sie fünfzig Zentimeter groß, hat Dampf an den Ohren und knetet den Teig, als hätte er sie beleidigt. Dann ist sie wieder groß und sagt: „Ich back nur ein bisschen mehr."* The Narrative Designer maps `style: "chibi"` to the chibi figure set and a fixed camera (`07`).

## Preset G · "Game caption" (the beat files)

Two to four sentences per beat, one moment, present tense, her line as its own beat, her sound as its own beat. No paragraph longer than the screen. Every beat readable alone under an animated scene.

## Bust focus (all presets, yskills 2026-10-18)

The camera loves her breasts, and her ass too: in cute and setpiece presets through glances, accidental touches and clothing moments (03, fan-service ladder); in tender and filthy through detail (weight, shape, how they move, his hands and mouth on them). The titfuck is a recurring scene type: from her night on, each woman has her own version (her line, how she holds them, her sounds) in her private sheet §6, and repeat scenes, pacts and the finale use it. Adults in the present day only.

## Switching

`style: "cute" | "literary" | "tender" | "filthy" | "setpiece" | "ad" | "caption"` on the chapter plan, `"chibi"` on a beat group inside a chapter. The drafter loads the preset file, the critic checks the chapter against the preset's rules and the banned list, the state delta is the same whatever the preset. To restyle a finished chapter: rerun the beat step with the new preset and the same plan and delta.
