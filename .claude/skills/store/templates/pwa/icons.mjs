// Dev-only: renders design/icon.svg to the PNG icons the manifest and iOS need (run after changing the icon).
// Uses the machine's Playwright (cloud threads: /opt/pw-browsers/chromium).
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
const require = createRequire(import.meta.url)
const { chromium } = require(process.env.PLAYWRIGHT_PATH || 'playwright')

const svg = readFileSync(new URL('../design/icon.svg', import.meta.url), 'utf8')
// maskable: the art must survive a circle crop, so it sits in the middle 80% on the cork colour
const SIZES = [
  { file: 'icon-192.png', size: 192, pad: 0 },
  { file: 'icon-512.png', size: 512, pad: 0 },
  { file: 'icon-maskable-512.png', size: 512, pad: 0.1 },
  { file: 'apple-touch-icon.png', size: 180, pad: 0 },
]
const browser = await chromium.launch()
const page = await browser.newPage()
for (const { file, size, pad } of SIZES) {
  await page.setViewportSize({ width: size, height: size })
  const inner = Math.round(size * (1 - pad * 2))
  await page.setContent(`<body style="margin:0;background:#c79a6b;display:grid;place-items:center;width:${size}px;height:${size}px">
    <div style="width:${inner}px;height:${inner}px">${svg.replace('<svg ', '<svg width="100%" height="100%" ')}</div></body>`)
  await page.screenshot({ path: `public/icons/${file}` })
}
await browser.close()
console.log('icons in public/icons/')
