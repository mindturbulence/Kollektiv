import { test, expect } from '@playwright/test';

test('boots through STORAGE_INIT and loader to the app shell', async ({ page }) => {
    // The app gates boot on the File System Access API folder picker.
    // Stub it with OPFS: a real FileSystemDirectoryHandle that satisfies
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
});
