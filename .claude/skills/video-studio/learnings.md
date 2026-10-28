# Video learnings

What earlier videos got wrong and how it was fixed. Every role reads this first. One line per
lesson, dated, project named; newest last within each section; merge duplicates. The full
Y-Land notes and scripts live in that project's files (`promo/LEARNINGS.md`, `promo/src/`).

## What viewers punished

- 2026-10-12 (Y-Land): the whole island as the opening shot reads as a static map at phone size; open on something that moves and reads, with the claim in big type in frame 1.
- 2026-10-12 (Y-Land): caption + place sign + name tags stacked in the top third; one caption at a time in a fixed band, fade anything that crosses it or is cut off at the frame edge.
- 2026-10-12 (Y-Land): a "before" that was a week old (already the new look) killed the before/after; use the real old build, same framing, hard cut.
- 2026-10-12 (Y-Land): four videos spread thin; two finished properly beat four half done.
- 2026-10-12 (Y-Land): ~300 views on polished promos ("not really convincing"); next try films real play, as a player would ("I visit my followers", "POV: you just followed me").
- 2026-10-12 (Y-Land how-to): a travelling finger (eased glide, press, tap ring) shows a gesture better than a spotlight; open on the result for about 1.3 s as the hook.
- 2026-10-18 (T1 test video): yskills rejected it ("would you pay 10k dollars for that?"): one agent played the whole team from a brief that held the concept, with no script, board, animatic or sound, and graded itself. Fix: one agent per role, a fresh Critic scoring against 2-3 reference videos at a $10k bar, a Sound role with two masters, and `scripts/ready.py` blocking delivery without the files.

## Filming a web app or game in the cloud

- 2026-10-07 (Y-Land): headless Chromium has no GPU (about 1 frame per second for 1,409 walkers) and page screenshots return stale WebGL frames, so about half the frames repeated: stutter. Own the clock: stop the app's ticker, step it by exactly 1/30 s, render and read the canvas (`toDataURL`) in the same task.
- 2026-10-11 (Y-Land): `page.clock.install` alone lets time flow; pause it after load (`pauseAt`), stamp the mocked server time with page time and seed `Math.random`, so stills and film match.
- 2026-10-11 (Y-Land): drive the camera in code (expose the viewport, set zoom and centre per frame); synthetic wheel and drag were unreliable. Smooth moves: van Wijk zoom paths, log-zoom dives that keep the subject centred, a follow camera.
- 2026-10-11 (Y-Land): after a hard cut, tick once more at the new zoom before drawing, or frame 1 shows stale sizes.
- 2026-10-11 (Y-Land): when the app runs its simulation in a Web Worker, make the worker fail during filming so the page's synchronous fallback runs on the hand-stepped clock.
- 2026-10-12 (Y-Land): film the real UI with `preserveDrawingBuffer` patched and step every CSS animation on the film clock (`document.getAnimations()`); Playwright's `click` times out on a paused clock, so trigger with `evaluate` or synthetic `PointerEvent`s (`pointerType: 'touch'` on a touch context).
- 2026-10-12 (Y-Land): injected overlays must be `pointer-events:none` and removed when hidden, or the next real tap lands on them.
- 2026-10-26 (Y-Land): the Storybook villagers paint their atlas in a worker; fail that worker too while filming, or villagers are invisible (only name tags and feet). Hide the weather layer and remove the `clamp-zoom` plugin for close-ups; the rig is `templates/yland-film/`.
- 2026-10-26 (Y-Land): villagers only get emojis and moods near the camera, and the sim still drifts between runs even with a seeded `Math.random`: pick each shot's subject by what it is doing at the shot's first frame, never by a name from a dry run.
- 2026-10-26 (Y-Land): the first cut juddered on the carousel and yskills saw it before we did: frame steps of [33,33,34] ms skip or double 30 Hz sim steps (use [34,33,33]), a camera locked to a spinning rider shakes (film rides from the hub), and the 2026-10-07 pacing check was skipped. Run it on every cut before showing it.
- 2026-10-12 (Y-Land): serve the page under the live origin (routes rewritten to the local build) so shared links and pictures show the real address.

## Captions, overlays and encode

- 2026-10-11 (Y-Land): render each caption once as a transparent PNG in the product's own font and CSS, then fade it in with ffmpeg `overlay` + `fade=alpha=1`; `file://` fonts are blocked in `setContent`, so embed the font as base64.
- 2026-10-12 (Y-Land): ffmpeg's looped-still overlays land one frame late; start fades a frame early and check the switch frames.
- 2026-10-12 (Y-Land): a caption-only change needs no re-film: overlay the new card on the old MP4 from the card's first frame; anything the app draws needs a re-film.
- 2026-10-07 (Y-Land): always check frame pacing before delivering (`mpdecimate` or a mean frame diff); zero difference during motion is stutter.
- 2026-10-26 (Y-Land /brag): the brag render measured -24.4 LUFS (no loudness pass, no ducking), about 10 LU quieter than the feed; every master goes through `sound.py mix` or `loud` at -14 LUFS (`sound-kit.md`).
- 2026-10-07 (Y-Land): everything was free (Playwright, Chromium, ffmpeg); about 1.5 s of render per frame on the cloud CPU, so a 24 s video takes about 20 minutes.

## Motion: easing and style

- 2026-10-27 (TikTok @ray_fu, lead, checked by grep: no rule existed): code-painted frames get closed-form spring easing, never CSS `ease`/`ease-in-out`/`linear`. Underdamped spring from 0 to 1, `w = sqrt(k/m)`, `z = c / (2*sqrt(k*m))`, `wd = w*sqrt(1-z*z)`: `x(t) = 1 - exp(-z*w*t) * (cos(wd*t) + (z*w/wd) * sin(wd*t))`. Start at `k=170, m=1, z=0.6` (a small overshoot), `z=1` for a camera or a fade. Evaluate it per frame from `t = frame/fps`; it is also the cheapest way to avoid the centred all-caps-on-gradient default. Give the model one reference clip or frame, not only the ban.
- 2026-10-27 (same lead): name one motion style per video (table below) in the Designer's art direction instead of a blank prompt. Before picking, check the row against `../ui-review/SLOP.md`; a row marked SLOP needs a reference capture of a top-of-niche video that does it, cited by file name.

| Style | SLOP check |
|---|---|
| Particles | 7 (decorative sparkles) unless the subject is particles |
| Liquid Morph | - |
| Holographic | 1 (gradients) |
| Neon Glow | 2 (neon on near-black) |
| Wireframe 3D | - |
| Glass Morphism | 1 (glassmorphism) |
| Kinetic Type | 6 (centred hero type) if it is all-caps, centred, on a gradient |
| Isometric | - |
| Clay 3D | - |
| ASCII Art | - |
| Gradient Mesh | 1 (gradients) |
| Comic Book | - |
| Split Flap Display | - |
| Retro VHS | 7 (grain) |
| Halftone | - |
| Bauhaus | - |
| Pixel Art | - |
| Blueprint | - |
| Art Deco | - |
| Neo Brutalism | - |

  Source: TikTok @millee.md, 28 s voice list; the transcript misheard two names, which were guessed from the sounds. The list is a vocabulary, not a recommendation.

## Dead frames

- 2026-10-27 (TikTok @ray_fu): a frame where nothing moves in a shot that should move is a bug, not a pause. The Critic sweeps the rendered frames for them; the Editor re-renders until none is left (`../roles/critic.md`, Floor 8).

