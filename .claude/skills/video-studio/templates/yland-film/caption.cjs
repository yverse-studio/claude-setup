// Renders the one caption as a transparent 1080x1920 PNG: plain white bold, thin shadow, top safe band.
const { chromium } = require('playwright');
const [text, out] = process.argv.slice(2);
(async () => {
  const b = await chromium.launch(); const p = await b.newPage({ viewport: { width: 1080, height: 1920 } });
  const esc = s => s.replace(/&/g, '&amp;').replace(/</g, '&lt;');
  await p.setContent(`<html><body style="margin:0;background:transparent">
  <div style="position:absolute;left:90px;right:150px;top:270px;text-align:center;font:700 64px/1.22 Inter,sans-serif;color:#fff;
  text-shadow:0 0 3px rgba(0,0,0,.55),0 2px 4px rgba(0,0,0,.45);letter-spacing:-0.3px">${esc(text)}</div></body></html>`);
  await p.screenshot({ path: out, omitBackground: true }); await b.close();
})();
