/**
 * Browser Operator Interface
 *
 * Unified contract for all browser-control backends.
 * The assistant talks to this interface; the resolver picks the right backend.
 *
 * Two implementations:
 *   - InAppBrowserOperator  — synthetic DOM events (page embedded in Kollektiv)
 *   - CdpBrowserOperator    — CDP WebSocket to external Chrome instance
 */

export type BrowserKind = 'in-app' | 'cdp';

export interface ScreenshotResult {
    data: string;        // base64-encoded JPEG (no data: prefix)
    width: number;
    height: number;
}

export interface BrowserOperator {
    /** Which backend this instance represents. */
    readonly kind: BrowserKind;
    /** Whether the backend is currently connected and ready. */
    readonly connected: boolean;
    /** Whether browser control permission has been granted by the user.
     *  In-app: reflects the user's Allow/Revoke choice.
     *  CDP: always true (permission is implicit when the external browser is connected). */
    readonly permissionGranted: boolean;

    // ─── Lifecycle ──────────────────────────────────────────

    connect(): Promise<void>;
    disconnect(): Promise<void>;

    /** Record the pixel size of the encoded frame the assistant sees,
     *  so coordinate mapping is accurate. */
    setCaptureSize(width: number, height: number): void;

    // ─── Pointing (coordinate-based, 0–1024 scaled frame) ───

    click(nx: number, ny: number): Promise<string>;
    doubleClick(nx: number, ny: number): Promise<string>;
    rightClick(nx: number, ny: number): Promise<string>;
    hover(nx: number, ny: number): Promise<string>;

    // ─── Element targeting (data-ai-id lookup) ──────────────

    clickElement(id: string): Promise<string>;
    selectOption(id: string, optionText: string): Promise<string>;

    // ─── Keyboard ───────────────────────────────────────────

    type(text: string): Promise<string>;
    pressKey(key: string): Promise<string>;

    // ─── Scrolling ──────────────────────────────────────────

    scroll(dx: number, dy: number): Promise<string>;
    scrollTo(frac: number): Promise<string>;

    // ─── Navigation ─────────────────────────────────────────

    navigate(url: string): Promise<string>;
    getUrl(): Promise<string>;

    // ─── Reading the page ───────────────────────────────────

    readContent(): Promise<string>;
    readStructure(): Promise<string>;

    // ─── Vision ─────────────────────────────────────────────

    /** Capture a screenshot of the current page as a base64 JPEG. */
    captureScreenshot(): Promise<ScreenshotResult>;

    // ─── Advanced gestures ────────────────────────────────────

    /** Drag from one coordinate to another (simulated mouse drag). */
    drag?(startNx: number, startNy: number, endNx: number, endNy: number): Promise<string>;

    /** Upload a file to a file input element identified by CSS selector.
     *  data is base64-encoded; filename is the visible name. */
    uploadFile?(cssSelector: string, data: string, filename: string): Promise<string>;

    // ─── Tab management (CDP only; in-app returns empty/error) ──

    /** List all open tabs/pages in the browser. */
    listTabs?: () => Promise<{ id: string; title: string; url: string }[]>;
    /** Open a new tab and navigate to the given URL. Returns the tab id. */
    openTab?: (url: string) => Promise<{ id: string; title: string }>;
    /** Close a tab by its id. */
    closeTab?: (id: string) => Promise<boolean>;
    /** Switch the active CDP connection to a different tab by id. */
    switchTab?: (id: string) => Promise<string>;
}
