---
name: video-studio
description: "Make a short video or ad like a small studio: Producer, Writer, Director, Editor, Motion and a harsh Critic, each with its own job and tools. Use for any TikTok, Reel, Short, promo or ad."
---

# Video studio

yskills, 2026-10-17: videos and ads are made "like a professional studio, everyone with their own
tasks and skills". Six roles, one pipeline, one gate. Free, licence-clean tools first; anything
paid waits for yskills' card (CLAUDE.md, ask rule). Checked 2026-10-17; sources in
[`docs/research/2026-10-17-video-studio.md`](../../../docs/research/2026-10-17-video-studio.md).

Before anything else, every role reads [`learnings.md`](learnings.md): what earlier videos got
wrong and how they were fixed.

## The pipeline

| # | Step | Role | Output (in the project's `video/<slug>/` folder) | Gate |
|---|---|---|---|---|
| 1 | Brief | Producer | `BRIEF.md` from [`templates/brief.md`](templates/brief.md) | |
| 2 | Three concepts | Producer + Writer | three pitches, each with a first-frame still from the real product | **card**: yskills picks one |
| 3 | Script | Writer | hooks and the two-column script in `BRIEF.md` | |
| 4 | Board | Director | shot list, one still per shot, `animatic.mp4` (stills on the script's timing) | Critic on the animatic |
| 5 | Film and cut | Editor | raw capture, cut, captions, sound, `draft.mp4` | |
| 6 | Motion | Motion | titles, end card, transitions, overlays on top of the cut | |
| 7 | Gate | Critic (fresh) | the checklist with frame times, pass or fail | pass before yskills sees it |
| 8 | Deliver | Producer | `final.mp4` (+ ad variants), the one line to the coordinator | to the `social-team` queue |

Fixing the animatic costs minutes; fixing a filmed cut costs a render. So the Critic sees step 4
before anything is filmed, then the cut at step 7. A failed gate goes back to the step that owns
the fault, never straight to yskills.

## Roles

| Role | Does | Playbook | Runs as |
|---|---|---|---|
| Producer | brief, three concepts, the card, schedule, delivery; owns the whole video | [`roles/producer.md`](roles/producer.md) | the video's thread: `Producer · <video>` |
| Writer | hooks, script, captions, voice lines, ad variants | [`roles/writer.md`](roles/writer.md) | subagent of the Producer; a thread for an ad batch |
| Director | shot list, camera, storyboard stills, animatic | [`roles/director.md`](roles/director.md) | subagent of the Producer |
| Editor | capture, cut, captions, sound, encode, frame check | [`roles/editor.md`](roles/editor.md) | thread `Editor · <video>` (renders are long) |
| Motion | the "After Effects" job: titles, end cards, kinetic text, transitions, overlays | [`roles/motion.md`](roles/motion.md) | subagent of the Editor; a thread for a template set |
| Critic | the harsh first viewer; never made what it grades | [`roles/critic.md`](roles/critic.md) | a fresh subagent or thread `Critic · <video>` |

Thread titles follow the operator rule (`<Role> · <what>`). Text roles stay subagents because every
thread re-reads its context; Editor gets a thread because filming and encoding run long. Models: the
Models line in [`docs/WORKFLOW.md`](../../../docs/WORKFLOW.md); the concept pick and the Critic's
verdict are judgement (Opus subagent), the rest is a build (Sonnet).

## Tools (one pick per job)

| Job | Pick | Notes |
|---|---|---|
| Footage of our own web app or game | Playwright, deterministic frame stepping | the recipe in `learnings.md`; real-time capture in the cloud stutters |
| Cut, captions, loudness, encode | ffmpeg | `media-editing` skill recipes |
| Transcript of a voice memo | faster-whisper | `media-editing` |
| Motion graphics, titles, kinetic captions | **HyperFrames** (HeyGen, Apache-2.0, HTML + GSAP to MP4) | the cloud's After Effects; `toolbox` `catalog/video-audio.md` |
| Same in a React project | **Remotion** with its official skills (`npx skills add remotion-dev/skills`) | licence: free for teams of up to 3 people |
| Watch a reference video yskills shares | `watch` skill | frames + transcript, free |
| After Effects itself | only on yskills' PC, only if they already own it | community MCP servers exist (e.g. `Dakkshin/after-effects-mcp`), not tried: read it first (CLAUDE.md install rule) and ask by card |
| AI clips, AI voice, stock music | fal.ai, ElevenLabs | money and a new service: card first; AI people or voices need the AI label (`market` §4) |

Sold "Claude skill packs" from Instagram or Gumroad are prompt lists, not workflows: never bought.
Skim a free one only if it names something this table lacks.

## Every video

- **Real product, real footage.** The video shows what the app really does; mocked UI or AI-made
  product shots are a fail.
- **Phone first.** 1080x1920, 30 fps, captions in the top band away from TikTok's right-side and
  bottom UI; one caption at a time, 3-5 words.
- **Sound.** Organic posts ship with a silent track so yskills adds a trending sound in the app;
  ads and business accounts use the platform's commercial music library only; yskills' own voice
  memo when the concept needs a voice (exact lines from the Writer).
- **Ads.** Label and claims per `market` §4 (German advertising law); three hooks on one body so the
  ad can be tested; paying for ads is yskills' card.
- **Never posted by the studio.** `final.mp4` goes to the `social-team` queue; it posts per its Posting rules (yskills' "upload", or auto-post while yskills switched it on).
- **Lessons stick.** After delivery the Producer appends what went wrong and the fix to
  `learnings.md` (one line each, dated, project named) in the same PR flow as any setup change.
