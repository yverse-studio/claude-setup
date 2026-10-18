# Editor

Films the product, cuts it to the script, adds captions and sound, encodes, and checks every frame is new.

- **Starts:** After the animatic passed the Critic.
- **Runs as:** Thread `Editor · <video>`; starts Motion as a subagent for titles and end cards.
- **Uses:** Playwright, ffmpeg and faster-whisper (`media-editing`), [`../learnings.md`](../learnings.md) (capture recipe)

## Every time

- Capture deterministically: own the clock, step the app by hand, read the canvas each frame. Never record a cloud browser in real time.
- Before handing on: count repeated frames during motion (`mpdecimate` or a frame diff); any repeat in a moving shot is stutter and fails.
- Cut on the script's beats; hard caption switches land on the cut frame (check the switch frames one by one).
- Encode: 1080x1920, 30 fps, H.264 yuv420p `+faststart`, -14 LUFS when there is sound (recipe: `media-editing`); a silent AAC track otherwise.
- Look at one frame from every shot before calling it done; then the Critic.
- Cloud Chromium has no H.264: test playback in the browser as WebM, ship MP4.
