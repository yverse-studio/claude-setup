// The journey check for a game (claude-setup journey.yml runs `npm run journey` against BASE_URL on a phone profile).
// A game has no login, so no test login: the canvas shows up and nothing throws. Grow it with the real play path
// (scripts/play.mjs drives one) as the game gets one.
import { chromium, devices } from 'playwright'
import { mkdirSync } from 'node:fs'

const base = process.env.BASE_URL
if (!base) throw new Error('BASE_URL is not set')
const device = devices[process.env.JOURNEY_DEVICE || 'iPhone 13']
mkdirSync('test-results', { recursive: true })

const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {})
const problems = []
try {
  const page = await (await browser.newContext({ ...device, baseURL: base })).newPage()
  page.on('pageerror', (err) => problems.push(`page error: ${err.message}`))
  await page.goto('/')
  await page.locator('canvas').first().waitFor({ timeout: 20000 })
  await page.screenshot({ path: 'test-results/home.png' })
} catch (e) {
  problems.push(e.message)
} finally {
  await browser.close()
}
if (problems.length) {
  console.error(`journey: ${problems.join('; ')}`)
  process.exit(1)
}
console.log('journey: ok')
