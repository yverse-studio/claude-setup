// Screenshots of the spots in test/game.mjs at 390 and 1440 px, from a fresh build.
// Usage: npm run shots -- [url] [--out dir]   (same arguments as play; files: <spot>-<390|1440>.png)
// Each spot is reached by letting the bot play, so every shot is repeatable (?seed=1&paused=1).
import { mkdirSync } from 'node:fs'
import { spots } from '../test/game.mjs'
import { parseArgs, serve, launch, openGame, settle, playBot } from './lib.mjs'

const SIZES = { 390: { width: 390, height: 844 }, 1440: { width: 1440, height: 900 } }
const { out, url } = parseArgs(process.argv.slice(2))
mkdirSync(out, { recursive: true })
const { base, stop } = await serve(url)
const browser = await launch()
const errors = []
for (const [name, viewport] of Object.entries(SIZES)) {
  for (const spot of spots) {
    const page = await openGame(browser, base, viewport, errors)
    await playBot(page, spot.steps)
    await settle(page)
    await page.screenshot({ path: `${out}/${spot.name}-${name}.png` })
    await page.close()
  }
}
await browser.close()
stop()
console.log(JSON.stringify({ shots: spots.length * Object.keys(SIZES).length, out, errors }))
if (errors.length) process.exit(1)
