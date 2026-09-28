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
        // Idle standby (1 min) overlays the app and swallows pointer input mid-test.
        localStorage.setItem('kollektivSettingsV4', JSON.stringify({ isIdleEnabled: false }));
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
        await toPro(page);

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

/** Fit-to-viewport runs a frame after the document opens; coordinates computed
 *  before it settles miss the canvas. Wait for the start dialog to leave and the zoom label to settle. */
/** Opening an image starts in Quick mode; tests of menus/layers switch to Pro. */
async function toPro(page: Page) {
    await page.getByRole('radio', { name: 'Pro' }).click();
}

async function waitForFit(page: Page) {
    // The Open-or-Create dialog animates out after the file loads and would eat the first drag.
    await expect(page.getByRole('dialog', { name: /Open or Create/i })).toHaveCount(0, { timeout: 10_000 });
    const zoom = () => page.evaluate(() => [...document.querySelectorAll('button')].find(b => /^\d+%$/.test(b.textContent!.trim()))?.textContent);
    let prev = await zoom();
    await expect.poll(async () => { const z = await zoom(); const same = z === prev; prev = z; return same; }, { intervals: [300] }).toBe(true);
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

    await waitForFit(page);
    await toPro(page);
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

test('Invert Selection, History panel jumps, and Levels opening below the toolbar', async ({ page }) => {
    await bootToAppShell(page, 'image_editor');
    // 400×300 solid blue (docToClient assumes a 400×300 document).
    const png = Buffer.from((await page.evaluate(() => {
        const c = document.createElement('canvas'); c.width = 400; c.height = 300;
        const x = c.getContext('2d')!;
        x.fillStyle = '#2040c0'; x.fillRect(0, 0, 400, 300);
        return c.toDataURL('image/png');
    })).split(',')[1], 'base64');
    const chooser = page.waitForEvent('filechooser');
    await page.getByRole('button', { name: /Open image/ }).click({ timeout: 30_000 });
    await (await chooser).setFiles({ name: 'blue.png', mimeType: 'image/png', buffer: png });
    await expect(page.getByText('400 × 300px')).toBeVisible({ timeout: 15_000 });

    await waitForFit(page);
    await toPro(page);
    // Select the left half, then invert → the right half is selected.
    await page.keyboard.press('m');
    const a = await docToClient(page, 4, 4);
    const b = await docToClient(page, 200, 296);
    await page.mouse.move(a.x, a.y);
    await page.mouse.down();
    await page.mouse.move(b.x, b.y, { steps: 10 });
    await page.mouse.up();
    await page.getByRole('button', { name: 'Select', exact: true }).click();
    await page.getByRole('menuitem', { name: 'Invert Selection' }).click();
    await page.waitForTimeout(300);

    await page.keyboard.press('b');
    const s = await docToClient(page, 60, 150);
    const e = await docToClient(page, 340, 150);
    await page.mouse.move(s.x, s.y);
    await page.mouse.down();
    for (let i = 1; i <= 40; i++) await page.mouse.move(s.x + (e.x - s.x) * i / 40, s.y);
    await page.mouse.up();

    await expect.poll(async () => Math.max(...await pixelAt(page, 300, 150)), { timeout: 5_000 }).toBeLessThan(20);
    expect((await pixelAt(page, 100, 150))[2]).toBeGreaterThan(150); // old selection stays blue

    // History panel: jumping back to 'Open' undoes the stroke; the latest step redoes it.
    await page.getByRole('tab', { name: 'History' }).click();
    await expect(page.getByRole('button', { name: 'Brush stroke' })).toBeVisible();
    await page.getByRole('button', { name: 'Open', exact: true }).click();
    await expect.poll(async () => (await pixelAt(page, 300, 150))[2], { timeout: 5_000 }).toBeGreaterThan(150);
    await page.getByRole('button', { name: 'Brush stroke' }).click();
    await expect.poll(async () => Math.max(...await pixelAt(page, 300, 150)), { timeout: 5_000 }).toBeLessThan(20);
    // Dirty-rect history: a second stroke elsewhere, then step back one — only the second goes.
    const s2 = await docToClient(page, 220, 250);
    const e2 = await docToClient(page, 380, 250);
    await page.mouse.move(s2.x, s2.y);
    await page.mouse.down();
    for (let i = 1; i <= 30; i++) await page.mouse.move(s2.x + (e2.x - s2.x) * i / 30, s2.y);
    await page.mouse.up();
    await expect(page.getByRole('button', { name: 'Brush stroke' })).toHaveCount(2);
    await expect.poll(async () => Math.max(...await pixelAt(page, 300, 250)), { timeout: 5_000 }).toBeLessThan(20);
    await page.getByRole('button', { name: 'Brush stroke' }).first().click();
    await expect.poll(async () => (await pixelAt(page, 300, 250))[2], { timeout: 5_000 }).toBeGreaterThan(150);
    expect(Math.max(...await pixelAt(page, 300, 150))).toBeLessThan(20);
    await page.getByRole('tab', { name: 'Layers' }).click();

    // Floating adjustment panels open inside the canvas area, not over the toolbar menus.
    await page.getByRole('button', { name: 'Adjust', exact: true }).click();
    await page.getByRole('menuitem', { name: /Levels/ }).click();
    const panel = page.locator('div.fixed.bg-base-300').filter({ hasText: 'Levels' });
    await expect(panel).toBeVisible();
    const panelTop = (await panel.boundingBox())!.y;
    const viewportTop = (await page.locator('[data-editor-viewport]').boundingBox())!.y;
    expect(panelTop).toBeGreaterThanOrEqual(viewportTop);
});

test('opens a layered PSD as a layered document', async ({ page }) => {
    const { writePsdBuffer } = await import('ag-psd');
    const solid = (w: number, h: number, rgba: [number, number, number, number]) => {
        const data = new Uint8ClampedArray(w * h * 4);
        for (let i = 0; i < data.length; i += 4) data.set(rgba, i);
        return { width: w, height: h, data };
    };
    const psd = writePsdBuffer({
        width: 300, height: 200,
        children: [
            { name: 'Base', top: 0, left: 0, bottom: 200, right: 300, imageData: solid(300, 200, [30, 60, 200, 255]) },
            { name: 'Patch', top: 50, left: 100, bottom: 150, right: 200, opacity: 0.5, blendMode: 'multiply', imageData: solid(100, 100, [220, 40, 40, 255]) },
        ],
    }, { generateThumbnail: false });

    await bootToAppShell(page, 'image_editor');
    const chooser = page.waitForEvent('filechooser');
    await page.getByRole('button', { name: /Open image/ }).click({ timeout: 30_000 });
    await (await chooser).setFiles({ name: 'layers.psd', mimeType: 'image/vnd.adobe.photoshop', buffer: psd });

    await expect(page.getByText('300 × 200px')).toBeVisible({ timeout: 15_000 });
    await toPro(page); // the layer list is on the Layers tab
    await expect(page.getByText('layers', { exact: true })).toBeVisible();
    const rows = page.locator('[draggable]');
    await expect(rows).toHaveCount(2);
    await expect(rows.nth(0)).toContainText('Patch'); // top of the stack
    await expect(rows.nth(1)).toContainText('Base');
});

test('a look layer grades what is below it, not what is above; strength and undo work', async ({ page }) => {
    await bootToAppShell(page, 'image_editor');
    // 400×300: blue left, red right (docToClient assumes a 400×300 document).
    const png = Buffer.from((await page.evaluate(() => {
        const c = document.createElement('canvas'); c.width = 400; c.height = 300;
        const x = c.getContext('2d')!;
        x.fillStyle = '#2040c0'; x.fillRect(0, 0, 200, 300);
        x.fillStyle = '#c03030'; x.fillRect(200, 0, 200, 300);
        return c.toDataURL('image/png');
    })).split(',')[1], 'base64');
    const chooser = page.waitForEvent('filechooser');
    await page.getByRole('button', { name: /Open image/ }).click({ timeout: 30_000 });
    await (await chooser).setFiles({ name: 'look.png', mimeType: 'image/png', buffer: png });
    await expect(page.getByText('400 × 300px')).toBeVisible({ timeout: 15_000 });
    await waitForFit(page);
    const spread = (p: number[]) => Math.max(...p) - Math.min(...p);

    // Quick mode opens on the Looks tab. Grainy Mono: saturation −1 → the red half turns grey.
    await page.getByRole('option', { name: /Grainy Mono/ }).click();
    await expect(page.getByRole('option', { name: /Grainy Mono/ })).toHaveAttribute('aria-selected', 'true');
    await expect.poll(async () => spread(await pixelAt(page, 300, 150)), { timeout: 5_000 }).toBeLessThan(40);

    // Strength = layer opacity: 0 shows the original red.
    const slider = page.getByLabel('Look strength');
    await slider.fill('0');
    await expect.poll(async () => (await pixelAt(page, 300, 150))[0], { timeout: 5_000 }).toBeGreaterThan(150);
    await slider.fill('100');
    await expect.poll(async () => spread(await pixelAt(page, 300, 150)), { timeout: 5_000 }).toBeLessThan(40);

    // Red foreground (via the Shape tool's fill input), then the brush.
    // Pro mode for the Shape tool; tool-rail clicks, not shortcuts: focus is still in the slider.
    await toPro(page);
    await page.getByRole('button', { name: /^Shape/ }).first().click();
    await page.locator('input[type=color]').first().fill('#ff2020');
    const draw = async (x0: number, x1: number, y: number) => {
        const a = await docToClient(page, x0, y);
        const b = await docToClient(page, x1, y);
        await page.mouse.move(a.x, a.y); await page.mouse.down();
        for (let i = 1; i <= 25; i++) await page.mouse.move(a.x + (b.x - a.x) * i / 25, a.y);
        await page.mouse.up();
    };

    // Paint ABOVE the look (a new top layer): the red stroke stays saturated.
    await page.getByRole('tab', { name: 'Layers' }).click();
    await page.getByRole('button', { name: 'New blank layer' }).click();
    await page.getByRole('button', { name: /^Brush/ }).first().click();
    await draw(220, 380, 60);
    await expect.poll(async () => spread(await pixelAt(page, 300, 60)), { timeout: 5_000 }).toBeGreaterThan(120);

    // Paint BELOW the look (Background, blue half): the pixel changes but stays grey —
    // the look's cache was invalidated and the new stroke is graded.
    const before = await pixelAt(page, 100, 240);
    await page.locator('[draggable]').last().click();
    await draw(20, 180, 240);
    await expect.poll(async () => Math.abs((await pixelAt(page, 100, 240))[0] - before[0]), { timeout: 5_000 }).toBeGreaterThan(10);
    expect(spread(await pixelAt(page, 100, 240))).toBeLessThan(40);

    // Flatten bakes the look (the uncached export/flatten path shades the same way).
    await page.getByRole('button', { name: 'Flatten image' }).click();
    await expect(page.locator('[draggable]')).toHaveCount(1);
    expect(spread(await pixelAt(page, 300, 150))).toBeLessThan(40);
    expect(spread(await pixelAt(page, 300, 60))).toBeGreaterThan(120); // the red stroke above the look stays red

    // Undo back past the look: colour returns.
    await page.getByRole('tab', { name: 'History' }).click();
    await page.getByRole('button', { name: 'Open', exact: true }).click();
    await expect.poll(async () => (await pixelAt(page, 300, 150))[0], { timeout: 5_000 }).toBeGreaterThan(150);
});

test('LUT looks: a procedural LUT grades at once; a bundled .cube LUT loads lazily and repaints', async ({ page }) => {
    await bootToAppShell(page, 'image_editor');
    const png = Buffer.from((await page.evaluate(() => {
        const c = document.createElement('canvas'); c.width = 400; c.height = 300;
        const x = c.getContext('2d')!;
        x.fillStyle = '#2040c0'; x.fillRect(0, 0, 200, 300);
        x.fillStyle = '#c03030'; x.fillRect(200, 0, 200, 300);
        return c.toDataURL('image/png');
    })).split(',')[1], 'base64');
    // The gallery fetches the bundled file: LUT lazily once the Looks panel renders thumbnails.
    const lutRequest = page.waitForRequest(r => r.url().endsWith('/looks/cold-vs-warm.cube'), { timeout: 30_000 });
    const chooser = page.waitForEvent('filechooser');
    await page.getByRole('button', { name: /Open image/ }).click({ timeout: 30_000 });
    await (await chooser).setFiles({ name: 'lut.png', mimeType: 'image/png', buffer: png });
    await expect(page.getByText('400 × 300px')).toBeVisible({ timeout: 15_000 });
    await waitForFit(page);
    const spread = (p: number[]) => Math.max(...p) - Math.min(...p);
    const original = await pixelAt(page, 300, 150);

    // proc:hard-mono → grey.
    await page.getByRole('option', { name: /Hard Mono/ }).click();
    await expect.poll(async () => spread(await pixelAt(page, 300, 150)), { timeout: 5_000 }).toBeLessThan(40);

    // Cold vs Warm (file:, fetched from /looks/ — the gallery thumbnails may already
    // have fetched it): the click replaces Hard Mono on the same look layer.
    await lutRequest;
    await page.getByRole('option', { name: /Cold vs Warm/ }).click();
    // Graded (−67% saturation) but not grey, and different from the original red.
    await expect.poll(async () => spread(await pixelAt(page, 300, 150)), { timeout: 8_000 }).toBeLessThan(spread(original) - 40);
});

test('Quick mode: trimmed tools, More menu, Looks gallery, merged browsing undo, compare and inspector', async ({ page }) => {
    await bootToAppShell(page, 'image_editor');
    const png = Buffer.from((await page.evaluate(() => {
        const c = document.createElement('canvas'); c.width = 400; c.height = 300;
        const x = c.getContext('2d')!;
        x.fillStyle = '#2040c0'; x.fillRect(0, 0, 200, 300);
        x.fillStyle = '#c03030'; x.fillRect(200, 0, 200, 300);
        return c.toDataURL('image/png');
    })).split(',')[1], 'base64');
    const chooser = page.waitForEvent('filechooser');
    await page.getByRole('button', { name: /Open image/ }).click({ timeout: 30_000 });
    await (await chooser).setFiles({ name: 'quick.png', mimeType: 'image/png', buffer: png });
    await expect(page.getByText('400 × 300px')).toBeVisible({ timeout: 15_000 });
    await waitForFit(page);
    const spread = (p: number[]) => Math.max(...p) - Math.min(...p);

    // Opened images start in Quick: trimmed rail, one More menu, Looks tab.
    await expect(page.getByRole('radio', { name: 'Quick' })).toHaveAttribute('aria-checked', 'true');
    await expect(page.getByRole('button', { name: /^Marquee/ })).toHaveCount(0);
    await expect(page.getByRole('button', { name: /^Brush/ })).toHaveCount(1);
    await expect(page.getByRole('button', { name: 'More', exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Adjust', exact: true })).toHaveCount(0);
    await expect(page.getByRole('tab', { name: 'Looks' })).toHaveAttribute('aria-selected', 'true');
    // Every catalog thumbnail renders on the user's image.
    await expect(page.getByRole('option').locator('canvas')).toHaveCount(30, { timeout: 30_000 });
    await page.screenshot({ path: 'test-results/looks-quick-mode.png' });

    // Browsing three looks = one undo step.
    await page.getByRole('option', { name: /Warm Portrait/ }).click();
    await page.getByRole('option', { name: /Teal & Orange/ }).click();
    await page.getByRole('option', { name: /Hard Mono/ }).click();
    await expect.poll(async () => spread(await pixelAt(page, 300, 150)), { timeout: 5_000 }).toBeLessThan(40);

    // Hold Compare → the original red; release → graded again.
    const compare = page.getByRole('button', { name: 'Compare' });
    const box = (await compare.boundingBox())!;
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    await expect.poll(async () => spread(await pixelAt(page, 300, 150)), { timeout: 5_000 }).toBeGreaterThan(100);
    await page.mouse.up();
    await expect.poll(async () => spread(await pixelAt(page, 300, 150)), { timeout: 5_000 }).toBeLessThan(40);

    // Inspector: turning the film grade off brings the colour back.
    await page.getByRole('button', { name: /Adjust look/ }).click();
    await page.getByRole('checkbox', { name: 'Film grade' }).uncheck();
    await expect.poll(async () => spread(await pixelAt(page, 300, 150)), { timeout: 5_000 }).toBeGreaterThan(100);

    await page.getByRole('tab', { name: 'History' }).click();
    // Three browsing clicks merged into one step, labelled with the look they ended on.
    await expect(page.getByRole('button', { name: /^(Add look|Look) "/ })).toHaveCount(1);
    await expect(page.getByRole('button', { name: 'Look "Hard Mono"', exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: /Edit look/ })).toHaveCount(1); // the inspector toggle
});

test('Phase 3 effects: glow spreads past highlights, frames and light leaks draw, randomize and favourites work', async ({ page }) => {
    await bootToAppShell(page, 'image_editor');
    // 400×300 black with a white square in the middle (150..250 × 100..200).
    const png = Buffer.from((await page.evaluate(() => {
        const c = document.createElement('canvas'); c.width = 400; c.height = 300;
        const x = c.getContext('2d')!;
        x.fillStyle = '#000'; x.fillRect(0, 0, 400, 300);
        x.fillStyle = '#fff'; x.fillRect(150, 100, 100, 100);
        return c.toDataURL('image/png');
    })).split(',')[1], 'base64');
    const chooser = page.waitForEvent('filechooser');
    await page.getByRole('button', { name: /Open image/ }).click({ timeout: 30_000 });
    await (await chooser).setFiles({ name: 'fx.png', mimeType: 'image/png', buffer: png });
    await expect(page.getByText('400 × 300px')).toBeVisible({ timeout: 15_000 });
    await waitForFit(page);
    const lum = (p: number[]) => (p[0] + p[1] + p[2]) / 3;
    const beside = await pixelAt(page, 262, 150); // 12 px right of the square — black before

    // Neon Night: bloom + halation spread light past the highlight.
    await page.getByRole('option', { name: /Neon Night/ }).click();
    await expect.poll(async () => lum(await pixelAt(page, 262, 150)), { timeout: 8_000 }).toBeGreaterThan(lum(beside) + 12);

    // Instant Print: an off-white instant-print frame with a thick bottom border.
    await page.getByRole('option', { name: /Instant Print/ }).click();
    await expect.poll(async () => lum(await pixelAt(page, 200, 290)), { timeout: 8_000 }).toBeGreaterThan(220);
    expect(lum(await pixelAt(page, 5, 150))).toBeGreaterThan(220);          // side border
    // Darkroom Print: a black rounded border.
    await page.getByRole('option', { name: /Darkroom Print/ }).click();
    await expect.poll(async () => lum(await pixelAt(page, 200, 296)), { timeout: 8_000 }).toBeLessThan(30);

    // Summer Leak: the black edges pick up a warm leak.
    await page.getByRole('option', { name: /Summer Leak/ }).click();
    await expect.poll(async () => {
        const px = await Promise.all([[20, 20], [380, 20], [20, 280], [380, 280], [200, 20], [20, 150]].map(([x, y]) => pixelAt(page, x, y)));
        return Math.max(...px.map(p => p[0] - p[2]));                          // warm: red above blue somewhere
    }, { timeout: 8_000 }).toBeGreaterThan(15);

    // Randomize changes the look (grain/leak reseed) — the image changes.
    const before = await Promise.all([[20, 20], [380, 280], [200, 20]].map(([x, y]) => pixelAt(page, x, y)));
    await page.getByRole('button', { name: 'Randomize' }).click();
    await expect.poll(async () => {
        const after = await Promise.all([[20, 20], [380, 280], [200, 20]].map(([x, y]) => pixelAt(page, x, y)));
        return after.some((p, i) => p.some((v, j) => Math.abs(v - before[i][j]) > 3));
    }, { timeout: 8_000 }).toBe(true);

    // Favourites: star one look and filter to it.
    await page.getByRole('button', { name: 'Favourite Lomo' }).click();
    await page.getByRole('tab', { name: /Favourites/ }).click();
    await expect(page.getByRole('option')).toHaveCount(1);
    await expect(page.getByRole('option', { name: /Lomo/ })).toBeVisible();

    // Old Print (procedural paper + dust): a flat black area gains texture.
    await page.getByRole('tab', { name: 'All', exact: true }).click();
    await page.getByRole('option', { name: /Old Print/ }).click();
    await expect.poll(async () => {
        const px = await Promise.all([30, 45, 60, 75, 90, 105, 120].map(x => pixelAt(page, x, 40)));
        const l = px.map(p => p[0] + p[1] + p[2]);
        return Math.max(...l) - Math.min(...l);
    }, { timeout: 8_000 }).toBeGreaterThan(3);
});

test('HSL colour mix: desaturating the red band greys reds and leaves blues', async ({ page }) => {
    await bootToAppShell(page, 'image_editor');
    const png = Buffer.from((await page.evaluate(() => {
        const c = document.createElement('canvas'); c.width = 400; c.height = 300;
        const x = c.getContext('2d')!;
        x.fillStyle = '#2040c0'; x.fillRect(0, 0, 200, 300);
        x.fillStyle = '#c03030'; x.fillRect(200, 0, 200, 300);
        return c.toDataURL('image/png');
    })).split(',')[1], 'base64');
    const chooser = page.waitForEvent('filechooser');
    await page.getByRole('button', { name: /Open image/ }).click({ timeout: 30_000 });
    await (await chooser).setFiles({ name: 'hsl.png', mimeType: 'image/png', buffer: png });
    await expect(page.getByText('400 × 300px')).toBeVisible({ timeout: 15_000 });
    await waitForFit(page);
    const spread = (p: number[]) => Math.max(...p) - Math.min(...p);

    await page.getByRole('option', { name: /Soft Matte/ }).click();            // a look without a LUT
    await page.getByRole('button', { name: /Adjust look/ }).click();
    await page.getByRole('button', { name: '+ Colour mix' }).click();
    await page.getByRole('radio', { name: 'Red' }).click();
    await page.getByLabel(/Red saturation/).fill('-1');
    await expect.poll(async () => spread(await pixelAt(page, 300, 150)), { timeout: 5_000 }).toBeLessThan(25);
    expect(spread(await pixelAt(page, 100, 150))).toBeGreaterThan(80);           // blue half keeps its colour
});
