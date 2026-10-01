import { test, expect, type Page } from '@playwright/test';

/**
 * Floating Assistant Avatar — embed relay e2e.
 *
 * Covers the two surfaces that share the same BroadcastChannel
 * ('kollektiv-avatar') protocol:
 *  1. The in-app floating avatar widget (portal, same realm)
 *  2. The #avatar-panel embed surface (what the extension side panel hosts
 *     in an iframe — a separate realm, so it consumes relayed snapshots)
 *
 * Cross-window semantics verified here in CI: hello → snapshot round-trip,
 * and session state changes propagating from the main app into the embed.
 * The actual chrome-extension:// side panel can't be loaded in the Playwright
 * CI browser (branded-Chrome policy blocks --load-extension), so the embed
 * page is exercised directly as a tab — same document the panel hosts.
 */

async function bootToAppShell(page: Page) {
    // Same stubs as smoke.spec.ts — File System Access API gate + clean IDB.
    await page.addInitScript(() => {
        try { indexedDB.deleteDatabase('kollektiv-db'); } catch { /* noop */ }
        (window as any).showDirectoryPicker = async () => {
            const dir: any = await navigator.storage.getDirectory();
            dir.queryPermission = () => Promise.resolve('granted');
            dir.requestPermission = () => Promise.resolve('granted');
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
    if (!gateBtn) throw new Error('Neither SELECT_VAULT_FOLDER nor RECONNECT_VAULT appeared.');
    await gateBtn.click();

    await expect(page.getByRole('heading', { name: /PROVISION/ })).toBeVisible({ timeout: 30_000 });
    await page.getByRole('button', { name: 'CONTINUE', exact: true }).click();
    await page.getByRole('button', { name: 'Yes', exact: true }).click({ timeout: 60_000 });
    await expect(page.locator('.app-header')).toBeVisible({ timeout: 30_000 });
}

// The in-app floating avatar was removed in 42aee0d; the relay protocol still
// serves the #avatar-panel embed (extension side panel), which is tested here.
test.describe('Assistant avatar relay', () => {
    test('embed receives snapshots and its commands reach the main app', async ({ page }) => {
        await bootToAppShell(page);

        // The embed page (extension-iframe stand-in) in the same context —
        // BroadcastChannel is same-origin, so main <-> embed relay works.
        const embed = await page.context().newPage();
        await embed.goto('/#avatar-panel');

        // Main -> embed: the panel controls only render once a snapshot arrives
        // ("Waiting for connection" until then).
        const goLive = embed.getByRole('button', { name: 'GO LIVE' });
        await expect(goLive).toBeVisible({ timeout: 20_000 });

        // Embed -> main: GO LIVE is relayed as a command; the main app starts a
        // session (no API key in CI -> connecting or error), and the new state
        // must come back to the embed.
        await goLive.click();
        await expect(
            embed.getByRole('button', { name: /END LINK|Connecting/ })
                .or(embed.getByText('Error', { exact: true }))
        ).toBeVisible({ timeout: 15_000 });
    });
});
