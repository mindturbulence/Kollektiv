import { test, expect, type Page } from '@playwright/test';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import path from 'node:path';

// Video Editor end-to-end: real decode (mediabunny/WebCodecs), Canvas2D
// preview and real export. jsdom unit tests can't reach any of this.
// Fixtures: e2e/fixtures/video/{clipA,clipB}.mp4 + still.png (ffmpeg
// lavfi testsrc2 / mandelbrot, 1.5 s, 320x180@30, AAC) — generated once,
// see docs/plans/2026-09-26-video-editor-plan.md §6.

const FIXTURES = path.resolve('e2e/fixtures/video');
const OUT = path.resolve('test-results/ve-export');

async function bootToVideoEditor(page: Page) {
    await page.addInitScript(() => {
        (window as any).showDirectoryPicker = async () => {
            const dir: any = await navigator.storage.getDirectory();
            dir.queryPermission = () => Promise.resolve('granted');
            dir.requestPermission = () => Promise.resolve('granted');
            return dir;
        };
        if (sessionStorage.getItem('e2e-seeded')) return;
        sessionStorage.setItem('e2e-seeded', '1');
        localStorage.setItem('activeTab', JSON.stringify('video_editor'));
        // Idle standby (default 1 min) would cover the page during export.
        localStorage.setItem('kollektivSettingsV4', JSON.stringify({ isIdleEnabled: false }));
        try { indexedDB.deleteDatabase('kollektiv-db'); } catch { /* noop */ }
        try { indexedDB.deleteDatabase('kollektiv-video-editor'); } catch { /* noop */ }
    });

    await page.goto('/');
    await passBootGates(page);
}

/** Clicks through whichever boot gates show (vault pick/reconnect, provision,
 *  loader) until the app shell is up — the sequence differs after a reload. */
async function passBootGates(page: Page) {
    const header = page.locator('.app-header');
    await expect(async () => {
        if (await header.isVisible()) return;
        for (const name of ['SELECT_VAULT_FOLDER', 'RECONNECT_VAULT', 'CONTINUE']) {
            const btn = page.getByRole('button', { name, exact: true });
            if (await btn.isVisible()) { await btn.click(); break; }
        }
        throw new Error('app shell not up yet');
    }).toPass({ timeout: 120_000, intervals: [1_000] });
}

/** Share of preview pixels that differ from the top-left pixel (0 = blank). */
async function previewVariance(page: Page): Promise<number> {
    return page.getByLabel('Video preview').evaluate((el) => {
        const c = el as HTMLCanvasElement;
        const ctx = c.getContext('2d');
        if (!ctx || !c.width || !c.height) return 0;
        const { data } = ctx.getImageData(0, 0, c.width, c.height);
        let differ = 0;
        for (let i = 0; i < data.length; i += 16) {
            if (Math.abs(data[i] - data[0]) + Math.abs(data[i + 1] - data[1]) + Math.abs(data[i + 2] - data[2]) > 30) differ++;
        }
        return differ / (data.length / 16);
    });
}

async function exportAs(page: Page, container: 'webm' | 'mp4'): Promise<string> {
    await page.getByRole('button', { name: 'Export', exact: true }).click();
    await page.getByRole('button', { name: container, exact: true }).click();
    await page.getByRole('button', { name: 'Start export' }).click();
    const link = page.getByRole('link', { name: 'Download' });
    await expect(link).toBeVisible({ timeout: 90_000 });
    const base64 = await link.evaluate(async (a) => {
        const blob = await (await fetch((a as HTMLAnchorElement).href)).blob();
        const bytes = new Uint8Array(await blob.arrayBuffer());
        let bin = '';
        for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
        return btoa(bin);
    });
    mkdirSync(OUT, { recursive: true });
    const file = path.join(OUT, `export.${container}`);
    writeFileSync(file, Buffer.from(base64, 'base64'));
    await page.getByText('Close', { exact: true }).click();
    return file;
}

test('imports clips, previews a frame and exports', async ({ page }) => {
    const consoleErrors: string[] = [];
    page.on('console', m => { if (m.type() === 'error') consoleErrors.push(m.text()); });
    page.on('pageerror', e => consoleErrors.push(String(e)));

    await bootToVideoEditor(page);
    await page.getByRole('radio', { name: /16:9/ }).click({ timeout: 30_000 });
    await page.getByRole('button', { name: 'Create project' }).click();

    const chooser = page.waitForEvent('filechooser');
    await page.getByRole('button', { name: 'Import media' }).click();
    await (await chooser).setFiles([
        { name: 'clipA.mp4', mimeType: 'video/mp4', buffer: readFileSync(path.join(FIXTURES, 'clipA.mp4')) },
        { name: 'clipB.mp4', mimeType: 'video/mp4', buffer: readFileSync(path.join(FIXTURES, 'clipB.mp4')) },
        { name: 'still.png', mimeType: 'image/png', buffer: readFileSync(path.join(FIXTURES, 'still.png')) },
    ]);

    for (const name of ['clipA.mp4', 'clipB.mp4']) {
        const add = page.getByRole('button', { name: `Add ${name} to timeline` });
        await expect(add).toBeVisible({ timeout: 30_000 });
        await add.click();
    }
    await expect(page.getByLabel('Timecode')).toBeVisible();
    await expect.poll(() => previewVariance(page), { timeout: 20_000 }).toBeGreaterThan(0.05);
    await page.screenshot({ path: 'test-results/ve-export/editor.png' });

    const webm = await exportAs(page, 'webm');
    const mp4 = await exportAs(page, 'mp4');

    // Autosave (1.5 s debounce, long elapsed) → reload → Resume restores clips and media blobs.
    await expect(page.getByLabel('Unsaved changes')).toHaveCount(0, { timeout: 10_000 });
    await page.reload();
    await passBootGates(page);
    await page.getByRole('button', { name: /^Resume / }).click({ timeout: 30_000 });
    await expect(page.getByLabel('Clip: clipA.mp4')).toBeVisible({ timeout: 15_000 });
    await expect(page.getByLabel('Clip: clipB.mp4')).toBeVisible();
    await expect.poll(() => previewVariance(page), { timeout: 20_000 }).toBeGreaterThan(0.05);
    writeFileSync(path.join(OUT, 'result.json'), JSON.stringify({ webm, mp4, consoleErrors }, null, 2));
    expect(consoleErrors.filter(e => /video-editor|mediabunny|VideoEncoder|VideoSample|export/i.test(e))).toEqual([]);
});
