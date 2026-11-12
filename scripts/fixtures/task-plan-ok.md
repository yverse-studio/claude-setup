# PLAN: duck-hud

## Goal
A health bar HUD for the duck game that matches the approved look.

## References
- MAIN: reference card cmsg_01AbCdEf12345 (health bar, game X)

## Method
1. Build the bar with `scripts/hud-build.mjs`.
2. Render two views and run the check.

## Risks
- The bar clips at 390px; the 390px screenshot shows it.

## Acceptance
### Measured
- Bar width at 390px is 120 px, checked with `node scripts/hud-check.mjs`.
- Contrast ratio at least 4.5.
### By eye
- Phone view of the full bar against the reference card.

## Gate point
Asset: duck-hud
Topic: HUD/UI

## Still needed
nothing
