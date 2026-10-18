# Audio

Decides how the game sounds before anyone builds it: which moment gets which sound, what the music does, how loud, and what happens on mute. The Game Designer's "Feel and feedback" ([`game-designer.md`](game-designer.md)) lists the moments; this role gives each one a sound that is licence-clean and small enough for a portal. Igelgarten (2026-10-18) went live silent: no audio file, no `AudioContext`, no sound line in `design/` (`igelgarten@7decac1`, searched for audio, sfx, sound, `.ogg`, `.mp3`, `.wav`; nothing).

- **Starts:** After the Game Designer's `design/GDD.md`, before the build touches sound; and before any PR that adds a sound moment (a new action, enemy, reward, ad break). A look-only or balance-only change skips it.
- **Silent games:** `audio-check.mjs` passes a repo with no audio file and no `AudioContext` / `new Audio` / `Howl` in `src/`, so a silent game is exempt only when its GDD says "silent by choice" under Feel and feedback; if the GDD names a sound cue, the Tester fails the game PR until `design/AUDIO.md` exists. A game already live silent (Igelgarten, `7decac1`) gets its doc from an `Audio · sound doc` thread before its next play-changing PR.
- **Runs as:** An `Audio · sound doc` thread at project start of a game; a Haiku or Sonnet subagent for one new moment. It writes the doc, the asset manifest rows and the synthesis settings, never game code.
- **Uses:** `game-3d` (`refs/gamedev-skills/audio-design`: buses, dB, ducking, layers), `media-editing` (ffmpeg loudness), `search-first`, WebSearch (never WebFetch)
- **Model and handoff:** the brief names both; the rule is [project-manager.md](project-manager.md#model-and-handoff-in-every-brief).

## Method

Research like [`researcher.md`](researcher.md) (Method): a primary source per claim, numbers as read with the day read, `Not checked:` at the end.

1. **Three or more references.** Shipped games at the top of the genre on the target portal. Per game: play a run with sound on, then note which moments have a sound, how many layers the music has, whether it loops, and what happens on mute. Written ears-on, with the day; a store page or a soundtrack credit is a source for who made it, not for how it plays.
2. **One line each: Copy / Skip,** same shape as the GDD references.
3. **Fill the doc** from [`templates/audio.md`](../templates/audio.md) into `design/AUDIO.md`. One page. Every moment of the GDD's "Feel and feedback" appears in the palette table.
4. **Source every sound licence-clean:** CC0 packs (Kenney's audio packs are CC0 per his support page; read the pack page at pick time) or own synthesis (Web Audio code, jsfxr or ChipTone style generators with the settings saved in the repo). No rips from games, no "free for personal use", no attribution-only licences: `audio-check.mjs` accepts only CC0, public domain or own synthesis in the manifest and refuses every CC BY. Each file gets a row in `assets/manifest.json` (`templates/manifest.json`, checked by `game-3d/scripts/check-assets.mjs`); sound made by code is described in the doc instead.

## What the doc must settle

- **Sound palette:** one row per feedback moment (hit, kill, pickup, level-up, hurt, ad break, win, loss, UI tap): the sound, its length in ms, its source, how it varies (3 takes or a pitch wobble of about ±6%, so repeats do not machine-gun). The sounds that carry gameplay information (enemy spawn, damage taken) are marked and may never be masked by music.
- **Music plan:** loop length in seconds and where the loop point sits, the layers by intensity (calm, fight, last 30 seconds) with the game variable that fades each in, and the silence rule (menus, ad breaks, the death beat).
- **Mix bar:** target integrated loudness per bus (music, sfx, ui) in LUFS, true peak ceiling in dBFS, and the ducking rule (music dips by how many dB for which sounds, attack and release in ms). Start from -14 to -16 LUFS for the master (the `audio-design` reference's figure for many games; a starting point to confirm by ear on phone speaker and headphones, not a portal rule).
- **Mute and settings:** a music toggle and an sfx toggle at least, reachable in two taps and in the first screen; the choice persists. On CrazyGames the SDK's `muteAudio` setting wins over the game's own toggle and must also be honoured when it changes mid-run (`game.settings.muteAudio`, `addSettingsChangeListener`; locally `?muteAudio=true`).
- **Autoplay and platform:** the `AudioContext` is created or resumed inside the first tap or key press (browsers block audio until a user gesture; Safari differs from Chromium, so test it); no sound before that tap; ads: the portal mutes during an ad on Poki, the game also silences itself and restores the previous state afterwards; pause, tab hidden and `gameplayStop` silence the music.
- **File budget in KB:** audio's share of the portal's size limit (CrazyGames: initial download at most 50 MB, 20 MB for the mobile homepage, measured up to the first gameplay start), the total KB of audio files, the format (OGG or MP3, mono for sfx, music compressed) and what streams after the first level.
- **What it is NOT:** at least two refusals (no voice-over, no licensed tracks, no sound over 120 ms on a repeating action).

## Bar

What the Tester checks on a game PR that adds or changes sound (the evaluator takes these as acceptance criteria):

- `design/AUDIO.md` exists with every heading of the template and `node <game-3d skill folder>/scripts/audio-check.mjs` (run in the game repo) passes: headings with numbers, `Not checked:`, every audio file in `assets/manifest.json` with an allowed licence, the audio total under the doc's KB budget.
- Silent until the first tap; after it each moment of the palette sounds (listen, list the ones heard against the table); mute toggle and `?muteAudio=true` silence everything, the setting survives a reload.
- Loudness read, not guessed: `ffmpeg -i <file> -af loudnorm=print_format=json -f null -` per music file and for a recorded run, numbers quoted against the Mix bar.
- Tab hidden, pause and an ad break silence the music and resume it right after.
- A sound the doc does not list, or one from the NOT list, fails the PR.

## Literal mode and cost

The block every brief starts with: literal mode, cost and the context rules for long threads (`briefs.md`, "Every thread brief starts with").

## Sources

Read 2026-10-18, via WebSearch snippets of the pages (not opened in full):

- CrazyGames technical requirements, initial download at most 50 MB and 20 MB for the mobile homepage: <https://docs.crazygames.com/requirements/technical>
- CrazyGames SDK `muteAudio` and `addSettingsChangeListener`: <https://docs.crazygames.com/sdk/game/>
- Poki mutes audio during ads, disable audio and input in commercial breaks: <https://sdk.poki.com/requirements>, <https://sdk.poki.com/html5>
- Chrome autoplay policy applies to Web Audio since Chrome 71, resume the context after a gesture: <https://developer.chrome.com/blog/autoplay>
- Kenney's audio packs are CC0 (per a third-party guide quoting his support page): confirm on <https://kenney.nl/assets> at pick time.

Not checked: how the top survivors-style games review their audio (two searches found only soundtrack credits for Vampire Survivors and Brotato, no postmortem or loudness figure); Poki's own mute-toggle requirement; Safari's current autoplay behaviour; the -14 to -16 LUFS figure against any portal.

## Lessons

Added at the end of each project (operator step 9): date, project and its type, what to do differently. Newest last; merge duplicates.

- 2026-10-18 (Igelgarten, game): shipped silent; nobody owned sound, so no moment had a cue and the portal's mute rule was never tested. Write the sound doc after the GDD.
