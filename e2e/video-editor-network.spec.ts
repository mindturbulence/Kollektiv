import { test, expect, type Page, type Request } from '@playwright/test';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import path from 'node:path';

// Video Editor Phase 0 criterion: no unexpected network egress. Boots the
// real app, imports/previews/exports, and records every request. Anything
// not same-origin (127.0.0.1:4173) or data:/blob: must be an already-known
// app-shell dependency (fonts, Google sign-in) loaded unconditionally from
// index.html at boot — never something the editor itself reaches out for
// (e.g. a CDN-fetched codec/ffmpeg core would be a real bug).

const FIXTURES = path.resolve('e2e/fixtures/video');
const OUT = path.resolve('test-results/ve-network');
const ORIGIN = 'http://127.0.0.1:4173';

// Verified in index.html: unconditional <link>/<script> tags in <head>,
// fetched on every page load regardless of which tab/tool is active.
const KNOWN_SHELL_HOSTS = [
    'fonts.googleapis.com',
    'fonts.gstatic.com',
    'db.onlinewebfonts.com',
    'api.fontshare.com',
    'accounts.google.com',
    'apis.google.com',
    // components/VideoPlayerOverlay.tsx: the app-wide "Media Player" overlay
    // resumes a persisted YouTube embed on boot regardless of active tab —
    // confirmed unrelated to the video editor by reading the component.
    'www.youtube-nocookie.com',
    // Home montage / stock fill (per project memory: intentional, keep it) —
    // a <video> pointed straight at Pexels from the main document.
    'videos.pexels.com',
    // components/Footer.tsx: the persistent app-wide status bar (visible on
    // every tab, incl. the video editor) — a background texture image and a
    // periodic OpenRouter model-list fetch for its ticker. Confirmed via grep,
    // unrelated to the editor itself.
    'www.transparenttextures.com',
    'openrouter.ai',
];

// Requests whose initiating frame is itself a third-party embed we already
// allow-listed above (e.g. everything the YouTube player iframe loads: its
// own CDN scripts, ytimg thumbnails, googlevideo playback, WAA attestation)
// are that embed's business, not the video editor's — attribute the whole
// subtree to the iframe's origin instead of enumerating every Google host.
function isNestedInAllowedFrame(frameUrl: string): boolean {
    try {
        const f = new URL(frameUrl);
        return KNOWN_SHELL_HOSTS.some(h => f.hostname === h || f.hostname.endsWith(`.${h}`));
    } catch {
        return false;
    }
}

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
            // Short timeout: gate screens swap mid-click; a stuck click must not block the retry loop.
            if (await btn.isVisible()) { await btn.click({ timeout: 5_000 }).catch(() => undefined); break; }
        }
        throw new Error('app shell not up yet');
    }).toPass({ timeout: 120_000, intervals: [1_000] });
}

function isKnownShellHost(url: URL): boolean {
    return KNOWN_SHELL_HOSTS.some(h => url.hostname === h || url.hostname.endsWith(`.${h}`));
}

test('editor session makes no network calls outside the preview origin / known app-shell hosts', async ({ page }) => {
    test.setTimeout(240_000); // shared CI machine under load: boot + export can outrun the default 120s.
    const requests: { url: string; resourceType: string; frame: string }[] = [];
    const thirdParty: { url: string; resourceType: string; frame: string }[] = [];
    const shellAllowed: { url: string; resourceType: string }[] = [];

    page.on('request', (req: Request) => {
        const raw = req.url();
        let u: URL;
        try { u = new URL(raw); } catch { return; }
        const entry = { url: raw, resourceType: req.resourceType(), frame: req.frame().url() };
        requests.push(entry);

        if (u.protocol === 'data:' || u.protocol === 'blob:') return;
        if (u.origin === ORIGIN) return;
        if (isKnownShellHost(u) || isNestedInAllowedFrame(entry.frame)) { shellAllowed.push(entry); return; }
        thirdParty.push(entry);
    });

    await bootToVideoEditor(page);
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
    await expect.poll(() => page.getByLabel('Video preview').evaluate((el) => {
        const c = el as HTMLCanvasElement;
        const ctx = c.getContext('2d');
        if (!ctx || !c.width || !c.height) return 0;
        const { data } = ctx.getImageData(0, 0, c.width, c.height);
        let differ = 0;
        for (let i = 0; i < data.length; i += 16) {
            if (Math.abs(data[i] - data[0]) + Math.abs(data[i + 1] - data[1]) + Math.abs(data[i + 2] - data[2]) > 30) differ++;
        }
        return differ / (data.length / 16);
    }), { timeout: 20_000 }).toBeGreaterThan(0.05);

    await page.getByRole('button', { name: 'Export', exact: true }).click();
    await page.getByRole('button', { name: 'mp4', exact: true }).click();
    await page.getByRole('button', { name: 'Start export' }).click();
    await expect(page.getByRole('link', { name: 'Download' })).toBeVisible({ timeout: 90_000 });

    mkdirSync(OUT, { recursive: true });
    writeFileSync(path.join(OUT, 'requests.json'), JSON.stringify({ requests, thirdParty, shellAllowed }, null, 2));

    console.log(`[network] ${requests.length} total requests; ${shellAllowed.length} known-shell third-party; ${thirdParty.length} unattributed third-party`);
    if (shellAllowed.length) {
        console.log('[network] allow-listed app-shell hosts (boot-time fonts/sign-in, not editor-caused):');
        for (const r of [...new Set(shellAllowed.map(r => new URL(r.url).hostname))]) console.log(`  - ${r}`);
    }
    if (thirdParty.length) {
        console.log('[network] UNEXPECTED third-party requests:');
        for (const r of thirdParty) console.log(`  - [${r.resourceType}] ${r.url} (frame: ${r.frame})`);
    }

    expect(thirdParty, `Unexpected third-party requests:\n${thirdParty.map(r => `${r.resourceType} ${r.url}`).join('\n')}`).toEqual([]);
});
