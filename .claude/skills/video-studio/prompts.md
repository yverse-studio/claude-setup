# Prompt and script library (research 2026-10-25)

Source report: `/mnt/project-files/claude-setup/research/2026-10-25-creator-video-styles.md`. No public primary source exists for @sinaboto, @jeremyfindsai or @pokecenterstaff, so these are rebuilt from public tools that do the same job; fill `{PLACEHOLDERS}`. Check commands on the repo or docs page before use.

## Free routes (kept sources)
| Route | What it is | Licence | Source |
|---|---|---|---|
| explainroo | Claude Code writes the script; Kokoro voice, word timing, Chrome frames, ffmpeg; no API key | MIT | https://www.vincentschmalbach.com/how-to-make-videos-with-claude-code/ |
| HyperFrames | HTML + GSAP to MP4, Three.js adapter, kokoro word timestamps | Apache-2.0 | https://www.heygen.com/research/html-to-video |
| Remotion + `remotion-dev/skills` | React video; `@remotion/three` for 3D; animate only from `useCurrentFrame()` | company licence above 3 people, check | https://www.remotion.dev/docs/three |
| Blender via `bpy` (cloud) or Blender MCP (laptop) | blockout, clay and toon renders, POV test (`templates/blender-pov/`) | GPL / MIT | https://github.com/ahujasid/blender-mcp |
| Manim | 2D diagrams, not 3D heroines | MIT | https://claudemarket.ai/skills/affaan-m/everything-claude-code/manim-video |

Skip list (funnels, paywalled prompt packs, vendor claims): see the report. Blender MCP honest limit (one blog): object keyframes work, rigging, IK and timing need human fixes.

## T1 Script
```
Make me a short {DURATION}s explainer video about {TOPIC} for {AUDIENCE}. Use {FRAMEWORK_REPO}: clone it, read its AGENTS.md, follow the steps.
Voice: calm, {LANGUAGE}, {WORDS_PER_SECOND} words/s. Hook in the first 3 s. One idea per sentence.
Output: script.md with numbered beats, each beat = one spoken sentence + the on-screen visual in 6 words.
```
## T2 Shot list
```
From script.md write shots.json: [{id, startSec, endSec, spokenText, visual, camera, heroinePose, insertCard?, captionStyle}].
Max {N} scenes. Hero = {HERO_DESCRIPTION}, same palette {HEX_LIST} every shot. Pixel-art insert cards are {W}x{H} PNGs in assets/.
Do not write code yet. Ask me only if a beat has two sensible visuals.
```
## T3 Render script (Remotion; HyperFrames: `/hyperframes` and `/gsap` instead)
```
npx skills add remotion-dev/skills. Build compositions from shots.json and captions.json (word, startMs, endMs).
Rules: animate from useCurrentFrame(); no useFrame; <Sequence from=...> on every scene; ThreeCanvas needs width/height and Sequence layout="none"; gl renderer angle.
Captions: one word at a time, big, on the beat, merge tokens under 200 ms.
First a 5 s smoke render (--scale=0.25), screenshot frames {FRAMES}, look, fix, then the full render and ffmpeg mux. Report duration and size.
```
## T4 Blender loop (`bpy` in the cloud or Blender MCP)
```
Build {SCENE} in low-poly toon style: palette {HEX_LIST}, soft key light + rim, camera {LENS}mm.
Loop, max {N} rounds: (1) one change via Python (2) screenshot or 25% render; if blank, retry (3) one line: what is wrong vs the goal (4) fix. Save the .blend each round.
Animate only with keyframes or per-frame pose resets. Rotate bones around their own head. Render PNG frames to {OUT_DIR}, then ffmpeg to mp4.
```
## T5 Blockout for an AI video model (paid or GPU step)
```
Block out shot {N} with grey boxes and capsules only: subject positions, one camera move, {SECONDS}s. Render the animatic and a depth pass; export frame 1 as the start image.
Then write the generator prompt: "{SUBJECT}, {STYLE}, {ACTION}, camera {MOVE}, keep layout of reference". Do not describe what the blockout already fixes.
```
## T6 POV reel
No source with a prompt was found. Reconstruction: selfie image + image-to-video prompt "first-person view, {GLIDER/BENDING}, hands in frame, {ORIGINAL WORLD}". See `people-video.md`.
