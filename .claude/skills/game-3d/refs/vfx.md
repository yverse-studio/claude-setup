# VFX recipes: rarity reveal, bloom, flash, particles (three.js and Roblox)

Source: a TikTok gacha roll ("Roll a Ball RNG", 25 s, watched with `watch.py` 2026-10-27, issue #348). The look is code, not a separate studio: bloom, additive sprites, a radial ray shader, a flash, camera shake and a colour per rarity. The title card named a "VFX Studio" that was not found; a title card is a lead, not a tool. No new tool or paid plugin. The numbers below are starting values to tune against frames, not measured facts.

## The reveal in beats (about 3 s)

| Beat | Time | Do |
|---|---|---|
| Anticipation | 0 to 1.0 s | Object shakes, glow ramps up, sound rises. Longer for higher rarity |
| Flash | 1.0 to 1.15 s | Full-screen white overlay, opacity 0 to 1 in 3 frames, back to 0 over 0.4 s |
| Burst | 1.15 to 1.8 s | Ring + radial rays + particles, all at the rarity colour, one hit sound |
| Banner | 1.3 s on | Rarity text scales 1.3 to 1.0 with an ease-out, holds 1 s |
| Idle | after | Slow rays, a few rising sparks, bloom stays |

Rarity changes the length, the count and the colour, never the beats.

## Per rarity (tune the colours to the game)

| Rarity | Colour | Rays | Particles | Flash | Shake | Bloom strength |
|---|---|---|---|---|---|---|
| Common | white-grey | none | 0 | none | none | base |
| Rare | blue | 0 | 20 | none | none | +0.2 |
| Epic | purple | 8 slow | 60 | 0.5 opacity | 0.1 s | +0.4 |
| Legendary | gold | 12 | 150 | 1.0 | 0.25 s | +0.7 |
| Mythic and up | second colour pair, ring portal | 16 + ring | 300 | 1.0 twice | 0.4 s | +1.0, then ease back |

One table in code (`RARITY[tier]`), read by both the effect and the sound, so a new tier is one row.

## three.js

- **Bloom:** `EffectComposer` + `UnrealBloomPass`, exact chain and parameters in `threejs-game-skills/threejs-aaa-graphics-builder/references/shader-cookbook.md`. Only pixels over the threshold bloom, so make the effect colours HDR (multiply by 2 to 4) and keep the base scene under the threshold. Ramp `bloom.strength` with the beat table, never leave it high at idle.
- **Flash:** a full-screen DOM `div` (white, `pointer-events: none`, opacity animated) is cheaper and sharper than a pass.
- **Additive sprites and particles:** one `THREE.Points` or `InstancedMesh` per burst, `blending: THREE.AdditiveBlending`, `depthWrite: false`, `transparent: true`, a soft radial-gradient texture. Update positions in the loop from a fixed buffer; reuse the buffer between rolls (no allocation per roll).
- **Radial rays:** a camera-facing quad with a fragment shader. `angle = atan(uv.y, uv.x)`, rays = `pow(abs(sin(angle * N + uTime)), k)` fading with distance from the centre, multiplied by `uColor` and `uIntensity`, additive blending. Rotate slowly with `uTime`.
- **Ring portal:** a `RingGeometry` (or a torus) scaled from 0 to 1 with ease-out, additive, with a second thinner ring a few frames behind.
- **Camera shake:** add a decaying random offset to the camera position each frame (`amp * exp(-t / tau)`), restore the base position after, so the shake never drifts.
- **Mobile:** fewer particles (halve), no extra bloom passes, check frame time (`refs/gamedev-skills/performance-optimization`). Overdraw from big additive quads is the usual cost.
- **Reduced motion:** honour `prefers-reduced-motion`: no flash, no shake, shorter reveal. Flashing full-screen white also needs a setting to turn off.

## Roblox

- **Bloom and flash:** a `BloomEffect` (Intensity, Size, Threshold) and a `ColorCorrectionEffect` (Brightness for the white flash) in `Lighting`, both tweened with `TweenService` and put back after. A `ScreenGui` `Frame` is the alternative flash.
- **Particles:** `ParticleEmitter` with `LightEmission = 1` (additive look), `Color` as a `ColorSequence`, `Size` and `Transparency` as `NumberSequence`, and a one-shot `:Emit(count)` with `Rate = 0`. Count and colour come from the same `RARITY` table.
- **Rays and ring:** a `Beam` for rays or a neon `Part` with a texture, scaled by a tween; the ring is a flat `Cylinder` or a `Decal` on a thin part.
- **Camera shake:** offset `Humanoid.CameraOffset` or the camera CFrame in `RenderStepped` with a decaying amplitude, then reset.
- **Cost:** cap emitter counts per tier, destroy one-shot emitters after their lifetime, keep a low-quality path for mobile.
- Server decides the roll, the client plays the effect; never roll on the client.

## Check it (same bar as video frames)

1. Render stills at each beat (headless Playwright for three.js, Studio `screen_capture` for Roblox) at 390 px and 1440 px.
2. A fresh Critic that built none of it (`video-studio` `roles/critic.md`, `design-critic` for UI) grades the frames against the reference frames and this table: is the rarity readable without text, does the flash land on the beat, is the idle calm.
3. Fix, re-render, and put the frames in the PR.
