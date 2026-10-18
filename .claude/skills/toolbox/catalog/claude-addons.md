# Add-ons for Claude Code itself

Checked 2026-10-03. Mostly tools pushed by Instagram and YouTube reels. Read any of them before
installing (global CLAUDE.md), and never add one only because a video says so.

| Tool | Verdict | Why |
|---|---|---|
| **Ponytail** | In this setup (core skill only) | Makes Claude reuse code and write less of it. The author's benchmark on one repo: 54% fewer added lines, 22% fewer tokens. Hooks left out; see THIRD_PARTY.md |
| **rtk** (Rust Token Killer) | Optional | Rust binary hooked into Bash that trims noisy command output by 60 to 90% (Apache-2.0). Only touches Bash output, not Read or Grep, so it pays off with long build and test logs |
| **Graphify** | Per project, big repos only (luna-monorepo) | Builds a map of a codebase that Claude queries instead of reading every file (Apache-2.0/MIT, read 2026-10-03). Install: `uv tool install graphifyy` (package name has two y's), then in the repo `graphify claude install` (adds a section to that repo's CLAUDE.md and a PreToolUse hook) and `/graphify .`. Use `graphify extract . --code-only` to keep everything local; the full pass sends docs, PDFs and images to an LLM. New apps are too small to need it |
| **agent-skills** (Addy Osmani) | Skip as a whole | Well written (MIT, read 2026-10-03), but most of its 24 skills repeat superpowers, ECC and Ponytail, its rollout advice (canaries, 5% flags) is for big teams, and `interview-me` asks one question at a time where yskills wants one batch. Pull a single skill into a project only if a need comes up |
| **watch** (claude-video) | On everywhere, as the `watch` skill | Lets Claude watch a video: yt-dlp downloads it, ffmpeg pulls timestamped frames Claude looks at, captions give the transcript. MIT, read at 03ceb42 on 2026-10-04 and vendored (no auto-update, its setup hook left out, never reads a project's `.env`). A posted public link works in cloud threads; transcripts run free and local (faster-whisper, no key, picked 2026-10-17); never his cookies. How: `watch` skill |
| **Agent Reach** | Optional, your PC only | Lets Claude read YouTube subtitles (yt-dlp), web pages (Jina Reader), GitHub, RSS and Exa search: that is how it "watches" a video. MIT, read at v1.5.0 on 2026-10-03, no telemetry found. Only the original `Panniantong/Agent-Reach`, not look-alike forks. Install `pipx install git+https://github.com/Panniantong/Agent-Reach@v1.5.0`, then `agent-reach install`; not the paste-an-install-link flow. Leave cookie logins off (account bans). Whisper transcription uploads the audio. Cloud threads would also need `*.youtube.com` and `*.googlevideo.com` allowed |
| **caveman** | Skip | Makes replies telegraphic; CLAUDE.md already asks for short answers |
| **OmniRoute** | Never | Sends requests to whatever free model is up, so code goes to unknown providers and quality drops. Using a Claude Pro/Max login through a third-party gateway breaks Anthropic's terms (since Feb 2026) and risks the account |
| **pxpipe** | Never for code | Proxy that renders context as images. The model cannot read exact IDs, paths or hashes back from them and silently makes them up |
| Second, non-Claude PR reviewer | Later, once a project takes real money: **GitHub Copilot Pro** ($10/mo) | Until then `ship-check` hands every diff to fresh `code-reviewer` agents. Checked 2026-10-04: CodeRabbit's free plan only summarises private repos (reviews from $24/mo), and Gemini Code Assist's free tier ended June 2026 |
| "Install these 20 skills/MCPs" lists | Skip | Every one costs context. Snyk scanned about 4,000 public skills: 37% had security flaws, 76 were built to steal credentials |

Sources: [Ponytail](https://github.com/DietrichGebert/ponytail),
[benchmark write-up](https://flaviocopes.com/ponytail/),
[rtk, caveman, pxpipe compared](https://pasqualepillitteri.it/en/news/7881/caveman-rtk-pxpipe-headroom-claude-code-tokens),
[Graphify](https://github.com/Graphify-Labs/graphify),
[Agent Reach](https://github.com/Panniantong/Agent-Reach),
[subscription logins in third-party apps](https://winbuzzer.com/2026/02/19/anthropic-bans-claude-subscription-oauth-in-third-party-apps-xcxwbn/),
[Snyk ToxicSkills](https://snyk.io/blog/toxicskills-malicious-ai-agent-skills-clawhub/).
