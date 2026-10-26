# Style library

Reusable style directions, one folder each: `styles/<name>/STYLE.md` plus `refs/` (the capture
stills its numbers come from). An index and a template, nothing in `CLAUDE.md`. yskills'
likes and rejects stay in [`../TASTE.md`](../TASTE.md); a style here is a starting direction a
project may pick, never a default.

| Style | For | Source |
|---|---|---|
| [`young-cool`](young-cool/STYLE.md) | games, social and creator tools for a young or "cool" audience: loose pixel-tile game-over pile, outlined stickers, beat-timed motion | TikTok "GAME OVER SCREEN???", 2026-10-26 |

## How a project picks one

1. Art direction step 0 (Breadth first, [`designer.md`](../../operator/roles/designer.md)) lists
   these folders as candidate families beside the project's own `design/STYLES.md` landscape.
2. The chosen style goes in the project's `design/DESIGN.md` under `## Direction`, citing the
   style's `refs/` file names. The project copies only the tokens it keeps into its own
   `## Palette` (at most eight hex colours) and `## Type`; `design-check.mjs` and SLOP.md still
   apply, and DESIGN.md wins over the style.
3. Deploy config (`projects/<name>.json`) is not a home for it.

## Template (`check.mjs` fails a style without these)

`STYLE.md` has the sections `## Tokens`, `## Do`, `## Don't` and `## How to use it`, every
line tagged **M** (measured), **F** (seen in the capture) or **P** (our proposal), and a `refs/`
folder with at least one image. A new style is a PR adding its folder and one row above.
