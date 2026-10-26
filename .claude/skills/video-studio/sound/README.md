# Sound library

Free-licence sounds for the video studio (yskills 2026-10-26: "free licence sound effects somewhere, sort them yourself"). Rules for picking and mixing: `video-studio/sound-kit.md` (the lead PR); this folder is the stock.

- **Only CC0 / public domain / our own synthesis.** No CC BY, no Pixabay, no BBC, no YouTube Audio Library. `scripts/sound_library.py check` fails on any other licence, a missing proof file, an unknown preset, music without BPM.
- `manifest.json` has one entry per file: `id`, `kind` (sfx or music), `category` (hit, thud, pop, tick, whoosh, riser, bell, glitch) or `mood` (chill, funky, playful, drive, cinematic, retro, tense), `tags`, `presets` it fits (real_talk, explainer, big), `source`, `url`, `licence`, `proof`, measured `lufs`/`rms`/`peak`/`seconds`, and `bpm` for music.
- `licences/<source>/` keeps the licence text and the download page we took each file from.
- SFX are peak-normalised to -3 dBFS, 48 kHz wav, so a cue's `gain_db` means the same for every file; `rms` says how loud it feels. Music is stored as downloaded; `mix` does the loudnorm.
- Add files: write a `curation.json` (see the docstring of `scripts/sound_library.py`), `python3 scripts/sound_library.py add .claude/skills/video-studio/sound curation.json`, then `check`. The pick comes from the real file's spectrum and length, not its name: warm, low high-frequency risk first.

## What is in (2026-10-26)

| Group | Files | Source |
|---|---|---|
| thud, hit, bell | 27 | Kenney Impact Sounds / Interface Sounds: soft and wood thuds for cuts and caption lands, punch and plate hits for payoffs |
| pop, tick, glitch | 22 | Kenney Interface Sounds, UI Audio: warm drops and taps for captions, quiet clicks, tiny glitch and error stings for the punchline gag |
| whoosh, riser | 20 | Kenney RPG Audio (cloth, slice, page flips), Casino Audio (card slides), Digital Audio (phaser sweeps, big only) |
| music | 13 | 8 human-made beds from Freesound, CC0 1.0 (chill/lo-fi 3, funky 2, playful 1, synthwave 1, cinematic 1; each 60 s from its first full-level beat, 128 kbps mp3, 2 s fade out, original page saved as proof), plus 5 Juhani Junkala chiptunes (OpenGameArt, CC0): `big` only, game-flavoured; Title Screen is 15 s, too short for a bed |

Known gaps: no scratch, no real riser. FreePD closed in 2026; the Freesound beds came through Openverse (`license=cc0`) and are Freesound's HQ mp3 previews (originals need a login). `bpm` is only an estimate (`bpm_estimated`): librosa reads several beds as exactly 117.5 and was off by 1.5x on `hiphop-chill-calm`, which is about 86. `mix` uses the real beat grid, so cuts do not depend on it; it only filters `big`'s 110-140 range. The beds were chosen by title, tags and spectrum, not by ear: audition before the first post. The synth in `sound.py sfx` covers riser and sub boom.
Getting new files: the cloud proxy blocks kenney.nl, freesound, opengameart and similar, so download on the laptop (Remote Control, `GameAssetLibrary/sound-inbox-*`) and import from there.

## Preset fit (Critic, 2026-10-26)

- `real_talk` gets only thuds and the two soft pop/drops, for the one punchline sound. No whoosh, bell, riser or glitch: his friends must not notice an edit. Glitch and error stings carry the tag `opt-in`: only when he asks for the gag.
- `explainer` and `big` take everything except the retro phaser and riser sweeps, which are `big` only.
- `mix` picks through `sound_library.pick(library, category, preset, last)`: the preset's files only, never the file used last.
- Music: the chiptunes are Y-Land promo material (`big`), never on his face posts. Only Level 1 (123 BPM) sits in the 110-140 BPM range; Level 3 (108) and Stage 1 (144) are borderline, Title Screen is 15 s, Boss Fight (172) is too tense for the cozy game. real_talk and explainer take the chill and funky beds; the music-free master stays the one for a trending sound.

## Using the beds

- Every bed opens at full level (the dead intros are cut), so a 7-13 s video gets the groove from the first beat.
- Three beds carry `vocals-unchecked`: nobody has listened for vocal chops in the hip-hop and lo-fi ones. Audition on the laptop before the first post.
- Freesound uploads can still be claimed by TikTok's Content-ID if the same track sits on a distribution service: on the first post that uses a bed, look at the video's copyright status in the app before relying on it.
- Two similar lo-fi beds (same author, same tempo) were dropped on purpose; add variety, not more of the same.
