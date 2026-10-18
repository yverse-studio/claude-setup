// Play the game with the bot in test/game.mjs, in the installed Chromium (SwiftShader), and keep
// screenshots. Usage: npm run play -- [url] [--out dir]   (url first; no url: builds, then serves dist/ itself,
// so you never play a stale build; a Worker Preview or the live url is played as it is)
// Fails on a page error, a round that never ends, or a score under `min`.
import { mkdirSync } from 'node:fs'
import { min } from '../test/game.mjs'
import { parseArgs, serve, launch, openGame, settle, playBot, read } from './lib.mjs'

const { out, url } = parseArgs(process.argv.slice(2))
mkdirSync(out, { recursive: true })
const { base, stop } = await serve(url)
const browser = await launch()
const errors = []
const page = await openGame(browser, base, { width: 390, height: 844 }, errors)

await page.screenshot({ path: `${out}/play-start.png` })
await playBot(page, null, async (i) => {
  if (i === 100) await page.screenshot({ path: `${out}/play-mid.png` })
})
await settle(page)
await page.screenshot({ path: `${out}/play-end.png` })
const state = await read(page)
await browser.close()
stop()

const result = { mode: state.mode, score: state.score, min, errors }
console.log(JSON.stringify(result))
if (state.mode !== 'over' || state.score < min || errors.length) process.exit(1)
