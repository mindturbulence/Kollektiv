/**
 * Browser Operator Resolver
 *
 * Selects the right BrowserOperator backend at runtime:
 *   1. CDP (external Chrome via WebSocket) — when connected to a remote browser
 *   2. In-app (synthetic DOM events)       — fallback, always available
 *
 * Tool execute functions call getOperator() instead of branching on
 * externalBrowserService.connected directly.
 */

import type { BrowserOperator, ScreenshotResult } from './browserOperator';
import { browserControlService } from './browserControlService';
import { externalBrowserService } from './externalBrowserService';

let _cachedCdp: CdpBrowserOperatorAdapter | null = null;

/**
 * Lazy adapter that wraps externalBrowserService (object-literal API)
 * into the BrowserOperator interface.
 *
 * We cache the adapter instance so the resolver always returns the same
 * object reference for the CDP backend, avoiding unnecessary re-creation.
 */
class CdpBrowserOperatorAdapter implements BrowserOperator {
    readonly kind = 'cdp' as const;

    get connected(): boolean {
        return externalBrowserService.connected;
    }

    get permissionGranted(): boolean {
        // CDP: permission is implicit when the external browser is connected
        return externalBrowserService.connected;
    }

    async connect(): Promise<void> {
        await externalBrowserService.connect();
    }

    async disconnect(): Promise<void> {
        await externalBrowserService.disconnect();
    }

    setCaptureSize(width: number, height: number): void {
        externalBrowserService.setCaptureSize(width, height);
    }

    async click(nx: number, ny: number): Promise<string> {
        return externalBrowserService.click(nx, ny);
    }

    async doubleClick(nx: number, ny: number): Promise<string> {
        return externalBrowserService.doubleClick(nx, ny);
    }

    async rightClick(nx: number, ny: number): Promise<string> {
        return externalBrowserService.rightClick(nx, ny);
    }

    async hover(nx: number, ny: number): Promise<string> {
        return externalBrowserService.hover(nx, ny);
    }

    async type(text: string): Promise<string> {
        return externalBrowserService.type(text);
    }

    async pressKey(key: string): Promise<string> {
        return externalBrowserService.pressKey(key);
    }

    async scroll(dx: number, dy: number): Promise<string> {
        return externalBrowserService.scroll(dx, dy);
    }

    async scrollTo(frac: number): Promise<string> {
        return externalBrowserService.scrollTo(frac);
    }

    async navigate(url: string): Promise<string> {
        return externalBrowserService.navigate(url);
    }

    async getUrl(): Promise<string> {
        const r = await externalBrowserService.readContent();
        return r.url || '(unknown)';
    }

    async readContent(): Promise<string> {
        const r = await externalBrowserService.readContent();
        if (!r.success) return `Error: ${r.error}`;
        return `Page title: "${r.title}"\nURL: ${r.url}\nContent:\n${r.content}`;
    }

    async readStructure(): Promise<string> {
        return externalBrowserService.readStructure();
    }

    async captureScreenshot(): Promise<{ data: string; width: number; height: number }> {
        // CDP screenshot — called from server.ts via API
        const res = await fetch('/api/cdp/screenshot');
        const data = await res.json();
        if (!data.success) throw new Error(data.error || 'CDP screenshot failed');
        return { data: data.data, width: data.width, height: data.height };
    }

    clickElement(_id: string): Promise<string> {
        // CDP doesn't have data-ai-id elements — redirect to coordinate click
        return Promise.resolve(`Error: CDP external browser does not support data-ai-id element targeting. Use browser_click with coordinates instead. Call browser_read_structure first to see available elements.`);
    }

    selectOption(_id: string, _optionText: string): Promise<string> {
        return Promise.resolve(`Error: CDP external browser does not support data-ai-id select option. Use browser_click with coordinates instead.`);
    }

    // ─── Tab management (CDP only) ──────────────────────────

    async listTabs(): Promise<{ id: string; title: string; url: string }[]> {
        const result = await externalBrowserService.getTargets(9222);
        if (!result.success) return [];
        return (result.targets || []).map(t => ({
            id: t.id,
            title: t.title,
            url: t.url,
        }));
    }

    async openTab(url: string): Promise<{ id: string; title: string }> {
        const result = await externalBrowserService.openTab(url);
        if (!result.success) throw new Error(result.error || 'Failed to open tab');
        return { id: result.targetId || '', title: url };
    }

    async closeTab(id: string): Promise<boolean> {
        const result = await externalBrowserService.closeTab(id);
        return result.success;
    }

    async switchTab(id: string): Promise<string> {
        const result = await externalBrowserService.switchTab(id);
        if (!result.success) throw new Error(result.error || `Failed to switch to tab "${id}".`);
        return result.title || '(untitled)';
    }

    // ─── Advanced gestures (CDP only) ──────────────────────────

    async drag(startNx: number, startNy: number, endNx: number, endNy: number): Promise<string> {
        // Omit captureW/captureH — server defaults to 1024, matching frame encoding
        const result = await externalBrowserService.drag(startNx, startNy, endNx, endNy);
        if (!result.success) throw new Error(result.error || 'Drag failed');
        return result.result || 'Dragged.';
    }

    async uploadFile(cssSelector: string, data: string, filename: string): Promise<string> {
        const result = await externalBrowserService.uploadFile(cssSelector, data, filename);
        if (!result.success) throw new Error(result.error || 'Upload failed');
        return result.result || 'File uploaded.';
    }
}

/**
 * In-app adapter that wraps the existing BrowserControlService singleton
 * into the BrowserOperator interface.
 *
 * The service is always available, so it needs no connect/disconnect logic.
 */
class InAppBrowserOperatorAdapter implements BrowserOperator {
    readonly kind = 'in-app' as const;

    get connected(): boolean {
        return true; // always available when the app is running
    }

    get permissionGranted(): boolean {
        return browserControlService.permissionGranted;
    }

    async connect(): Promise<void> {
        // No-op: already connected to the app's own page
    }

    async disconnect(): Promise<void> {
        // No-op: cannot disconnect from the app's own page
    }

    setCaptureSize(width: number, height: number): void {
        browserControlService.setCaptureSize(width, height);
    }

    async click(nx: number, ny: number): Promise<string> {
        return browserControlService.click(nx, ny);
    }

    async doubleClick(nx: number, ny: number): Promise<string> {
        return browserControlService.doubleClick(nx, ny);
    }

    async rightClick(nx: number, ny: number): Promise<string> {
        return browserControlService.rightClick(nx, ny);
    }

    async hover(nx: number, ny: number): Promise<string> {
        return browserControlService.hover(nx, ny);
    }

    async type(text: string): Promise<string> {
        return browserControlService.type(text);
    }

    async pressKey(key: string): Promise<string> {
        return browserControlService.pressKey(key);
    }

    async scroll(dx: number, dy: number): Promise<string> {
        return browserControlService.scroll(dx, dy);
    }

    async scrollTo(frac: number): Promise<string> {
        return browserControlService.scrollTo(frac);
    }

    async navigate(url: string): Promise<string> {
        return browserControlService.navigate(url);
    }

    async getUrl(): Promise<string> {
        return browserControlService.getUrl();
    }

    async readContent(): Promise<string> {
        return browserControlService.readVisibleContent();
    }

    async readStructure(): Promise<string> {
        return browserControlService.readPageStructure();
    }

    async captureScreenshot(): Promise<{ data: string; width: number; height: number }> {
        // In-app screenshot uses the shared frame cache populated by LiveAssistant
        // during screen sharing. If no frame is available, throw a clear error.
        const cached = getLastInAppScreenshot();
        if (cached.data) {
            return { ...cached };
        }
        throw new Error('captureScreenshot: no screen share frame available. Start screen sharing first.');
    }

    clickElement(id: string): Promise<string> {
        return Promise.resolve(browserControlService.clickElement(id));
    }

    selectOption(id: string, optionText: string): Promise<string> {
        return Promise.resolve(browserControlService.selectOption(id, optionText));
    }
    // Tab methods deliberately NOT implemented — in-app mode cannot manage browser tabs.
    // The assistant tools check `if (!operator.listTabs)` etc. and return a clear error.
}

// ─── Singletons ─────────────────────────────────────────

const _inApp = new InAppBrowserOperatorAdapter();

/**
 * Return the best available BrowserOperator for the current session.
 *
 * Priority:
 *   1. CDP external browser (if connected)
 *   2. In-app browser (always available)
 *
 * The returned object is a stable singleton — safe to compare by reference.
 */
export function getOperator(): { operator: BrowserOperator; warning?: string } {
    if (externalBrowserService.connected) {
        if (!_cachedCdp) _cachedCdp = new CdpBrowserOperatorAdapter();
        return { operator: _cachedCdp };
    }
    return { operator: _inApp };
}

/**
 * Return the in-app operator directly (used by tools that need the
 * data-ai-id targeting regardless of CDP connection state).
 */
export function getInAppOperator(): BrowserOperator {
    return _inApp;
}

// ─── In-app screenshot frame cache ──────────────────────
// LiveAssistant populates this during screen sharing so the
// InAppBrowserOperatorAdapter can return the latest frame.

let _lastInAppFrame: ScreenshotResult = { data: '', width: 0, height: 0 };

/**
 * Store the latest screen-share frame for the in-app operator.
 * Called by LiveAssistant.startVideoFrameLoop on each captured frame.
 */
export function setInAppScreenshotFrame(shot: ScreenshotResult): void {
    _lastInAppFrame = { ...shot };
}

/**
 * Retrieve the cached in-app frame. Returns empty data if none available.
 */
function getLastInAppScreenshot(): ScreenshotResult {
    return _lastInAppFrame;
}
