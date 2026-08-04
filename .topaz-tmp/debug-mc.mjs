import { chromium } from 'playwright-core';

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } });

await page.addInitScript(() => {
  try { indexedDB.deleteDatabase('kollektiv-db'); } catch {}
  (window).showDirectoryPicker = async () => {
    const dir = await navigator.storage.getDirectory();
    dir.queryPermission = async () => 'granted';
    dir.requestPermission = async () => 'granted';
    return dir;
  };
});

await page.goto('http://127.0.0.1:7500/', { waitUntil: 'domcontentloaded', timeout: 40000 }).catch(() => {});
await page.waitForTimeout(3000);
console.log('STEP1 title:', await page.title());
console.log('STEP1 body text (first 600):', (await page.evaluate(() => document.body.innerText)).slice(0, 600).replace(/\n+/g, ' | '));

const btns = await page.evaluate(() => Array.from(document.querySelectorAll('button')).map(b => b.textContent.trim()).filter(Boolean).slice(0, 30));
console.log('STEP1 buttons:', JSON.stringify(btns));

const gate = await Promise.race([
  page.getByRole('button', { name: 'SELECT_VAULT_FOLDER' }).waitFor({ state: 'visible', timeout: 8000 }).then(() => 'select'),
  page.getByRole('button', { name: 'RECONNECT_VAULT' }).waitFor({ state: 'visible', timeout: 8000 }).then(() => 'reconnect'),
].map(p => p.catch(() => null)));
console.log('STEP1 gate:', gate);

if (gate) {
  await page.getByRole('button', { name: gate === 'select' ? 'SELECT_VAULT_FOLDER' : 'RECONNECT_VAULT' }).click();
  await page.waitForTimeout(2000);
  const allBtns = await page.evaluate(() => Array.from(document.querySelectorAll('button')).map(b => b.textContent.trim()).filter(Boolean).slice(0, 30));
  console.log('STEP2 buttons:', JSON.stringify(allBtns));
  const cont = page.getByRole('button', { name: 'CONTINUE', exact: true }).first();
  const visible = await cont.isVisible().catch(() => false);
  console.log('STEP2 CONTINUE visible:', visible);
  if (visible) { await cont.click(); await page.waitForTimeout(3000); }
  const body = await page.evaluate(() => document.body.innerText).catch(() => '');
  console.log('STEP3 body (first 400):', body.slice(0, 400).replace(/\n+/g, ' | '));
  const cont2 = page.getByRole('button', { name: 'CONTINUE', exact: true }).first();
  const visible2 = await cont2.isVisible().catch(() => false);
  console.log('STEP3 CONTINUE2 visible:', visible2);
  if (visible2) { await cont2.click(); await page.waitForTimeout(4000); }
}

const hdr = await page.evaluate(() => {
  const h = document.querySelector('.app-header, header');
  return h ? h.innerText.slice(0, 500) : 'NO HEADER FOUND';
});
console.log('STEP4 header text:', hdr.replace(/\n+/g, ' | '));
await page.screenshot({ path: '.topaz-tmp/debug1.png' });
await browser.close();
