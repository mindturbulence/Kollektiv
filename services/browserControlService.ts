/**
 * Browser Control Service
 *
 * Lets the assistant interact with the user's browser when screen sharing
 * is active and the user has explicitly granted control permission.
 *
 * All operations dispatch synthetic browser events at coordinate or
 * element level, visible to the page just like real user input.
 *
 * Permission state is stored here and mirrored in LiveAssistantContext.
 * Revoking permission mid-operation is safe — each function checks first.
 */

type PermissionListener = (granted: boolean) => void;

class BrowserControlService {
    private _permissionGranted = false;
    private listeners = new Set<PermissionListener>();

    /** Whether browser control permission is currently granted. */
    get permissionGranted(): boolean {
        return this._permissionGranted;
    }

    /** Grant control permission. Called when the user clicks "Allow" on the
     * permission prompt. */
    grant(): void {
        this._permissionGranted = true;
        this.notify();
    }

    /** Revoke control permission. Called when the user clicks "Release" or
     * stops screen sharing. */
    revoke(): void {
        this._permissionGranted = false;
        this.notify();
    }

    onPermissionChange(fn: PermissionListener): () => void {
        this.listeners.add(fn);
        return () => this.listeners.delete(fn);
    }

    private notify(): void {
        for (const fn of this.listeners) fn(this._permissionGranted);
    }

    // ─── Guard ───────────────────────────────────────────────────

    private assertPermission(): void {
        if (!this._permissionGranted) {
            throw new Error('Browser control permission not granted.');
        }
    }

    // ─── Coordinates: map from scaled capture to real viewport ───

    /** Scale factor used during screen capture (1024 / max dimension). */
    private get captureScale(): number {
        return Math.min(1, 1024 / Math.max(window.innerWidth, window.innerHeight));
    }

    /** Convert capture-relative coordinates (0–1) to absolute viewport px. */
    private captureToViewport(nx: number, ny: number): { x: number; y: number } {
        return {
            x: Math.round(nx / this.captureScale),
            y: Math.round(ny / this.captureScale),
        };
    }

    // ─── Element-level helpers ────────────────────────────────────

    /** Find the topmost element at the given viewport coordinates. */
    private elementAt(x: number, y: number): Element | null {
        // Temporarily disable pointer-events so we can query through overlays.
        const el = document.elementFromPoint(x, y);
        return el && el !== document.documentElement ? el : null;
    }

    /** Scroll ancestors so the element is visible before interacting. */
    private scrollIntoView(el: Element): void {
        if (typeof el.scrollIntoView === 'function') {
            el.scrollIntoView({ block: 'nearest', behavior: 'instant' });
        }
    }

    // ─── Public API ───────────────────────────────────────────────

    /** Click at the given capture-relative coordinates.
     *  nx, ny are fractions 0–1 of the captured frame dimensions. */
    click(nx: number, ny: number): string {
        this.assertPermission();
        const { x, y } = this.captureToViewport(nx, ny);
        const el = this.elementAt(x, y);
        if (el) this.scrollIntoView(el);

        // Dispatch real-looking pointer + mouse + click sequence.
        const opts: MouseEventInit = { bubbles: true, cancelable: true, view: window, clientX: x, clientY: y, button: 0 };
        const target = el || document.body;
        target.dispatchEvent(new PointerEvent('pointerdown', { ...opts, pointerType: 'mouse' }));
        target.dispatchEvent(new MouseEvent('mousedown', opts));
        target.dispatchEvent(new PointerEvent('pointerup', { ...opts, pointerType: 'mouse' }));
        target.dispatchEvent(new MouseEvent('mouseup', opts));
        target.dispatchEvent(new MouseEvent('click', opts));

        const tag = el?.tagName?.toLowerCase() || 'document';
        const id = el?.id ? `#${el.id}` : '';
        const cls = el?.className && typeof el.className === 'string' ? `.${el.className.split(' ').filter(Boolean).slice(0, 2).join('.')}` : '';
        return `Clicked at (${x}, ${y}) → <${tag}${id}${cls}>`;
    }

    /** Double-click at capture-relative coordinates. */
    doubleClick(nx: number, ny: number): string {
        this.assertPermission();
        const { x, y } = this.captureToViewport(nx, ny);
        const el = this.elementAt(x, y);
        if (el) this.scrollIntoView(el);

        const opts: MouseEventInit = { bubbles: true, cancelable: true, view: window, clientX: x, clientY: y, button: 0 };
        const target = el || document.body;
        target.dispatchEvent(new MouseEvent('dblclick', opts));
        return `Double-clicked at (${x}, ${y})`;
    }

    /** Right-click at capture-relative coordinates. */
    rightClick(nx: number, ny: number): string {
        this.assertPermission();
        const { x, y } = this.captureToViewport(nx, ny);
        const el = this.elementAt(x, y);
        if (el) this.scrollIntoView(el);

        const opts: MouseEventInit = { bubbles: true, cancelable: true, view: window, clientX: x, clientY: y, button: 2 };
        const target = el || document.body;
        target.dispatchEvent(new MouseEvent('contextmenu', opts));
        return `Right-clicked at (${x}, ${y})`;
    }

    /** Hover (mouse move) to the given capture-relative coordinates. */
    hover(nx: number, ny: number): string {
        this.assertPermission();
        const { x, y } = this.captureToViewport(nx, ny);
        const el = this.elementAt(x, y);
        const opts: MouseEventInit = { bubbles: true, cancelable: true, view: window, clientX: x, clientY: y };
        (el || document.body).dispatchEvent(new MouseEvent('mousemove', opts));
        return `Hovered at (${x}, ${y})`;
    }

    /** Type text into the currently focused element.
     *  Dispatches individual keydown/keypress/input/keyup events per character
     *  for realistic form filling. */
    type(text: string): string {
        this.assertPermission();
        const el = document.activeElement as HTMLElement | null;
        if (!el) return 'Error: no element is focused. Click somewhere first.';

        const isInput = el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement;
        const isContentEditable = el.isContentEditable;

        if (!isInput && !isContentEditable) {
            // Try dispatching keyboard events anyway — some apps listen for them.
            for (const ch of text) {
                el.dispatchEvent(new KeyboardEvent('keydown', { key: ch, bubbles: true }));
                el.dispatchEvent(new KeyboardEvent('keypress', { key: ch, bubbles: true }));
                el.dispatchEvent(new KeyboardEvent('keyup', { key: ch, bubbles: true }));
            }
            return `Dispatched key events for "${text.slice(0, 100)}" (not a text field — may not appear).`;
        }

        // Insert text into the field.
        const existing = isInput ? (el as HTMLInputElement).value : (el as HTMLElement).textContent || '';
        const start = isInput ? (el as HTMLInputElement).selectionStart ?? existing.length : existing.length;

        if (isInput) {
            const input = el as HTMLInputElement;
            const before = input.value.slice(0, start);
            const after = input.value.slice(input.selectionEnd ?? start);
            input.value = before + text + after;
            const caret = start + text.length;
            input.setSelectionRange(caret, caret);
        } else {
            const editable = el as HTMLElement;
            const sel = window.getSelection();
            if (sel && sel.rangeCount) {
                const range = sel.getRangeAt(0);
                range.deleteContents();
                range.insertNode(document.createTextNode(text));
                range.collapse(false);
            } else {
                editable.textContent = (editable.textContent || '') + text;
            }
        }

        // Dispatch input event so frameworks (React, Vue, etc.) detect the change.
        el.dispatchEvent(new Event('input', { bubbles: true, cancelable: true }));
        el.dispatchEvent(new Event('change', { bubbles: true }));

        return `Typed "${text.slice(0, 200)}"${text.length > 200 ? '…' : ''}.`;
    }

    /** Press a named key (Enter, Tab, Escape, ArrowUp, etc.) on the focused element. */
    pressKey(key: string): string {
        this.assertPermission();
        const validKeys = [
            'Enter', 'Tab', 'Escape', 'Backspace', 'Delete',
            'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight',
            'Home', 'End', 'PageUp', 'PageDown',
            'Shift', 'Control', 'Alt', 'Meta',
            'F1', 'F2', 'F3', 'F4', 'F5', 'F6', 'F7', 'F8', 'F9', 'F10', 'F11', 'F12',
            'CapsLock', 'Space',
        ];
        const k = key.charAt(0).toUpperCase() + key.slice(1);
        if (!validKeys.includes(k) && k.length > 1) return `Error: unknown key "${key}". Valid: ${validKeys.slice(0, 15).join(', ')}…`;

        const opts = { key: k, code: k, bubbles: true, cancelable: true };
        document.activeElement?.dispatchEvent(new KeyboardEvent('keydown', opts));
        document.activeElement?.dispatchEvent(new KeyboardEvent('keypress', opts));
        document.activeElement?.dispatchEvent(new KeyboardEvent('keyup', opts));

        // Special handling for Enter in input/textarea.
        if (k === 'Enter') {
            const el = document.activeElement;
            if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) {
                el.dispatchEvent(new Event('input', { bubbles: true }));
            }
        }

        return `Pressed "${k}".`;
    }

    /** Select text by CSS selector and click it. */
    selectAndClick(cssSelector: string): string {
        this.assertPermission();
        const el = document.querySelector(cssSelector) as HTMLElement;
        if (!el) return `Error: no element found for "${cssSelector}".`;

        this.scrollIntoView(el);
        const rect = el.getBoundingClientRect();
        const cx = rect.left + rect.width / 2;
        const cy = rect.top + rect.height / 2;

        const opts: MouseEventInit = { bubbles: true, cancelable: true, view: window, clientX: cx, clientY: cy, button: 0 };
        el.dispatchEvent(new PointerEvent('pointerdown', { ...opts, pointerType: 'mouse' }));
        el.dispatchEvent(new MouseEvent('mousedown', opts));
        el.dispatchEvent(new PointerEvent('pointerup', { ...opts, pointerType: 'mouse' }));
        el.dispatchEvent(new MouseEvent('mouseup', opts));
        el.dispatchEvent(new MouseEvent('click', opts));

        return `Clicked <${el.tagName.toLowerCase()}${el.id ? `#${el.id}` : ''}${el.className ? `.${el.className.split(' ').filter(Boolean).slice(0, 1)}` : ''}> matching "${cssSelector}".`;
    }

    /** Scroll the page by the given capture-relative delta (0–1). */
    scroll(dx: number, dy: number): string {
        this.assertPermission();
        const factor = 1000; // Scale relative deltas to actual px.
        const sx = Math.round(dx * factor);
        const sy = Math.round(dy * factor);
        window.scrollBy({ left: sx, top: sy, behavior: 'instant' });
        return `Scrolled by (${sx}, ${sy}) px.`;
    }

    /** Scroll to a specific position (fraction 0–1 of total scrollable height). */
    scrollTo(frac: number): string {
        this.assertPermission();
        const maxY = Math.max(0, document.documentElement.scrollHeight - window.innerHeight);
        window.scrollTo({ top: Math.round(maxY * Math.max(0, Math.min(1, frac))), behavior: 'instant' });
        return `Scrolled to ${Math.round(frac * 100)}% of page.`;
    }

    /** Read the visible page content (text nodes in the viewport). */
    readVisibleContent(): string {
        this.assertPermission();
        const textParts: string[] = [];
        const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT, null);
        let node: Text | null;
        while ((node = walker.nextNode() as Text | null)) {
            const t = node.textContent?.trim();
            if (t) textParts.push(t);
        }
        const full = textParts.join('\n');
        return `Page title: "${document.title}"
URL: ${window.location.href}
Content (${full.length} chars):
${full.slice(0, 5000)}${full.length > 5000 ? '\n… (truncated)' : ''}`;
    }

    /** Get structural info about visible elements (headings, links, buttons, inputs). */
    readPageStructure(): string {
        this.assertPermission();
        const tags = ['h1', 'h2', 'h3', 'h4', 'a', 'button', 'input', 'textarea', 'select', '[role="button"]', '[tabindex]'];
        const items: string[] = [];
        for (const sel of tags) {
            const els = document.querySelectorAll(sel);
            for (const el of els) {
                const rect = el.getBoundingClientRect();
                // Only include elements visible in the viewport.
                if (rect.top < window.innerHeight && rect.bottom > 0) {
                    const tag = el.tagName.toLowerCase();
                    const text = (el.textContent || '').trim().slice(0, 60);
                    const id = el.id ? `#${el.id}` : '';
                    const placeholder = (el as HTMLInputElement).placeholder || '';
                    const label = text || placeholder || tag;
                    items.push(`<${tag}${id}> "${label}" at (${Math.round(rect.left)}, ${Math.round(rect.top)}) [${Math.round(rect.width)}×${Math.round(rect.height)}]`);
                }
            }
        }
        return items.slice(0, 100).join('\n') || 'No interactive elements found in viewport.';
    }

    /** Get the current URL. */
    getUrl(): string {
        return window.location.href;
    }

    /** Navigate to a URL. */
    navigate(url: string): string {
        this.assertPermission();
        try {
            new URL(url);
        } catch {
            return `Error: invalid URL "${url}".`;
        }
        window.location.href = url;
        return `Navigating to ${url}…`;
    }
}

export const browserControlService = new BrowserControlService();
