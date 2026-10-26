# Y-Land film rig (2026-10-26)

Needs Playwright with Chromium (preinstalled in cloud threads; elsewhere `npm i -D playwright && npx playwright install chromium`) and ffmpeg. Films the real Y-Land game frame by frame in the cloud and cuts it with a face clip into a 9:16 video in yskills' style (`/mnt/project-files/social/style/xyskillsx-style.md`). First used for the "my followers live here" test video.

1. Real followers: download `https://yland.yverse.workers.dev/api/island` on the laptop (the cloud can't reach workers.dev), stage it, then run the Y-Land dev server against it: `FILM_ISLAND=<island.json> npm run dev` (yland `server/utils/island-store.ts`; without the variable, dev uses made-up followers).
2. `node film.cjs <out> dry` grabs only each shot's first and last frame (about 6 min); look at them, then `node film.cjs <out>` films all 210 frames (about 7 s per frame, so 25 min).
3. `node caption.cjs "<caption>" cap.png`, then `./comp.sh <selfie.mp4> <frames> cap.png <out> [music.mp3 start]` writes `final-nomusic.mp4` (the main master: he adds the trending sound), `final.mp4` and `cover.png`.

What the rig does, and why (details in `../../learnings.md`): the simulation and villager-atlas workers are made to fail so the page versions run on Playwright's fake clock; `Math.random` is seeded; the weather layer is hidden (the live island's own weather is often rain); the zoom clamp plugin is removed for close-ups past the game's 8x (12x and above gets soft); subjects are picked per shot from what villagers are doing (`spot.activity`, `emoji`, `partnerKey`). Emojis only appear near the camera, so a preroll parks the camera on the picnic meadow first.
