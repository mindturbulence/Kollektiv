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

// Vault gate
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
} else {
  console.log('NOTE: no vault gate visible (vault already connected)');
}

// Open native tab (wait for the header scramble to settle first)
await page.locator('.app-header, header').first().waitFor({ state: 'visible', timeout: 30000 });
await page.waitForTimeout(4000);
const navText = await page.evaluate(() => Array.from(document.querySelectorAll('.app-header button, header button')).map(b => b.textContent.replace(/\s+/g, ' ').trim()).filter(t => t.length > 0));
console.log('NAV BUTTONS:', JSON.stringify(navText.slice(0, 12)));
// NAV BUTTONS order is stable: 0 logo, 1 HOME, 2 MISSION, 3 MISSION (native)
await page.locator('header button').nth(3).click({ timeout: 15000 });
await page.waitForTimeout(3000);

// Login if needed
const userField = page.getByLabel(/username/i);
if (await userField.isVisible().catch(() => false)) {
  const { username, password } = creds();
  await userField.fill(username);
  await page.getByLabel(/password/i).fill(password);
  await page.getByRole('button', { name: /sign in/i }).click();
  await page.waitForTimeout(5000);
}

// --- Overview facts ---
await page.locator('h2', { hasText: 'Overview' }).first().waitFor({ timeout: 25000 });
const facts = await page.evaluate(() => {
  const q = (s) => document.querySelectorAll(s).length;
  const text = (s) => Array.from(document.querySelectorAll(s)).map(e => e.textContent.trim()).filter(Boolean);
  return {
    h2: text('h2').slice(0, 4),
    cornerTicks: q('.border-l.border-primary\\/40, [class*="border-primary/40"]'),
    eyebrow: text('[class*="text-primary/60"]').slice(0, 4),
    metricLabels: text('[class*="font-black uppercase"]').slice(0, 8),
    navGroups: text('nav ul li div span').filter(t => ['OBSERVE','AUTOMATE','ADMIN'].includes(t)),
    badgeCounts: text('.badge').slice(0, 8),
    mcBrand: text('span').filter(t => t === 'MC://').length,
  };
});
console.log('OVERVIEW FACTS:', JSON.stringify(facts, null, 2));

// --- Agents panel facts ---
await page.getByText('Agents', { exact: true }).click();
await page.waitForTimeout(2500);
const agentsFacts = await page.evaluate(() => {
  const text = (s) => Array.from(document.querySelectorAll(s)).map(e => e.textContent.trim()).filter(Boolean);
  return {
    h2: text('h2').slice(0, 3),
    buttons: text('button').filter(t => /register|cancel/i.test(t)).slice(0, 3),
    table: !!document.querySelector('table'),
    corners: document.querySelectorAll('[class*="border-primary/40"]').length,
  };
});
console.log('AGENTS FACTS:', JSON.stringify(agentsFacts, null, 2));

await page.screenshot({ path: '.topaz-tmp/mc-overview.png' });
console.log('screenshot saved');
await browser.close();
