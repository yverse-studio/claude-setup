# Sound template for scene games

What other 18+ and scene games do with sound, as data, and the template our games follow. Teardown 2026-11-02 of four
local games; their audio files were **not** extracted or played, only names, counts and manifests read (what that
leaves open: the list at the bottom). Our practice for the scene player stays in
[`game-pipeline.md`](game-pipeline.md#sound-for-scene-games-2026-10-26); this file is the cross-game pattern plus the
event table to fill per game. Sounds from commercial games are placeholders at most (see Licences), never in a release build.

## What the games do

| Game (engine) | Sound as seen in its data | Source |
|---|---|---|
| Wild Life Full (UE5, Wwise for flight) | Sound is **data on the animation**: a clip carries timed notifies. Maya x Max clips: 1 004 `PlaySound` notifies (OralSquish, GenitalSquish1/2/All, GenitalSmack, breatheIn/Out/Heavy) plus 209 voice notifies that name a voice row (`Moan_Closed_Long`, `Moan_Open_Short`). Sex loops are 0.96-5.96 s, median 2.46 s (59 frames at 24 fps), blended by speed through BlendSpaces, so the one-shots ride the stroke. Footsteps are a notify too. Flight: 6 sound groups (accelerate, brake, roll, takeoff, landing, wind) with 3-5 variants each, intensity Light/Medium/Strong and a CloseToGround flag. | StudioLibrary `_research/wild-life-full-deep-1-2026-11-02.md`, `-deep-2-` |
| House Party (Unity) | Audio sits in **AssetBundles per content pack** (`Base`, `Christmas`, one per DLC character), each with `Audio`, `Music`, `BackgroundChatter`, `Dialogue`. Base: 165 manifest lines in `base_audio` (10.5 MB): **60 footstep wavs = 3 floors (wood, laminate, concrete) x 2 shoes (barefoot, loafers) x 10 variants**, ~40 one-shots (door lock, zipper, fabric rip, glass, spray, `OralSFX.mp3`, `VibratorBuzz.wav`, a UI click, a positive chime); `base_music` 6 tracks (32.7 MB); 16 voices with 1 654 background-chatter mp3 (115 MB); 22 dialogue packs with 5 981 mp3 (566 MB). 134 interactive items have a `SoundEffects` field; the 63 cutscene Timelines carry 148 Audio tracks. A scene is a Timeline: camera, animation and audio on one clock. | `_research/house-party-teardown-2026-11-02.md`, bundle `.manifest` files |
| Being a DIK (Ren'Py) | **No voice** (no voice folder in the archive index). Music: one archive per episode, 17-42 tracks, 375 in the indexed archives. Sound effects: 358 mp3 in `sound_effects/`, split `season2` 94, `season3` 166, `interlude` 18. Adult sound is a handful of one-shots: `slap`, `slap2`, `cum1-3`, `kick_slap`, `bella_slap`, `fireworks_kiss`, `melon_squish`, `heartbeat`, `audience_gasp`. Event sound only, no loop layers. | `_research/being_a_dik_notes/rpa_index.json` |
| Captain Hardcore (UE4) | Steam Audio (Phonon) plugin only; the pak index is encrypted, no sound content read. | `_research/captain-hardcore-teardown-2026-11-02.md` |

What carries over (the patterns, not the files):

1. **Footsteps are the biggest variant pool** (House Party: 10 per surface and shoe). Variants beat length: no repeat tell.
2. **Sound is bound to the motion or the line, not to a global timer** (Wild Life notifies, House Party Timeline tracks). Ours: the contact layer is exactly as long as its clip and starts with it.
3. **Voice is a named row, not a file path** (`Moan_Closed_Long`): the scene says which kind of sound, a table picks the file. Ours: slot name to file by naming rule (`szene_ton.rpy`).
4. **Layers per scene**: ambience bed, music, chatter or voice, contact foley. House Party adds background chatter as its own bank.
5. **Visual novels stay cheap**: Being a DIK has only one-shot SFX and music, no voice. That is the floor.
6. **Stock-library SFX are normal**: House Party filenames look like store libraries (inferred from names, not from licences). Nobody records footsteps; license them.

## Event table (fill per game)

| Event | Layer | Trigger | Sync | Variants | Level | Source |
|---|---|---|---|---|---|---|
| UI hover, click, confirm, back | ui | button style / `ton_ui` | none | 2 each | quiet (0.35) | Kenney UI and Interface Sounds (CC0) |
| Phone ping | ui | script line | on the line | 1-2 | quiet | Kenney Interface |
| Footsteps (surface) | foley | script line or animation | on the step | 5 | 0.7 | Kenney Impact (CC0) |
| Door, fabric, belt, creaking bed | foley | script line | on the line | 2-4 | 0.7 | Kenney RPG Audio (CC0) |
| Room ambience | bed | location card | none, 24 s seamless loop | 1 per room | -13 dBFS, ducks to 0.55 under voice | own synthesis |
| Music | music | location | none | 3 beds | 0.35 / 0.6 / 0.8 by phase | CC0 Freesound beds |
| Breath and voice | voice | scene phase (intro, loop, fast, finish) | free loop, intensity by file | 1 per phase and voice | above bed | own synthesis (vowels) |
| Contact (slap, wet, squish) | contact | clip | **same length as the clip, starts with it** | loop + loop_b | loudest layer | own synthesis plus CC0 squelch |
| Finish | voice + contact | finish clip | one-shot, decaying breath | 1 | peak | own synthesis |

Ren'Py channels (`ton_kit.rpy`, `szene_ton.rpy`): `szene_raum`, `szene_atem`, `szene_kontakt` loop; `szene_foley` and `ui` are one-shot; `music`. Quiet to loud: bed < music < breath and voice < contact. Variant files are `<name>_<n>.ogg`, never the same twice in a row; an unknown name stays silent.

## Checks (run muted)

- Static: every variant group has at least 2 files; every file a mapping names exists (`pruefe_ton_kit`, `pruefe_ton_dateien`, test lane `ton`).
- Behaviour: draw a group 40 times, assert no immediate repeat; assert the right file plays on the right channel; assert an unknown name stays silent.
- Run: `CXY_TEST=1 SDL_AUDIODRIVER=dummy renpy.exe <project> test ton`. The dummy driver plays nothing, so a test thread never makes noise on the laptop.
- Ears only (no test can do it): loudness balance, loop seams, vocals inside a bed. Say so in the PR.

## Licences and sourcing

- Kept: CC0 (Kenney, Freesound CC0 beds, OpenGameArt CC0) and our own synthesis (`scripts/make_sounds.py`). One credits line per source, licence text next to it.
- Recorded moans: no free CC0 or CC-BY source found (2026-10-26, unchanged). The paid route is a pack purchase (a card to yskills) or a recorded voice actor.
- Sounds from commercial games: only as internal placeholders in a folder named `_ref_placeholder`, listed in a replacement list, never in a release build. Nothing was extracted in this teardown, so no such folder exists yet.
- No DRM or encryption is cracked for sound (Captain Hardcore's pak stays closed).

## Not checked

- No audio file of any game was played or decoded: loudness, mix, real loop lengths of the sounds and the voice content are open.
- House Party: which Timeline cue hits when was not read, only that the tracks exist.
- Wild Life Full: the Wwise banks (flight) and the voice-row DataTable contents were not opened; counts come from the animation notify scan.
- Being a DIK: whether sound is baked into the `.webm` clips is open.
- Licences of the commercial games' own sounds were not researched (names suggest stock libraries, inferred).
