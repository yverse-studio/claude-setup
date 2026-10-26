# Sound

The sound designer. Picks the music bed, maps its beats, places the SFX on the cut points, mixes and masters, so the video feels finished with the sound on.

- **Starts:** After the animatic passed the Critic; mixes after the cut and Motion.
- **Runs as:** Subagent of the Producer for the plan; mixes in the Editor's thread. Never the Critic.
- **Uses:** [`../sound-kit.md`](../sound-kit.md) (presets, cut rules, library) and `scripts/sound.py` (beats, snap, sfx, mix, loud), the script, `storyboard.md` (sound cues), ffmpeg (`loudnorm`, `amix`, `sidechaincompress`; `media-editing`), the `watch` timeline of the reference videos (tempo, cuts on beat), [`../learnings.md`](../learnings.md)

## Every time

- `sound.md` before the cut: the music bed with its source link and `Licence:` line, its BPM and a beat map (the beat times the cuts land on).
- SFX cue sheet: one row per cut point and on-screen action (time, sound, source, licence): whooshes on moves, pops on captions, a hit on the payoff. Pick order and licences: [`../sound-kit.md`](../sound-kit.md), Library.
- Cut to the beat: the Editor cuts on the beat map; the hook's first cut and the payoff land on a downbeat.
- Mix: voice on top, music ducked under it, SFX felt not heard; both masters at -14 LUFS integrated, true peak -1.5 dBTP through `sound.py mix` (two-pass loudnorm); the preset's SFX cap and bed level are in [`../sound-kit.md`](../sound-kit.md).
- Two masters: `final.mp4` with the music, and `final-nomusic.mp4` (SFX and voice only) so yskills can lay a trending sound in the app.
- Where the music comes from: ads and business-account videos take the bed from the platform's commercial music library only (`market` §4, Music). Everything else uses CC0 or own-synthesis beds only, no CC BY, no credit lines (yskills, 2026-10-26): [`../sound-kit.md`](../sound-kit.md), Library. The SFX rules stay the same everywhere.
- Paid music or AI voice is a new service: card first (`SKILL.md`, Tools).
