# Scene clips, the player and sound for scene games

Moved out of `docs/game-pipeline.md` (M27 step 5): craft know-how for a scene game, loaded on demand by the `storyteller` skill. Scene gate, camera and motion: `docs/two-figure-scenes.md`; cross-game sound pattern: `docs/sound-template.md`.

## Scene clips and the player (2026-10-26, night scenes)

Per slot in `game\art\loops\`: `<slot>_intro.webm` (once), `_loop` (A, POV, seamless), `_B_loop` (B, close-up on the
action, seamless, no `_B_fast`), `_fast` (double tempo, seamless, camera A only), `_finish` (once, last frame = the
still `cg_nacht_kommen_<x>.png`). All VP9 webm 24 fps, frame N = frame 0; tempo stages only through clips, never by
playback speed. Lengths per slot live in the laptop `README.md` (`ANIM_LEN`) and the Ren'Py code reads them:
intro 4-6 s, loop 48 frames (2 s), fast 24 frames (every 2nd frame), finish ~76 frames (burst 1.0 s, then hold).

- Player: auto-advance is a game option, default on (fast after 12 s of loop, finish after 8 s of fast), switchable
  to click-only; a click works in both. A and B switch by hard cut every 4-8 s (1-2 frames, dissolve 0.05 s).
- Dialog and sound live in the game, not in the video: intro lines on top at the beats (look, hands, mouth), none in
  the last second; in loops only short auto lines (6 words at most, every 5-8 s), text low, 30 % height, half
  transparent; no line in the burst, one line in the hold, then the still with normal dialog. The epilogue
  (6-7 s wide angle) is its own still.
- Option "hide the man" per clip, same keys, render time only: `_nm` (penis and hands only) and `_gh` (his body as a
  blue Fresnel shell, alpha 0.2-0.3, penis normal). Material override in the scene, never in the figure file.
- Cut lessons from the reference videos (Jane/Zhu): intro 15-20 s with a static camera; cuts only at position
  changes (17-38 s without a cut, a hard cut plus 1-2 frames of RGB offset); tempo stages 0.4 / 1.2 / 2.3 Hz of
  10-15 s each, burst 2 s at most; a reaction insert of 1.5-2 s (35 mm, two faces) mid-scene; subtitles one line at
  beat borders; finish = burst, hard cut, 6-7 s wide-angle epilogue; clothing as a layer (one script for
  bare/half/dressed).
- Scene gate, camera and motion rules: `claude-setup/docs/two-figure-scenes.md`.

## Sound for scene games (2026-10-26)

Cross-game pattern, event table and muted checks: `claude-setup/docs/sound-template.md`.

Practice for the scene player, general game audio (ambience as the bed, foley synced to motion, ducking, fades):

- **Layers, quiet to loud:** room bed (always on, -13 dBFS peak, 24 s seamless loop, fade 1.5-2 s) < music (0.35 in
  loops, 0.6 fast, 0.8 finish) < breath and voice (loop per phase) < contact foley (the loudest, because it carries
  the motion). Never all at the same level: equal layers read as mud.
- **Sync only what must be synced:** the contact layer is exactly as long as its clip and starts with it (loop 2 s =
  2 strokes, fast 1 s = 2 strokes); breath and room are free loops. A slot without its own file falls back to a
  generic one of the same type, so a new scene is never silent.
- **Stage the intensity** through files, not volume sliders: intro (soft breath), loop, fast (shorter cycle, more
  voice), finish (peak, then pants decaying, one sigh). Cycle length 3.4 s, 2.5 s, 1.5 s, 1.1 s.
- **Duck:** the room drops to 0.55 under voice and returns after; music dips the same way in the player.
- **No repetition tells:** a loop carries 4-6 different takes in random order, never one clip repeated every 2 s.
- **Routes without a player** get the same layers from hooks: room from the location card text, breath and contact
  from the looping clip's name (the game repo's sound hook), a test lane asserts it.
- **Own synthesis first, files second:** `scripts/make_sounds.py` in the game repo (numpy, scipy, ffmpeg) builds rooms
  (noise beds, hum, drips, crowd, waves), breath and vowels (glottal pulse through formants) and contact foley
  (slap, wet click, bubble). Licence: own work, credits file next to the audio. A found file needs CC0 or CC-BY and a
  line in the credits file; paid packs are a purchase, so a card to yskills.
