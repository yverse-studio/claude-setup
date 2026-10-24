# Explainer pipeline (the Miso look is rejected, keep the pipeline only)

```bash
pip install piper-tts faster-whisper numpy      # Piper voice file: huggingface.co/rhasspy/piper-voices (en_US-lessac-medium used for the test)
python3 build.py sky.json out v.onnx            # out/voice.wav + out/timing.json
node render.mjs out                             # out/video.mp4  (needs `playwright` resolvable, ffmpeg)
```

- `sky.json` is the example (5 scenes, 18 s). A scene = a `visual` key from `visuals.js` + the spoken `text`.
- Add a visual: one entry in `visuals.js` (`bg` gradient, mascot `pose`: idle, point or cheer, `draw(t, progress)` returning SVG for the 1080x1330 stage).
- Everything is a function of time, so frames are deterministic. Mascot lives in `mascot.js`; captions in `explainer.html`.
- Check the voice's licence before ads or monetisation; Piper voices differ. Pixel-art inserts and music are not built in yet.
