# __NAME__: design

The look in a few lines. A thread fills this in before the first UI PR; the gate and `design-critic`
read it.

## Direction

(One clear direction: palette tokens, type, shapes. Real life first, then better. Cute cartoon or
pixel taste, licence-clean art.)

## Reference

(Where the look is compared to: `design/reference/*.png`, the Designer vote-gallery pick, plus
links. `design-critic` compares the 390px and 1440px screenshots against it.)

## Bar

- Motion: answers an action or plays once; `prefers-reduced-motion` lands on the finished screen.
- Loading, empty and error states: designed, not blank.
- Contrast: WCAG 2.2 AA, HUD text at least 4.5:1 on every scene, end card included.
- Touch: targets at least 44px on phone.
- Speed: first playable frame fast on a phone; budget numbers in `game-3d` §4.
