# Living world on a browser budget (research 2026-11-19)

From the vacation-game study of a 2026 AAA open-world release on its launch day, read through reviews and tech
analyses; report with every link: vacation-game project files `research/gta6-lessons.md` (German). We take
techniques only, never another game's content, names or art. Tags: **V** review of the shipped game read, **C**
secondary source or ex-developer interview, **U** our choice, not yet measured.
Crowd tiers, LOD and budgets stay in [`crowds-and-lod.md`](crowds-and-lod.md); idle minimums in `game-ux` §3.

## What made the world read as alive

- Reaction beats graphics: reviews praise NPCs that react to the player and to each other, with the dialogue
  lines per NPC roughly tripled to quadrupled (C, a developer quoted in the Vice review). Mood differs by district: poorer areas more aggressive (V).
- Reactivity has a cost: one review says it takes some of the arcade feel away; the most repeated complaints are a
  slow opening and missions that fence the player in (V, Destructoid, review roundups).
- Simulation, not pixels, set the frame-rate ceiling: 30 fps on every console because the CPU is the limit (C, Digital
  Foundry via secondary reports).
- Sound comes from things: radios, TVs, car and shop speakers at volumes set by place; each shop fridge hums
  differently; districts get their own reverb (C, interview with the audio lead; V, reviews).
- Soft-tissue and strap motion: the skeleton follows the animation and a few physics bones lag behind from momentum,
  gravity and speed (C, ex-studio animator's explanation, not the studio).
- The phone is an object in the hand (the camera turns to it), with a feed and two-choice text replies (V, Kotaku).
- In an early trailer a far group standing fully still was spotted by fans (C).

## Rules for our games

1. **Reaction ladder per NPC role** [U]: distance stages (ignore, glance, address, follow or block, give up or
   escalate), each with its own line pool drawn by the seeded RNG without repeats; at least 3 lines per stage, 8 or
   more for a role the player meets often. The ladder is a pure module with a unit test per stage.
2. **Mood lives in the zone** [U]: aggression, loudness and density are zone values the figures read, not per-figure
   numbers.
3. **Scenario points** [U]: everyday jobs (phone call, eating, counting money, smoking, arguing) are markers placed in
   the level; any fitting figure takes one. At least one NPC pair per scene busy with each other, not the player.
4. **Sound from sources** [U]: music and hums from placed Web Audio `PannerNode`s (HRTF, distance roll-off, low-pass
   behind walls), one `ConvolverNode` per zone; a global ambience loop is a bed, never the only layer.
5. **Secondary motion as a spring layer after the mixer** [U]: Verlet chain per strap, braid or soft-tissue bone,
   near tier only; props (lanterns, tarps, hanging goods) sway in the vertex shader with no bones. three-vrm's
   spring bones work the same way (stiffness, gravity, drag, colliders; tune per model scale, vrm.dev). No
   benchmark found: spike 12 figures first.
6. **Nothing in view stands still** [U]: far instanced figures get breath and sway in the vertex shader by instance
   phase.
7. **Diegetic UI** [U]: when the world has a phone, calculator or sign, the interface lives on it, its text drawn at
   full resolution.
8. **Cheap wet streets** [U]: mirror only the light sources (flipped, squashed billboards under the ground inside a
   puddle mask, UV ripple when raining); a three.js `Reflector` renders the scene again, so only where a scene needs
   true mirroring. Figures in rain: darker albedo, lower roughness.
9. **Simulation is the budget** [U]: AI and reaction ticks at fixed rates by distance (`crowds-and-lod.md`), never per
   frame; a reaction stops the player at most 1.5 s unless blocking is the mechanic.
10. **Skip on the web**: strand hair, ray-traced GI and reflections, cloth simulation, per-district weather,
    motion-matching locomotion. Cards plus 1-2 spring bones, baked vertex light, light-pool decals and one weather
    event per level carry it.

Not checked: the Digital Foundry video itself (secondary reports only); cloth-simulation claims conflict; the soft-tissue
method is an informed guess, not a studio statement.

## Sources (read 2026-11-19)

- Vice review: https://www.vice.com/en/article/gta-6-review/
- Destructoid review: https://www.destructoid.com/reviews/grand-theft-auto-6-review/
- Kotaku review (phone): https://kotaku.com/grand-theft-auto-6-the-kotaku-review-2000757842
- Review roundup (complaints): https://www.thenationalnews.com/arts-culture/pop-culture/2026/11/18/gta-6-reviews-metacritic/
- Digital Foundry via PureXbox (30 fps, CPU limit): https://www.purexbox.com/news/2026/11/three-big-takeaways-from-digital-foundrys-gta-6-analysis-for-xbox-series-xs
- Audio lead interview via mezha: https://mezha.net/eng/news/mezha-0cff8db9d208b3fee1b165ca_gta_6_refrigerators
- Ex-studio animator on soft-tissue bones (Dexerto): https://www.dexerto.com/gta/former-rockstar-animator-reveals-how-gta-6s-jiggle-physics-work-3300686/
- Still far group in a trailer (Sportskeeda): https://www.sportskeeda.com/gta/15-unfinished-details-gta-6-trailers-screenshots-probably-didn-t-notice
- Spring-bone parameters and scale: https://vrm.dev/en/api/spring/spring_and_scaling
