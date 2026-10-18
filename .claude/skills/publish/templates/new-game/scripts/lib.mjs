// Shared by play.mjs and shots.mjs: serve or open a build, start Chromium (SwiftShader), play with
// the bot from test/game.mjs. Nothing game-specific lives here.
import { chromium } from 'playwright-core'
import { spawn, execFileSync } from 'node:child_process'
import { stepMs, maxSteps, decide } from '../test/game.mjs'

const WIN = process.platform === 'win32' // npx is a .cmd file there
const PORT = 4173
const FADE_MS = 700 // CSS fades and transitions run on the real clock, advanceTime does not move them

// `[url] [--out dir]`: the url comes first (npm drops an empty argument). No url: builds, then serves dist/.
export function parseArgs(argv) {
  const outAt = argv.indexOf('--out')
  const outValueAt = outAt >= 0 && argv[outAt + 1] && !argv[outAt + 1].startsWith('--') ? outAt + 1 : -1 // a trailing --out falls back
  return { out: outValueAt >= 0 ? argv[outValueAt] : '.shots', url: argv.find((a, i) => !a.startsWith('--') && i !== outValueAt) ?? '' }
}

export async function serve(url) {
  if (url) return { base: url, stop() {} } // a Worker Preview or the live url is used as it is
  execFileSync('npx', ['vite', 'build'], { stdio: ['ignore', 'inherit', 'inherit'], shell: WIN }) // a failing build prints why and stops here
  const server = spawn('npx', ['vite', 'preview', '--port', String(PORT), '--strictPort'], { stdio: 'ignore', shell: WIN })
  const base = `http://localhost:${PORT}`
  for (let i = 0; i < 50; i++) {
    if (await fetch(base).then((r) => r.ok, () => false)) break
    await new Promise((r) => setTimeout(r, 200))
  }
  return { base, stop: () => server.kill() }
}

export const launch = () =>
  chromium.launch({
    executablePath: process.env.CHROMIUM_PATH ?? '/opt/pw-browsers/chromium',
    args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
  })

// A paused page (?paused=1) is repeatable but paints only inside advanceTime(): open, wait for the game, paint once.
export async function openGame(browser, base, viewport, errors) {
  const page = await browser.newPage({ viewport })
  page.on('pageerror', (e) => errors.push(e.message))
  page.on('console', (m) => m.type() === 'error' && !m.text().includes('404') && errors.push(m.text()))
  await page.goto(`${base}${base.includes('?') ? '&' : '?'}seed=1&paused=1`)
  await page.waitForFunction(() => window.__gameReady === true, null, { timeout: 60_000 })
  await settle(page)
  return page
}

// Paint the current state, then let CSS fades finish: screenshot only after this.
export async function settle(page) {
  await page.evaluate(() => window.advanceTime(16))
  await page.waitForTimeout(FADE_MS)
}

export const read = (page) => page.evaluate(() => JSON.parse(window.render_game_to_text()))

// The bot plays up to `steps` decisions (null = until the round is over). Returns the last state.
export async function playBot(page, steps = null, onStep = async () => {}) {
  let state = await read(page)
  for (let i = 0; state.mode === 'playing' && i < (steps ?? maxSteps); i++) {
    await page.evaluate(([args, ms]) => { window.__playInput(...args); window.advanceTime(ms) }, [decide(state), stepMs])
    state = await read(page)
    await onStep(i)
  }
  return state
}
