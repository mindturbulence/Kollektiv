import { chromium } from 'playwright-core';
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1400, height: 900 } });
await page.addInitScript(() => {
  try { indexedDB.deleteDatabase('kollektiv-db'); } catch {}
  window.showDirectoryPicker = async () => {
    const dir = await navigator.storage.getDirectory();
    dir.queryPermission = async () => 'granted';
    dir.requestPermission = async () => 'granted';
    return dir;
  };
});
await page.goto('http://127.0.0.1:7500/', { waitUntil: 'networkidle', timeout: 40000 }).catch(() => {});
const gate = await Promise.race([
  page.getByRole('button', { name: 'SELECT_VAULT_FOLDER' }).waitFor({ state: 'visible', timeout: 10000 }).then(() => 'select'),
  page.getByRole('button', { name: 'RECONNECT_VAULT' }).waitFor({ state: 'visible', timeout: 10000 }).then(() => 'reconnect'),
].map(p => p.catch(() => null)));
if (gate) {
  await page.getByRole('button', { name: gate === 'select' ? 'SELECT_VAULT_FOLDER' : 'RECONNECT_VAULT' }).click();
  await page.getByRole('button', { name: 'CONTINUE', exact: true }).first().click({ timeout: 40000 }).catch(() => {});
  await page.getByRole('button', { name: 'CONTINUE', exact: true }).first().click({ timeout: 40000 }).catch(() => {});
  await page.waitForTimeout(4000);
}
await page.locator('.app-header, header').first().waitFor({ state: 'visible', timeout: 30000 });
await page.waitForTimeout(3000);
await page.locator('.parent-nav-item[data-nav="mission-control-native"]').click({ timeout: 15000 });
await page.waitForTimeout(2500);
await page.getByLabel(/username/i).waitFor({ state: 'visible', timeout: 15000 });
const sizes = await page.evaluate(() => {
  const out = new Map();
  for (const el of document.querySelectorAll('body *')) {
    const cs = getComputedStyle(el);
    const fs = parseFloat(cs.fontSize);
    if (!fs || el.textContent.trim() === '') continue;
    // skip host overlays
    const txt = el.textContent;
    if (/System Standby|Hover your mouse|RESUME|0x[0-9A-F]{6} :: SEG/.test(txt)) continue;
    if (!out.has(fs)) out.set(fs, { count: 0, sample: '' });
    const o = out.get(fs);
    o.count++;
    if (!o.sample) o.sample = el.textContent.trim().slice(0, 40);
  }
  return Array.from(out.entries()).sort((a, b) => a[0] - b[0]);
});
console.log('LOGIN VIEW font tiers:');
for (const [px, o] of sizes) console.log(`  ${px}px ×${o.count}  e.g. "${o.sample}"`);
await page.screenshot({ path: '.topaz-tmp/font-login.png' });
await browser.close();
