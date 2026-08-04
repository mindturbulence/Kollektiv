import { chromium } from 'playwright-core';

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } });
const logs = [];
page.on('console', (m) => logs.push(`[${m.type()}] ${m.text().slice(0, 300)}`));
page.on('pageerror', (e) => logs.push(`[pageerror] ${String(e).slice(0, 400)}`));
page.on('requestfailed', (r) => logs.push(`[reqfail] ${r.url().slice(0, 150)} ${r.failure()?.errorText}`));

await page.goto('http://127.0.0.1:7500/', { waitUntil: 'networkidle', timeout: 40000 }).catch((e) => logs.push('goto: ' + e));
await page.waitForTimeout(4000);

const state = await page.evaluate(() => ({
  readyState: document.readyState,
  html: document.documentElement.outerHTML.slice(0, 800),
  scripts: Array.from(document.querySelectorAll('script')).map(s => s.src).filter(Boolean),
  rootChildren: document.getElementById('root')?.children.length ?? -1,
}));
console.log(JSON.stringify(state, null, 2));
console.log('LOGS:'); logs.slice(0, 25).forEach(l => console.log(l));
await browser.close();
