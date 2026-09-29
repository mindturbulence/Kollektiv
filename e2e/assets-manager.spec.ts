import { test, expect, type Page } from '@playwright/test';

/**
 * e2e/assets-manager.spec.ts (plan Task 26): the Assets Manager end to end on
 * the OPFS-backed picker stub — the same origin-private root serves as vault
 * and as the asset root, so test images live in a `photos` subfolder.
 */


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

/** Seeds photos/{a.png, b.png (a near-copy of a), c.jpg} and an empty archive/. */
async function seedPhotos(page: Page) {
    await page.evaluate(async () => {
        const root = await navigator.storage.getDirectory();
        const photos = await root.getDirectoryHandle('photos', { create: true });
        await root.getDirectoryHandle('archive', { create: true });
        const write = async (name: string, draw: (x: CanvasRenderingContext2D) => void, type: string) => {
            const c = document.createElement('canvas'); c.width = 96; c.height = 64;
            const x = c.getContext('2d')!; draw(x);
            const blob = await new Promise<Blob>(r => c.toBlob(b => r(b!), type, 0.92));
            const w = await (await photos.getFileHandle(name, { create: true })).createWritable();
            await w.write(blob); await w.close();
        };
        const redScene = (x: CanvasRenderingContext2D) => { x.fillStyle = '#c03030'; x.fillRect(0, 0, 96, 64); x.fillStyle = '#ffe0a0'; x.fillRect(10, 10, 30, 20); };
        await write('a.png', redScene, 'image/png');
        await write('b.png', x => { redScene(x); x.fillStyle = '#c13131'; x.fillRect(80, 50, 2, 2); }, 'image/png');
        // Stripes, so its dHash is far from the flat red scenes.
        await write('c.jpg', x => { for (let i = 0; i < 12; i++) { x.fillStyle = i % 2 ? '#1030a0' : '#90d0ff'; x.fillRect(i * 8, 0, 8, 64); } }, 'image/jpeg');
    });
}

async function openPhotos(page: Page) {
    await bootToAppShell(page, 'assets_manager');
    await seedPhotos(page);
    await page.getByRole('button', { name: 'SELECT A FOLDER TO BEGIN' }).click({ timeout: 30_000 });
    await page.getByText('photos', { exact: true }).click({ timeout: 15_000 });
    await expect(page.getByText('3 IMAGES')).toBeVisible({ timeout: 15_000 });
    await expect(page.locator('[data-testid="asset-grid"] img')).toHaveCount(3, { timeout: 20_000 });
    // Regression: <main> used to get scrolled sideways (off-screen side panels), cutting the sidebar off.
    await page.waitForTimeout(1500);
    expect(await page.evaluate(() => document.querySelector('main')!.scrollLeft)).toBe(0);
}

const card = (page: Page, name: string) => page.getByRole('button', { name: `Open ${name}` });

test('index, thumbnails, rate/label/tag, filter, duplicates, stacks and collections', async ({ page }) => {
    test.setTimeout(120_000);
    await openPhotos(page);
    // Grid cards use cached WebP thumbnails, not the original files.
    const srcs = await page.locator('[data-testid="asset-grid"] img').evaluateAll(imgs => imgs.map(i => (i as HTMLImageElement).src));
    expect(srcs.every(s => s.startsWith('blob:'))).toBe(true);

    // Rate 4 + red label from the keyboard, tag in the inspector.
    await card(page, 'a.png').click({ modifiers: ['Control'] });
    const details = page.getByRole('complementary', { name: 'Asset details' });
    await expect(details).toContainText('96 × 64');
    await page.keyboard.press('4');
    await page.keyboard.press('6');
    await details.getByLabel('Add tags').fill('beach, sunset');
    await details.getByLabel('Add tags').press('Enter');
    await expect(card(page, 'a.png')).toContainText('★★★★');
    await expect(details.getByRole('button', { name: 'Remove tag beach' })).toBeVisible();

    // Filters compose: 4+ stars → only a.png; a tag search too.
    await page.getByLabel('Minimum rating').selectOption('4');
    await expect(page.locator('[data-testid="asset-grid"] button[aria-label^="Open"]')).toHaveCount(1);
    await page.getByRole('button', { name: 'Clear' }).click();
    await page.getByLabel('Search assets').fill('sunset');
    await expect(page.locator('[data-testid="asset-grid"] button[aria-label^="Open"]')).toHaveCount(1);
    await page.getByRole('button', { name: 'Clear' }).click();

    // Duplicates: a and b are near-identical; select the extra.
    await page.keyboard.press('Escape');
    await page.getByRole('button', { name: 'DUPLICATES' }).click();
    const dupes = page.getByRole('dialog', { name: /look-alike/ });
    await expect(dupes).toContainText('1 group');
    await dupes.getByRole('button', { name: /Select 1 extras/ }).click();
    await expect(page.getByText('1 SELECTED')).toBeVisible();

    // Stack a + b into one card, then expand it.
    await card(page, 'a.png').click({ modifiers: ['Control'] });
    await page.getByRole('complementary', { name: 'Asset details' }).getByRole('button', { name: 'Stack' }).click();
    await expect(page.locator('[data-testid="asset-grid"] button[aria-label^="Open"]')).toHaveCount(2);
    await page.getByRole('button', { name: /Expand stack of 2/ }).click();
    await expect(page.locator('[data-testid="asset-grid"] button[aria-label^="Open"]')).toHaveCount(3);

    // Collection from the selection, then open it from the sidebar.
    await details.getByLabel('Collection name').fill('Best');
    await details.getByRole('button', { name: 'Add', exact: true }).click();
    await page.keyboard.press('Escape');
    await page.getByRole('complementary').getByText('Best', { exact: true }).click();
    await expect(page.getByText('COLLECTION · Best')).toBeVisible();
    // a + b (both selected when the collection was made; their stack is still expanded).
    await expect(page.locator('[data-testid="asset-grid"] button[aria-label^="Open"]')).toHaveCount(2, { timeout: 10_000 });

    // Everything user-authored persisted to the vault manifest.
    await expect.poll(() => page.evaluate(async () => {
        const root = await navigator.storage.getDirectory();
        try { return await (await (await root.getFileHandle('kollektiv_assets_index.json')).getFile()).text(); } catch { return ''; }
    }), { timeout: 10_000 }).toContain('"Best"');
});

test('batch rename + undo, move to another folder, metadata written into the file, RAW preview', async ({ page }) => {
    test.setTimeout(120_000);
    await bootToAppShell(page, 'assets_manager');
    await seedPhotos(page);
    // A "RAW" LibRaw would never see: junk + an embedded JPEG preview, like a camera file.
    await page.evaluate(async () => {
        const c = document.createElement('canvas'); c.width = 60; c.height = 40;
        const x = c.getContext('2d')!; x.fillStyle = '#20a060'; x.fillRect(0, 0, 60, 40);
        const jpeg = new Uint8Array(await (await new Promise<Blob>(r => c.toBlob(b => r(b!), 'image/jpeg'))).arrayBuffer());
        const photos = await (await navigator.storage.getDirectory()).getDirectoryHandle('photos');
        const w = await (await photos.getFileHandle('d.cr2', { create: true })).createWritable();
        await w.write(new Blob([new TextEncoder().encode('NOT-A-REAL-RAW-HEADER'.repeat(10)), jpeg]));
        await w.close();
    });
    await page.getByRole('button', { name: 'SELECT A FOLDER TO BEGIN' }).click({ timeout: 30_000 });
    await page.getByText('photos', { exact: true }).click({ timeout: 15_000 });
    await expect(page.getByText('4 IMAGES')).toBeVisible({ timeout: 15_000 });
    await expect(page.locator('[data-testid="asset-grid"] img')).toHaveCount(4, { timeout: 20_000 });
    await expect(card(page, 'd.cr2')).toContainText('RAW');

    // Rate a.png, then batch-rename a + c; the rating follows the file.
    await card(page, 'a.png').click({ modifiers: ['Control'] });
    await page.keyboard.press('5');
    await card(page, 'c.jpg').click({ modifiers: ['Control'] });
    const details = page.getByRole('complementary', { name: 'Asset details' });
    await details.getByRole('button', { name: 'Rename…' }).click();
    const rename = page.getByRole('dialog', { name: /Rename 2 files/ });
    await rename.getByLabel('Rename pattern').fill('{index}_{name}');
    await expect(rename.getByRole('table', { name: 'Rename preview' })).toContainText('01_a.png');
    await rename.getByRole('button', { name: 'Rename 2' }).click();
    await expect(card(page, '01_a.png')).toBeVisible({ timeout: 15_000 });
    await expect(card(page, '02_c.jpg')).toBeVisible();
    await expect(card(page, '01_a.png')).toContainText('★★★★★');

    // Undo restores the names (and the rating stays with a.png).
    await page.getByRole('button', { name: /UNDO: Rename 2/ }).click();
    await expect(card(page, 'a.png')).toBeVisible({ timeout: 15_000 });
    await expect(card(page, 'c.jpg')).toBeVisible();
    await expect(card(page, 'a.png')).toContainText('★★★★★');

    // Move c.jpg into archive/.
    await card(page, 'c.jpg').click({ modifiers: ['Control'] });
    await details.getByRole('button', { name: 'Copy / Move…' }).click();
    const move = page.getByRole('dialog', { name: /Copy or move 1 file/ });
    await move.getByRole('radio', { name: 'move' }).click();
    await move.getByRole('button', { name: '/archive' }).click();
    await move.getByRole('button', { name: 'Move here' }).click();
    await expect(page.getByText('3 IMAGES')).toBeVisible({ timeout: 15_000 });
    expect(await page.evaluate(async () => {
        const archive = await (await navigator.storage.getDirectory()).getDirectoryHandle('archive');
        try { await archive.getFileHandle('c.jpg'); return true; } catch { return false; }
    })).toBe(true);

    // Write the index metadata into a.png as XMP, verified by reading the file back.
    await card(page, 'a.png').click({ modifiers: ['Control'] });
    await details.getByLabel('Add tags').fill('keeper');
    await details.getByLabel('Add tags').press('Enter');
    await details.getByRole('button', { name: 'Write to file' }).click();
    await expect.poll(() => page.evaluate(async () => {
        const photos = await (await navigator.storage.getDirectory()).getDirectoryHandle('photos');
        return (await (await photos.getFileHandle('a.png')).getFile()).text();
    }), { timeout: 10_000 }).toContain('xmp:Rating="5"');
    // …and the written PNG still decodes (valid chunk CRCs).
    expect(await page.evaluate(async () => {
        const photos = await (await navigator.storage.getDirectory()).getDirectoryHandle('photos');
        const bmp = await createImageBitmap(await (await photos.getFileHandle('a.png')).getFile());
        return `${bmp.width}x${bmp.height}`;
    })).toBe('96x64');
    // The write is undoable too — and the journal and index survive a restart.
    await expect(page.getByRole('button', { name: /UNDO: Write metadata to 1/ })).toBeVisible();
    await page.reload();
    // Whatever boot screens a returning session shows (vault gate and/or CONTINUE), click through.
    const header = page.locator('.app-header');
    const next = page.getByRole('button', { name: /^(SELECT_VAULT_FOLDER|RECONNECT_VAULT|CONTINUE)$/ });
    for (let i = 0; i < 6 && !(await header.isVisible()); i++) {
        await next.first().click({ timeout: 30_000 }).catch(() => {});
        await page.waitForTimeout(500);
    }
    await expect(header).toBeVisible({ timeout: 30_000 });
    await page.getByText('photos', { exact: true }).click({ timeout: 30_000 });
    await expect(page.getByRole('button', { name: /UNDO: Write metadata to 1/ })).toBeVisible({ timeout: 15_000 });
    await expect(card(page, 'a.png')).toContainText('★★★★★');
});

test('save to the Vault gallery with tags, then browse the vault gallery as a root', async ({ page }) => {
    test.setTimeout(120_000);
    await openPhotos(page);
    await card(page, 'c.jpg').click({ modifiers: ['Control'] });
    const details = page.getByRole('complementary', { name: 'Asset details' });
    await details.getByLabel('Add tags').fill('stripes');
    await details.getByLabel('Add tags').press('Enter');
    await page.getByRole('toolbar', { name: 'Selection actions' }).getByRole('button', { name: 'To Vault' }).click();
    const save = page.getByRole('dialog', { name: /Save 1 to the Vault gallery/ });
    await save.getByRole('button', { name: 'Save' }).click();
    await expect(page.getByText(/Saved 1 to the gallery/)).toBeVisible({ timeout: 15_000 });
    // The gallery manifest has the item with its tag.
    expect(await page.evaluate(async () => {
        const root = await navigator.storage.getDirectory();
        return (await (await root.getFileHandle('kollektiv_gallery_manifest.json')).getFile()).text();
    })).toContain('stripes');

    await page.getByRole('button', { name: 'Add the vault gallery as a root' }).click();
    await expect(page.getByText(/[1-9]\d* IMAGES?$/)).toBeVisible({ timeout: 15_000 });
});
