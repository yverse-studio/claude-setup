# Launch video lane (/brag, 2026-10-26)

yskills on the first /brag run for Y-Land: "war nicht schlecht ... ab jetzt auch in unseren projekten sowas schnell und günstig machen können". This lane turns any project repo into a 15 s promo in the product's own look. It costs nothing (open source, renders locally) and takes about 15 minutes of agent time plus a 1 minute render. Reference output (Y-Land, vertical, 15 s): the claude.ai project's files under `social/2026-10-26-brag/brag-tool/`.

## When to use it

- **Use it for:** update and launch announcements, a feature drop, a store or landing-page trailer, and posts on product accounts (Claude decides those).
- **Don't use it for:** yskills' own @xyskillsx posts. His style is face first, real screen and no designed cards ([`social-team/xyskillsx-style.md`](../../../social-team/xyskillsx-style.md)). /brag builds designed cards around the product, so there it is at most a second post next to his face-first cut, never in place of it.

## Tools

| Part | What it is | Licence | Cost |
|---|---|---|---|
| [latent-spaces/brag](https://github.com/latent-spaces/brag) skill | Reads the repo (README, colours, fonts, the app's own art) and plans, scripts and storyboards the video. Read on 2026-10-26 at commit `669ab92`. | MIT | free |
| HyperFrames (`npx hyperframes`) | Turns an HTML composition into a video: `check`, `snapshot`, `render`. | Apache-2.0 | free, local |
| Music | Sascha Ende, "Happy Beats / Business Moves" vol 1, 9, 10, 11 and 12 | CC BY 4.0 (not covered by the skill's MIT licence) | free, but the credit line is required |

No API key, no account and no paid plan. The only download is a headless Chrome in `~/.cache`.

## Run it

1. Get the skill into scratch rather than installing it as a plugin: `git clone https://github.com/latent-spaces/brag <scratch>/brag`. If HEAD has moved past `669ab92`, read `git diff 669ab92..HEAD` first (CLAUDE.md, outside skills). Then run `npx hyperframes browser ensure`.
2. Give a subagent the run and point it at `<scratch>/brag/skills/brag/SKILL.md`. Say **"use the full brag"** (or pass `--full`), because on Opus 5.5 the skill otherwise hands off to `/brag-slim`. Also pass `--format vertical --duration 15` and the product repo path. Screenshots come from the local dev server (`npm run dev`), never from production. Numbers on screen must be real, taken from the live data or the HUD.
3. The subagent checks with `npx hyperframes check` (0 errors) and `npx hyperframes snapshot --at 1,3,5,...`, looks at the stills, then renders with `npx hyperframes render --quality delivery --output <out>/brag.mp4`.
4. For a trending sound, also render a no-music master: `--no-music`, or strip the audio and add a silent AAC track the way `templates/yland-film/comp.sh` does.

## Music credit

If the bundled music stays in, the post description carries this line: `Music: Sascha Ende, ende.app (CC BY 4.0)`. The no-music master needs no credit.

## Critic check (fresh agent, before anyone sees it)

1. **The product's own look:** its own font, colours and art, not a SaaS template. Compare one still with a real screenshot of the product.
2. **Every claim and number is real:** counts, features and prices. Jokes are fine, made-up features are not.
3. **Legible on a phone:** text at 390 px width, inside the safe band (top 250 px and bottom 400 px stay free for the app UI).
4. **No dead layout:** no empty quadrant held for more than 1 s. Card layouts stay varied, because the Y-Land run's mid-section was flat and template-like.
5. **Cuts land on the beat:** the music cue sheet shows them, and the pacing check from `../../learnings.md` (2026-10-07) passes.
6. **People:** real names or handles only where the project allows it. Y-Land allows them (`yskills-taste` memory).

After that comes the normal delivery: `final.mp4` plus `final-nomusic.mp4` go to the `social-team` queue, and nothing is uploaded until yskills says "upload".
