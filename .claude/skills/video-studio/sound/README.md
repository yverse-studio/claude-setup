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
| music | 5 | Juhani Junkala chiptunes, OpenGameArt, CC0: `big` only, game-flavoured; Title Screen is 15 s, too short for a bed |

Known gaps: no scratch, no real riser, and no chill/funky/cinematic beds yet. FreePD closed in 2026, so beds need another CC0 source; the synth in `sound.py sfx` covers riser and sub boom.
