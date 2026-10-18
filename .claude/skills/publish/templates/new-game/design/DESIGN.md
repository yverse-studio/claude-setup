# __NAME__: design

The look in a few lines. A thread fills this in before the first UI PR; the gate and `design-critic`
read it.

## Direction

(Three visual pillars in plain words, the real-life object the world copies, and at least three
captures from `design/reference/` cited by file name. Rule: claude-setup
`operator/roles/designer.md`, Art direction first; nothing from `ui-review/SLOP.md`.)

## Palette

| role | hex | taken from |
|---|---|---|
| (ground, surface, text, accent, danger, pickup; at most eight) | | (capture file) |

Text pairs: (`#fg on #bg`, each at least 4.5:1; large text and UI 3:1)

## Type

(At most two licence-clean, self-hosted families, and a scale in px, for example 13 / 16 / 22 / 32 / 48px.)

## Bar

- Motion: answers an action or plays once; `prefers-reduced-motion` lands on the finished screen.
- Loading, empty and error states: designed, not blank.
- Contrast: WCAG 2.2 AA, HUD text at least 4.5:1 on every scene, end card included.
- Touch: targets at least 44px on phone.
- Speed: first playable frame fast on a phone; budget numbers in `game-3d` §4.
