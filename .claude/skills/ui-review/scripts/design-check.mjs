#!/usr/bin/env node
// Gate check 5, the part a script can prove: design/DESIGN.md has a Direction citing at least
// three reference captures, a palette of at most eight hex colours with text pairs at 4.5:1,
// and a type scale. Usage: node design-check.mjs [project root]. Exit 1 lists what fails.
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const MIN_REFERENCES = 3;
const MAX_PALETTE = 8;
const MIN_TEXT_CONTRAST = 4.5;
const MIN_LARGE_CONTRAST = 3;
const MIN_TYPE_SIZES = 3;
const IMAGE = /\.(png|jpe?g|webp|gif|avif)$/i;
const HEX = /#[0-9a-f]{6}\b/gi;

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
  if (s.palette) checkPalette(s.palette, fails);
  if (s.type && new Set(s.type.match(/\d+(?:\.\d+)?\s?px/g) ?? []).size < MIN_TYPE_SIZES) {
    fails.push(`## Type: no type scale (at least ${MIN_TYPE_SIZES} sizes in px)`);
  }
  return fails;
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  const fails = checkDesign(resolve(process.argv[2] ?? '.'));
  for (const f of fails) console.log(`FAIL ${f}`);
  console.log(fails.length ? `design-check: ${fails.length} failing` : 'design-check: pass');
  process.exit(fails.length ? 1 : 0);
}
