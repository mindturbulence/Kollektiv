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

test('opt-in gallery conversion: saved images become WebP when the setting says so', async ({ page }) => {
    test.setTimeout(120_000);
    await openPhotos(page);
    await page.evaluate(() => {
        const s = JSON.parse(localStorage.getItem('kollektivSettingsV4') ?? '{}');
        localStorage.setItem('kollektivSettingsV4', JSON.stringify({ ...s, convertImageToJpgLocal: true, galleryConvertTarget: 'webp' }));
    });
    await card(page, 'a.png').click({ modifiers: ['Control'] });
    await page.getByRole('toolbar', { name: 'Selection actions' }).getByRole('button', { name: 'To Vault' }).click();
    await page.getByRole('dialog', { name: /Save 1 to the Vault gallery/ }).getByRole('button', { name: 'Save' }).click();
    await expect(page.getByText(/Saved 1 to the gallery/)).toBeVisible({ timeout: 30_000 });
    const names = await page.evaluate(async () => {
        const gallery = await (await navigator.storage.getDirectory()).getDirectoryHandle('gallery');
        const out: string[] = [];
        for await (const [n] of (gallery as any).entries()) out.push(n);
        return out;
    });
    expect(names.some(n => n.endsWith('.webp'))).toBe(true);
});

test('selection toolbar lives in the grid header; right-click copy pastes across folders', async ({ page }) => {
    test.setTimeout(120_000);
    await openPhotos(page);

    // The selection toolbar is a single instance inside the grid's own <header>,
    // not the global .app-header chrome (§5.1).
    await card(page, 'a.png').click({ modifiers: ['Control'] });
    const toolbar = page.getByRole('toolbar', { name: 'Selection actions' });
    await expect(toolbar).toBeVisible();
    expect(await toolbar.count()).toBe(1);
    expect(await toolbar.evaluate(el => !!el.closest('header'))).toBe(true);
    expect(await toolbar.evaluate(el => !!el.closest('.app-header'))).toBe(false);
    await toolbar.getByRole('button', { name: 'Deselect all' }).click();
    await expect(page.getByText(/\d+ SELECTED/)).toHaveCount(0);

    // Shift+F10 opens the card menu from the keyboard (0,0 anchor → rect fallback).
    await card(page, 'a.png').focus();
    await page.keyboard.press('Shift+F10');
    const kbMenu = page.getByRole('menu');
    await expect(kbMenu).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(kbMenu).toHaveCount(0);

    // Right-click → menu (selects the card it opened on) → Copy.
    await card(page, 'a.png').click({ button: 'right' });
    const menu = page.getByRole('menu');
    await expect(menu).toContainText('Move to Trash');
    await menu.getByRole('menuitem', { name: /^Copy(?! to)/ }).click();
    await expect(menu).toHaveCount(0);

    // Right-click the empty archive/ grid → Paste lands the file there.
    await page.locator('[title="archive"]').click();
    await expect(page.getByText('No Images Here')).toBeVisible({ timeout: 15_000 });
    await page.getByText('No Images Here').click({ button: 'right' });
    await page.getByRole('menu').getByRole('menuitem', { name: /^Paste(?! as)/ }).click();
    await expect(page.getByText('1 IMAGE')).toBeVisible({ timeout: 15_000 });
    await expect(card(page, 'a.png')).toBeVisible();
    expect(await page.evaluate(async () => {
        const archive = await (await navigator.storage.getDirectory()).getDirectoryHandle('archive');
        try { await archive.getFileHandle('a.png'); return true; } catch { return false; }
    })).toBe(true);
});

test('tree context menu: New Folder prompts for a name, Delete Folder removes it', async ({ page }) => {
    test.setTimeout(120_000);
    await openPhotos(page);

    page.on('dialog', d => {
        void d.accept(d.type() === 'prompt' ? 'holiday' : undefined);
    });

    // New Folder… under photos/ — the name comes from a prompt.
    await page.locator('[title="photos"]').click({ button: 'right' });
    await page.getByRole('menu').getByRole('menuitem', { name: 'New Folder…' }).click();
    await expect(page.getByText('Created folder "holiday".')).toBeVisible({ timeout: 10_000 });
    // photos gains its first child → the expand affordance appears; expand to see it.
    await page.locator('[title="photos"]').getByRole('button', { name: 'Expand folder' }).click({ timeout: 15_000 });
    await expect(page.locator('[title="photos/holiday"]')).toBeVisible();

    // Delete Folder — empty folder deletes without a confirmation dialog.
    await page.locator('[title="photos/holiday"]').click({ button: 'right' });
    await page.getByRole('menu').getByRole('menuitem', { name: 'Delete Folder' }).click();
    await expect(page.locator('[title="photos/holiday"]')).toHaveCount(0, { timeout: 15_000 });
    await expect(page.getByText('Deleted folder "holiday".')).toBeVisible();
});

test('grid reorder: dropping a card switches to manual order and it survives a reload', async ({ page }) => {
    test.setTimeout(120_000);
    await openPhotos(page);

    const gridOrder = () => page.locator('[data-testid="asset-grid"] button[aria-label^="Open"]').evaluateAll(
        els => els.map(e => e.getAttribute('aria-label')));
    expect(await gridOrder()).toEqual(['Open a.png', 'Open b.png', 'Open c.jpg']);

    // Drop c.jpg onto the top half of a.png → 'before' → [c, a, b] + manual-order toast.
    // Synthetic input doesn't start an HTML5 drag here — drive the chain directly,
    // yielding between events so React flushes the dragover state the drop reads.
    await page.evaluate(async () => {
        const src = document.querySelector('[aria-label="Open c.jpg"]');
        const tgt = document.querySelector('[aria-label="Open a.png"]');
        if (!src || !tgt) throw new Error('cards not found');
        const dt = new DataTransfer();
        const fire = (el: Element, type: string, x: number, y: number) =>
            el.dispatchEvent(new DragEvent(type, { bubbles: true, cancelable: true, clientX: x, clientY: y, dataTransfer: dt }));
        const r = tgt.getBoundingClientRect();
        fire(src, 'dragstart', 0, 0);
        await new Promise(res => setTimeout(res, 50));
        fire(tgt, 'dragover', r.left + 24, r.top + 6);
        await new Promise(res => setTimeout(res, 50));
        fire(tgt, 'drop', r.left + 24, r.top + 6);
        fire(src, 'dragend', r.left + 24, r.top + 6);
    });
    await expect(page.getByText('Switched to manual order.')).toBeVisible({ timeout: 10_000 });
    await expect.poll(gridOrder, { timeout: 10_000 }).toEqual(['Open c.jpg', 'Open a.png', 'Open b.png']);

    // The sortOrder data is committed to the vault manifest before we restart.
    await expect.poll(() => page.evaluate(async () => {
        const root = await navigator.storage.getDirectory();
        try { return await (await (await root.getFileHandle('kollektiv_assets_index.json')).getFile()).text(); } catch { return ''; }
    }), { timeout: 10_000 }).toContain('"sortOrder"');

    // Restart: sort resets to Name — re-selecting Manual restores the dropped order.
    await page.reload();
    const header = page.locator('.app-header');
    const next = page.getByRole('button', { name: /^(SELECT_VAULT_FOLDER|RECONNECT_VAULT|CONTINUE)$/ });
    for (let i = 0; i < 6 && !(await header.isVisible()); i++) {
        await next.first().click({ timeout: 30_000 }).catch(() => {});
        await page.waitForTimeout(500);
    }
    await expect(header).toBeVisible({ timeout: 30_000 });
    await page.getByText('photos', { exact: true }).click({ timeout: 30_000 });
    await expect(page.locator('[data-testid="asset-grid"] img')).toHaveCount(3, { timeout: 20_000 });
    await page.getByLabel('Sort by').selectOption('manual');
    await expect.poll(gridOrder, { timeout: 10_000 }).toEqual(['Open c.jpg', 'Open a.png', 'Open b.png']);
});

test('Move to Trash files the file away; the Trash node restores it and Empty Trash clears it', async ({ page }) => {
    test.setTimeout(120_000);
    await openPhotos(page);

    page.on('dialog', d => { void d.accept(); }); // confirms: move to trash / empty trash
    await card(page, 'a.png').click({ button: 'right' });
    await page.getByRole('menu').getByRole('menuitem', { name: 'Move to Trash' }).click();

    await expect(page.getByText('Moved 1 file to trash.')).toBeVisible({ timeout: 10_000 });
    await expect(page.getByText('2 IMAGES')).toBeVisible({ timeout: 15_000 });
    await expect(card(page, 'a.png')).toHaveCount(0);

    // The file sits at .kollektiv-trash/<batch>/photos/a.png.
    expect(await page.evaluate(async () => {
        const root = await navigator.storage.getDirectory();
        try {
            const trash = await root.getDirectoryHandle('.kollektiv-trash');
            for await (const [batch] of (trash as any).entries()) {
                try {
                    const photos = await (await trash.getDirectoryHandle(batch)).getDirectoryHandle('photos');
                    await photos.getFileHandle('a.png');
                    return true;
                } catch { /* try the next batch */ }
            }
            return false;
        } catch { return false; }
    })).toBe(true);

    // The Trash node lists it; Restore puts it back where it was.
    await page.locator('[title="Trash"]').getByRole('button', { name: 'Expand trash' }).click();
    await expect(page.locator('[title="photos/a.png"]')).toBeVisible();
    await page.locator('[title="photos/a.png"]').click({ button: 'right' });
    await page.getByRole('menu').getByRole('menuitem', { name: 'Restore' }).click();
    await expect(page.getByText('Restored "a.png".')).toBeVisible({ timeout: 10_000 });
    await expect(card(page, 'a.png')).toBeVisible({ timeout: 15_000 });

    // Trash it again, then Empty Trash from the node's own menu.
    await card(page, 'a.png').click({ button: 'right' });
    await page.getByRole('menu').getByRole('menuitem', { name: 'Move to Trash' }).click();
    await expect(page.getByText('Moved 1 file to trash.')).toBeVisible({ timeout: 10_000 });
    await page.locator('[title="Trash"]').click({ button: 'right' });
    await page.getByRole('menu').getByRole('menuitem', { name: 'Empty Trash' }).click();
    await expect(page.getByText('Emptied the trash (1 item).')).toBeVisible({ timeout: 10_000 });
    await expect(page.locator('[title="photos/a.png"]')).toHaveCount(0);
    await expect(card(page, 'a.png')).toHaveCount(0);

    // Every batch is gone: the trash folder is empty (or gone entirely).
    expect(await page.evaluate(async () => {
        const root = await navigator.storage.getDirectory();
        try {
            const trash = await root.getDirectoryHandle('.kollektiv-trash');
            for await (const _ of (trash as any).entries()) return false;
            return true;
        } catch { return true; }
    })).toBe(true);
});

test('folder drag: self-drop is blocked, dropping onto a sibling nests the folder and rescans the tree', async ({ page }) => {
    test.setTimeout(120_000);
    await openPhotos(page);

    // Guard: dropping a folder onto itself must not move anything (plan §4.2).
    await page.evaluate(async () => {
        const src = document.querySelector('[title="photos"]');
        if (!src) throw new Error('photos row not found');
        const dt = new DataTransfer();
        const fire = (el: Element, type: string) =>
            el.dispatchEvent(new DragEvent(type, { bubbles: true, cancelable: true, dataTransfer: dt }));
        fire(src, 'dragstart');
        await new Promise(r => setTimeout(r, 50));
        fire(src, 'dragover');
        await new Promise(r => setTimeout(r, 50));
        fire(src, 'drop');
        fire(src, 'dragend');
    });
    await page.waitForTimeout(1000);
    await expect(page.getByText(/^Moved folder/)).toHaveCount(0);
    expect(await page.evaluate(async () => {
        const root = await navigator.storage.getDirectory();
        try { await root.getDirectoryHandle('photos'); return true; } catch { return false; }
    })).toBe(true);

    // photos → archive: nests as archive/photos with both files, tree rescans.
    // Synthetic input doesn't start an HTML5 drag here — drive the chain directly,
    // yielding between events so React flushes the dragover state the drop reads.
    await page.evaluate(async () => {
        const src = document.querySelector('[title="photos"]');
        const dst = document.querySelector('[title="archive"]');
        if (!src || !dst) throw new Error('tree rows not found');
        const dt = new DataTransfer();
        const fire = (el: Element, type: string) =>
            el.dispatchEvent(new DragEvent(type, { bubbles: true, cancelable: true, dataTransfer: dt }));
        fire(src, 'dragstart');
        await new Promise(r => setTimeout(r, 50));
        fire(dst, 'dragover');
        await new Promise(r => setTimeout(r, 50));
        fire(dst, 'drop');
        fire(src, 'dragend');
    });

    await expect(page.getByText('Moved folder "photos" to "archive" — 3 files.')).toBeVisible({ timeout: 15_000 });
    await expect(page.locator('[title="photos"]')).toHaveCount(0, { timeout: 15_000 });
    await page.locator('[title="archive"]').getByRole('button', { name: 'Expand folder' }).click({ timeout: 15_000 });
    await expect(page.locator('[title="archive/photos"]')).toBeVisible();
    await page.locator('[title="archive/photos"]').click();
    await expect(page.getByText('3 IMAGES')).toBeVisible({ timeout: 15_000 });

    expect(await page.evaluate(async () => {
        const root = await navigator.storage.getDirectory();
        try {
            const photos = await (await root.getDirectoryHandle('archive')).getDirectoryHandle('photos');
            await photos.getFileHandle('a.png');
            await photos.getFileHandle('b.png');
            try { await root.getDirectoryHandle('photos'); return false; } catch { return true; }
        } catch { return false; }
    })).toBe(true);
});
