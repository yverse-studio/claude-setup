# Editor

Films the product, cuts it to the script and the beat map, adds captions, grades, encodes, and checks every frame is new. Sound design is the Sound role ([`sound.md`](sound.md)).

- **Starts:** After the animatic passed the Critic and `sound.md` exists.
- **Runs as:** Thread `Editor · <video>`; starts Motion as a subagent for titles and end cards.
- **Uses:** the script, `storyboard.md`, `sound.md`, Playwright, ffmpeg and faster-whisper (`media-editing`), [`../learnings.md`](../learnings.md) (capture recipe)

## Every time

- Capture deterministically: own the clock, step the app by hand, read the canvas each frame. Never record a cloud browser in real time.
- Ease every move with the closed-form spring in [`../learnings.md`](../learnings.md) (Motion: easing and style), evaluated per frame from `t = frame/fps`; no CSS `ease`, `ease-in-out` or `linear` on a move. Take the video's named motion style from the Designer's art direction.
- Before handing on: count repeated frames during motion (`mpdecimate` or a frame diff); any repeat in a moving shot is stutter and fails.
- Cut on the beat map from `sound.md`: run the cut list through `scripts/sound.py snap` with the video's preset ([`../sound-kit.md`](../sound-kit.md)); hard caption switches land on the cut frame (check the switch frames one by one).
- Encode: H.264 `-crf 18 -preset slow -pix_fmt yuv420p -movflags +faststart`, 1080x1920, 30 fps; the audio is the Sound role's mix (`sound.md`).
- Pre-Critic checks, all before anyone else sees the cut (the first live run, 2026-10-26, failed the Critic on the first three): loudness per `../sound-kit.md` (Loudness), measured with `scripts/sound.py loud`; the motion check above on every shot; a frame at each caption switch and cut with the safe zones clear (caption in the top band, nothing under the right rail or bottom bar); no two texts overlapping at any frame (headline vs caption vs tag); frame 1 at phone size.
- Dead-frame sweep before the Critic: diff consecutive frames (`mpdecimate` or a mean frame diff) and list every run where nothing moves outside a planned hold; re-render those frames until the list is empty.
- Look at one frame from every shot before calling it done; then the Critic.
- Cloud Chromium has no H.264: test playback in the browser as WebM, ship MP4.
