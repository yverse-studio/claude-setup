// Y-Land brag 2026-10-26: one sim clock, six shots, hard cuts on beats. node film.cjs <outDir> [dry]
const { open, grab } = require('./rig.cjs');
const fs = require('fs');
const out = process.argv[2]; const dry = process.argv[3] === 'dry';
fs.mkdirSync(out, { recursive: true });
const ease = t => 1 - Math.pow(1 - t, 3);
const easeIO = t => t < .5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
const lerp = (a, b, t) => a + (b - a) * t;
const logz = (a, b, t) => Math.exp(lerp(Math.log(a), Math.log(b), t));
const ISLAND = { x: 3600, y: 2500, z: 0.135 };
// pick: preference list of predicates run in the page; returns follower key
const PICK = {
  hero: `f => f.emoji === '👋'`, ride: `f => f.spot && f.spot.activity === 'ride'`,
  fish: `f => f.spot && f.spot.activity === 'fish'`, talk: `f => ['💬','🥰','😄','❤️'].includes(f.emoji)`,
  seated: `f => f.isSeated`,
};
const SHOTS = [
  { from: 0, to: 45, pick: 'hero', cam: (s, t) => ({ ...s, z: lerp(9.5, 10.5, t) }) },
  { from: 45, to: 75, keep: 0, cam: (s, t) => { const e = ease(Math.min(1, t * 1.25)); return { x: lerp(s.x, ISLAND.x, e), y: lerp(s.y, ISLAND.y, e), z: logz(10.5, ISLAND.z, e) }; } },
  { from: 75, to: 105, pick: 'ride', cam: (s, t) => ({ ...s, z: lerp(4.6, 5.2, t) }) },
  { from: 105, to: 135, pick: 'fish', cam: (s, t) => ({ ...s, z: lerp(8.5, 9.5, t) }) },
  { from: 135, to: 165, pick: 'friends', cam: (s, t) => ({ ...s, z: lerp(8.5, 9.5, t) }) },
  { from: 165, to: 210, keep: 0, cam: (s, t) => { const e = easeIO(t); return { x: lerp(ISLAND.x, s.x, e), y: lerp(ISLAND.y, s.y, e), z: logz(0.3, 9.5, e) }; } },
];
(async () => {
  const { b, p } = await open();
  await p.evaluate(() => { const r = window.__island; r.setWeather({ kind: 'sunny', intensity: 0 }); r.weather.container.visible = false; }); await p.clock.runFor(10000);
  const pre = await p.evaluate(() => { const r = window.__island; const fs = r.simulation.followers.filter(f => f.spot && f.spot.zoneId === 'picnic'); const c = { x: fs.reduce((a, f) => a + f.x, 0) / fs.length, y: fs.reduce((a, f) => a + f.y, 0) / fs.length }; const v = r.viewport; v.plugins.remove('clamp-zoom'); v.scale.set(2.5); v.moveCenter(c.x, c.y); return { c, n: fs.length }; });
  console.log('preroll', JSON.stringify(pre));
  await p.clock.runFor(3000);
  const picked = []; const log = [];
  let frame = 0;
  for (let si = 0; si < SHOTS.length; si++) {
    const shot = SHOTS[si];
    let key;
    if (shot.keep !== undefined) key = picked[shot.keep];
    else if (shot.keys) key = shot.keys;
    else {
      key = await p.evaluate(({ kind, used }) => {
        const F = window.__island.simulation.followers.filter(f => f.key !== 'xyskillsx' && !used.includes(f.key));
        const by = k => F.find(f => f.key === k);
        const pair = q => { const f = F.find(f => f.partnerKey && by(f.partnerKey) && q(f)); return f && [f.key, f.partnerKey]; };
        const one = q => { const f = F.find(q); return f && [f.key]; };
        const act = (f, a) => f.spot && f.spot.activity === a;
        if (kind === 'hero') return one(f => f.spot && f.spot.zoneId === 'picnic' && ['🥰','😄','👋','😆','🤩'].includes(f.emoji)) || pair(f => f.emoji === '👋') || pair(f => !!f.emoji) || one(f => f.emoji === '👋') || [F[0].key];
        if (kind === 'ride') return one(f => act(f, 'ride') && f.isSeated && f.emoji) || one(f => act(f, 'ride') && f.isSeated) || one(f => act(f, 'ride')) || [F[1].key];
        if (kind === 'fish') return one(f => act(f, 'fish') && ['🐠', '🎣', '🐟'].includes(f.emoji)) || one(f => act(f, 'fish') && f.isSeated) || one(f => act(f, 'fish')) || [F[2].key];
        return pair(f => !!f.emoji) || one(f => ['😄', '🥰', '😆'].includes(f.emoji)) || one(f => !!f.emoji) || [F[3].key];
      }, { kind: shot.pick, used: picked.flat() });
    }
    picked[si] = key;
    for (; frame < shot.to; frame++) {
      const t = (frame - shot.from) / (shot.to - shot.from - 1 || 1);
      const s = await p.evaluate(ks => { const F = window.__island.simulation.followers; const fs = [].concat(ks).map(k => F.find(x => x.key === k)).filter(Boolean); const x = fs.reduce((a, f) => a + f.x, 0) / fs.length, y = fs.reduce((a, f) => a + f.y, 0) / fs.length; return { x, y: y - 12, name: fs.map(f => f.name).join('+'), e: fs.map(f => f.emoji).join(''), a: fs[0].spot && fs[0].spot.activity }; }, key);
      const c = shot.cam(s, t);
      await p.evaluate(c => { window.__island.weather.container.visible = false; const v = window.__island.viewport; v.plugins.remove('clamp-zoom'); v.plugins.remove('clamp'); v.scale.set(c.z); v.moveCenter(c.x, c.y); }, c);
      if (frame === shot.from) { await p.evaluate(() => window.__island.app.ticker.update()); log.push({ shot: si, key, name: s.name, emoji: s.e, act: s.a }); }
      await p.clock.runFor(frame % 3 === 2 ? 34 : 33);
      await p.evaluate(c => { window.__island.weather.container.visible = false; const v = window.__island.viewport; v.plugins.remove('clamp-zoom'); v.plugins.remove('clamp'); v.scale.set(c.z); v.moveCenter(c.x, c.y); }, c);
      if (!dry || frame === shot.from || frame === shot.to - 1) await grab(p, `${out}/f${String(frame).padStart(4, '0')}.png`);
    }
  }
  fs.writeFileSync(`${out}/cast.json`, JSON.stringify(log, null, 1));
  console.log(JSON.stringify(log));
  await b.close();
})();
