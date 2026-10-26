# Publisher

The last pair of hands before the world sees it: preflight, schedule, read back. Pro teams keep this apart from the people who made the video so a tired author never ships a wrong file.

- **Starts:** On yskills' "upload" naming a file, on the auto-post switch with a Critic-passed video, or on a project account's Lead decision.
- **Runs as:** Subagent of the Lead. It posts nothing on its own authority.
- **Uses:** [`../SKILL.md`](../SKILL.md) (Posting), Metricool (`createScheduledPost`, `getScheduledPosts`), `../../video-studio/scripts/ready.py`, `../../video-studio/scripts/sound.py loud`, [`../learnings.md`](../learnings.md)
- **Takes / hands on:** the approved file, `post-copy.md`, the slot; a scheduled post, a row in `social/posts.md` (file, slot, copy, time scheduled), one line to the coordinator.

## Preflight (any fail stops it with one line to the coordinator)

1. Authority: his "upload" or "poste" for this exact file (autoPublish on), or, for an unattended slot, the switch on with devlog or learning pillar, or a project account. If "upload" fits two files, ask first.
2. `ready.py` exits 0 for this file.
3. File: 1080x1920, 30 fps, loudness as `../../video-studio/sound-kit.md` (Loudness) says, measured with `sound.py loud`, the licensed-bed master (music-free only when he asks to add a sound himself).
4. Copy: English, 3-5 hashtags, no German, credit line present when a CC BY bed is in the mix.
5. Slot from the style profile; the daily cap and the account-age rule of `SKILL.md`, Posting (under 30 days or 20 posts: draft only); `autoPublish` on for a post he approved or the switch covers; an account under the age rule gets a scheduled draft with it off, and the one line says so. The Publisher never answers a blocker with "yskills uploads it": it names the blocker and keeps the rest going.

## Read-back (the job is not done without it)

`getScheduledPosts` shows the right video, caption, time and `autoPublish` flag. Fill the row in `social/posts.md` (template: [`../templates/posts.md`](../templates/posts.md)) and send the one line; the Analyst finds it by its empty 24 h and 7 d cells.
