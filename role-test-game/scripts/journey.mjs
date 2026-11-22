// Kofferlauf journey (Tester first, #732). Draft for role-test-game scripts/journey.mjs; steps match role-test/tester-journey.md.
// Runs against BASE_URL (Worker Preview or live) on JOURNEY_DEVICE (default iPhone 13), plus a 1440 desktop pass.
// Needs the hook contract in tester-journey.md. Exit 1 lists every failed step.
import { chromium, devices } from 'playwright'
import { mkdirSync } from 'node:fs'

const base = process.env.BASE_URL
if (!base) throw new Error('BASE_URL is not set')
mkdirSync('test-results', { recursive: true })
const fails = []
const ok = (step, cond, why) => { if (!cond) fails.push(`step ${step}: ${why}`) }
const state = (page) => page.evaluate(() => JSON.parse(window.render_game_to_text()))
const dist = (a, b) => Math.hypot(a.x - b.x, a.z - b.z)
const launch = () => chromium.launch({
  ...(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {}),
  args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
})

async function open(browser, ctxOpts, query = '') {
  const page = await (await browser.newContext({ ...ctxOpts, baseURL: base })).newPage()
  const errors = []; const unread = []; let bytes = 0
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`))
  page.on('console', (m) => { if (m.type() === 'error') errors.push(`console.error: ${m.text()}`) })
  page.on('response', async (r) => { try { bytes += (await r.body()).length } catch { unread.push(r.url()) } })
  const t0 = Date.now()
  await page.goto('/' + query)
  await page.waitForFunction(() => window.__gameReady === true, null, { timeout: 20000 })
  return { page, errors, ms: Date.now() - t0, bytes: () => bytes }
}

// Bot round on the fixed clock: walk to the nearest untaken suitcase until won, lost or 60 s.
async function playRound(page, stopAt = 5) {
  for (let i = 0; i < 1200; i++) {
    const s = await state(page)
    if (!['title', 'play'].includes(s.mode) || s.collected >= stopAt) return s // GDD: title starts play on the first move input
    const t = s.suitcases.filter((c) => !c.taken).sort((a, b) => dist(a, s.player) - dist(b, s.player))[0]
    await page.evaluate(([x, z]) => window.__playInput(x, z), [t.x - s.player.x, t.z - s.player.z])
    await page.evaluate(() => window.advanceTime(100))
  }
  return state(page)
}

const browser = await launch()
try {
  // Phone pass: steps 1, 2, 5, 13
  const phone = await open(browser, { ...devices[process.env.JOURNEY_DEVICE || 'iPhone 13'] })
  ok(1, phone.ms < 5000, `ready after ${phone.ms} ms (max 5000)`)
  let s = await state(phone.page)
  ok(2, s.player.clip === 'idle' && s.suitcases.length === 5 && s.suitcases.every((c) => !c.taken) && s.timeLeft > 55 && s.timeLeft <= 60, `first state ${JSON.stringify(s)}`)
  await phone.page.screenshot({ path: 'test-results/start-390.png' })
  ok(13, phone.bytes() <= 20 * 1024 * 1024, `first load ${(phone.bytes() / 1048576).toFixed(1)} MB (max 20)`)
  const stick = phone.page.locator('[data-testid=stick]')
  const box = await stick.boundingBox()
  ok(5, box && box.width >= 44 && box.height >= 44, `touch stick box ${JSON.stringify(box)}`)
  if (box) {
    const cx = box.x + box.width / 2, cy = box.y + box.height / 2
    const before = (await state(phone.page)).player
    const cdp = await phone.page.context().newCDPSession(phone.page)
    const touch = (type, y) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: type === 'touchEnd' ? [] : [{ x: cx, y }] })
    await touch('touchStart', cy); await touch('touchMove', cy - box.height / 2)
    await phone.page.waitForTimeout(1000)
    const mid = await state(phone.page)
    await touch('touchEnd')
    ok(5, dist(mid.player, before) > 0.5 && mid.player.clip === 'walk', `stick moved ${dist(mid.player, before).toFixed(2)} m, clip ${mid.player.clip}`)
  }
  ok(1, phone.errors.length === 0, phone.errors.join(' | '))

  // Desktop pass: steps 2-4, 6, 7, 12
  const desk = await open(browser, { viewport: { width: 1440, height: 900 } })
  await desk.page.screenshot({ path: 'test-results/start-1440.png' })
  const p0 = await state(desk.page)
  await desk.page.keyboard.down('KeyW'); await desk.page.waitForTimeout(1000)
  const p1 = await state(desk.page)
  await desk.page.keyboard.up('KeyW'); await desk.page.waitForTimeout(500)
  const p2 = await state(desk.page)
  ok(3, dist(p1.player, p0.player) > 0.5 && p1.player.clip === 'walk', `W moved ${dist(p1.player, p0.player).toFixed(2)} m, clip ${p1.player.clip}`)
  ok(3, p2.player.clip === 'idle', `after release clip ${p2.player.clip}`)
  await desk.page.evaluate(() => document.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyW', key: 'z', bubbles: true })))
  await desk.page.waitForTimeout(500)
  await desk.page.evaluate(() => document.dispatchEvent(new KeyboardEvent('keyup', { code: 'KeyW', key: 'z', bubbles: true })))
  const p3 = await state(desk.page)
  ok(4, dist(p3.player, p2.player) > 0.2, `AZERTY KeyW moved ${dist(p3.player, p2.player).toFixed(2)} m`)
  const off0 = Math.hypot(p0.camera.x - p0.player.x, p0.camera.z - p0.player.z)
  const off3 = Math.hypot(p3.camera.x - p3.player.x, p3.camera.z - p3.player.z)
  ok(6, Math.abs(off3 - off0) <= 1, `camera offset ${off0.toFixed(2)} -> ${off3.toFixed(2)} m`)
  await desk.page.locator('[data-testid=pause]').click()
  const q0 = await state(desk.page)
  await desk.page.waitForTimeout(2000)
  const q1 = await state(desk.page)
  ok(7, q0.mode === 'paused' && q1.timeLeft === q0.timeLeft && dist(q1.player, q0.player) === 0, `pause ${q0.mode}, time ${q0.timeLeft} -> ${q1.timeLeft}`)
  await desk.page.keyboard.press('Escape')
  ok(7, (await state(desk.page)).mode === 'play', 'resume did not return to play')
  await desk.page.reload(); await desk.page.waitForFunction(() => window.__gameReady === true, null, { timeout: 20000 })
  await desk.page.goBack().catch(() => {})
  ok(12, desk.errors.length === 0, desk.errors.join(' | '))

  // Fixed-clock pass: steps 8-11
  const run = await open(browser, { viewport: { width: 1440, height: 900 } }, '?paused=1')
  let r = await state(run.page)
  ok(2, r.timeLeft === 60 && ['title', 'play'].includes(r.mode), `fixed-clock start ${r.mode} ${r.timeLeft}`)
  const near = r.suitcases[0]
  // step 8: stop 1.0 m from a suitcase (GDD: contact is 0.7 m, nothing at 1.0 m), collected must stay 0
  for (let i = 0; i < 300 && dist(r.player, near) > 1.0; i++) {
    await run.page.evaluate(([x, z]) => window.__playInput(x, z), [near.x - r.player.x, near.z - r.player.z])
    await run.page.evaluate(() => window.advanceTime(50)); r = await state(run.page)
  }
  await run.page.evaluate(() => { window.__playInput(0, 0); window.advanceTime(500) })
  ok(8, (await state(run.page)).collected === 0, 'a suitcase counted without contact')
  r = await playRound(run.page)
  ok(9, r.mode === 'won' && r.collected === 5, `round ended ${r.mode} with ${r.collected}`)
  ok(9, await run.page.locator('[data-testid=win]').isVisible(), 'win panel not visible')
  await run.page.evaluate(() => window.advanceTime(16)); await run.page.waitForTimeout(700)
  await run.page.screenshot({ path: 'test-results/win-1440.png' })
  await run.page.locator('[data-testid=restart]:visible').click()
  r = await state(run.page)
  ok(10, ['title', 'play'].includes(r.mode) && r.collected === 0 && r.timeLeft === 60 && r.suitcases.every((c) => !c.taken), `after restart ${JSON.stringify(r)}`)
  r = await playRound(run.page, 4)
  await run.page.evaluate(() => window.__playInput(0, 0))
  const left = r.timeLeft
  await run.page.evaluate((ms) => window.advanceTime(ms), Math.max(0, left * 1000 - 100))
  ok(11, (await state(run.page)).mode === 'play', 'run ended before 60 s')
  await run.page.evaluate(() => window.advanceTime(300))
  r = await state(run.page)
  ok(11, r.mode === 'lost' && r.collected === 4, `timeout ended ${r.mode} with ${r.collected}`)
  ok(11, await run.page.locator('[data-testid=lose]').isVisible(), 'lose panel not visible')
  ok(1, run.errors.length === 0, run.errors.join(' | '))
} catch (e) {
  fails.push(`aborted: ${e.message}`)
} finally {
  await browser.close()
}
if (fails.length) { console.error(`journey: ${fails.length} failed\n${fails.join('\n')}`); process.exit(1) }
console.log('journey: ok (steps 1-13)')
