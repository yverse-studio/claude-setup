#!/usr/bin/env node
// Gate check 5, the part a script can prove: design/DESIGN.md has a Direction citing at least
// three reference captures, a palette of at most eight hex colours with text pairs at 4.5:1,
// a type scale, no default-look colour (SLOP.md 18, 19, 22) and no vague button label or arrow
// (SLOP.md 22, 23) in the source. Usage: node design-check.mjs [project root]. Exit 1 lists what fails.
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const MIN_REFERENCES = 3;
const MAX_PALETTE = 8;
const MIN_TEXT_CONTRAST = 4.5;
const MIN_LARGE_CONTRAST = 3;
const MIN_TYPE_SIZES = 3;
const IMAGE = /\.(png|jpe?g|webp|gif|avif)$/i;
const HEX = /#[0-9a-f]{6}\b/gi;
const MAX_DEFAULT_DISTANCE = 25;
const MAX_NEAR_BLACK_DISTANCE = 6; // the look is neutral black; a green or blue ground like #0a1210 is a choice
const DEFAULT_COLOURS = [
  { hex: '#f4f1ea', look: 18, name: 'cream ground', warm: true },
  { hex: '#d97757', look: 18, name: 'terracotta accent' },
  { hex: '#0b0b0b', look: 22, name: 'tinted near-black', max: MAX_NEAR_BLACK_DISTANCE },
  { hex: '#111111', look: 22, name: 'tinted near-black', max: MAX_NEAR_BLACK_DISTANCE },
];
const NEAR_BLACK_LUMINANCE = 0.02;
const MIN_WARM_HUE = 30;
const MAX_WARM_HUE = 60;
const MIN_WARM_SATURATION = 0.15;
const MIN_SHOUT_SATURATION = 0.85;
const SOURCE_DIRS = ['src', 'app', 'pages', 'components', 'layouts', 'public'];
const SKIPPED_DIRS = new Set(['node_modules', 'fixtures', '__tests__', 'test', 'tests']);
const SOURCE_FILE = /\.(vue|html|jsx|tsx|svelte)$/i;
const VAGUE_LABELS = ['submit', 'ok', 'click here', 'go', 'absenden', 'hier klicken'];
const BUTTON_TEXT = /<(button|a)\b[^>]*>\s*([^<>{}]{1,40}?)\s*<\/\1>/gi;

function luminance(hex) {
  const [r, g, b] = [1, 3, 5].map((i) => {
    const c = parseInt(hex.slice(i, i + 2), 16) / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

export function contrast(a, b) {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

function rgb(hex) {
  return [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
}

function hsl(hex) {
  const [r, g, b] = rgb(hex).map((c) => c / 255);
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  const d = max - min;
  if (!d) return { h: 0, s: 0, l };
  const s = d / (1 - Math.abs(2 * l - 1));
  const h = max === r ? ((g - b) / d) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return { h: (h * 60 + 360) % 360, s, l };
}

function distance(a, b) {
  const [x, y] = [rgb(a), rgb(b)];
  return Math.hypot(...x.map((c, i) => c - y[i]));
}

// Cream is warm and a little saturated; neutral greys (#f5f5f5, #fafafa) are not the look.
function isWarm(hex) {
  const { h, s } = hsl(hex);
  return h >= MIN_WARM_HUE && h <= MAX_WARM_HUE && s >= MIN_WARM_SATURATION;
}

function isSaturated(hex) {
  const { s, l } = hsl(hex);
  return s >= MIN_SHOUT_SATURATION && l >= 0.4 && l <= 0.65;
}

// Acid green or vermilion; a plain red (hue under 8 or over 350) reads as danger, not as the shout.
function isShout(hex) {
  const { h } = hsl(hex);
  return isSaturated(hex) && ((h >= 65 && h <= 110) || (h >= 8 && h <= 20));
}

function sections(md) {
  const out = {};
  let name = null;
  for (const line of md.split('\n')) {
    const h = line.match(/^##\s+(.+?)\s*$/);
    if (h) name = h[1].toLowerCase();
    else if (name) out[name] = (out[name] ?? '') + line + '\n';
  }
  return out;
}

function checkPalette(text, fails) {
  const colours = new Set(
    text.split('\n').filter((l) => l.trim().startsWith('|')).flatMap((l) => (l.match(HEX) ?? []).map((h) => h.toLowerCase())),
  );
  if (colours.size < 3) fails.push('## Palette: a table of at least three hex colours by role');
  if (colours.size > MAX_PALETTE) fails.push(`## Palette: ${colours.size} colours, at most ${MAX_PALETTE}`);
  const pairs = [...text.matchAll(/(#[0-9a-f]{6})\s+on\s+(#[0-9a-f]{6})([^,\n]*)/gi)];
  if (!pairs.length) fails.push('## Palette: no text pairs ("#fg on #bg")');
  for (const [, fg, bg, note] of pairs) {
    const min = /large|ui|icon/i.test(note) ? MIN_LARGE_CONTRAST : MIN_TEXT_CONTRAST;
    const ratio = contrast(fg, bg);
    if (ratio < min) fails.push(`## Palette: contrast ${fg} on ${bg} is ${ratio.toFixed(2)}:1, needs ${min}:1`);
  }
}

// SLOP.md 18, 19, 22: a palette row that cites a reference capture by file name clears its colour.
function checkDefaultLooks(text, captures, fails) {
  const rows = text.split('\n').filter((l) => l.trim().startsWith('|'));
  const cleared = (row) => captures.some((f) => row.includes(f));
  const rowColours = rows.filter((r) => !cleared(r)).flatMap((r) => (r.match(HEX) ?? []).map((h) => h.toLowerCase()));
  for (const hex of new Set(rowColours)) {
    const hit = DEFAULT_COLOURS.find((d) => distance(hex, d.hex) <= (d.max ?? MAX_DEFAULT_DISTANCE) && (!d.warm || isWarm(hex)));
    if (hit) fails.push(`## Palette: ${hex} is the SLOP.md ${hit.look} default (${hit.name}); cite a reference capture on its row or pick another`);
  }
  const dark = rowColours.some((h) => luminance(h) < NEAR_BLACK_LUMINANCE);
  const saturated = rowColours.filter(isSaturated);
  const shout = saturated.length === 1 && isShout(saturated[0]) ? saturated[0] : null; // single: a second saturated colour is a palette
  if (dark && shout) fails.push(`## Palette: near-black ground with the single shout ${shout} is SLOP.md 19; cite a reference capture on its row or pick another`);
}

function sourceFiles(dir) {
  if (!existsSync(dir)) return [];
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const p = join(dir, e.name);
    if (e.isDirectory()) return SKIPPED_DIRS.has(e.name) ? [] : sourceFiles(p);
    return SOURCE_FILE.test(e.name) ? [p] : [];
  });
}

// SLOP.md 22, 23: button and link text that says nothing, or ends in an arrow.
function checkSourceLabels(root, fails) {
  const files = [...SOURCE_DIRS.flatMap((d) => sourceFiles(join(root, d))), ...sourceFiles(root).filter((f) => dirname(f) === root)];
  for (const file of files) {
    for (const [, tag, text] of readFileSync(file, 'utf8').matchAll(BUTTON_TEXT)) {
      const label = text.trim();
      const where = `${file.slice(root.length + 1)}: <${tag}> "${label}"`;
      if (VAGUE_LABELS.includes(label.toLowerCase().replace(/[.!]+$/, ''))) fails.push(`${where} is a vague label (SLOP.md 23)`);
      else if (/[→➜➔]$/.test(label)) fails.push(`${where} ends in an arrow (SLOP.md 22)`);
    }
  }
}

export function checkDesign(root) {
  const fails = [];
  const file = join(root, 'design', 'DESIGN.md');
  if (!existsSync(file)) return ['design/DESIGN.md missing'];
  const s = sections(readFileSync(file, 'utf8'));
  for (const name of ['direction', 'palette', 'type', 'bar']) {
    if (!s[name]?.trim()) fails.push(`## ${name[0].toUpperCase()}${name.slice(1)} section missing`);
  }
  const refDir = join(root, 'design', 'reference');
  const captures = existsSync(refDir) ? readdirSync(refDir).filter((f) => IMAGE.test(f)) : [];
  const cited = captures.filter((f) => s.direction?.includes(f));
  if (cited.length < MIN_REFERENCES) {
    fails.push(`## Direction cites ${cited.length} reference captures in design/reference/, needs ${MIN_REFERENCES}`);
  }
  if (s.palette) {
    checkPalette(s.palette, fails);
    checkDefaultLooks(s.palette, captures, fails);
  }
  if (s.type && new Set(s.type.match(/\d+(?:\.\d+)?\s?px/g) ?? []).size < MIN_TYPE_SIZES) {
    fails.push(`## Type: no type scale (at least ${MIN_TYPE_SIZES} sizes in px)`);
  }
  checkSourceLabels(root, fails);
  return fails;
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  const fails = checkDesign(resolve(process.argv[2] ?? '.'));
  for (const f of fails) console.log(`FAIL ${f}`);
  console.log(fails.length ? `design-check: ${fails.length} failing` : 'design-check: pass');
  process.exit(fails.length ? 1 : 0);
}
