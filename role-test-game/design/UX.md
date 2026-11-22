# UX: Kofferlauf

Wireframe for `GDD.md` (Screen, people, map). Sizes in CSS px; safe margin 16 px.

## Play (1440 x 900 and 390 x 844)

```
+------------------------------------------------+
| 60.0                              Suitcases 0/5   |
|                                  [II] (touch)  |
|                                                |
|                 (3D street plot)               |
|            suitcase 5 m ahead of figure        |
|                     figure                     |
|                                                |
|  (stick, touch: drawn at rest bottom left,     |
|   jumps to left thumb)        (right half: drag look)
+------------------------------------------------+
```

- Timer: 40 px desktop, 32 px at 390; last 10 s red plus one decimal; tabular numbers.
- Counter: same size as the timer, right aligned; bumps on pick-up.
- Pause button on every device (56 px on touch, `data-testid=pause`); Esc, P or pad Start too.

## Title panel (centre, one at a time)

`Kofferlauf` / "Collect 5 suitcases in 60 seconds." / [Start] / hint line from the device in use. Options link below (sensitivity, invert Y, auto-camera, reduced motion).

## End panel

Win: "5/5 in 38.4 s" / "Best: 34.9 s" / [Restart]. Loss: "Time's up: 3/5" / [Restart]. R, A or tap restarts; Esc or a tap outside does not close it (it is the end of the run).

## Pause panel

"Paused" / [Resume] [Restart] [Options]. Esc, P or Start toggles; a lost window focus pauses.
