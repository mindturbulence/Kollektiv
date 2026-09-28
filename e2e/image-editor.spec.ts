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
            // Native MediaQueryList methods throw "Illegal invocation" unless bound to the real list
            // (motion's MotionConfig reducedMotion="user" subscribes via addEventListener).
            return {
                matches: false, media: q, onchange: null,
                addEventListener: mql.addEventListener.bind(mql),
                removeEventListener: mql.removeEventListener.bind(mql),
                addListener: mql.addListener.bind(mql),
                removeListener: mql.removeListener.bind(mql),
                dispatchEvent: mql.dispatchEvent.bind(mql),
            } as MediaQueryList;
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

    test('Ctrl+Shift+M exports the mask and toolbar menus open adjustments', async ({ page }) => {
        await bootToAppShell(page, 'image_editor');
        const png = await makePng(page);
        const chooser = page.waitForEvent('filechooser');
        await page.getByRole('button', { name: /Open image/ }).click({ timeout: 30_000 });
        await (await chooser).setFiles({ name: 'red-banner.png', mimeType: 'image/png', buffer: png });
        await expect(page.getByText('321 × 123px')).toBeVisible({ timeout: 15_000 });

        // Ctrl+Shift+M used to fall into the Ctrl+M (Curves) case.
        await page.keyboard.press('Control+Shift+M');
        await expect(page.getByText(/has no mask/)).toBeVisible({ timeout: 5_000 });

        // The Adjust menu must render above the tool header to be clickable.
        await page.getByRole('button', { name: 'Adjust', exact: true }).click();
        await page.getByRole('menuitem', { name: /Levels/ }).click();
        await expect(page.locator('div.fixed.bg-base-300').getByText('Levels', { exact: false })).toBeVisible();
    });

    test('upgrades a v1 autosave database left by an older build', async ({ page }) => {
        // A pre-2026-09-25 install has the 'documents' store at v1 with a JPEG-era record.
        await page.addInitScript(() => {
            if (sessionStorage.getItem('e2e-autosave-v1')) return;
            sessionStorage.setItem('e2e-autosave-v1', '1');
            indexedDB.deleteDatabase('kollektiv-editor-autosave');
            const req = indexedDB.open('kollektiv-editor-autosave', 1);
            req.onupgradeneeded = () => {
                req.result.createObjectStore('documents').put({ metadata: {}, layerTree: [] }, 'current');
            };
            req.onsuccess = () => req.result.close();
        });
        await bootToAppShell(page, 'image_editor');
        await expect(page.getByRole('button', { name: /Open image/ })).toBeVisible({ timeout: 30_000 });

        await expect.poll(() => page.evaluate(async () =>
            (await indexedDB.databases()).find(d => d.name === 'kollektiv-editor-autosave')?.version,
        ), { timeout: 10_000 }).toBe(2);
        await expect(page.getByText('Async Task Failed')).toHaveCount(0);
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

// ─── Selection-clipped painting (magic wand) ────────────────────────────────

/** The editor canvas — the widest canvas that isn't the app's full-screen backdrop. */
const EDITOR_CANVAS = `(() => [...document.querySelectorAll('canvas')].find(c => { const r = c.getBoundingClientRect(); return r.width > 600 && r.left > 50; }))()`;

async function docToClient(page: Page, x: number, y: number) {
    return page.evaluate(([dx, dy, sel]) => {
        const r = (eval(sel as string) as HTMLCanvasElement).getBoundingClientRect();
        // The toolbar zoom control is the only button labelled "<n>%".
        const zoomBtn = [...document.querySelectorAll('button')].find(b => /^\d+%$/.test(b.textContent!.trim()))!;
        const z = parseInt(zoomBtn.textContent!, 10) / 100;
        return { x: r.left + r.width / 2 + ((dx as number) - 200) * z, y: r.top + r.height / 2 + ((dy as number) - 150) * z };
    }, [x, y, EDITOR_CANVAS] as const);
}

async function pixelAt(page: Page, docX: number, docY: number): Promise<number[]> {
    const p = await docToClient(page, docX, docY);
    return page.evaluate(([cx, cy, sel]) => {
        const c = eval(sel as string) as HTMLCanvasElement;
        const r = c.getBoundingClientRect();
        const s = c.width / r.width;
        return [...c.getContext('2d')!.getImageData(Math.round(((cx as number) - r.left) * s), Math.round(((cy as number) - r.top) * s), 1, 1).data].slice(0, 3);
    }, [p.x, p.y, EDITOR_CANVAS] as const);
}

test('magic wand selection clips the brush, even on a blank layer', async ({ page }) => {
    await bootToAppShell(page, 'image_editor');
    // 400×300: blue left half, red right half, green disc (r=60) centred at (300,150).
    const png = Buffer.from((await page.evaluate(() => {
        const c = document.createElement('canvas'); c.width = 400; c.height = 300;
        const x = c.getContext('2d')!;
        x.fillStyle = '#2040c0'; x.fillRect(0, 0, 200, 300);
        x.fillStyle = '#c03030'; x.fillRect(200, 0, 200, 300);
        x.fillStyle = '#30c030'; x.beginPath(); x.arc(300, 150, 60, 0, Math.PI * 2); x.fill();
        return c.toDataURL('image/png');
    })).split(',')[1], 'base64');
    const chooser = page.waitForEvent('filechooser');
    await page.getByRole('button', { name: /Open image/ }).click({ timeout: 30_000 });
    await (await chooser).setFiles({ name: 'disc.png', mimeType: 'image/png', buffer: png });
    await expect(page.getByText('400 × 300px')).toBeVisible({ timeout: 15_000 });

    // Paint on a fresh blank layer: the wand samples all layers, so it selects the disc.
    await page.getByRole('button', { name: 'New blank layer' }).click();
    await page.keyboard.press('w');
    const seed = await docToClient(page, 300, 150);
    await page.mouse.click(seed.x, seed.y);
    await page.waitForTimeout(500);

    await page.keyboard.press('b');
    const a = await docToClient(page, 180, 150);
    const b = await docToClient(page, 390, 150);
    await page.mouse.move(a.x, a.y);
    await page.mouse.down();
    for (let i = 1; i <= 40; i++) await page.mouse.move(a.x + (b.x - a.x) * i / 40, a.y);
    await page.mouse.up();

    // Inside the disc turns black; red just outside its edge and blue far left stay untouched.
    await expect.poll(async () => Math.max(...await pixelAt(page, 300, 150)), { timeout: 5_000 }).toBeLessThan(20);
    const outside = await pixelAt(page, 225, 150);
    expect(outside[0]).toBeGreaterThan(150);
    const far = await pixelAt(page, 190, 150);
    expect(far[2]).toBeGreaterThan(150);

    // Layer footer controls sit in one horizontal row.
    const tops = await page.locator('footer.panel-footer button').evaluateAll(bs => bs.map(b => Math.round(b.getBoundingClientRect().top)));
    expect(tops.length).toBe(6);
    expect(new Set(tops).size).toBe(1);

    // Merge down + flatten collapse the stack.
    await page.getByRole('button', { name: 'Merge down' }).click();
    await expect(page.locator('[draggable]')).toHaveCount(1);
    await page.getByRole('button', { name: 'New blank layer' }).click();
    await expect(page.locator('[draggable]')).toHaveCount(2);
    await page.getByRole('button', { name: 'Flatten image' }).click();
    await expect(page.locator('[draggable]')).toHaveCount(1);
});
