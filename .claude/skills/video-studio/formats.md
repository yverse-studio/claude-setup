# Video formats (from the shared-video batches, 2026-10-23/24)

Source: videos yskills shared; tool names marked (unverified) came from captions only. Use the formats as shot lists, never copy a creator's character, look or name.

## Mascot-explainer (~45 s, from @sinaboto, 1.5M views; yskills: "make our own")
- Our own original mascot (the Designer makes it; not a copy of hers). Low-poly or toon 3D, same outfit every video.
- Script template: problem, then "so you add X", then "this is a X", then the next problem; end on "congratulations, you have built a ___". One history beat is allowed.
- One-word kinetic captions (HyperFrames), pixel-dissolve between steps, big type in the caption band.
- First topics are things our products touch. Shot list and script go to the Writer/Director as normal.

## POV magic (from Jonnel Cayabyab's reels; two modes)
- (a) real handheld selfie footage plus one AI element per shot (fire, water, glider);
- (b) fully generated video from reference photos of yskills, with a character sheet first so face and outfit stay the same in every shot.
- Formula: selfie angle, 2 to 5 s per beat, one iconic world detail per shot, a personal payoff (a wanted poster with his own face).
- Gear: phone 4K/60, stable grip, plain-ish background. Tool for the video-to-video step is not confirmed (unverified): pick with `search-first`, money means a card.
- Legal: an original world inspired by, never using, Avatar / One Piece / Harry Potter names, logos or characters; label AI per platform rules (`market` section 4). Every real person shown consents.

## Blockout to AI video (from @aisavvy, @comfyorg)
Claude builds a rough scene and camera in Blender through the Blender connector, renders a cheap clip, and the AI video tool uses it as the motion reference with the character references. Camera and timing are planned for free before any paid credits. The tool name/version in the source (Seedance 2.5) is unverified; fal.ai models are in `toolbox/catalog/video-audio.md`.

## What free tools reach, per style (research 2026-10-25)
Report: `docs/research/2026-10-25-creator-video-styles.md`; prompts: [`prompts.md`](prompts.md); people and POV: [`people-video.md`](people-video.md).

| Style | Free route | Ceiling | Paid or GPU part |
|---|---|---|---|
| Toon 3D heroine explainer (@sinaboto) | Remotion or HyperFrames + three.js, Kokoro or Piper, word captions | stylised, posed or simple cycles | an expressive rigged heroine |
| Code-made explainer (@jeremyfindsai) | explainroo, HyperFrames or Remotion | full match | none |
| Clay diorama (@pokecenterstaff) | Blender stills and slow camera, subtitles on the beat | rooms yes, moving characters no | a video model for acting |
| POV fantasy reels | cloud tier 0 clip (blockout look); Wan 2.2 on the laptop GPU | v1 clip is not real life | tier 2 hosted model for the real look |
| Blockout to AI video | Blender blockout free | layout and camera only | the video model step |
| Claude drives Blender | `bpy` loop, keyframes | simple transforms | none |
