import { test, expect, type Page } from '@playwright/test';

/**
 * MANUAL VERIFICATION HARNESS — ffmpeg A/V path (plan success criterion:
 * "flac→mp3 with no page freeze >2s").
 *
 * NOT part of the CI suite: the ffmpeg single-thread core (~32MB) is fetched
 * from unpkg on first A/V job, which must not run in CI. The file name ends
 * with .verify.spec.ts and test.describe.configure sets test.ignore() unless
 * CONVERTER_AV_VERIFY=1 is set. Run explicitly:
 *
 *   CONVERTER_AV_VERIFY=1 npx playwright test e2e/converter-av.verify.spec.ts
 *
 * What it does:
 *  1. Boots the real app (OPFS stub) into the Converter.
 *  2. Installs a jank probe on the page: a rAF loop that records any
 *     main-thread gap > 2s (the plan's freeze criterion).
 *  3. Adds a real 3.5s stereo FLAC, converts to MP3 through the real
 *     ffmpeg.wasm single-thread core (fetched from unpkg on first use).
 *  4. Waits for the done row, asserts a real MP3 artifact (size > 0),
 *     asserts the jank probe recorded no >2s freeze, and downloads the
 *     artifact to disk for ffprobe validation by the caller.
 */

const ENABLED = !!process.env.CONVERTER_AV_VERIFY;
test.skip(!ENABLED, 'Manual A/V verification — set CONVERTER_AV_VERIFY=1 to run.');

test.setTimeout(180_000); // 32MB core fetch + conversion, generously.

async function bootToConverter(page: Page) {
    await page.addInitScript(() => {
        try { indexedDB.deleteDatabase('kollektiv-db'); } catch { /* noop */ }
        (window as any).showDirectoryPicker = async () => {
            const dir: any = await navigator.storage.getDirectory();
            dir.queryPermission = async () => 'granted';
            dir.requestPermission = async () => 'granted';
            return dir;
        };
        // Jank probe: rAF loop measuring main-thread gaps. Survives for the
        // page's lifetime; the last sample survives pageonsole capture.
        (window as any).__jank = { maxGapMs: 0, gapsOver2s: 0, lastTick: performance.now() };
        const tick = () => {
            const now = performance.now();
            const gap = now - (window as any).__jank.lastTick;
            if (gap > (window as any).__jank.maxGapMs) (window as any).__jank.maxGapMs = gap;
            if (gap > 2000) (window as any).__jank.gapsOver2s++;
            (window as any).__jank.lastTick = now;
            requestAnimationFrame(tick);
        };
        requestAnimationFrame(tick);
    });

    await page.goto('/');

    const selectBtn = page.getByRole('button', { name: 'SELECT_VAULT_FOLDER' });
    const reconnectBtn = page.getByRole('button', { name: 'RECONNECT_VAULT' });
    const gateBtn = await Promise.race([
        selectBtn.waitFor({ state: 'visible', timeout: 10_000 }).then(() => selectBtn),
        reconnectBtn.waitFor({ state: 'visible', timeout: 10_000 }).then(() => reconnectBtn),
    ].map(p => p.catch(() => null as any)));
    if (!gateBtn) throw new Error('Neither SELECT_VAULT_FOLDER nor RECONNECT_VAULT appeared on the Welcome screen.');
    await gateBtn.click();

    await expect(page.getByRole('heading', { name: /PROVISION/ })).toBeVisible({ timeout: 30_000 });
    await page.getByRole('button', { name: 'CONTINUE', exact: true }).click();
    await page.getByRole('button', { name: 'CONTINUE', exact: true }).click({ timeout: 60_000 });
    await expect(page.locator('.app-header')).toBeVisible({ timeout: 30_000 });

    // Header nav → Utilities → Converter (letter-doubled RollingText).
    await page.getByRole('button', { name: /U.*t.*i.*l.*i.*t.*i.*e.*s/ }).first().click();
    await page.getByRole('menuitem', { name: /C.*o.*n.*v.*e.*r.*t.*e.*r/ }).first().click({ timeout: 10_000 });
    await expect(page.getByText('Queue is Empty')).toBeVisible({ timeout: 15_000 });
}

test('flac→mp3 via ffmpeg core: converts, no main-thread freeze >2s', async ({ page }) => {
    await bootToConverter(page);

    await page.setInputFiles('input[type="file"]', ['.tmp-verify/verify_tone.flac']);
    await expect(page.getByText('verify_tone.flac')).toBeVisible();

    // Per-row target override: FLAC source → MP3 (first audio target).
    await page.locator('select[aria-label="Override target for verify_tone.flac"]').selectOption('mp3');

    // First A/V job lazily fetches the ~32MB core — watch the state surface.
    await page.getByText('CONVERT ALL').click();
    const loading = page.getByText(/LOADING ENGINE/);
    try {
        await loading.waitFor({ state: 'visible', timeout: 8_000 });
        console.log('[verify] ffmpeg core loading (32MB from unpkg)...');
    } catch {
        console.log('[verify] core load state not observed (may be cached or too fast)');
    }

    // Done row: "→ verify_tone.mp3 · N KB · T.Ts"
    await expect(page.getByText(/→ verify_tone\.mp3/)).toBeVisible({ timeout: 150_000 });
    await expect(page.getByText(/1\/1 converted/)).toBeVisible();

    // Read the jank probe: the plan criterion is no main-thread freeze >2s.
    const jank = await page.evaluate(() => (window as any).__jank);
    console.log(`[verify] max main-thread gap: ${jank.maxGapMs.toFixed(0)}ms; gaps >2s: ${jank.gapsOver2s}`);
    expect(jank.gapsOver2s).toBe(0);

    // Sanity: output size looks like audio, not an empty/error blob.
    const rowText = await page.getByText(/→ verify_tone\.mp3/).textContent();
    console.log(`[verify] result row: ${rowText}`);
    const kb = Number(/·\s+(\d+)\s+KB/.exec(rowText ?? '')?.[1] ?? 0);
    expect(kb).toBeGreaterThan(10);

    // Persist the artifact for ffprobe validation by the caller.
    const [download] = await Promise.all([
        page.waitForEvent('download', { timeout: 10_000 }),
        page.getByRole('link', { name: 'SAVE' }).click(),
    ]);
    await download.saveAs('.tmp-verify/verify_tone.output.mp3');
    console.log('[verify] artifact saved to .tmp-verify/verify_tone.output.mp3');
});
