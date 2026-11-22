# Walk and crowd feel: numbers from shipped games and research (2026-11-22)

From the vacation-game reverse-engineering study (Game Designer thread, 2026-11-22); full report with every source line:
vacation-game project files `research/reverse-engineering.md` (German) and `research/re/*.md` (English appendices).
Techniques and numbers only, never another game's code or assets. Tags: **V** primary source read (engine source,
developer's own words, paper), **C** secondary, **U** our choice, not yet measured. Starting values; a playtest tunes them.
Living-world items (reaction ladder, sound from sources, spring bones) stay in [`living-world.md`](living-world.md).

## First-person walk

1. **Sound before camera** (V): Half-Life 2 has no camera bob at all and sells walking through footsteps. A walk with
   no step sound reads as gliding, whatever the camera does.
2. **Steps by distance walked, not by a clock** (V, Unity Standard Assets, Doom 3): one step per ~0.72 m at 1.4 m/s
   (step length L = 0.45 + 0.2·v [U]); the first step plays on the first frame of movement (V, Half-Life SDK); phase 0 on stop.
3. **Footstep set** (V/C): a table per surface with its own volume (HL: walk 0.2, run 0.5), left/right pools, 6 to 8
   samples per surface, never the last 3 again, pitch ±4 %, volume ±2 dB [U]; mixed under the ambience bed
   (Firewatch's audio lead: "when in doubt, turn down the footsteps").
4. **Decel never shorter than accel** (V, Source SDK friction): accel 350 to 450 ms, decel 400 to 500 ms
   (exponential, tau ~150 ms, short tail) [U from Source's 100 ms / ~400 ms]. A stop faster than the start feels like a wall.
5. **Bob shape** (V, Doom 3): one |sin| bump per step with the trough at foot strike; 1.2 cm peak-to-peak at 1.4 m/s,
   scaled by speed; lateral 0.6 cm at half the step rate (2:1, V Unity); roll ±0.25° flipping per foot; stop settle
   0.6 cm down in 150 ms, back in 300 ms; step-up smoothing 200 ms. Real heads move 3 to 4.4 cm, but gaze
   stabilisation means the seen picture moves far less (C, Hirasaki 1999), so a third or less. Unity's 10 cm is too big.
6. **One motion source** (V, Game Accessibility Guidelines): bob, roll and settle all from the step phase, behind one
   "Camera motion" slider 0 to 150 % (0 = off; the OS reduced-motion flag sets 0). Shipped pattern is on by default with
   a slider (Xbox XAG 117, ESO, Cyberpunk); measured Firewatch and Ethan Carter footage moves under 1 % of screen height.
7. **Speed** (C, Bohannon 1997): comfortable walk 1.3 to 1.4 m/s, cadence ~1.9 Hz; a hold-to-hurry to ~2.0 m/s with a
   ~1.5 s ramp, named in the hints (The Chinese Room: a hidden sprint made "too slow" the top review complaint).
8. **FOV** (C): Firewatch 55° vertical, Unity 60°; wider adds peripheral flow and the sliding feel (baseline row 4).

## Crowds that keep their distance

1. **Avoid on time to collision** (V, Karamouzas 2014): react only when τ < 3 s (sparse) to ~1.5 s (dense) AND the
   predicted closest pass < 1 m (C, Olivier 2012), after a 0.35 s delay; speed changes over 0.5 s (V, Moussaïd 2009).
2. **Pick a side once** (V, Moussaïd 2009): head-on means lateral offset < 0.25 m; choose a side (cultural bias, about
   p 0.7 [U]) and lock it until passed; slow 15 to 30 % only then. Distance-only avoidance jitters.
3. **Personal space** (C, Sorokowska 2017): personal 0.92 m, social 1.35 m; walkers keep an ellipse of ~1.2 m ahead and
   0.6 m beside the camera; an approaching NPC stops at 1.1 to 1.3 m, never under 0.9 m, and comes in 30 to 45° off
   the player's heading [U], so a face never fills the screen.
4. **Gesture only when standing** (C, Hitman: Absolution crowd talk): Idle -> PendingWalk (fade the gesture out
   0.2 to 0.3 s) -> Walk. Turn cap 180°/s walking; a change over 120° stops and pivots [U]. Clip rate = speed / clip
   speed, clamped 0.8 to 1.2, else switch clip (C, Unreal distance matching).
5. **Glance, not stare** (V, Fotios 2018): pedestrians fixate others at ~15 m for ~500 ms; one in three walkers glances
   0.4 to 0.6 s at 8 to 15 m, then looks ahead.
6. **Rich only near** (V, AC Unity talk report): full social behaviour inside 12 m for at most 40 agents; beyond,
   lane followers with push-out only. Special NPCs "possess" a crowd agent from a small pool (C, Hitman).
7. **Engine defaults to start from** (V, Recast/Detour): horizon 2.5 s, neighbour range ~6 m, 6 to 8 neighbours,
   overlap push-out 70 % per step; accel cap 2 to 3 m/s² at walking pace [U].
8. **Speed spread** (C): N(1.25, 0.2) m/s in open halls, N(0.75, 0.15) in a market aisle.

## Cheap stable look (low-res, dither, fog)

1. **Dither follows the camera** (V, Lucas Pope, Obra Dinn devlog): `offset = screenSize * rotation / fov`, snapped to
   pixels; 128x128 blue noise survives scaling and video compression better than 8x8 Bayer; threshold in the last pass only;
   360 lines is the floor (640x360 was too coarse, 800x450 shipped).
2. **Fog colour from a gradient by radial distance** (C, Firewatch talk report and recreation): `length(viewPos)`, not
   depth, or the gradient slides when you turn; far stop = sky horizon colour; bright pixels punch through
   (`fog *= 1 - luminance/10`, V ATI ToyShop).
3. **Pixel size is an accessibility option** (V, A Short Hike: players reported nausea); no MSAA on the small target.

## Crowd sound

Three tiers (V, Prototype's sound director): a distant bed, midground group walla, one-shots; density by two walla
layers (mono small group at its centroid, stereo large crowd, the second from ~10 people), never by volume alone; far
crowds low-passed; zone crossfades by position.

Not checked: GDC Vault videos (only abstracts and reports); no developer walk or bob numbers for Firewatch, Edith Finch,
Gone Home or Season; footstep dB and cent values from tutorials; side bias in Vietnam unmeasured.
