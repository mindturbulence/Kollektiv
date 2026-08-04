import { chromium } from 'playwright-core';

const url = process.argv[2] || 'http://127.0.0.1:7500/';
const out = process.argv[3] || '.topaz-tmp/shot.png';
const width = parseInt(process.argv[4] || '1500', 10);

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width, height: 950 } });
page.on('console', (msg) => {
  if (msg.type() === 'error') console.log('[console.error]', msg.text().slice(0, 300));
});
page.on('pageerror', (err) => console.log('[pageerror]', String(err).slice(0, 300)));
try {
  await page.goto(url, { waitUntil: 'networkidle', timeout: 30000 });
} catch (e) {
  console.log('goto warn:', String(e).slice(0, 200));
}
await page.waitForTimeout(2500);
await page.screenshot({ path: out });
console.log('saved', out, await page.title());
await browser.close();
