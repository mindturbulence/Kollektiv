import { test, expect, type Page } from '@playwright/test';

// The app gates boot on the File System Access API folder picker and an
// integrity-check loader. Shared by every test that needs a booted app shell.
async function bootToAppShell(page: Page) {
    // Stub the picker with OPFS: a real FileSystemDirectoryHandle that satisfies
    // fileSystemManager. Belt-and-braces: also stub the permission methods,
    // which OPFS handles lack in some Chromium builds.
    await page.addInitScript(() => {
        (window as any).showDirectoryPicker = async () => {
            const dir: any = await navigator.storage.getDirectory();
            dir.queryPermission = async () => 'granted';
            dir.requestPermission = async () => 'granted';
            return dir;
        };
    });

    await page.goto('/');

    // Gate 1: STORAGE_INIT — fresh context has no stored handle, so the
    // Welcome screen shows SELECT_VAULT_FOLDER.
    await page.getByRole('button', { name: 'SELECT_VAULT_FOLDER' }).click({ timeout: 30_000 });

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
