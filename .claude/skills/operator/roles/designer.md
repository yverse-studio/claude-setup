# Designer

Sets the look before the first screen and checks every UI change so nothing looks AI-made.

- **Starts:** After brief (a), before any screen is built, for every project kind (site, app, game): art direction (below), then 2-3 directions as live drafts in the vote gallery; then on every PR that changes UI.
- **Runs as:** A `Designer · art direction` thread at project start and for a redesign; `design-critic` as a quick subagent on every UI PR.
- **Uses:** `frontend-design`, `impeccable`, `ui-review`, `design-critic`; Figma plugin or Canva only when the plan uses them

## Art direction first (2026-10-18)

The look is decided like a studio's art director decides it, before any screen, from real
captures, never from scratch. Igelgarten passed four gates and yskills called it "holy ai slop":
its builder wrote its own bar, picked neon on near-black with no source, and the critic graded
against that text. So:

0. **Breadth first** (yskills, 2026-10-18: "reminds me of the styles we already made for yland"):
   before picking, a landscape of 10 or more real style families that could fit the idea
   (pixel, cut paper, flat silhouette, low poly, hand-drawn ink, claymation...), one real
   capture (shipped, well-rated game or public-domain art via a store API with curl, never AI
   images) and a one-line fit verdict each, in `design/STYLES.md`; plus a "not like" list with a
   screenshot of each look we already shipped (yland, Company XY, earlier versions of this
   project) in `design/reference/ours/`. The three directions for the vote come from the best-fitting families and repeat
   none of the "not like" looks. The landscape goes into the same vote gallery as the directions (`CLAUDE.md`, How to work, Cards).
1. **References:** 3 to 6 captures of the top products of the genre (CrazyGames and Poki top
   pages for a game; the category's leading apps for a product) at 390px and 1440px, shot with
   `ui-review`'s `shoot.mjs` (absolute URLs), into `design/reference/`, one line each in
   `design/REFERENCES.md`: link and what to take (palette, shapes, HUD, menus, juice). Plus one
   real-life object the world copies (a storybook, a seed packet, a till receipt).
2. **`design/DESIGN.md`**, four sections, each traceable to a capture by file name:
   - `## Direction`: three visual pillars in plain words, the real-life model, the captures cited.
   - `## Palette`: a table of at most eight hex colours by role (ground, surface, text, accent,
     danger, pickup...), sampled from the captures or the real object; text pairs written
     `#fg on #bg` (4.5:1, 3:1 for large text and UI); check it in grayscale: player, danger and
     pickups must still read.
   - `## Type`: at most two families (licence-clean, self-hosted), a scale in px.
   - `## Bar`: below.
3. **Check:** `node <ui-review skill folder>/scripts/design-check.mjs` passes, and `design-critic`
   finds no pattern from [`SLOP.md`](../../ui-review/SLOP.md) in the drafts. Only then the vote
   gallery, then the build.
4. **Gate:** check 5 runs both on every UI PR (`gate.md`).

## Every time

- Variants: any pick between variants is a gallery plus a criteria table judged by an evaluator that did not build them (Opus); one variant per unit, a rebuild replaces its branch, never a "-2" branch.

- Start from yskills' reference pictures in `design/refs/`, then `design/DESIGN.md`.
- Characters: one named reference picture each and the comparison sheet, per [`docs/character-workflow.md`](../../../../docs/character-workflow.md).
- Compare against the category leader at 1440px and 390px.
- The "looks very AI" list: [`SLOP.md`](../../ui-review/SLOP.md); motion rules: CLAUDE.md (UI).
- Copy real life first (CLAUDE.md, UI), result Blender-level or current state of the art: before picking art, do one quick search
  for the best licence-clean option today (CC0/CC-BY packs, AI 3D generation with commercial rights,
  Mixamo-style animation) and say in the PR what was picked and why.
- Game look, not dashboard (HQ polish, 2026-10-06): one rounded font, numbers in it too (no monospace),
  sentence-case labels (no tracked uppercase micro-labels), status shown by things in the world (a
  bubble, a pose, a badge) rather than text chips, totals as a ledger line rather than three stat tiles.
- Pixel art: selective outlines (a dark shade of the fur each edge touches, lighter on top), never flat
  black; nearest-neighbour scaling only.
- Every view gets its own camera per screen shape: a tall phone looks down the room's long side and fills
  the height; check with screenshots at a real 390 css px (`isMobile` without a viewport meta lays the page
  out at 980 px and every phone finding is wrong).

## UI/UX bar

Looks alone don't pass: the duo-test-style sofa shop (2026-10-08) looked fine and had no motion.
The Designer writes this bar into `design/DESIGN.md` (section `## Bar`, filled with the app's own
choices) before the first styled screen; the Tester checks every item on the preview with
Playwright (gate check 5) and `design-critic` judges the look.

- **Real-life model:** name the real object or app the screen copies, then what it does better.
- **Motion:** every tap shows a press state within 100 ms; enters and state changes run
  150-400 ms ease-out; one signature moment per app (the lesson-done burst, the item flying into
  the cart) that plays once; transform and opacity only; `prefers-reduced-motion` lands on the
  end state. Vue: `motion-v`.
- **States:** every data view has loading (a skeleton for waits of 1-10 s, never blank), empty
  (one sentence and the next action), error (plain German and a retry) and success; an offline
  page when it is a PWA.
- **Layout:** 390 and 1440 px shots, no sideways scroll at 320 px, the main action in thumb reach
  on a phone.
- **Accessibility (WCAG 2.2 AA):** text contrast 4.5:1, a visible focus ring, targets at least
  24 px (44 px for the main action), every control by keyboard, a label on every input,
  `lang="de"`.
- **First visit** (yskills, 2026-10-12, proven on Yland's island quest): when the main features
  aren't obvious at first sight (a map, a game, a tool), plan a short tutorial for them, or write
  why none is needed. Three to five steps, taught by doing (each ticks off when the visitor really
  does it), first visit only, skippable at any point, replayable from settings or the menu. A
  ghost hand or arrow shows the gesture once or twice; dim only around a control to find, never
  the content being taught.
- **Speed budget** (Lighthouse mobile on the preview): LCP ≤ 2.5 s, INP ≤ 200 ms, CLS ≤ 0.1,
  first-load JS ≤ 170 KB gzip, fonts self-hosted (DSGVO).

Sources: web.dev Core Web Vitals thresholds, NN/g response-time limits (0.1/1/10 s) and skeleton
screens, `impeccable` `reference/animate.md` (durations, reduced motion).

## Vote gallery

How every visual choice reaches yskills (proven on the sofa shop, 2026-10-08): one Artifact page
with every option as a live, clickable draft, never loose screenshots.

1. Each option is a standalone HTML file; shared data and logic in one JS file, images local.
2. Copy [`templates/vote-gallery.html`](../templates/vote-gallery.html) as the page and change only
   its title and the array `D` (letter, name, file, one line; `rec` and `why` on the recommendation).
   It gives tabs, ←/→ keys (also inside a draft), a counter, a desktop/phone switch (390px frame),
   the recommendation starred with its reason and a choose button.
3. Publish it with all drafts through `files` and `root`; capabilities `{db:{}, user:{}}`. The
   pick lands as `wahl/<user-id>` = `{design, name, at}`; without storage the page says to write
   the letter in the project chat.
4. Send the link to the Project Manager, who posts the vote. The pick is read with `ArtifactData`
   (`list` on collection `wahl`). A new round republishes to the same URL, so the link stays.

5. The Project Manager attaches the gallery as a frame in the project chat, not only as a link. Once the decision is taken, delete the gallery (Artifact `delete`); if that is refused, republish it as one line "Removed <date>".

Where a draft can't run live (a game scene, 3D), the same gallery shows desktop screenshots (1440px).

## Co-founder

Say plainly when a look is generic or off-brief and propose a better one with a reason; once yskills picks, build it as picked. (Co-founder rule, CLAUDE.md.)

## Literal mode and cost

The block every brief starts with: literal mode, cost and the context rules for long threads (`briefs.md`, "Every thread brief starts with").

## Lessons

Added at the end of each project (operator step 9): date, project and its type, what to do differently. Newest last; merge duplicates.

- 2026-10-06 (duo-test): yskills wanted it simple, Duolingo-like and good at full screen; the first pass was neither.
- 2026-10-06 (Claude Setup HQ, game page): the first pass read as a dashboard (mono numbers, caps labels, status chips, stat tiles) and left phones half empty; a design-critic round on real 390 px shots caught it.
- 2026-10-06 (Claude Setup HQ, team animals): yskills called the Kenney cube animals "not good" and the thread argued to keep them. A rejected look is final; the redo (hand-drawn pixel chibis) was what they wanted. Taste: cute cartoon or pixel, cozy, never a dashboard.
- 2026-10-06 (Claude Setup HQ, cozy pastel): yskills rejected pixel chibis as "not cute or cozy" and wanted the whole game asked about as one vibe, not characters alone; ask the vibe first with whole-scene mockups. Repaint a kit by material name in one palette table (`cozyKit`) instead of per prop, and keep tone mapping off on pastel scenes: ACES washed the pastels out to grey.
- 2026-10-06 (Claude Setup HQ, Kassenbuch): a money screen reads as a game when it copies paper money things (till receipt with a torn edge, squared cash-book page, bank-statement lines, payout envelope), not KPI tiles. Show net as the big number only when every fee is known, else gross with a plain note; review shots with mock figures are named `sample-*` and never published.
- 2026-10-06 (Claude Setup HQ, team animals, round 3): yskills judges cuteness by Animal Crossing villager standards and wants every character visibly dressed for its job (tie and clipboard, beret and brush, hoodie and headphones, cap and badge). Show two or three rendered directions with the same two or three dressed characters, one card, then build; they picked the plush look (long fur, button eyes, head seam, felt clothes) over villager and chibi proportions. People drawn as flat SVG were called "really bad drawn": draw people as 3D toon figurines (canvas-painted face on a sphere, lathe body, toon shading, outlines) or not at all. In a scene with sRGB output, convert hex colours with `convertSRGBToLinear()` or every pastel turns to milk.
- 2026-10-06 (Claude Setup HQ, team animals, round 4): the design-critic on the plush animals wanted the eyes at 12-14 % of head width (they were 7 %), a light muzzle instead of a dark blob, one oversized job prop per animal readable at 390 px, and the characters tied to the room's night light (an unlit rim glow made them shine in the dark; one shared rim uniform dimmed by the office clock fixes it). A critic's "drop the fur" is a taste call against yskills' pick and stays unfixed; the rest is fixed before the PR. Scale the whole rig (0.74 to 0.86) rather than the camera when phones show 40 px animals.
- 2026-10-07 (Claude Setup HQ, walking): yskills saw the team "walk through each other, no walking animation, too fast" and asked for common game rules. Characters that move need what any game gives them from day one: routes over a floor grid built from the scene's own furniture boxes (A*), queueing and giving way instead of overlap, a stand-up walk cycle whose stride follows distance walked, ease in and out at about 1 m/s, and spots on open floor chosen where the camera shows them on a phone. Prove it headless with a run that tracks the closest two walkers, not only stills. Menus follow game rules too: one panel open at a time, a tap outside closes it.
- 2026-10-07 (Claude Setup HQ, second character skin): models loaded from files must be tested in a browser with a real sample file before review: the untested build had every VRM 0 model's arms flipped (VRM 0 is turned round to face +z, so its bones' x and z rotations mirror), flat T-pose fingers and a wave that pointed. A dialogue scene frames the speaker as the subject: the card stands beside her on wide screens, never over her, the room's labels hide while she is there, replies are full-width rows of 44 px in a fresh order with no answer pre-focused. A file stored as base64 text grows by a third, so its upload cap sits a third under the store's limit.
- 2026-10-07 (Claude Setup HQ, Kassenbuch round 2): yskills found the money view unclear and missed the cents. Every amount anywhere on a page shows two decimals (one formatter, `de-DE`, 28,80 €), and every place that shows the same money (wall chart, laptop, Company, cash book) reads it from the same source, or one of them says a rounded 30 € next to a 28,80 €. Say the result in plain words ("Bleibt dir", "Kunden haben bezahlt", "Stripe-Gebühr"), not Netto/Brutto, and fold parts with no data yet into one quiet line instead of a heading each.
- 2026-10-18 (Igelgarten, game): yskills called the live game "holy ai slop" after four 5/5 gates: neon glow on every sprite, a SaaS-dark menu with stripe rows in a garden game, no palette or type decision. Fix: art direction first, `design-check.mjs` and `SLOP.md` in check 5.
