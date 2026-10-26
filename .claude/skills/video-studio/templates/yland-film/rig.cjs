// Deterministic Y-Land film rig: page simulation, Playwright fake clock, canvas read per frame.
const { chromium } = require('playwright');
async function open({ url = 'http://localhost:3000/', start = Date.parse('2026-10-26T11:00:00Z') } = {}) {
  const b = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const ctx = await b.newContext({ viewport: { width: 540, height: 960 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  await ctx.addInitScript(() => {
    const W = window.Worker;
    window.Worker = function (u, o) { if (/simulation.worker|villager-atlas/.test(String(u))) throw new Error('film: page sim'); return new W(u, o); };
    let a = 20261026; Math.random = () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
  });
  const p = await ctx.newPage();
  p.on('pageerror', e => console.log('PAGEERR', String(e).slice(0, 200)));
  await p.clock.install({ time: start });
  await p.goto(url, { waitUntil: 'domcontentloaded', timeout: 180000 });
  for (let i = 0; i < 400; i++) { await p.clock.runFor(100); if (await p.evaluate(() => !!window.__island)) break; await p.waitForTimeout(50); }
  await p.clock.runFor(3000);
  return { b, p };
}
async function grab(p, file) {
  const data = await p.evaluate(() => { const r = window.__island; r.app.render(); return r.app.canvas.toDataURL('image/png'); });
  require('fs').writeFileSync(file, Buffer.from(data.split(',')[1], 'base64'));
}
module.exports = { open, grab };
