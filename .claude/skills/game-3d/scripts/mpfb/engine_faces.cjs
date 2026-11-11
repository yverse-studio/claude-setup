// node faces3.cjs <outdir> <tag> fig[:lod] ...  -> <outdir>/<tag>-<fig>-L<lod>-{front,34}.png : engine close-ups (market lighting, crowd off)
const { chromium } = require('playwright')
const [, , outdir, tag, ...figs] = process.argv
;(async () => {
  const b = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] })
  for (const f of figs) {
    const [fig, lod = '0'] = f.split(':')
    const base = `http://localhost:8790/spike/look/?dir=r&crowd=0&fig=${fig}&lod=${lod}`
    const p = await b.newPage({ viewport: { width: 900, height: 900 } }); p.setDefaultTimeout(300000)
    await p.goto(base); await p.waitForFunction(() => window.__ready)
    const h = await p.evaluate(() => { let hb; globalThis.__fig.traverse((c) => { if (c.isBone && c.name === 'head' && !hb) hb = c })
      const v = hb.getWorldPosition(new hb.position.constructor()); const q = globalThis.__fig.getWorldQuaternion(new hb.quaternion.constructor())
      const fwd = new hb.position.constructor(0, 0, 1).applyQuaternion(q); return { x: v.x, y: v.y + 0.07, z: v.z, fx: fwd.x, fz: fwd.z } })
    await p.close()
    const body = !!process.env.BODY
    for (const [nm, ang] of [['front', 0], ['34', 0.6]]) {
      const c = Math.cos(ang), s = Math.sin(ang), dx = h.fx * c - h.fz * s, dz = h.fx * s + h.fz * c, d = body ? 2.4 : 0.55, ty = body ? h.y * 0.55 : h.y
      const cam = [h.x + dx * d, ty + 0.02, h.z + dz * d, h.x, ty, h.z].map((n) => n.toFixed(3)).join(',')
      const p2 = await b.newPage({ viewport: { width: 900, height: 900 } }); p2.setDefaultTimeout(300000)
      await p2.goto(`${base}&cam=${cam}`); await p2.waitForFunction(() => window.__ready); await p2.waitForTimeout(1500)
      const d64 = await p2.evaluate(() => document.querySelector('canvas').toDataURL('image/png'))
      require('fs').writeFileSync(`${outdir}/${tag}-${fig}-L${lod}${body ? '-body' : ''}-${nm}.png`, Buffer.from(d64.split(',')[1], 'base64')); await p2.close()
    }
    console.log('ok', f)
  }
  await b.close()
})()
