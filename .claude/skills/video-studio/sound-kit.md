# Sound kit: presets, cuts, library

The one home of how a video sounds and where it cuts, per preset (yskills 2026-10-26: "audio wie
brag ... sound effecte cuts und alles was halt so funktioniert"). The tool is
[`scripts/sound.py`](scripts/sound.py) (free, local, no key); `python3 scripts/sound.py presets`
prints the numbers below from the code, and the code wins when they differ. Research and plan:
`/mnt/project-files/social/2026-10-26-audio/` (`research-brag.md`, `research-market.md`, `PLAN.md`).

## What we took from /brag

| /brag does | We |
|---|---|
| librosa beat grid plus "strong cues" (0.45 onset, 0.25 contrast, 0.20 RMS, 0.10 bass, threshold 0.45) | adopt: `sound.py beats` |
| reveals within ±0.15 s of a strong cue, small entrances within ±0.10 s of a beat, text on every other beat, a hold of 0.8 s per label or 0.3 s per word | adopt: `sound.py snap` and the Writer's caption timing |
| 3-5 Kenney CC0 SFX per video at the start of a motion, SFX 0.55-0.85 against music 0.3-0.4 | adopt, capped per preset |
| Sascha Ende "Happy Beats" beds, CC BY 4.0 | skip: credit line in every caption, sounds like stock |
| no loudness pass and no ducking: the real Y-Land brag measured -24.4 LUFS, about 10 LU under the feed | fix: two-pass loudnorm and ducking in `sound.py mix` |

## Presets

The preset is the one the idea carries in the `social` app (real_talk, explainer, big). Each idea
also carries his sound switch (yskills 2026-10-26: "ich wähle aus ob du sound wählst oder ich"):

- **Claude wählt** (default): the Sound role picks bed and SFX; the music master is the one to post.
- **Ich wähle**: the music-free master is the one to post, he lays his sound on in TikTok; when he
  pastes a sound link, its audio (fetched on the laptop with `watch`) is the beat grid the cuts snap to.

| | real_talk | explainer | big |
|---|---|---|---|
| What it is | his face, one ironic caption, 7-13 s. **Unproven** until it has run on one of his own face clips and passed "would his friends notice someone else edited it?" | voice and captions, 20-40 s | flagship or launch, 15-30 s, music-driven |
| Music-free master (`final-nomusic.mp4`) | his own sound only, for a trending sound added in TikTok | voice and SFX | voice and SFX |
| Music master (`final.mp4`) | own or CC0 bed at -20 dB, ducked 12 dB under his voice (yskills 2026-10-26: "manchmal haben wir nur Hintergrundmusik") | own or CC0 bed at -22 dB, ducked 14 dB under the voice | own or CC0 bed at -16 dB, 110-140 BPM, ducked 10 dB |
| Cuts | on action and on the spoken beat; on the sound's beat when the idea has a sound link | every 2-4 s, on a beat ±80 ms | every 1-2 beats, hook and payoff on a strong cue ±0.15 s |
| Shortest shot | 0.8 s | 1.5 s | 0.4 s |
| SFX | 0-2, only on the punchline | at most 4 | at most 8 |
| Loudness, both masters | -14 LUFS integrated, -1.5 dBTP, LRA 11 | same | same |

Until fitting beds exist (2026-10-26: the library has only chiptunes, and only the 123 BPM one fits, for
`big`), real_talk and explainer with "Claude wählt" ship SFX-only and the music-free master is the
one to post; a bed appears in `final.mp4` there only when the Sound role found one that fits.
Both masters ship with every video and he picks: the music master is ready to post as is, the
music-free one takes a trending sound in the app (a TikTok sound can never be burned in). API and
auto-posts, ads and project accounts use the music master or the platform's commercial library
(`social-team` SKILL.md, Posting; `market` §4, Music).

## Never (reads as slop)

- A whoosh on every cut, the same file twice in a row, an SFX while a caption is being read
  (except the one that starts it).
- Music louder than his voice; a bed that never changes; stock ukulele or "corporate happy" beds.
- Riser into nothing: a riser lands on a cut or a hit, or it goes.
- On real_talk: anything that makes his friends notice someone else edited it
  ([`../social-team/xyskillsx-style.md`](../social-team/xyskillsx-style.md)).

## Library

Order of pick, every file with its source and a `Licence:` line in the video's `sound.md`. The sorted
and tagged CC0 library itself (SFX by category, chiptune beds, licence proof per file, a CI check)
is [`sound/README.md`](sound/README.md); `sound.py mix` reads it by default.

1. **Own synthesis** (`sound.py sfx <dir>`): hit, thud, tick, whoosh up and down, riser, sub boom;
   three takes each with a pitch wobble, so repeats never machine-gun; 8 ms fades, quiet tails.
   No licence at all. No synth pop or scratch (the Critic, 2026-10-26: cartoony, gives the edit
   away): those come from Kenney.
2. **Kenney CC0 packs** (kenney.nl: Impact Sounds, Interface Sounds, Casino Audio, UI Audio), the
   files /brag uses: `impactSoft_medium_*`, `impactBell_heavy_*`, `impactWood_*`, `bong_001`,
   `click_00*`, `drop_00*`, `card-slide*`, `chip-*`. Read the pack page at pick time.
3. **Freesound, CC0 filter only**, picked by hand and kept with the video (its API needs a key).
4. **Music beds:** CC0 or own synthesis only (yskills' card, 2026-10-26), so no caption ever
   needs a credit line: FreePD.com (public domain), OpenGameArt and Freesound with the CC0 filter.
   The Sound role picks the bed per video by mood and tempo; a bed that sounds like stock or like a
   generator is replaced, not posted.

Skip: BBC Sound Effects (non-commercial), Pixabay music (Content-ID claims), YouTube Audio Library
(login, YouTube terms), anything CC BY unless yskills asks; tools madmom (non-commercial models),
aubio (GPL), essentia (AGPL). Paid or AI music and AI voice are a card (`SKILL.md`, Tools).

## The run (Sound role, `roles/sound.md`)

1. `sound.py beats bed.wav` (or the sound link's audio, fetched on the laptop with `watch`).
2. The Editor's cut list goes through `sound.py snap beats.json cuts.json --preset <p>`; moved
   cuts are re-checked on the frame.
3. SFX cue sheet `cues.json` (time, sound, gain) within the preset's cap.
4. `sound.py mix draft.mp4 cues.json --preset <p> [--music bed.wav]` writes both masters at
   -14 LUFS; `sound.py loud` on each before `ready.py`. `mix` refuses a bed on a source that
   already carries music (`--force-music` only on purpose) and warns when such a source would make
   the "music-free" master not music-free: start from the raw clip, never from a finished render.
