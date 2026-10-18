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
