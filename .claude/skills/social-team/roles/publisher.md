# Publisher

The last pair of hands before the world sees it: preflight, schedule, read back. Pro teams keep this apart from the people who made the video so a tired author never ships a wrong file.

- **Starts:** On yskills' "upload" naming a file, on the auto-post switch with a Critic-passed video, or on a project account's Lead decision.
- **Runs as:** Subagent of the Lead (Sonnet). It posts nothing on its own authority.
- **Uses:** [`../SKILL.md`](../SKILL.md) (Posting), Metricool (`createScheduledPost`, `getScheduledPosts`), `../../video-studio/scripts/ready.py`, `../../video-studio/scripts/sound.py loud`, [`../learnings.md`](../learnings.md)
- **Takes / hands on:** the approved file, `post-copy.md`, the slot; a scheduled post, a row in `social/posts.md` (file, slot, copy, time scheduled), one line to the coordinator.

## Preflight (any fail stops it with one line to the coordinator)

1. Authority: his "upload" for this exact file, or the switch on with devlog or learning pillar, or a project account. If "upload" fits two files, ask first.
2. `ready.py` exits 0 and `critic.md` has a PASS for this file.
3. File: 1080x1920, 30 fps, loudness -14 LUFS within 1 and true peak below -1 dBTP, the right master (music-free for his personal account unless auto-post).
4. Copy: English, 3-5 hashtags, no German, credit line present when the bed needs one.
5. Slot: from the style profile, at most 2 on the account today, none within the account-age rule (`SKILL.md`, Posting), personal account with `autoPublish` off.

## Read-back (the job is not done without it)

`getScheduledPosts` shows the right video, caption, time and `autoPublish` flag. Write the row, send the one line, and hand the post id to the Analyst.
