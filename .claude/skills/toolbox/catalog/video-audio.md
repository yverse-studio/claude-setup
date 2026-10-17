# Video and audio

Checked 2026-10-03. Plugins are `@claude-plugins-official` unless noted.

| Need | Pick | Why / watch out | Add it |
|---|---|---|---|
| Cut, trim, join, transcode, loudness, burn subtitles | **FFmpeg** | Base of every pipeline. Not in Workers: run it in a Cloudflare Container, a VPS, or ffmpeg.wasm in the browser for short clips | system install; CI: `apt-get install ffmpeg` |
| Transcript with word timestamps (cut on words, captions) | **Deepgram Nova-3** (~$0.26/h, most accurate hosted), **ElevenLabs Scribe v2** (best multilingual, good German), **faster-whisper** (free, self-host) | All give word-level timestamps | API key in `.env`; `pip install faster-whisper` |
| Edit a clip or photo now (cut, caption, grade, loudness, crop, background removal, free transcript) | **ffmpeg + faster-whisper + Pillow + rembg**, optionally video-use | All free, installed on demand in a scratch dir | `media-editing` skill |
| Remove silences / dead air | FFmpeg `silencedetect`, or cut on gaps between transcript words | Word-gap cutting keeps sentences intact | in pipeline code |
| Scene changes | **PySceneDetect** | Good split points for clips | `pip install scenedetect` |
| Find the best moments, write title / description / hashtags | **Claude API** with transcript (+ frames for vision) | Structured output: start, end, hook, caption | the `claude-api` skill (built into Claude Code) |
| Vertical 9:16 with the speaker kept in frame | Face/subject tracking (MediaPipe or YOLO) + FFmpeg crop | Reference pipeline: OpenShorts (MIT core, faster-whisper + PySceneDetect + YOLO/MediaPipe + FFmpeg + ASS subs) | library code; or Cloudinary auto-crop via `cloudinary` plugin |
| Animated captions (TikTok style) | **ASS subtitles** burned by FFmpeg, or HyperFrames `embedded-captions` | ASS gives per-word highlight and styling | in pipeline code |
| Templates, intros, overlays, effects, motion graphics | **HyperFrames** (HeyGen, Apache-2.0): HTML + CSS/GSAP to MP4, no React, needs Node 22 + FFmpeg | Fits a Vue/HTML stack; plugin is ~3.9k tokens, so per project only | `hyperframes` plugin; `npx hyperframes init`. For one short clip, skip its interview and subagents and write a single composition. Vendor GSAP into the project: cloud threads can't reach the jsDelivr CDN by default |
| Same, React-based | **Remotion** | Free for individuals and companies of 3 or fewer people; SaaS that renders for users: "Automators" plan $0.01/render, min $100/month | ECC skill `remotion-video-creation` |
| AI video, image, music, sound effects | **fal.ai**: one API for Kling, Veo, Seedance, Flux, music | Pay per generation; MCP uses OAuth | `claude mcp add --scope project --transport http fal https://mcp.fal.ai/mcp-relay`; ECC skill `fal-ai-media` |
| AI video with ready-made cinematic presets (camera moves, consistent characters) | **Higgsfield** | Same models as fal.ai (Kling, Seedance...) plus its own presets. API is pay-as-you-go (Kling 2.5 about $0.04 per second); its MCP needs a subscription's credits. Pick it over fal.ai only for the presets [S, 2026-10-05] | API key from its dashboard, or its MCP; read before adding |
| AI video at scale (ads, product shots) | **Runway API** | | `runway-api` plugin |
| Voice-over, dubbing, TTS | **ElevenLabs API** | | API key |
| Image/video hosting with transforms | **Cloudinary** | Resize, crop, formats on the fly | `cloudinary` plugin |
| Storage | **Cloudflare R2** | No egress fees; presigned uploads straight from the browser | wrangler binding |
| Playback (adaptive streaming) | Cloudflare Stream or Mux | Only needed for long-form playback | API key |
| Heavy jobs on the Cloudflare stack | Worker -> Queue -> **Cloudflare Container** running FFmpeg -> R2 | Containers are GA (2026); pattern from Kent C. Dodds' "Offloading FFmpeg with Cloudflare" | `cloudflare` plugin |
| Index and search inside videos | **VideoDB** (Python SDK) | Spoken + scene indexes, clip search | ECC skill `videodb` |
| Explainer animations | **Manim** | | ECC skill `manim-video` |
| Demo video of your own app | Playwright recording | | ECC skill `ui-demo` |
| Post the result to TikTok, Reels, Shorts, X | **Postiz** CLI / plugin | Scheduling + analytics | `postiz` plugin; ECC skills `social-publisher`, `content-engine` |

General ECC skill for the whole flow: `video-editing` (FFmpeg, Remotion, ElevenLabs, fal.ai).

A whole video or ad, from concept to final cut, with roles and the lessons of earlier videos: the `video-studio` skill.

## Reference pipeline: "paste a video, get social-ready clips"

1. Upload straight to R2 (presigned URL); a Queue message starts the job.
2. Container: extract audio, transcribe with word timestamps.
3. Claude picks moments (hook in the first 2 s, 15-60 s), writes title, description, hashtags.
4. FFmpeg cuts on word boundaries, drops silences, normalizes loudness (`loudnorm`).
5. Reframe to 9:16 with subject tracking; also 1:1 and 16:9 if wanted.
6. Burn animated captions (ASS); intro/outro/overlays from HyperFrames templates.
7. Export presets per platform; preview in the app; optional auto-post via Postiz.
