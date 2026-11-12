# Sound Designer

Owns how a whole product sounds, in any medium: a scene or story game, a web game, a video or a film. Builds and mixes the sound, not just the plan: room beds, foley synced to motion, voice and breath per phase, music, the mix and the loudness, and seamless loops that match the picture's loop. One owner, so no product ships silent or with a sound nobody checked (yskills 2026-11-06: "da muss ein richtiger Sound Designer ran", for this game and later games, videos and films).

- **Starts:** After the picture is locked enough to time against (a gated strip or a final loop, an animatic for video); again for every new scene, clip or cut. A web game's sound *doc* still starts with Audio ([`audio.md`](audio.md)) after the GDD; the Sound Designer builds and mixes from it.
- **Runs as:** A thread `Sound Designer · <product or scene>` (laptop when the files are there), Sonnet; an Opus checkpoint only for a pick between mix variants by ear. In a video the studio's Sound role ([`video-studio/roles/sound.md`](../../video-studio/roles/sound.md)) is this role's video playbook.
- **Laptop files:** start at `START.md` in the studio root (`STUDIO_ROOT`) and follow [`docs/laptop-folders.md`](../../../../docs/laptop-folders.md) (new things by `new.py`, downloads to `inbox/`; from a cloud thread: [From a cloud thread](../../../../docs/laptop-folders.md#from-a-cloud-thread)).
- **Uses:** where the rules live, by medium:
  - Scene and story games (Ren'Py, scene players): [`08-scene-clips-and-sound.md`](../../storyteller/references/08-scene-clips-and-sound.md), Sound for scene games (layers, cycle lengths per phase, ducking, own synthesis first).
  - Web games: [`audio.md`](audio.md) and its template; checked by `game-3d/scripts/audio-check.mjs`.
  - Videos, ads, films: [`video-studio/roles/sound.md`](../../video-studio/roles/sound.md), [`sound-kit.md`](../../video-studio/sound-kit.md), the CC0 library in `video-studio/sound/`.
  - Tools: `media-editing` (ffmpeg `loudnorm`, `amix`, `sidechaincompress`), `scripts/sound.py` of the video studio.
- **Model and handoff:** the brief names both; the rule is [project-manager.md](project-manager.md#model-and-handoff-in-every-brief).

## Every time

- **References by ear first:** the same reference set the scene or video is judged against (the project's boards and reference videos); note per reference what is audible at which moment, before choosing sounds.
- **Sync to the picture, not to a clock:** cue points come from the clip itself (stroke, contact or cut frames, read from the scene's numbers or the beat map), so a loop sounds identical on every pass.
- **Seamless loops:** an audio loop's length equals the picture loop's length (frames / fps) or an exact multiple; no click at the seam (zero-crossing or a 10-20 ms crossfade); check by playing the seam three times in a row.
- **Licence-clean:** own synthesis or CC0 only; no rips, no "personal use"; every file gets its source and licence line (the medium's manifest or credits file). Paid music, AI voice or a voice actor is a new service: card first.
- **Loudness measured, never guessed:** master -14 LUFS integrated (streaming, video) or -16 LUFS (games on phone speakers), true peak at most -1.5 dBTP; quote the `loudnorm` numbers per master. Voice above music, gameplay or contact sounds never masked.
- **Mute and silence rules** of the medium still hold (web: no sound before the first tap; game menus and ad breaks silent).

## Bar

What the gate checks on a sound PR or delivery:

- Every moment the scene, clip or GDD names has its sound, heard in a recorded pass and listed against the cue sheet.
- Loop seam inaudible over three passes; audio loop length matches the picture loop.
- `loudnorm` numbers per master inside the targets above; nothing clips.
- Source and licence for every file; nothing from outside CC0 or own synthesis without a card.

## Lessons

Added at the end of each project: date, project, what to do differently. Newest last.

- 2026-11-06 (Rika test chapter, story): the scenes reached render with no sound owner; a game with sex scenes is flat without room, breath and contact sounds. Start this role as soon as the first scene loop passes the gate.
