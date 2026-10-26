# Style direction: young and cool (optional)

An optional direction for projects aimed at a younger or "cool" audience (games, social, creator
tools). Not the default: a project opts in through its `design/DESIGN.md`, which wins over this
file and fixes its own palette and face. yskills likes it too (2026-10-26).

Source: one TikTok, "GAME OVER SCREEN???", 19.8 s, 576x1024, a Roblox-style clip ending on a
pixel-art game-over pile. One clip is a lead, not a system: use it as a starting direction and
confirm in the project's own art direction. Reference stills (downscaled, internal reference
only) are in `refs/young-cool/`: `gameover-pile.jpg`, `cut-yellow.jpg`, `world-start.jpg`.

Each line is tagged by how sure it is. **M** measured from frames or audio (re-checked
2026-10-26), **F** read from the frames by eye, **P** our proposal, not in the video.

## Tokens (M, sampled from `refs/young-cool/`; a project sets its own)

```css
--yc-ground:   #F8F8F0; /* result screen, off-white (M) */
--yc-tile:     #C0C0B8; /* tile fill, grey (M) */
--yc-outline:  #100818; /* outline, near-black violet (M) */
--yc-shadow:   #4830A8; /* hard offset shadow, violet (M) */
--yc-cut:      #F3C13E; /* flat colour cut frame, warm yellow (M) */
--yc-sky:      #74E9FB; /* world sky, cyan (M) */
--yc-floor:    #C2B2FB; /* world floor, lilac (M) */
```

SLOP.md applies unchanged. Lilac and cyan are flat fills here, never a gradient (item 1); the
off-white ground is a result screen, not a cream-and-serif look (item 18) and is cleared by
citing `refs/young-cool/gameover-pile.jpg` in the project's `## Palette` (item 10).

## Game-over screen

- (F) The death is the screen, not a modal over a frozen game: the character bursts and the
  pieces land on a bare bright canvas.
- (F) The pieces are the UI. The Retry button is one more loose tile in the pile next to a skull
  head, bones, a coffin and a skeleton chest, each rotated a little, none on a grid.
- (F) One hero object (the head), 5 to 7 small props, one button; no stats table before it.
- (F) Retry is the largest tile, bottom left of the pile, same pixel face as the rest, light fill,
  dark outline.
- (M) Not a quick wobble: over 10 s (frames at 5, 10 and 15 s) the pile only drifts about 10 px
  of 512 and rotates a few degrees. P: a slow idle drift of this size; the sway period and
  amplitude are ours to choose.
- (F) Retry is a hard cut back into the world, with one flat colour frame (`--yc-cut`) between
  death and the next run. Cut takes about 1 s (frames at 17 and 18 s).
- (P) Button text in German first: "NOCHMAL" (not "Retry", not "OK"); the game's own verb, per
  SLOP.md item 23.

## Look in general

- (F) Pixel icons with a thick dark outline and a hard offset shadow, no blur; stickers, not
  glass. Outline width and shadow offset were not measured on the 576 px video: P 2 to 3 px
  outline and 4 px shadow at 1x, tune per project.
- (M) Palette is flat: loud sky and lilac in the world, off-white plus grey tiles on the result
  screen, one warm yellow for the cut, near-black violet outlines. Two or three saturated hues
  per screen, the rest pale.
- (F) Type in the video is TikTok's own caption (white fill, thick black outline, uppercase),
  not game UI. P: the same treatment for trailer captions and store clips; in game, short
  uppercase words in the pixel face.
- (F) Layout: a caption in the top third, the pile in the lower two thirds, room around it.
  P: portrait first at 390 px, check 1440 px (`ui-review`).
- (M) Pace (timeline script): 3 cuts, all in the first 3.2 s (2.07, 2.43, 3.23 s), longest shot
  16.6 s (the pile). Silence 0 to 1.7 s, then audio hits about every 0.3 to 0.5 s, then 2.5 s
  quiet at the end. Loudness -12.2 LUFS. The ~133 BPM comes from the script's onset detector on
  a 16 s clip, so treat it as low confidence; only "motion lands on the beat" is the lesson.
- (M) Hook: the question in the caption plus a plain start (empty baseplate) so the viewer
  waits for the payoff. Use in trailers and store clips, not in the game.

## Do

- A pile of loose objects with Retry inside it, thumb reachable; a hard cut back to play.
- Flat saturated fills, thick outline, hard offset shadow; one idea per second of motion.
- Own art for every icon; reduced motion shows the landed pile with no drift.

## Don't

- Gradients, glow or blur shadows on the tiles (SLOP.md items 1, 7, 11).
- A dark panel with a score table and two pill buttons (SLOP.md item 14).
- Roblox assets or the video's tiles: licence-clean art only, we take the method.
- Copying the numbers marked P as if the video proved them.

## How to use it

1. The project's DESIGN.md names this direction, copies the tokens it keeps into its own
   `## Palette` with the reference file name, and drops the rest.
2. Build the screen as sprites or DOM objects with transforms or a small physics step, not a
   card with a heading.
3. Screenshot at 390 px and 1440 px and have `design-critic` check it against SLOP.md.
