# Style direction: young and cool (optional)

An optional direction for projects aimed at a younger or "cool" audience (games, social, creator
tools). Not the default: a project opts in through its `design/DESIGN.md`, which wins over this
file. yskills likes it too (2026-10-26). Source: one TikTok, "GAME OVER SCREEN???", 19 s, 3 cuts,
watched with `watch.py` (frames and timeline; no speech; the caption is the only text). Numbers
below come from the timeline, the rest from reading the frames. Nothing here is copied art: the
Roblox-style character and the pixel icons are the video's, we take only the method.

## Game-over screen

- The death is the screen: no modal over a frozen game. The character blows apart and the pieces
  land on a bare, bright canvas (near white, warm tint, no vignette).
- Pieces are the UI. The Retry button is one more loose tile lying in the pile, beside a skull
  head, bones, a coffin and a skeleton chest, all tilted a few degrees (about -20 to +25), never
  on a grid.
- Pile reads in a second: one hero object (the head), 5 to 7 small props, one button. Nothing else:
  no stats table before the button.
- Retry is the biggest and most readable tile, bottom left of the pile, thumb reachable, text in
  the same pixel face as the rest, white fill, dark outline.
- Idle motion after landing: the whole pile sways 2 to 4 px and 1 to 2 degrees on a slow loop
  (about 1 s), so it feels alive without asking for attention.
- Retry returns to the same spot with a cut, not a menu: the next frame is the player standing
  in the world again (about 1 s total). A flat colour frame (warm yellow, #F2BE3C) works as the
  cut between death and the next run.

## Look in general

- Pixel-art icons with a chunky dark outline (2 to 3 px at 1x), a hard offset shadow in a saturated
  violet-blue (about 4 px right and down, no blur), one highlight stripe. Stickers, not glass.
- Palette: a loud flat sky and lilac world (pastel lavender floor, cyan sky), off-white for result
  screens, one warm yellow for punctuation, red and pink for the player, near-black outlines.
  Two or three saturated hues per screen; the rest stays pale.
- Typography: one heavy rounded or pixel display face, uppercase, white fill with a thick black
  outline (caption style: about 7 % of screen height, 2 to 3 px stroke). Short words: GAME OVER,
  RETRY, never a sentence.
- Layout: centred objects with room to breathe; the focal pile sits in the lower two thirds, a
  caption in the top third. Portrait first (390 px) and it still holds at 1440 px.
- Motion: camera does the drama (a fast fly-by, tumble, then a hard cut to the result), UI does
  small things (a sway, a pop-in with a slight overshoot). One idea per second, no loops that
  compete.
- Pace (timeline): average shot 5 s, but the 3 cuts all land in the first 3.2 s; audio hits about
  every 0.3 to 0.5 s at roughly 133 BPM, so motion lands on the beat. Silence 0 to 1.7 s as a
  setup, then the beat, then 2.5 s of quiet at the end. Loudness about -12 LUFS.
- Hook: the question in the caption ("GAME OVER SCREEN???") plus an oddly plain start (empty
  baseplate) makes the viewer wait for the payoff. Use in trailers and store clips, not in the
  game itself.

## How to use it

1. The project's DESIGN.md names it as the direction and fixes its own palette and face.
2. Build the screen as a pile of DOM or sprite objects with CSS transforms or a physics step,
   not a card with a heading. Keep `prefers-reduced-motion`: show the landed pile, no sway.
3. Licence-clean art only: draw our own icons, do not reuse Roblox assets or the video's tiles.
4. Check it at 390 px and 1440 px like any UI (`ui-review`).
