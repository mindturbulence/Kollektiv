import { test, expect, type Page } from '@playwright/test';
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import path from 'node:path';

// Video Editor Phase 0 criterion: ffmpeg.wasm export fallback when
// VideoEncoder/AudioEncoder are unavailable (core/export/index.ts picks
// exportFfmpegFallback whenever `typeof VideoEncoder === 'undefined'`).
// VideoDecoder is left alone — decode of the source clips still needs it.

const FIXTURES = path.resolve('e2e/fixtures/video');
const OUT = path.resolve('test-results/ve-fallback');
const FFPROBE = 'C:/Program Files/FFMPEG/bin/ffprobe.exe';

async function bootToVideoEditor(page: Page) {
    // Strip the WebCodecs encoders before any app script runs, forcing the
    // ffmpeg fallback path. Keep VideoDecoder/AudioDecoder for source decode.
    await page.addInitScript(() => {
        delete (window as any).VideoEncoder;
        delete (window as any).AudioEncoder;
    });
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
        localStorage.setItem('kollektivSettingsV4', JSON.stringify({ isIdleEnabled: false }));
        try { indexedDB.deleteDatabase('kollektiv-db'); } catch { /* noop */ }
        try { indexedDB.deleteDatabase('kollektiv-video-editor'); } catch { /* noop */ }
    });

    await page.goto('/');
    await passBootGates(page);
}

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

test('exports via the ffmpeg fallback when WebCodecs encoders are absent', async ({ page }) => {
    // Cold ffmpeg.wasm core fetch (~32MB, single-thread) + JPEG-frame mux is
    // much slower than the WebCodecs path the other e2e spec exercises.
    test.setTimeout(300_000);
    const consoleErrors: string[] = [];
    page.on('console', m => { if (m.type() === 'error') consoleErrors.push(m.text()); });
    page.on('pageerror', e => consoleErrors.push(String(e)));

    await bootToVideoEditor(page);

    const hasEncoder = await page.evaluate(() => typeof (window as any).VideoEncoder !== 'undefined');
    expect(hasEncoder).toBe(false);

    await page.getByRole('radio', { name: /16:9/ }).click({ timeout: 30_000 });
    await page.getByRole('button', { name: 'Create project' }).click();

    const chooser = page.waitForEvent('filechooser');
    await page.getByRole('button', { name: 'Import media' }).click();
    await (await chooser).setFiles([
        { name: 'clipA.mp4', mimeType: 'video/mp4', buffer: readFileSync(path.join(FIXTURES, 'clipA.mp4')) },
        { name: 'clipB.mp4', mimeType: 'video/mp4', buffer: readFileSync(path.join(FIXTURES, 'clipB.mp4')) },
    ]);

    for (const name of ['clipA.mp4', 'clipB.mp4']) {
        const add = page.getByRole('button', { name: `Add ${name} to timeline` });
        await expect(add).toBeVisible({ timeout: 30_000 });
        await add.click();
    }
    await expect(page.getByLabel('Timecode')).toBeVisible();

    await page.getByRole('button', { name: 'Export', exact: true }).click();
    await page.getByRole('button', { name: 'mp4', exact: true }).click();
    await page.getByRole('button', { name: 'Start export' }).click();

    // ExportDialog maps ExportProgress.phase 'fallback-ffmpeg' to this label
    // (video-editor/ui/ExportDialog.tsx PHASE_LABEL) — proves the fallback ran,
    // not just that a file happened to come out the other end.
    await expect(page.getByText('Encoding (compatibility mode)')).toBeVisible({ timeout: 60_000 });

    const link = page.getByRole('link', { name: 'Download' });
    await expect(link).toBeVisible({ timeout: 240_000 });
    const base64 = await link.evaluate(async (a) => {
        const blob = await (await fetch((a as HTMLAnchorElement).href)).blob();
        const bytes = new Uint8Array(await blob.arrayBuffer());
        let bin = '';
        for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
        return btoa(bin);
    });
    mkdirSync(OUT, { recursive: true });
    const file = path.join(OUT, 'export-fallback.mp4');
    writeFileSync(file, Buffer.from(base64, 'base64'));

    expect(consoleErrors.filter(e => /video-editor|mediabunny|VideoEncoder|VideoSample|export/i.test(e))).toEqual([]);

    // ffprobe: the fallback muxes H.264 + AAC via the system ffmpeg.wasm core
    // (workers/ffmpegWorker.ts encodeFrames, '-c:v libx264 ... -c:a aac').
    const probeJson = execFileSync(FFPROBE, [
        '-v', 'error',
        '-print_format', 'json',
        '-show_format', '-show_streams',
        file,
    ], { encoding: 'utf8' });
    const probe = JSON.parse(probeJson);
    writeFileSync(path.join(OUT, 'ffprobe.json'), probeJson);

    const videoStream = probe.streams.find((s: any) => s.codec_type === 'video');
    const audioStream = probe.streams.find((s: any) => s.codec_type === 'audio');
    expect(videoStream?.codec_name).toBe('h264');
    expect(audioStream).toBeDefined();
    expect(audioStream?.codec_name).toBe('aac');

    const duration = Number(probe.format.duration);
    expect(duration).toBeGreaterThan(2.5);
    expect(duration).toBeLessThan(3.5);
});
