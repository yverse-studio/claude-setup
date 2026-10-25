# Creator video styles with Claude and free tools (research, 2026-10-24)

Method: WebSearch only, snippets and summaries, no page was opened. Anything marked (unverified) rests on a search summary or a vendor claim. Details such as commands and versions must be checked on the primary repo or docs before use.

## Honest gap first
- I found NO public primary source for @sinaboto, @jeremyfindsai or @pokecenterstaff (their posts or prompts). A search for jeremyfindsai returned nothing about that creator. The creator recipes below are therefore reconstructions from public tools that do the same job, not copies of those creators' prompts. Ask yskills for the post links if exact prompts are wanted.
- No source tests the full stack Kokoro -> faster-whisper -> Remotion -> ffmpeg end to end. Pieces exist and fit together (see Pipeline).

## Sources kept (real, reproducible, primary or near-primary)

K1. explainroo (MIT, Vincent Schmalbach): local pipeline. Kokoro voice, timestamped Whisper word timing, Chrome renders frames, ffmpeg muxes to out/video.mp4. No API keys. Needs Node 20.11+, ffmpeg, Chrome. First run downloads about 400 MB of models. Entry prompt: "Make me a short explainer video about [topic]. Use explainroo for it: clone https://github.com/vincentsch/explainroo, read its AGENTS.md and follow the steps."
 - https://www.vincentschmalbach.com/how-to-make-videos-with-claude-code/ , https://skillsllm.com/skill/explainroo , https://trendshift.io/repositories/271330
 - This is the closest public match to style 2 (@jeremyfindsai: script + open libs + AI voice, no video model). Listing says it works best with Claude Code on the top Opus model.

K2. HyperFrames (HeyGen, Apache-2.0, opened 2026-04-17): HTML + CSS + GSAP to deterministic MP4 via headless Chrome + FFmpeg; no neural rendering. Install `npx skills add heygen-com/hyperframes`; slash commands /hyperframes, /hyperframes-cli, /gsap. Has a Three.js adapter (drives scenes from hf-seek / window.__hfThreeTime, not wall clock) and a media skill using kokoro-onnx with word-level timestamps.
 - https://themenonlab.blog/blog/hyperframes-claude-code-writes-renders-videos , https://www.mindstudio.ai/blog/what-is-hyperframes-html-video-renderer-ai-agents , https://www.heygen.com/research/html-to-video , https://skills.sh/heygen-com/hyperframes/hyperframes-media , https://www.vibeindex.ai/skills/heygen-com/hyperframes/three
 - Byte-identical output is a vendor claim: hash two renders to check.

K3. Remotion + Claude Code: `npx create-video@latest`, `npx skills add remotion-dev/skills` (skills stop Claude writing outdated API), describe video, preview in Remotion Studio, `npx remotion render`. Founder Jonny Burger publishes step-by-step Claude Code sessions. Common bug: missing `from` on `<Sequence>` makes everything start at frame 0. Official docs page named: remotion.dev/docs/ai/claude-code (confirm commands there).
 - https://zerofuturetech.substack.com/p/generate-videos-with-claude-code , https://blog.openreplay.com/making-videos-claude-code-remotion/ , https://www.heyuan110.com/posts/ai/2026-01-26-claude-code-remotion-video/
 - Licence note: Remotion has a company licence for larger teams; check remotion.dev license before commercial use (not verified here).

K4. Remotion + three.js (@remotion/three): `npm i three @react-three/fiber @remotion/three @types/three`. Animate ONLY from useCurrentFrame(), never R3F useFrame. `<Sequence layout="none">` inside ThreeCanvas. Width/height required. Use ANGLE GL renderer for server render (default OpenGL fails).
 - https://www.remotion.dev/docs/three , https://v4.remotion.dev/docs/three
 - Third-party mirror of the same rules as a skill file (verify first): https://docs.creem.io/.cursor/skills/remotion-best-practices/rules/3d.md

K5. Captions: Remotion `convertToCaptions()` expects whisper.cpp output; merge tokens inside about 200 ms for word-by-word captions. faster-whisper word JSON must be converted to that shape (my inference, not sourced).
 - https://remotion.dev/docs/install-whisper-cpp/convert-to-captions
 - Kokoro-FastAPI lists per-word timestamps in its feature list (Kokoro is Apache weights): https://github.com/skyiron/Kokoro-FastAPI-TTS ; Kokoro JS: https://cdn.jsdelivr.net/npm/kokoro-js@1.2.0/README.md

K6. Generic headless-capture recipe for three.js/canvas: `renderFrame(t)` called per frame by Puppeteer, screenshot, then `ffmpeg -framerate 30 -i frame-%04d.png -c:v libx264 -pix_fmt yuv420p out.mp4`. Pitfall: captureScreenshot races the renderer, wait for settle. puppeteer-capture uses an experimental CDP API (risk).
 - https://hackmd.io/@bok-ai-lab/r15cA8sZbe , https://cdn.jsdelivr.net/npm/puppeteer-capture@1.58.0/README.md , https://hackernoon.com/the-missing-interface-in-ai-generated-animation-is-seekt

K7. Manim + Claude: yusuke710/manim-skill (Plan -> Code -> Render -> Iterate; needs cairo, pkg-config, ffmpeg, Manim Community): https://cdn.jsdelivr.net/gh/yusuke710/manim-skill@main/README.md . ECC `manim-video` skill (thesis first, 3-6 scenes, low-quality smoke render first, 16:9, thumbnail frame): https://claudemarket.ai/skills/affaan-m/everything-claude-code/manim-video . Also a toolkit of Remotion/Manim/ffmpeg skills: https://github.com/wilwaldon/Claude-Code-Video-Toolkit
 - Manim fits 2D diagrams, not toon 3D heroines.

K8. Blender MCP (ahujasid/blender-mcp, MIT, about 17k stars at snapshot): addon.py in Blender + MCP server. `claude mcp add blender uvx blender-mcp`. Needs Python 3.10+, Blender 3.0+, uv. Object/material/scene control, run Python in Blender, Poly Haven / Sketchfab / Hyper3D / Hunyuan3D asset hooks (Hyper3D is a paid-credit API, Poly Haven is free).
 - https://glama.ai/mcp/servers/ahujasid/blender-mcp , https://yuv.ai/blog/blender-mcp , https://www.augmentcode.com/mcp/blender-mcp
 - Other Blender MCPs with viewport screenshot + render + MP4: sandraschi/blender-mcp https://github.com/sandraschi/blender-mcp ; ClaudeKit https://glama.ai/mcp/servers/olbboy/claudekit-blender-mcp ; blend-ai (about 108 tools, turntable render) https://glama.ai/mcp/servers/wgqttro6cr . Tool counts unverified.
 - Reality check (single undated blog): basic object animation works; rigging, weight paint, IK, animation curves and timing fail or need heavy human correction; spatial placement needs several correction rounds; visual judgment weak. https://www.mindstudio.ai/blog/claude-blender-mcp-real-world-performance
 - Known issue: Blender screenshot sometimes returns a blank frame (vendor note, https://pardesco.com/products/blender-mcp-one-click-installer ; that product is a paid installer, Skip the product, the BlenderMCP itself is free).

K9. Blockout -> AI video: render grey/low-poly Blender scene (animatic), use as depth/composition/start-frame reference for Seedance or Kling; three control modes: motion reference (video-to-video), render passes (depth/pose/edge into ComfyUI/ControlNet), start-frame. Plain stand-ins work better than detailed models (anecdotal).
 - https://curiousrefuge.com/blog/how-to-control-ai-videos-with-blender-and-claude (Blender MCP + Claude for set, pose, camera, then Seedance; course marketing, article only partly checked), https://flick.art/blog/blender-ai-filmmaking , https://tesseract.academy/from-blender-to-ai-video-a-faster-creative-workflow/ , https://invideo.io/faq/how-do-you-use-a-blender-blocking-render-as-a-camera/
 - No source found on fal.ai endpoints or whether they accept depth input: check fal.ai docs directly.

K10. Free local image-to-video: Wan 2.2 (Apache 2.0) in ComfyUI. 5B TI2V about 720p/24fps on 8 GB VRAM; 14B needs 16 GB+ (GGUF quant can run on 8 GB, about 3 min for 5 s at 480p); all sources assume a GPU, CPU-only impractical. https://stable-diffusion-art.com/wan-2-2-image-to-video/ , https://www.mindstudio.ai/blog/what-is-wan-2-2-video-open-source , https://www.runflow.io/blog/comfyui-wan-2-2-image-to-video
 - yskills' laptop GPU unknown; cloud container has no GPU (assumption).

## Skip list
- Seedance 2.5 "50 reference inputs", "reads camera layouts from white models": vendor marketing (https://dreamina.capcut.com/seedance/seedance-2-5-blender-model-workflow). Skip as proof.
- Picsart MCP / Dreamina-x-Codex pages, invideo FAQ: tool funnels. Use only for the concept.
- Udemy "Claude AI for creative work" course, Skool post, pardesco paid installer, Telegram/aggregator repost pages: paywalled or funnel. Skip.
- learnwithhasan / growwstacks guides: "faceless shorts" funnel content, not opened, not verified. Skip until read.
- Aggregator star/install counts (skillselion, vibeindex): inconsistent, ignore.

## Pipeline (all free, assembled from K1-K6)
1. Script text (Claude) -> 2. Kokoro WAV (K1/K5) -> 3. word timestamps (faster-whisper or Kokoro timings; convert to captions JSON) -> 4. scenes as React (Remotion) or HTML+GSAP (HyperFrames), three.js via K4 -> 5. render -> 6. ffmpeg mux/loudnorm. HyperFrames/explainroo already bundle 2-3.

## Prompt templates (reusable; sources show the pattern, wording is mine)

T1 Script prompt (pattern: explainroo entry prompt, https://www.vincentschmalbach.com/how-to-make-videos-with-claude-code/)
```
Make me a short {DURATION}s explainer video about {TOPIC} for {AUDIENCE}. Use {FRAMEWORK_REPO}: clone it, read its AGENTS.md, follow the steps.
Voice: calm, {LANGUAGE}, {WORDS_PER_SECOND} words/s. Hook in the first 3 s. One idea per sentence.
Output: script.md with numbered beats, each beat = one spoken sentence + the on-screen visual in 6 words.
```
T2 Shot-list prompt (pattern: Manim ECC "thesis first, 3-6 scenes, smoke render", https://claudemarket.ai/skills/affaan-m/everything-claude-code/manim-video)
```
From script.md write shots.json: [{id, startSec, endSec, spokenText, visual, camera, heroinePose, insertCard?, captionStyle}].
Max {N} scenes. Hero = {HERO_DESCRIPTION}, same palette {HEX_LIST} every shot. Pixel-art insert cards are {W}x{H} PNGs listed in assets/.
Do not write code yet. Ask me only if a beat has two sensible visuals.
```
T3 Render-script prompt (pattern: Remotion skills + K4 rules, https://www.remotion.dev/docs/three)
```
Install skills: npx skills add remotion-dev/skills. Build compositions from shots.json and captions.json (word, startMs, endMs).
Rules: all animation from useCurrentFrame(); no useFrame; <Sequence from=...> on every scene; ThreeCanvas needs width/height and Sequence layout="none"; gl renderer angle.
Captions: one word at a time, big, on the beat, merged tokens <200 ms.
First render a 5 s low-quality smoke test (npx remotion render --scale=0.25), screenshot frames {FRAMES}, look at them, fix, then full render. Run mux with ffmpeg and report duration and file size.
```
(For HyperFrames swap the first lines for `/hyperframes` and `/gsap`; https://themenonlab.blog/blog/hyperframes-claude-code-writes-renders-videos)

T4 Blender-MCP loop prompt (pattern: viewport screenshot + render loop, https://github.com/sandraschi/blender-mcp ; limits https://www.mindstudio.ai/blog/claude-blender-mcp-real-world-performance)
```
Blender is connected via MCP. Build {SCENE} in low-poly toon style: palette {HEX_LIST}, soft key light + rim, camera {LENS}mm.
Loop, max {N} rounds: (1) make ONE change via Python (2) take a viewport screenshot; if blank, retry or render at 25% (3) state in one line what is wrong vs the goal (4) fix. Save .blend after every round.
Animate only with keyframes on object transforms (location/rotation/scale, 24 fps, frames {START}-{END}). No rigging, no IK, no weight painting; build the character from parented primitives.
Finish: render {W}x{H} PNG sequence to {OUT_DIR}, then ffmpeg to mp4.
```
T5 Blockout-for-AI-video prompt (paid generator step; pattern https://curiousrefuge.com/blog/how-to-control-ai-videos-with-blender-and-claude , https://flick.art/blog/blender-ai-filmmaking)
```
In Blender, block out shot {N} with grey boxes and capsules only: subject positions, one camera move (dolly/orbit), {SECONDS}s. Render the animatic plus a depth pass. Export frame 1 as start image.
Then write the generator prompt: "{SUBJECT}, {STYLE}, {ACTION}, camera {MOVE}, keep layout of reference". Do not describe details the blockout already fixes.
```
T6 POV reel (style 4): no source with a prompt was found. Reconstruction: selfie image + image-to-video model prompt "first-person view, {GLIDER/BENDING}, hands in frame, {WORLD}". Treat as paid-generator or Wan 2.2 local (K10).

## Per-style verdict

1. @sinaboto-style toon 3D heroine, pixel cards, word captions, VO: PARTLY/MOSTLY free. Heroine as low-poly three.js (Remotion K4 or HyperFrames Three adapter) or Blender-rendered turntable/poses; pixel cards = PNGs (Claude can draw them in code); captions + Kokoro all free. Ceiling: simple, stylised, mostly posed/walk-cycle motion; no expressive character acting without hand rigging. Needs a heroine asset: build from primitives or take a CC0 model (licence check).
2. @jeremyfindsai: FULLY free (explainroo K1, HyperFrames K2, Remotion K3). Ceiling: motion-graphics/code-animation look, not footage. Real match to the "no video model" claim.
3. @pokecenterstaff clay/diorama: PARTLY. Blender (Cycles/Eevee) with soft materials, DoF and area lights renders glossy clay rooms free, and Claude can script it via Blender MCP, but character acting and mockumentary mouth/body motion are the weak point (MindStudio limits). Ceiling: static or slow-camera diorama shots with puppet-like prop motion, subtitles on beat. Moving clay characters need a paid generator or heavy manual animation.
4. POV fantasy reels: needs a generator. Free route only via Wan 2.2 locally if a GPU exists (K10), quality below Kling/Veo (no comparison source found). Skip this style at zero budget unless GPU confirmed.
5. Blockout -> AI video: Blender part free; the video model step is paid (Seedance/Kling via fal.ai, price not researched). Free substitute is Wan 2.2 + ComfyUI depth control (K9, K10), needs GPU.
6. Claude drives Blender (Arcane-style insect): PARTLY. Loop works (K8); polished painterly Arcane look, rigging and timing do not (single-source warning). Ceiling: simple procedural/transform animation of a stylised model with look-and-fix passes.

## Final table

| Style | Free route | Ceiling | Paid-only part | Sources |
|---|---|---|---|---|
| 1 toon 3D heroine explainer | Remotion/HyperFrames + three.js, Kokoro, Whisper timings, ffmpeg, Blender stills | Stylised, posed or simple-cycle motion, strong captions | none, except a rigged expressive heroine | K2 K3 K4 K5 K8 |
| 2 jeremyfindsai code-only | explainroo, HyperFrames or Remotion + Kokoro | Full match (motion graphics look) | none | K1 K2 K3 |
| 3 clay diorama mockumentary | Blender via MCP, Eevee/Cycles, DoF; subtitles via Remotion | Gorgeous static/slow-camera rooms; characters hardly move | moving clay characters (generator) | K8, mindstudio limits |
| 4 POV fantasy reels | Wan 2.2 local if GPU | Lower quality than Kling/Veo | Kling/Seedance/Veo for the real look | K10 (no recipe source) |
| 5 blockout -> AI video | Blender blockout + Claude free | Layout/camera control only | Seedance/Kling via fal.ai (or GPU for Wan) | K9 K10 |
| 6 Claude + Blender animation | Blender MCP loop, keyframes | Simple transform animation, no rigged acting | none (time cost) | K8 |

Recommendation: start with styles 2 and 1 (explainroo/HyperFrames first, then add a three.js heroine). Style 3 as stills. Skip 4 and 5 until GPU or budget exists.
