import { test, expect, type Page } from '@playwright/test';

// The app gates boot on the File System Access API folder picker and an
// integrity-check loader. Shared by every test that needs a booted app shell.
async function bootToAppShell(page: Page) {
    // Stub the picker with OPFS: a real FileSystemDirectoryHandle that satisfies
    // fileSystemManager. Belt-and-braces: also stub the permission methods,
    // which OPFS handles lack in some Chromium builds.
    await page.addInitScript(() => {
        // Clear any IndexedDB state from previous test runs.
        // Chromium's OPFS implementation can leak directory handles across
        // BrowserContext boundaries — a stale handle makes the Welcome screen
        // show RECONNECT_VAULT instead of SELECT_VAULT_FOLDER, timing out the test.
        try {
            indexedDB.deleteDatabase('kollektiv-db');
        } catch {
            // non-fatal in restricted contexts
        }

        (window as any).showDirectoryPicker = async () => {
            const dir: any = await navigator.storage.getDirectory();
            dir.queryPermission = async () => 'granted';
            dir.requestPermission = async () => 'granted';
            return dir;
        };
    });

    await page.goto('/');

    // Gate 1: STORAGE_INIT — fresh context has no stored handle, so the
    // Welcome screen shows SELECT_VAULT_FOLDER.  Fall back to RECONNECT_VAULT
    // if a stale OPFS handle leaked from a previous context.
    const selectBtn = page.getByRole('button', { name: 'SELECT_VAULT_FOLDER' });
    const reconnectBtn = page.getByRole('button', { name: 'RECONNECT_VAULT' });
    const gateBtn = await Promise.race([
        selectBtn.waitFor({ state: 'visible', timeout: 30_000 }).then(() => selectBtn),
        reconnectBtn.waitFor({ state: 'visible', timeout: 30_000 }).then(() => reconnectBtn),
    ].map(p => p.catch(() => null as any)));
    // If neither button appeared (e.g., app crashed), fail with a clear error
    if (!gateBtn) throw new Error('Neither SELECT_VAULT_FOLDER nor RECONNECT_VAULT appeared on the Welcome screen.');
    await gateBtn.click();

    // Gate 2: PROVISION — the onboarding wizard's provider step (ISSUE-24.1).
    // Its CONTINUE button shares an accessible name with the loader's, so wait
    // for the step's own heading before clicking to keep the two apart.
    await expect(page.getByRole('heading', { name: /PROVISION/ })).toBeVisible({ timeout: 30_000 });
    await page.getByRole('button', { name: 'CONTINUE', exact: true }).click();

    // Gate 3: the finish splash auto-advances after ~800ms into the boot
    // loader, which reaches 100% and crossfades its own CONTINUE buttons in.
    // Headless throttles rAF, so be generous.
    const continueBtn = page.getByRole('button', { name: 'Yes', exact: true });
    await continueBtn.click({ timeout: 60_000 });

    // App shell (header) becomes visible after the blinds reveal.
    await expect(page.locator('.app-header')).toBeVisible({ timeout: 30_000 });
}
test.use({ viewport: { width: 1920, height: 1080 } });
test.describe.configure({ mode: 'parallel' });
const TABS = ['dashboard','assistant','discovery','prompts','crafter','refiner','prompt_analyzer','media_analyzer','gallery','design_library','prompt','settings','composer','image_compare','color_palette_extractor','resizer','converter','assets_manager','video_to_frames','lora_editor','batch_runner','comfy_studio','a1111_studio','image_editor','video_editor'];
for (const tab of TABS) {
  test(`edge ${tab}`, async ({ page }) => {
    await page.addInitScript(t => { try { localStorage.setItem('activeTab', JSON.stringify(t)); } catch {} }, tab);
    await bootToAppShell(page);
    await page.waitForTimeout(3500);
    const res = await page.evaluate(() => {
        const f = document.querySelector('footer') as HTMLElement; const ft = f.getBoundingClientRect().top;
        const out: string[] = [`activeTab=${localStorage.getItem('activeTab')} footerTop=${ft}`];
        document.querySelectorAll('main *').forEach(el => {
            const r = el.getBoundingClientRect(); const s = getComputedStyle(el);
            if (r.width < 100 || s.visibility === 'hidden' || s.display === 'none') return;
            if (Math.abs(r.bottom - ft) <= 1.5 && parseFloat(s.borderBottomWidth) > 0 && s.borderBottomStyle !== 'none' && !s.borderBottomColor.endsWith('/ 0)') && s.borderBottomColor !== 'rgba(0, 0, 0, 0)')
                out.push(`BB ${el.tagName}.${(el.className?.toString?.()||'').slice(0,110)} bottom=${r.bottom} ${s.borderBottomWidth} ${s.borderBottomColor}`);
        });
        return out;
    });
    console.log(`[${tab}] ` + res.join('\n   '));
  });
}
