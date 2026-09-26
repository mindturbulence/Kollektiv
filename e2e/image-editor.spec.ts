import { test, expect, type Page } from '@playwright/test';

// Image Editor entry paths. Runs with FULL motion on purpose: headless Chrome
// defaults to prefers-reduced-motion, where the route director commits the tab
// synchronously — that path hid a bug where the Gallery→EDIT payload was
// cleared before the animated transition committed, opening a blank editor.

async function bootToAppShell(page: Page, initialTab: string) {
    await page.addInitScript((tab) => {
        // Always: vault picker stub + full-motion matchMedia.
        (window as any).showDirectoryPicker = async () => {
            const dir: any = await navigator.storage.getDirectory();
            dir.queryPermission = () => Promise.resolve('granted');
            dir.requestPermission = () => Promise.resolve('granted');
            return dir;
        };
        const realMatchMedia = window.matchMedia.bind(window);
        window.matchMedia = (q: string) => {
            const mql = realMatchMedia(q);
            if (!q.includes('prefers-reduced-motion')) return mql;
            // `matches` is a prototype getter — shadow it, don't assign it.
            return Object.create(mql, { matches: { value: false }, media: { value: q } });
        };
        // Once: clean state + starting tab (init scripts re-run on every load).
        if (sessionStorage.getItem('e2e-seeded')) return;
        sessionStorage.setItem('e2e-seeded', '1');
        localStorage.setItem('activeTab', JSON.stringify(tab));
        try { indexedDB.deleteDatabase('kollektiv-db'); } catch { /* noop */ }
    }, initialTab);

    await page.goto('/');
    const selectBtn = page.getByRole('button', { name: 'SELECT_VAULT_FOLDER' });
    const reconnectBtn = page.getByRole('button', { name: 'RECONNECT_VAULT' });
    const gateBtn = await Promise.race([
        selectBtn.waitFor({ state: 'visible', timeout: 30_000 }).then(() => selectBtn),
        reconnectBtn.waitFor({ state: 'visible', timeout: 30_000 }).then(() => reconnectBtn),
    ].map(p => p.catch(() => null as any)));
    if (!gateBtn) throw new Error('Neither SELECT_VAULT_FOLDER nor RECONNECT_VAULT appeared.');
    await gateBtn.click();

    await expect(page.getByRole('heading', { name: /PROVISION/ })).toBeVisible({ timeout: 30_000 });
    await page.getByRole('button', { name: 'CONTINUE', exact: true }).click();
    await page.getByRole('button', { name: 'CONTINUE', exact: true }).click({ timeout: 60_000 });
    await expect(page.locator('.app-header')).toBeVisible({ timeout: 30_000 });
}

/** A 321×123 PNG — a size no blank-document preset produces. */
async function makePng(page: Page): Promise<Buffer> {
    const dataUrl = await page.evaluate(() => {
        const c = document.createElement('canvas');
        c.width = 321; c.height = 123;
        const ctx = c.getContext('2d')!;
        ctx.fillStyle = '#c03030'; ctx.fillRect(0, 0, 321, 123);
        return c.toDataURL('image/png');
    });
    return Buffer.from(dataUrl.split(',')[1], 'base64');
}

test.describe('Image Editor entry', () => {
    test('opens an existing image from the start modal', async ({ page }) => {
        await bootToAppShell(page, 'image_editor');
        const png = await makePng(page);

        const chooser = page.waitForEvent('filechooser');
        await page.getByRole('button', { name: /Open image/ }).click({ timeout: 30_000 });
        await (await chooser).setFiles({ name: 'red-banner.png', mimeType: 'image/png', buffer: png });

        await expect(page.getByText('321 × 123px')).toBeVisible({ timeout: 15_000 });
        await expect(page.getByText('red-banner', { exact: true })).toBeVisible();
    });

    test('Gallery EDIT opens the item in the editor (animated route)', async ({ page }) => {
        await bootToAppShell(page, 'gallery');
        const png = await makePng(page);

        await page.getByRole('button', { name: /IMPORT/ }).click({ timeout: 30_000 });
        await page.locator('input[type="file"][accept*="image"]').setInputFiles(
            { name: 'vault-source.png', mimeType: 'image/png', buffer: png },
        );
        await page.getByPlaceholder('Artifact title...').fill('e2e-edit-source');
        await page.getByRole('button', { name: /COMMIT TO VAULT/ }).click();

        const card = page.locator('.group').filter({ hasText: 'EDIT' }).first();
        await card.hover({ timeout: 30_000 });
        await card.getByRole('button', { name: 'EDIT', exact: true }).click();

        await expect(page.getByText('321 × 123px')).toBeVisible({ timeout: 30_000 });
        await expect(page.getByText('e2e-edit-source', { exact: true })).toBeVisible();
        await expect(page.getByRole('button', { name: /Open image/ })).toHaveCount(0);
    });
});
