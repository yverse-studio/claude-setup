// Y-Land v2: 6 s of game, six 1 s shots on a 120 BPM grid, cameras that never chase a spinning rider.
// node film.cjs <outDir> [dry]
const { open, grab } = require('./rig.cjs');
const fs = require('fs');
const out = process.argv[2]; const dry = process.argv[3] === 'dry';
fs.mkdirSync(out, { recursive: true });
const ease = t => 1 - Math.pow(1 - t, 3);
const easeIO = t => t < .5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
const lerp = (a, b, t) => a + (b - a) * t;
const logz = (a, b, t) => Math.exp(lerp(Math.log(a), Math.log(b), t));
const ISLAND = { x: 3600, y: 2500, z: 0.135 };
const HUB = { x: 2280, y: 1275 }; // Ferris wheel hub: funfair frame (2010,1110) + WHEEL.hub (180,110) x 1.5
// Shots take a zone centre `c` (page-computed) and a subject `s` where they need one.
const SHOTS = [
  { n: 30, need: 'picnic', cam: (c, s, t) => { const e = ease(t); return { x: lerp(c.x, ISLAND.x, e), y: lerp(c.y, ISLAND.y, e), z: logz(4, ISLAND.z, e) }; } },
  { n: 30, need: 'town', cam: (c, s, t) => ({ x: lerp(c.x - 260, c.x + 260, t), y: c.y, z: 1.35 }) },
  { n: 30, cam: (c, s, t) => ({ x: HUB.x, y: HUB.y + 70, z: lerp(1.55, 1.8, t) }) },
  { n: 30, need: 'lagoon', pick: 'fish', cam: (c, s, t) => ({ x: s.x, y: s.y - 10, z: lerp(3.6, 4.0, t) }) },
  { n: 30, need: 'burger', pick: 'happy', cam: (c, s, t) => ({ x: s.x, y: s.y - 10, z: lerp(3.4, 3.8, t) }) },
  { n: 30, need: 'harbor', cam: (c, s, t) => { const e = easeIO(t); return { x: lerp(c.x - 100, c.x - 190, e), y: c.y, z: lerp(1.75, 1.6, e) }; } },
];
const STEPS = [34, 33, 33]; // 100 ms per 3 frames, each frame crossing exactly one 30 Hz sim step
(async () => {
  const { b, p } = await open();
  await p.evaluate(() => { const r = window.__island; r.setWeather({ kind: 'sunny', intensity: 0 }); r.weather.container.visible = false; r.viewport.plugins.remove('clamp-zoom'); r.viewport.plugins.remove('clamp'); });
  await p.clock.runFor(8000);
  const log = []; let frame = 0;
  const setCam = c => p.evaluate(c => { const r = window.__island; r.weather.container.visible = false; r.viewport.scale.set(c.z); r.viewport.moveCenter(c.x, c.y); }, c);
  for (let si = 0; si < SHOTS.length; si++) {
    const shot = SHOTS[si];
    const c = shot.need ? await p.evaluate(z => { const fs = window.__island.simulation.followers.filter(f => f.spot && f.spot.zoneId === z); return { x: fs.reduce((a, f) => a + f.spot.x, 0) / fs.length, y: fs.reduce((a, f) => a + f.spot.y, 0) / fs.length, n: fs.length }; }, shot.need) : null;
    if (c) { await setCam({ x: c.x, y: c.y, z: 2.5 }); await p.clock.runFor(1500); } // wake moods near the camera
    let key = null;
    if (shot.pick) key = await p.evaluate(({ z, kind }) => {
      const F = window.__island.simulation.followers.filter(f => f.spot && f.spot.zoneId === z);
      const q = kind === 'fish' ? [f => f.spot.activity === 'fish' && f.emoji, f => f.spot.activity === 'fish' && f.isSeated, f => f.spot.activity === 'fish'] : [f => ['😄', '🥰', '😆', '🤩'].includes(f.emoji), f => !!f.emoji, f => f.isSeated];
      for (const p of q) { const f = F.find(p); if (f) return f.key; } return F[0] && F[0].key;
    }, { z: shot.need, kind: shot.pick });
    const subject = () => key ? p.evaluate(k => { const f = window.__island.simulation.followers.find(x => x.key === k); return { x: f.x, y: f.y, name: f.name, e: f.emoji }; }, key) : null;
    for (let i = 0; i < shot.n; i++, frame++) {
      const t = i / (shot.n - 1);
      const s = await subject();
      const cam = shot.cam(c, s, t);
      await setCam(cam);
      if (i === 0) { await p.evaluate(() => window.__island.app.ticker.update()); log.push({ shot: si, zone: shot.need, c, key, s }); }
      await p.clock.runFor(STEPS[frame % 3]);
      await setCam(shot.cam(c, await subject(), t));
      if (!dry || i === 0 || i === shot.n - 1) await grab(p, `${out}/f${String(frame).padStart(4, '0')}.png`);
    }
  }
  fs.writeFileSync(`${out}/cast.json`, JSON.stringify(log, null, 1));
  console.log(JSON.stringify(log));
  await b.close();
})();
