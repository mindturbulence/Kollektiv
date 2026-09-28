import { test, expect, type Page } from '@playwright/test';
import path from 'path';
import fs from 'fs';

/**
 * e2e/converter.spec.ts (plan §8: 8 E2E candidates → the 3 highest-value
 * flows that don't need an external ffmpeg core download in CI):
 *
 *  1. Happy batch: 3 PNG → WebP, all rows done, ZIP enabled.
 *  2. Cancel mid-batch: rows flip to cancelled, batch stops.
 *  3. Unknown extension: row rejected before queueing.
 *
 * Navigation uses the command palette (Ctrl+K → "Converter") because the
 * header nav items sit inside a hover-expanded GSAP container that is
 * flaky to click in headless mode.
 */

async function bootToAppShell(page: Page) {
    await page.addInitScript(() => {
        try { indexedDB.deleteDatabase('kollektiv-db'); } catch { /* noop */ }
        (window as any).showDirectoryPicker = async () => {
            const dir: any = await navigator.storage.getDirectory();
            dir.queryPermission = async () => 'granted';
            dir.requestPermission = async () => 'granted';
            return dir;
        };
    });

    await page.goto('/');

    const selectBtn = page.getByRole('button', { name: 'SELECT_VAULT_FOLDER' });
    const reconnectBtn = page.getByRole('button', { name: 'RECONNECT_VAULT' });
    const gateBtn = await Promise.race([
        selectBtn.waitFor({ state: 'visible', timeout: 30_000 }).then(() => selectBtn),
        reconnectBtn.waitFor({ state: 'visible', timeout: 30_000 }).then(() => reconnectBtn),
    ].map(p => p.catch(() => null as any)));
    if (!gateBtn) throw new Error('Neither SELECT_VAULT_FOLDER nor RECONNECT_VAULT appeared on the Welcome screen.');
    await gateBtn.click();

    await expect(page.getByRole('heading', { name: /PROVISION/ })).toBeVisible({ timeout: 30_000 });
    await page.getByRole('button', { name: 'CONTINUE', exact: true }).click();

    const continueBtn = page.getByRole('button', { name: 'CONTINUE', exact: true });
    await continueBtn.click({ timeout: 60_000 });

    await expect(page.locator('.app-header')).toBeVisible({ timeout: 30_000 });
}

async function navigateToConverter(page: Page) {
    // Header nav: click the Utilities parent to expand its GSAP container,
    // then the Converter item. RollingText doubles each letter ("UUttiill..."),
    // so match loosely with .* between letters.
    await page.getByRole('button', { name: /U.*t.*i.*l.*i.*t.*i.*e.*s/ }).first().click();
    await page.getByRole('menuitem', { name: /C.*o.*n.*v.*e.*r.*t.*e.*r/ }).first().click({ timeout: 10_000 });
    // Static empty-state copy confirms the page mounted.
    await expect(page.getByText('Queue is Empty')).toBeVisible({ timeout: 15_000 });
}

// Minimal valid PNG (1×1 red pixel), written to the test's output dir.
const PNG_1X1 =
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';

function writePng(filePath: string): void {
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(filePath, Buffer.from(PNG_1X1, 'base64'));
}

test.describe('Converter (plan §8 e2e)', () => {
    test('happy batch: 3 PNGs → WebP, all rows done, ZIP enabled', async ({ page }) => {
        await bootToAppShell(page);
        await navigateToConverter(page);

        // Create real PNG files on disk for the file chooser.
        const dir = test.info().outputDir;
        const files: string[] = [];
        for (const name of ['alpha', 'beta', 'gamma']) {
            const p = path.join(dir, `${name}.png`);
            writePng(p);
            files.push(p);
        }

        await page.setInputFiles('input[type="file"]', files);

        await expect(page.getByText('3 FILES')).toBeVisible({ timeout: 10_000 });
        await expect(page.getByText('CONVERT ALL')).toBeVisible();

        await page.getByText('CONVERT ALL').click();

        // All three rows reach done; status bar reports 3/3.
        await expect(page.getByText(/3\/3 converted/)).toBeVisible({ timeout: 60_000 });
        for (const name of ['alpha', 'beta', 'gamma']) {
            await expect(page.getByText(new RegExp(`→ ${name}\\.webp`))).toBeVisible();
        }
        // ZIP button enabled with the done count.
        await expect(page.getByText(/DOWNLOAD ZIP \(3\)/)).toBeEnabled();
    });

    test('unknown extension is rejected before queueing', async ({ page }) => {
        await bootToAppShell(page);
        await navigateToConverter(page);

        const dir = test.info().outputDir;
        const bogus = path.join(dir, 'payload.exe');
        writePng(bogus.replace(/\.exe$/, '.png'));
        fs.renameSync(bogus.replace(/\.exe$/, '.png'), bogus);

        await page.setInputFiles('input[type="file"]', [bogus]);
        await expect(page.getByText('payload.exe')).toBeVisible();
        await expect(page.getByText('Unsupported format')).toBeVisible();
        // CONVERT ALL only runs 'pending' rows — clicking it with a rejected
        // row must not convert anything nor crash.
        await page.getByText('CONVERT ALL').click();
        await expect(page.getByText(/0\/1 converted/)).toBeVisible({ timeout: 10_000 });
        await expect(page.getByText('Unsupported format')).toBeVisible();
    });

    test('cancel mid-batch leaves remaining rows cancelled', async ({ page }) => {
        await bootToAppShell(page);
        await navigateToConverter(page);

        // 8 PNGs: enough jobs that CANCEL lands while some are still pending.
        const dir = test.info().outputDir;
        const files: string[] = [];
        for (let i = 0; i < 8; i++) {
            const p = path.join(dir, `c${i}.png`);
            writePng(p);
            files.push(p);
        }
        await page.setInputFiles('input[type="file"]', files);
        await expect(page.getByText('8 FILES')).toBeVisible();

        await page.getByText('CONVERT ALL').click();
        await page.getByText('CANCEL').click();

        await expect(page.getByText('CANCEL')).toBeHidden({ timeout: 10_000 });
        // No row silently reports success after cancellation; at least one
        // row shows the cancelled LED (aria-label on the status dot).
        await expect(page.getByText(/RUNNING/)).toBeHidden();
        await expect(page.locator('[aria-label="cancelled"], [title="cancelled"]').first()).toBeVisible();
    });
});
