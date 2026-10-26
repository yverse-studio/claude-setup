// The journey check's specs (claude-setup journey.yml runs `npm run journey` against BASE_URL on a phone profile).
// Day zero: the page renders and, when PREVIEW_LOGIN_TOKEN is set, the preview test login works. A project grows
// this file with its real journeys (never turn on Playwright tracing: a trace stores the test login's Authorization header) (sign in with the test login, then click through); it must never run against live.
import { chromium, devices } from 'playwright'
import { mkdirSync } from 'node:fs'

const base = process.env.BASE_URL
if (!base) throw new Error('BASE_URL is not set')
const device = devices[process.env.JOURNEY_DEVICE || 'iPhone 13']
mkdirSync('test-results', { recursive: true })

const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {})
let failed = false
try {
  const context = await browser.newContext({ ...device, baseURL: base })
  const page = await context.newPage()
  await page.goto('/')
  await page.locator('h1, canvas').first().waitFor({ timeout: 15000 })
  if (process.env.PREVIEW_LOGIN_TOKEN) {
    const login = await context.request.post('/api/test-login', { headers: { authorization: `Bearer ${process.env.PREVIEW_LOGIN_TOKEN}`, origin: new URL(base).origin } })
    if (!login.ok()) throw new Error(`test login answered ${login.status()}`)
    console.log('journey: preview test login ok')
  } else {
    console.log('journey: no PREVIEW_LOGIN_TOKEN, login steps skipped')
  }
  await page.screenshot({ path: 'test-results/home.png' })
  console.log('journey: ok')
} catch (e) {
  failed = true
  console.error(`journey: ${e.message}`)
} finally {
  await browser.close()
}
process.exit(failed ? 1 : 0)
