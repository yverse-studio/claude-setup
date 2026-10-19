# Blender body: checklists

Rules and reasons: [`SKILL.md`](SKILL.md); method [`references/method.md`](references/method.md); gate [`references/gate.md`](references/gate.md). Paths are under
`/mnt/project-files/companyxy/patches/base-body/` (Luna: `characters/luna/`).

## Builder, every round

Before you touch anything
- [ ] Read only the LIVE STATE block, the contract blocks and the top 3 plan items; nothing else.
- [ ] Start FROM the named base or best round; say which build, and which bands each key owns.
- [ ] Cloud Blender up (about two minutes, see references/method.md); the best round rendered once as baseline.

While building
- [ ] Simplest first: scale the base's own form; then one region, one named shape key, from a parameter json beside the blend. Mirrored.
- [ ] Head and neck above the collarbone untouched. No global smooth, no stacked fillet.
- [ ] The tool printed its max vertex move (stop over 5 cm) and updated Basis and every key.
- [ ] Face keys synced after any tool that skips them.
- [ ] Weights re-checked around the moved region.
- [ ] After each key: a 1-minute low-sample crop of that region vs best and ref, looked at.

Gates, run by you before anyone sees the round (a failed gate is said, not handed in)
- [ ] Neck: crop old | new vs ref (front and side, 2x) reads long, slim, no ring or shelf.
- [ ] Bust: front raw at full resolution, ref | best | new on one scale, at least as full as best,
      round from front, 3/4 and side.
- [ ] Same-size sheet: ref | body on one canvas, same height, crown in frame, hair on, hands whole.
- [ ] Figure frame as in SKILL.md rule 9.
- [ ] Zoom: `zoom5.py <round> <best>` ran; bust-front and back-upper looked at yourself.
- [ ] Stance: upright, flat feet, no lean or tiptoe in the rest skeleton.
- [ ] Poses: from-below frame (her above the camera), sway mid-frame, arm up plus head tilt;
      no tube neck, no groin fold, no knee pinch, bust root attached.
- [ ] Number gates (hints, after the eye): bust RMS, mirror, gap, ring areas.
- [ ] No visible regression against the best round in any of the five views.

Hand in
- [ ] The sheet below, in `proof/<round>/`; `tools/handin-cloud.sh <round>` renders raw, clay and masks only, you add detail, posed, zoom and numbers.
- [ ] Blend saved as `build-<round>.blend`; LIVE STATE block updated (keys and their values,
      band map, what is open); one cross-session line to the reviewer and coordinator.
- [ ] Context nearly full: update the LIVE STATE block on disk and carry on after the compaction;
      no new builder thread.

## Reviewer, every round

Order is fixed. The first line of the verdict is the bust read vs the best round.
1. Bust front raw, ref | best | new, full resolution, by eye (cap 4/5 if worse than best).
2. Neck crops REF | best | new: long and slim (chin to notch about 88 mm, width about 85 mm), no ring, no shelf. A neck that is not the ref neck caps the round at 3/5 and nothing else counts (14:18 rule; the target is the ref, not lc1, since 14:25).
3. Posed frames: tube neck, groin fold, knee pinch, bust root, shoulders, hands.
4. The zoom triples, one line per crop "what is off, direction, mm" in `zoom/WHAT-IS-OFF.md`.
5. Likeness to the ref in the five views.
6. Only then sheets, band tables and numbers, then the score.
- [ ] Regressions named first; the user's pins outrank your numbers.
- [ ] Re-trace or re-registration checked by eye before it is trusted.
- [ ] The verdict gives the builder a ranked list capped at what fits one round (3 to 5 items).
- [ ] Score states the real value; 5/5 only when every gate above passed.

## Hand-in sheet contract (`proof/<round>/`)

| File | Content |
|---|---|
| `raw/front.png`, `back.png`, `b34.png`, `side-full.png`, `backT-full.png` | five raw views, same cameras, 2x |
| `clay/*.png` | clay ground vs new, same cameras (arm-off masks as `*-mask.png`) |
| `detail/neck-*.jpg` | neck crop old vs new vs ref, front and side |
| `detail/bust-front-prev-new-best.jpg`, `bust-side-raw.png`, `bust-b34-raw.png` | bust crops at full resolution |
| `posed/` | from-below, sway, arm up plus head tilt |
| `zoom/` | `zoom5.py` triples REF, best, new, plus hands and openings strips |
| `detail/hands-strip.jpg` | every hand-in |
| `numbers.txt` | shape key list with values, band map, max move per tool, number gates |
| `zoom/WHAT-IS-OFF.md` | reviewer's one line per crop: what is off, direction, mm |
