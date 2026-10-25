---
name: video-watching
description: How a cloud thread watches an Instagram/TikTok link yskills shares; tested 2026-10-17, report and open pick
metadata:
  type: project
  modified: 2026-10-17T23:08:35.575Z
---

yskills wants to share IG/TikTok links (skill/plugin tips) and have a thread really watch, explain and fact-check them; later the Social Media Manager project needs his own account via official APIs.

Tested 2026-10-17 in a cloud thread: yt-dlp without login downloads public reels; `watch` skill (local engine) gives keyframes; faster-whisper small transcribes free on CPU (decode audio to wav with ffmpeg first: PyAV in the container breaks its decoder). WhisperX/Gemini/Groq not set up. Links, never files.

**How to apply:** report at /mnt/project-files/claude-setup/research/video-watching-2026-10-17.md. yskills tapped Free local (no Gemini) 2026-10-17; claude-setup PR 140 merged 2026-10-17: watch skill auto-uses faster-whisper when no key, posted link = watch it (Seen/Heard/Fact check/For claude-setup), USING.md "Share a video". TikTok still untested. Never use his login cookies.
