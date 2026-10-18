// Play the game with the bot in test/bot.mjs, in the installed Chromium (SwiftShader), and keep
// screenshots. Usage: npm run play -- [url] [--out dir]   (url first; no url: builds, then serves dist/ itself,
// so you never play a stale build; a Worker Preview or the live url is played as it is)
// Fails on a page error, a round that never ends, or a score under the bot's `min`.
import { chromium } from 'playwright-core'
import { spawn, execFileSync } from 'node:child_process'
import { mkdirSync } from 'node:fs'
import { decide, min } from '../test/bot.mjs'

const WIN = process.platform === 'win32' // npx is a .cmd file there
const PORT = 4173
const STEP_MS = 100
const args = process.argv.slice(2)
const outAt = args.indexOf('--out')
const outValueAt = outAt >= 0 && args[outAt + 1] && !args[outAt + 1].startsWith('--') ? outAt + 1 : -1 // a trailing --out falls back
const out = outValueAt >= 0 ? args[outValueAt] : '.shots'
const arg = args.find((a, i) => !a.startsWith('--') && i !== outValueAt) ?? ''
mkdirSync(out, { recursive: true })

let server
let base = arg
if (!base) {
  execFileSync('npx', ['vite', 'build'], { stdio: ['ignore', 'inherit', 'inherit'], shell: WIN }) // a failing build prints why and stops here
  server = spawn('npx', ['vite', 'preview', '--port', String(PORT), '--strictPort'], { stdio: 'ignore', shell: WIN })
  base = `http://localhost:${PORT}`
  for (let i = 0; i < 50; i++) {
    if (await fetch(base).then((r) => r.ok, () => false)) break
    await new Promise((r) => setTimeout(r, 200))
  }
}

const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH ?? '/opt/pw-browsers/chromium',
  args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
})
const errors = []
const page = await browser.newPage({ viewport: { width: 390, height: 844 } })
page.on('pageerror', (e) => errors.push(e.message))
page.on('console', (m) => m.type() === 'error' && !m.text().includes('404') && errors.push(m.text()))
await page.goto(`${base}${base.includes('?') ? '&' : '?'}seed=1&paused=1`)
await page.waitForFunction(() => window.__gameReady === true, null, { timeout: 60_000 })

const read = () => page.evaluate(() => JSON.parse(window.render_game_to_text()))
await page.screenshot({ path: `${out}/play-start.png` })
let state = await read()
for (let i = 0; state.mode === 'playing' && i < 1000; i++) {
  const { x, z } = decide(state)
  await page.evaluate(([a, b, ms]) => { window.__playInput(a, b); window.advanceTime(ms) }, [x, z, STEP_MS])
  state = await read()
  if (i === 100) await page.screenshot({ path: `${out}/play-mid.png` })
}
await page.screenshot({ path: `${out}/play-end.png` })
await browser.close()
server?.kill()

const result = { mode: state.mode, score: state.score, min, errors }
console.log(JSON.stringify(result))
if (state.mode !== 'over' || state.score < min || errors.length) process.exit(1)
