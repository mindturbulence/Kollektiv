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
        selectBtn.waitFor({ state: 'visible', timeout: 10_000 }).then(() => selectBtn),
        reconnectBtn.waitFor({ state: 'visible', timeout: 10_000 }).then(() => reconnectBtn),
    ].map(p => p.catch(() => null as any)));
    // If neither button appeared (e.g., app crashed), fail with a clear error
    if (!gateBtn) throw new Error('Neither SELECT_VAULT_FOLDER nor RECONNECT_VAULT appeared on the Welcome screen.');
    await gateBtn.click();

    // Gate 2: loader — integrity check runs, progress reaches 100%, then the
    // CONTINUE buttons crossfade in. Headless throttles rAF, so be generous.
    const continueBtn = page.getByRole('button', { name: 'CONTINUE', exact: true });
    await continueBtn.click({ timeout: 60_000 });

    // App shell (header) becomes visible after the blinds reveal.
    await expect(page.locator('.app-header')).toBeVisible({ timeout: 30_000 });
}

test('boots through STORAGE_INIT and loader to the app shell', async ({ page }) => {
    await bootToAppShell(page);
});

test('opens the Web Viewer panel from the header', async ({ page }) => {
    await bootToAppShell(page);

    // HUDNavItem renders as <button title="Web Browser">, and Playwright derives
    // the accessible name from `title` when there's no aria-label/text content.
    await page.getByRole('button', { name: 'Web Browser' }).click();

    // WebViewerPanel toggles a real `visibility` style (not just aria-hidden),
    // so toBeVisible() reflects the open/closed state correctly.
    await expect(page.getByRole('button', { name: 'Close web viewer' })).toBeVisible({ timeout: 10_000 });
});
