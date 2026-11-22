// The bot on every layout: `npm run bot -- [url]` plays seeds 1 to 5 in the installed Chromium and prints one line each.
// Exit 1 unless every seed is cleared (5/5) with at least `minTimeLeft` seconds left and no page error.
// With a url (Worker Preview or live) it plays that page as it is; without, it builds and serves dist/.
import { minTimeLeft } from '../test/game.mjs'
import { parseArgs, serve, launch, openGame, playBot, read } from './lib.mjs'

const { url } = parseArgs(process.argv.slice(2))
const { base, stop } = await serve(url)
const browser = await launch()
const errors = []
let failed = false
for (let seed = 1; seed <= 5; seed++) {
  const page = await openGame(browser, base, { width: 1440, height: 900 }, errors, seed)
  const s = await playBot(page)
  const ok = s.mode === 'won' && s.collected === 5 && s.timeLeft >= minTimeLeft
  if (!ok) failed = true
  console.log(`seed ${seed}: ${s.mode} ${s.collected}/5, ${s.timeLeft.toFixed(1)} s left ${ok ? 'ok' : `FAIL (need cleared with >= ${minTimeLeft} s)`}`)
  await page.close()
}
await browser.close()
stop()
if (errors.length) { console.log(`page errors: ${errors.join(' | ')}`); failed = true }
console.log(failed ? 'bot: FAILED' : `bot: all five seeds cleared with at least ${minTimeLeft} s left`)
process.exit(failed ? 1 : 0)
