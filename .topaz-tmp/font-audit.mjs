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
await page.waitForTimeout(4000);
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

async function audit(label) {
  const sizes = await page.evaluate(() => {
    const out = new Map();
    const walk = (root) => {
      for (const el of root.querySelectorAll('*')) {
        const cs = getComputedStyle(el);
        const fs = parseFloat(cs.fontSize);
        if (!fs || el.textContent.trim() === '') continue;
        if (!out.has(fs)) out.set(fs, { count: 0, sample: '' });
        const o = out.get(fs);
        o.count++;
        if (!o.sample) o.sample = el.textContent.trim().slice(0, 40);
      }
    };
    walk(document.body);
    return Array.from(out.entries()).sort((a, b) => a[0] - b[0]);
  });
  const tiny = sizes.filter(([px]) => px < 11);
  const body = sizes.filter(([px]) => px >= 11 && px < 14);
  console.log(`\n== ${label} ==`);
  console.log('  <11px:', tiny.length ? JSON.stringify(tiny) : 'none');
  console.log('  11-13.9px (eyebrow tier):', body.length ? JSON.stringify(body) : 'none');
  console.log('  >=14px tiers:', sizes.filter(([px]) => px >= 14).map(([px, o]) => `${px}px×${o.count}`).join('  '));
}

await audit('Overview');

const targets = [
  ['Agents', 'Agents'],
  ['Tasks', 'Tasks'],
  ['Users', 'Users'],
  ['Alerts', 'Alerts'],
  ['Settings', 'Settings'],
  ['Audit', 'Audit'],
  ['Integrations', 'Integrations'],
  ['Logs', 'Logs'],
];
for (const [label, name] of targets) {
  await page.getByText(label, { exact: true }).first().click().catch(() => {});
  await page.waitForTimeout(2000);
  await audit(name);
}

await browser.close();
