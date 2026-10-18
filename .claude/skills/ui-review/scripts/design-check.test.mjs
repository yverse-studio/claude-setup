import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { checkDesign, contrast } from './design-check.mjs';

const GOOD = `# Design
## Direction
Storybook night garden, from reference/a.png, reference/b.png and reference/c.png.
## Palette
| role | hex |
|---|---|
| ground | #2b2118 |
| leaf | #5f7f3a |
| lamp | #f2c46d |
Text pairs: #f7ecd8 on #2b2118 (body), #2b2118 on #f2c46d (button)
## Type
Display: Baloo 2 32px, body: Nunito 16px, small 13px.
## Bar
Motion and states.
`;

function project(md, files = ['a.png', 'b.png', 'c.png']) {
  const dir = mkdtempSync(join(tmpdir(), 'design-'));
  mkdirSync(join(dir, 'design', 'reference'), { recursive: true });
  for (const f of files) writeFileSync(join(dir, 'design', 'reference', f), 'x');
  if (md !== null) writeFileSync(join(dir, 'design', 'DESIGN.md'), md);
  return dir;
}

test('contrast of black on white is 21', () => {
  assert.equal(Math.round(contrast('#000000', '#ffffff')), 21);
});

test('a complete DESIGN.md passes', () => {
  assert.deepEqual(checkDesign(project(GOOD)), []);
});

test('missing DESIGN.md fails', () => {
  assert.match(checkDesign(project(null)).join(), /DESIGN\.md missing/);
});

test('missing sections fail', () => {
  const fails = checkDesign(project('# Design\n## Bar\nx\n'));
  for (const s of ['Direction', 'Palette', 'Type']) assert.ok(fails.some((f) => f.includes(s)), s);
});

test('fewer than three cited captures fails', () => {
  assert.match(checkDesign(project(GOOD, ['a.png'])).join(), /reference/);
});

test('a text pair under 4.5:1 fails', () => {
  const md = GOOD.replace('#f7ecd8 on #2b2118', '#555555 on #444444');
  assert.match(checkDesign(project(md)).join(), /contrast/);
});

test('no type scale fails', () => {
  const md = GOOD.replace(/Display:.*\n/, 'Nunito everywhere.\n');
  assert.match(checkDesign(project(md)).join(), /type scale/);
});

test('more than eight palette colours fails', () => {
  const extra = Array.from({ length: 9 }, (_, i) => `| c${i} | #${String(i).repeat(6)} |`).join('\n');
  const md = GOOD.replace('| lamp | #f2c46d |', `| lamp | #f2c46d |\n${extra}`);
  assert.match(checkDesign(project(md)).join(), /Palette: \d+ colours/);
});

const withPalette = (rows) => GOOD.replace('| lamp | #f2c46d |', `| lamp | #f2c46d |\n${rows}`);

test('the cream ground from SLOP.md 18 fails, a near hex too', () => {
  assert.match(checkDesign(project(withPalette('| paper | #f4f1ea |'))).join(), /SLOP\.md 18 default \(cream ground\)/);
  assert.match(checkDesign(project(withPalette('| paper | #f5f0e8 |'))).join(), /SLOP\.md 18/);
});

test('the terracotta accent from SLOP.md 18 fails', () => {
  assert.match(checkDesign(project(withPalette('| accent | #d97757 |'))).join(), /terracotta accent/);
});

test('tinted near-black from SLOP.md 22 fails', () => {
  assert.match(checkDesign(project(withPalette('| ink | #0b0b0b |'))).join(), /SLOP\.md 22 default/);
});

test('neutral near-black fails at both defaults, a hued dark ground passes', () => {
  assert.match(checkDesign(project(withPalette('| ink | #111111 |'))).join(), /SLOP\.md 22 default/);
  assert.match(checkDesign(project(withPalette('| ink | #0c0c0b |'))).join(), /SLOP\.md 22 default/);
  for (const dark of ['#0a1210', '#0b1226', '#05080a']) assert.deepEqual(checkDesign(project(withPalette(`| ink | ${dark} |`))), [], dark);
});

const FLAGGED = ['#f4f1ea', '#f4ecd6', '#f5f0e8', '#d97757', '#0b0b0b', '#111111', '#0c0c0b'];
const PASSING = [
  '#ffffff', '#fefefe', '#fdfcfa', '#faf9f6', '#f9f7f4', '#f5f5f5', '#fafafa', '#f8f8f8', '#f0f0f0', '#eeeeee', '#e5e5e5',
  '#fffaf0', '#e07a5f', '#0a1210', '#0b1226', '#05080a', '#000000', '#121212', '#09090b', '#0a0a0a', '#151515', '#18181b',
  '#111827', '#ff2a1a', '#e53935', '#dc2626',
];

test('table: real defaults fail, near-whites, greys, dark greens and blues, danger reds pass', () => {
  for (const hex of FLAGGED) assert.match(checkDesign(project(withPalette(`| c | ${hex} |`))).join(), /SLOP\.md (18|22) default/, hex);
  for (const hex of PASSING) assert.deepEqual(checkDesign(project(withPalette(`| c | ${hex} |`))), [], hex);
});

test('a danger red on a dark ground is not the shout, a second saturated colour breaks the single shout', () => {
  assert.deepEqual(checkDesign(project(withPalette('| danger | #ff2a1a |'))), []);
  assert.deepEqual(checkDesign(project(withPalette('| shout | #c6ff00 |\n| dew | #00e5ff |'))), []);
});

test('a shout row citing a reference capture is cleared', () => {
  assert.deepEqual(checkDesign(project(withPalette('| shout | #c6ff00 | from a.png |'))), []);
});

test('a default colour passes when its row cites a reference capture', () => {
  assert.deepEqual(checkDesign(project(withPalette('| paper | #f4f1ea | from a.png |'))), []);
});

test('near-black ground with one acid-green shout fails (SLOP.md 19), a vermilion one too', () => {
  for (const shout of ['#c6ff00', '#ff3d00']) {
    const md = withPalette(`| shout | ${shout} |`);
    assert.match(checkDesign(project(md)).join(), /SLOP\.md 19/, shout);
  }
});

test('the same shout on a light ground passes', () => {
  const md = withPalette('| shout | #c6ff00 |').replace('| ground | #2b2118 |', '| ground | #e8e2d4 |').replace('#f7ecd8 on #2b2118', '#2b2118 on #e8e2d4');
  assert.deepEqual(checkDesign(project(md)), []);
});

function withSource(file, body) {
  const dir = project(GOOD);
  mkdirSync(join(dir, 'src'), { recursive: true });
  writeFileSync(join(dir, 'src', file), body);
  return dir;
}

test('vague button labels fail (SLOP.md 23)', () => {
  for (const label of ['Submit', 'OK', 'Click here', 'Go', 'Absenden', 'Hier klicken']) {
    const fails = checkDesign(withSource('App.vue', `<template><button class="x">${label}</button></template>`));
    assert.match(fails.join(), /vague label \(SLOP\.md 23\)/, label);
  }
});

test('a button that says what happens passes', () => {
  assert.deepEqual(checkDesign(withSource('App.vue', '<button>Save changes</button><a href="/">Zurück zum Garten</a>')), []);
});

test('an arrow after link or button text fails (SLOP.md 22)', () => {
  assert.match(checkDesign(withSource('Hero.html', '<a href="/play">Play now →</a>')).join(), /ends in an arrow/);
});

test('node_modules and test fixtures are not scanned', () => {
  for (const skipped of ['node_modules', 'fixtures', '__tests__']) {
    const dir = project(GOOD);
    mkdirSync(join(dir, 'src', skipped), { recursive: true });
    writeFileSync(join(dir, 'src', skipped, 'x.html'), '<button>Submit</button>');
    assert.deepEqual(checkDesign(dir), [], skipped);
  }
});
