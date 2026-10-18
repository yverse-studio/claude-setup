# Slop list

The one home of "looks AI-made" (yskills, 2026-10-18: "holy ai slop"). Every pattern here is
**blocking** in `design-critic` and gate check 5. A project's `DESIGN.md` can never allow one: a
DESIGN.md that names a pattern below as its choice fails too (gstack lets DESIGN.md bless a
pattern; that is how Igelgarten passed four gates). Only a reference capture that shows the
same thing in a top-of-genre product clears a pattern, cited by file name.

## Any screen

1. Purple, blue or teal default gradients; gradient text; glassmorphism as the main surface.
2. Near-black navy or slate background with saturated neon accents (cyan, magenta, lime) that no
   reference uses.
3. Inter, Roboto, system-ui or Poppins as the only face, or one of them under a chunky display
   face picked for "fun"; more than two families.
4. Emoji as icons; mixed icon sets; icons with no job.
5. Identical rounded cards in a grid; every row a card with a coloured left stripe; three
   feature tiles; stat tiles for numbers a sentence would say.
6. Centred hero with a generic headline, a subline and two buttons; every section the same rhythm.
7. Decorative blobs, sparkles, glows and grain added for "polish".
8. Tracked uppercase micro-labels; grey-on-grey text under 4.5:1.
9. Copy that could sit on any product ("Unlock", "Elevate", "Seamless", lorem-like lines).
10. A palette with no named source: colours not traceable to a reference capture or a real object.

## Games

11. Glow or bloom on everything: when every sprite emits light, nothing reads first.
12. The player is not the most readable thing on screen (value contrast, outline, size).
13. Particles and floating numbers with no hierarchy: hits, pickups and enemies at the same weight.
14. A menu or HUD in a web-dashboard style (dark panels, pill buttons, stripe rows) that does not
    belong to the game's world; a cosy garden needs wood, paper or felt, not a SaaS panel.
15. Placeholder primitives left in (boxes as beds, spheres as rocks) or default three.js light:
    flat ground, no shadow, no atmosphere, no colour grade.
16. Enemies, pickups and hazards that share a hue; danger not readable in grayscale.
17. A look no top game of the genre has, without a reason written in `## Direction`.

## Default looks (hex, not bans)

A bare ban ("no cream") only moves the model to the next fixed palette (oh-my-claudecode's
designer role), so each look below names the values it uses. `scripts/design-check.mjs` flags
these hex values in `## Palette` and the button text below in the project source. A palette row
that cites a reference capture by file name clears its colour; the colour is then a copied choice.

18. Cream and clay: a background near `#F4F1EA`, a high-contrast serif display, a terracotta
    accent near `#D97757` (the accent is Anthropic's own, so on a user's brief it reads as a tell).
19. Black and one shout: a near-black ground with a single acid-green or vermilion accent (hue
    65 to 110 or 355 to 16 degrees, saturation 85 percent or more, our reading of the source's words).
20. Broadsheet: hairline rules, zero radius, dense newspaper columns, whatever the subject.
21. SaaS card kit: identical rounded cards, one radius on everything, the same soft grey shadow
    (`rgba(0,0,0,.1)`), gradient washes as decoration.
22. Template chrome: a tracked-out caps eyebrow above every heading, meta strings joined with
    middle dots, "WORD — fragment" labels, tinted near-black `#0B0B0B` or `#111111` standing in
    for black, a mono face for small data labels, an arrow `→` after link and button text.
23. Vague button labels: "Submit", "OK", "Click here", "Go", "Absenden", "Hier klicken". A
    button says what happens ("Save changes", "Pick a seed"), and the toast after it repeats the
    verb. "Continue" and "Learn more" pass only when the next step is the only one.

## How a critic uses it

Look at the references first, then the build, then this list. Name the pattern number, the
screenshot and the fix. Any hit makes check 5 fail. End with the slop count.

Sources (ideas, rewritten): gstack's AI-slop checklist and Design Score / AI Slop Score (Garry Tan,
MIT), Hallmark's slop-test gates and pre-emit critique (Nutlope, MIT), taste-skill's
reference-images-first flow (Leonxlnx, MIT), `impeccable` (vendored).

Sources for 18 to 23 (ideas, rewritten; the hex values are quoted facts): Anthropic
`skills/frontend-design/SKILL.md` ("Process" list of five AI-default traits and the CTA
writing rule, Apache-2.0, commit dbd4588, https://github.com/anthropics/skills), oh-my-claudecode
`agents/designer.md` (give hex codes and a type stack, not bans), gstack `design-review/SKILL.md`
(specific button labels, commit 25dbe34, MIT). Credit lines: `THIRD_PARTY.md`.
