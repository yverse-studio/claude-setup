# Motion

The After Effects job without After Effects: titles, kinetic captions, end cards, transitions and overlays, in the product's own fonts and colours.

- **Starts:** When the cut needs graphics; once per project for a reusable template set (caption style, end card).
- **Runs as:** Subagent of the Editor; a thread `Motion · <set>` for a template set.
- **Uses:** HyperFrames (HTML + GSAP to MP4, Apache-2.0); Remotion and its official skills in a React project; ffmpeg overlays for simple fades; After Effects only per the tools table in [`../SKILL.md`](../SKILL.md)

## Every time

- Build graphics in the project's design tokens and font (its `DESIGN.md`), never a template look.
- Render overlays as transparent video or PNG sequences once and composite with ffmpeg; do not re-render the whole product per frame for a caption.
- Motion answers a beat and plays once; no looping wiggle, no default stock transitions.
- Keep TikTok's safe zones: nothing important in the bottom fifth or the right edge.
- Vendor GSAP and fonts into the composition (cloud threads cannot reach the CDN by default).
