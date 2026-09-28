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
    await page.getByRole('button', { name: 'CONTINUE', exact: true }).click({ timeout: 60_000 });
    await expect(page.locator('.app-header')).toBeVisible({ timeout: 30_000 });
}

// FloatingAssistantAvatar was removed in 42aee0d (Sep 22): replaced by a
// pop-out button on AssistantPage. These tests are skipped until the relay
// protocol is re-tested against the new surface.
test.describe.skip('Assistant avatar relay', () => {
    test('floating avatar widget mounts on the app shell', async ({ page }) => {
        await bootToAppShell(page);
        // Portal-rendered into <body>; identified by its aria-label.
        await expect(page.locator('[aria-label^="Assistant avatar"]')).toBeVisible({ timeout: 10_000 });
    });

    test('embed surface renders and receives relayed snapshots', async ({ page }) => {
        await bootToAppShell(page);

        // The embed page (extension-iframe stand-in) in the same context —
        // BroadcastChannel is same-origin, so main ↔ embed relay works.
        const embed = await page.context().newPage();
        await embed.goto('/#avatar-panel');

        // Panel content is either AWAITING UPLINK (relay not answered yet) or
        // the live panel (GO LIVE button) if a snapshot beat first paint —
        // both prove the surface booted.
        const goLive = embed.getByRole('button', { name: /GO LIVE|END LINK/ });
        const rendered = await Promise.race([
            goLive.waitFor({ timeout: 15_000 }).then(() => 'panel'),
            embed.getByText('AWAITING UPLINK').waitFor({ timeout: 15_000 }).then(() => 'standby'),
            new Promise(r => setTimeout(() => r('nothing'), 15_000)),
        ]);
        expect(rendered).not.toBe('nothing');

        // Relay round-trip: the panel's controls only render once a snapshot
        // has arrived over the channel. If standby showed first, wait for it.
        if (rendered === 'standby') {
            await expect(goLive).toBeVisible({ timeout: 8_000 });
        }

        // Session state propagates main → embed: toggling live in the main
        // app (no API key in CI → error) must flip the embed's button label
        // or surface FAULT within a few seconds.
        //
        // Locator note: FAULT intentionally appears twice in the fault state
        // (sigil status label + "SYSTEM FAULT" message), so a bare getByText
        // would be a strict-mode violation. Pin to the exact sigil label.
        await page.locator('[aria-label^="Assistant avatar"]').click();
        await expect(
            embed.getByRole('button', { name: /END LINK|LINKING/ })
                .or(embed.getByText('FAULT', { exact: true }))
        ).toBeVisible({ timeout: 15_000 });
    });
});
