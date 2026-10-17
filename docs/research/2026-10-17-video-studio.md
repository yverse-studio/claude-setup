# Video studio research (2026-10-17)

Why the `video-studio` skill is shaped the way it is. History, not rules.

Ask (yskills, 2026-10-17): videos and ads made like a professional studio, planning, script, an
effects person, an After Effects person, each with their own tasks and skills; look at the state
of the art, including skills and plugins sold on Instagram.

## Findings

- Pro short-form and ad teams split into the same stages: brief and concept, script with hooks,
  storyboard or animatic, edit, motion graphics, review. Agency guides agree the first 1-3 s decide
  the view, lo-fi creator-style beats polished studio ads on TikTok, and ads need several hook
  variants to test. These are agency blogs, not TikTok's own Creative Center.
  [bevycommerce](https://bevycommerce.com/insights/tiktok-ads-strategy-creative-best-practices-for-2026),
  [rocketshiphq](https://www.rocketshiphq.com/?p=7028),
  [stackmatix](https://stackmatix.com/blog/tiktok-creative-best-practices-2026)
- Community skill packs map one skill per stage (script, storyboard, edit, voice, publish); none
  is a coordinated team, and quality varies.
  [aividpipeline](https://aividpipeline.com/blog/best-agent-skills-video-production-2026),
  [tella](https://www.tella.com/blog/best-claude-code-skills)
- Remotion ships official agent skills (`npx skills add remotion-dev/skills`); licence free for
  teams of up to 3. [remotion.dev](https://www.remotion.dev/docs/ai/skills)
- HyperFrames (HeyGen, Apache-2.0) is already in `toolbox` `catalog/video-audio.md`: HTML + GSAP
  to MP4, runs in cloud threads, fits a Vue/HTML stack. It is the motion role's default.
- After Effects: several community MCP servers (most cited `Dakkshin/after-effects-mcp`) drive AE
  through scripting, all need AE open on a PC and a paid Adobe licence; none tried.
  [glama](https://glama.ai/mcp/servers/kq2n1g3cr5),
  [claudemarketplaces](https://claudemarketplaces.com/mcp/dakkshin/after-effects-mcp)
- "Claude skills" sold on Gumroad and promoted on Instagram are mostly prompt packs (often labelled
  for ChatGPT too), a few dollars each; nothing in them beats the free official skills above.
  [Gumroad example](https://inflectual.gumroad.com/l/master-marketing-claude-skills-bundle)

## Verdict

Adopt: Remotion's official skills (React projects only), HyperFrames (default), ffmpeg and the
existing `media-editing` and `watch` skills. Build: the six role playbooks and the pipeline with a
Critic on the animatic, because the Y-Land promos (`learnings.md`) failed on hook, captions and
framing, which an animatic review catches before filming. Skip: paid prompt packs; After Effects
until yskills says they own it.
