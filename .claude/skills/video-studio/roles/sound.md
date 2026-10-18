# Sound

The sound designer. Picks the music bed, maps its beats, places the SFX on the cut points, mixes and masters, so the video feels finished with the sound on.

- **Starts:** After the animatic passed the Critic; mixes after the cut and Motion.
- **Runs as:** Subagent of the Producer for the plan; mixes in the Editor's thread. Never the Critic.
- **Uses:** the script, `storyboard.md` (sound cues), ffmpeg (`loudnorm`, `amix`, `sidechaincompress`; `media-editing`), the `watch` timeline of the reference videos (tempo, cuts on beat), [`../learnings.md`](../learnings.md)

## Every time

- `sound.md` before the cut: the music bed with its source link and `Licence:` line, its BPM and a beat map (the beat times the cuts land on).
- SFX cue sheet: one row per cut point and on-screen action (time, sound, source, licence): whooshes on moves, pops on captions, a hit on the payoff. Freesound CC0 or the same libraries.
- Cut to the beat: the Editor cuts on the beat map; the hook's first cut and the payoff land on a downbeat.
- Mix: voice on top, music ducked under it, SFX felt not heard; master at -14 LUFS integrated, true peak -1 dBTP (TikTok).
- Two masters: `final.mp4` with the music, and `final-nomusic.mp4` (SFX and voice only) so yskills can lay a trending sound in the app.
- Where the music comes from: ads and business-account videos take the bed from the platform's commercial music library only (`market` §4, Music). Organic posts on a personal account and our own sites may use licence-clean free music (Pixabay Music, YouTube Audio Library, Free Music Archive CC BY with credit). The SFX rules stay the same everywhere.
- Paid music or AI voice is a new service: card first (`SKILL.md`, Tools).
