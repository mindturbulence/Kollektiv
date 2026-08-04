import { chromium } from 'playwright-core';
import * as fs from 'node:fs';
import * as path from 'node:path';

const envPath = path.join(process.cwd(), 'mission-control', '.env');
function creds() {
  let username = 'kollektiv', password = '';
  try {
    const c = fs.readFileSync(envPath, 'utf8');
    const u = c.match(/^AUTH_USER=(.+)$/m); if (u) username = u[1].trim();
    const p = c.match(/^AUTH_PASS=(.+)$/m); if (p) password = p[1].trim();
  } catch {}
  return { username, password };
}

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } });
page.on('pageerror', (e) => console.log('[pageerror]', String(e).slice(0, 200)));

await page.addInitScript(() => {
  try { indexedDB.deleteDatabase('kollektiv-db'); } catch {}
  (window).showDirectoryPicker = async () => {
    const dir = await navigator.storage.getDirectory();
    dir.queryPermission = async () => 'granted';
    dir.requestPermission = async () => 'granted';
    return dir;
  };
});

await page.goto('http://127.0.0.1:7500/', { waitUntil: 'networkidle', timeout: 40000 }).catch(() => {});

const selectBtn = page.getByRole('button', { name: 'SELECT_VAULT_FOLDER' });
const reconnectBtn = page.getByRole('button', { name: 'RECONNECT_VAULT' });
const gate = await Promise.race([
  selectBtn.waitFor({ state: 'visible', timeout: 10000 }).then(() => selectBtn),
  reconnectBtn.waitFor({ state: 'visible', timeout: 10000 }).then(() => reconnectBtn),
].map(p => p.catch(() => null)));
if (gate) {
  await gate.click();
  await page.getByRole('button', { name: 'CONTINUE', exact: true }).first().click({ timeout: 40000 }).catch(() => {});
  await page.getByRole('button', { name: 'CONTINUE', exact: true }).first().click({ timeout: 40000 }).catch(() => {});
  await page.waitForTimeout(4000);
}

await page.locator('.app-header, header').first().waitFor({ state: 'visible', timeout: 30000 });
await page.waitForTimeout(4000);
// data-nav based click (Header now exposes data-nav)
await page.locator('.parent-nav-item[data-nav="mission-control-native"]').click({ timeout: 15000 });
await page.waitForTimeout(3000);

const userField = page.getByLabel(/username/i);
if (await userField.isVisible().catch(() => false)) {
  const { username, password } = creds();
  await userField.fill(username);
  await page.getByLabel(/password/i).fill(password);
  await page.getByRole('button', { name: /sign in/i }).click();
  await page.waitForTimeout(5000);
}

await page.locator('h2', { hasText: 'Overview' }).first().waitFor({ timeout: 25000 });
await page.screenshot({ path: '.topaz-tmp/font-overview.png' });

const shots = [
  ['Agents', 'font-agents'],
  ['Tasks', 'font-tasks'],
  ['Users', 'font-users'],
  ['Alerts', 'font-alerts'],
  ['Settings', 'font-settings'],
  ['Audit', 'font-audit'],
];
for (const [label, file] of shots) {
  await page.getByText(label, { exact: true }).click().catch(async () => {
    // fall back to nav rail search
    await page.evaluate((l) => {
      const els = Array.from(document.querySelectorAll('a,button,[role="menuitem"],summary'));
      const hit = els.find(e => e.textContent.trim().toLowerCase() === l.toLowerCase());
      if (hit) hit.click();
    }, label);
  });
  await page.waitForTimeout(2200);
  await page.screenshot({ path: `.topaz-tmp/${file}.png` });
  console.log('shot', file);
}

await browser.close();
console.log('done');
