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
    /** Actual pixel size of the last captured frame, set by liveAssistantService
     *  so coordinate mapping uses the real encoded frame — not a guess derived
     *  from window.innerWidth/innerHeight, which can diverge from it. */
    private captureW = 0;
    private captureH = 0;

    /** Whether browser control permission is currently granted. */
    get permissionGranted(): boolean {
        return this._permissionGranted;
    }

    /** Grant control permission. Called when the user clicks "Allow" on the
     * permission prompt. */
    grant(): void {
        if (this._permissionGranted) return;
        console.debug('[BrowserControl] grant');
        this._permissionGranted = true;
        this.notify();
    }

    /** Revoke control permission. Called when the user clicks "Release" or
     * stops screen sharing. */
    revoke(): void {
        if (!this._permissionGranted) return;
        console.debug('[BrowserControl] revoke');
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

    /** Called by liveAssistantService each time it encodes a frame, so
     *  captureToViewport maps against the real captured pixel size instead of
     *  re-deriving it from window.innerWidth/innerHeight (wrong whenever the
     *  device pixel ratio isn't 1, or CSS viewport size is < 1024px). */
    setCaptureSize(width: number, height: number): void {
        this.captureW = width;
        this.captureH = height;
    }

    /** The capture canvas the assistant sees is scaled to max 1024px on the
     *  longest side (see startScreenShare in liveAssistantService.ts). Coordinates
     *  are ALWAYS absolute pixels within that scaled frame — no fraction mode,
     *  no auto-detection. (Coordinate clicking is now a canvas-only fallback;
     *  DOM targets go through clickElement/data-ai-id, which needs no mapping
     *  at all.) Clamped to [0, 1] after normalisation so out-of-range values
     *  never produce negative or overshoot viewport coordinates. */
    private captureToViewport(px: number, py: number): { x: number; y: number } {
        const capW = this.captureW || window.innerWidth;
        const capH = this.captureH || window.innerHeight;
        const normX = Math.max(0, Math.min(1, capW > 0 ? px / capW : px));
        const normY = Math.max(0, Math.min(1, capH > 0 ? py / capH : py));
        return {
            x: Math.round(normX * window.innerWidth),
            y: Math.round(normY * window.innerHeight),
        };
    }

    // ─── Element-level helpers ────────────────────────────────────

    /** Tags that indicate an element is likely an interactive overlay / popup. */
    private static OVERLAY_SKIP = ['screen-control-overlay', 'assistant-fault', 'toast', 'modal', 'popup', 'dropdown'];

    /** Find the best clickable element at viewport coordinates, skipping known
     *  overlays by walking up from the hit element and preferring interactives. */
    private elementAt(x: number, y: number): Element | null {
        // elementsFromPoint not supported in older browsers; fallback to elementFromPoint.
        const elementsAt = (typeof document.elementsFromPoint === 'function')
            ? document.elementsFromPoint(x, y)
            : [document.elementFromPoint(x, y)].filter(Boolean) as Element[];
        // First pass: find the first interactive element (button, a, input, etc.).
        for (const el of elementsAt) {
            if (el === document.documentElement || el === document.body) continue;
            // Skip elements that are part of known overlays.
            const cls = (el as HTMLElement).className || '';
            if (typeof cls === 'string' &&
                BrowserControlService.OVERLAY_SKIP.some(k => cls.includes(k))) continue;
            const tag = el.tagName.toLowerCase();
            if (['button', 'a', 'input', 'textarea', 'select', 'label'].includes(tag)) return el;
            if (el.getAttribute('role') === 'button' || el.getAttribute('tabindex') !== null) return el;
        }
        // Second pass: first non-overlay, non-root element.
        for (const el of elementsAt) {
            if (el === document.documentElement || el === document.body) continue;
            const cls = (el as HTMLElement).className || '';
            if (typeof cls === 'string' &&
                BrowserControlService.OVERLAY_SKIP.some(k => cls.includes(k))) continue;
            return el;
        }
        // Fallback.
        return document.elementFromPoint(x, y);
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
        const pointerId = 1;
        const ptrOpts: PointerEventInit = { bubbles: true, cancelable: true, view: window, clientX: x, clientY: y, button: 0, pointerId, pointerType: 'mouse' };
        const mouseOpts: MouseEventInit = { bubbles: true, cancelable: true, view: window, clientX: x, clientY: y, button: 0 };
        const target = el || document.body;
        target.dispatchEvent(new PointerEvent('pointerdown', ptrOpts));
        target.dispatchEvent(new MouseEvent('mousedown', mouseOpts));
        // Focus the element after mousedown — synthetic events don't trigger
        // automatic focus like real user interaction does.
        if (el && typeof (el as HTMLElement).focus === 'function') {
            (el as HTMLElement).focus();
        }
        target.dispatchEvent(new PointerEvent('pointerup', ptrOpts));
        target.dispatchEvent(new MouseEvent('mouseup', mouseOpts));
        target.dispatchEvent(new MouseEvent('click', mouseOpts));

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

        const mouseOpts: MouseEventInit = { bubbles: true, cancelable: true, view: window, clientX: x, clientY: y, button: 0 };
        const target = el || document.body;
        if (el && typeof (el as HTMLElement).focus === 'function') {
            (el as HTMLElement).focus();
        }
        target.dispatchEvent(new MouseEvent('dblclick', mouseOpts));
        return `Double-clicked at (${x}, ${y})`;
    }

    /** Right-click at capture-relative coordinates. */
    rightClick(nx: number, ny: number): string {
        this.assertPermission();
        const { x, y } = this.captureToViewport(nx, ny);
        const el = this.elementAt(x, y);
        if (el) this.scrollIntoView(el);

        const mouseOpts: MouseEventInit = { bubbles: true, cancelable: true, view: window, clientX: x, clientY: y, button: 2 };
        const target = el || document.body;
        if (el && typeof (el as HTMLElement).focus === 'function') {
            (el as HTMLElement).focus();
        }
        target.dispatchEvent(new MouseEvent('contextmenu', mouseOpts));
        return `Right-clicked at (${x}, ${y})`;
    }

    /** Hover (mouse move) to the given capture-relative coordinates. */
    hover(nx: number, ny: number): string {
        this.assertPermission();
        const { x, y } = this.captureToViewport(nx, ny);
        const el = this.elementAt(x, y);
        const target = el || document.body;
        const opts: MouseEventInit = { bubbles: true, cancelable: true, view: window, clientX: x, clientY: y };
        target.dispatchEvent(new MouseEvent('mousemove', opts));
        target.dispatchEvent(new MouseEvent('mouseenter', opts));
        target.dispatchEvent(new MouseEvent('mouseover', opts));
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
        if (isInput) {
            const input = el as HTMLInputElement;
            const start = input.selectionStart ?? input.value.length;
            const before = input.value.slice(0, start);
            const after = input.value.slice(input.selectionEnd ?? start);
            const newValue = before + text + after;
            const caret = start + text.length;

            // Use the native value setter so React's controlled-input detection fires.
            // Setting `input.value` directly bypasses React's property descriptor
            // patch — React polls the native setter to detect changes in 18+.
            const nativeSetter = Object.getOwnPropertyDescriptor(
                window.HTMLInputElement.prototype, 'value'
            )?.set;
            if (nativeSetter) {
                nativeSetter.call(input, newValue);
            } else {
                input.value = newValue;
            }
            input.setSelectionRange(caret, caret);
        } else if (isContentEditable) {
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

    /** Press a named key (Enter, Tab, Escape, ArrowUp, etc.) or combinations (Control+C, Control+V) on the focused element. */
    async pressKey(key: string): Promise<string> {
        this.assertPermission();
        
        const parts = key.split('+').map(k => k.trim().toLowerCase());
        const mainKeyRaw = parts.pop() || '';
        
        const validKeys = [
            'Enter', 'Tab', 'Escape', 'Backspace', 'Delete',
            'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight',
            'Home', 'End', 'PageUp', 'PageDown',
            'Shift', 'Control', 'Alt', 'Meta',
            'F1', 'F2', 'F3', 'F4', 'F5', 'F6', 'F7', 'F8', 'F9', 'F10', 'F11', 'F12',
            'CapsLock', 'Space',
        ];
        
        let k = mainKeyRaw.charAt(0).toUpperCase() + mainKeyRaw.slice(1);
        if (mainKeyRaw.length === 1) {
            k = mainKeyRaw.toLowerCase();
        } else if (!validKeys.includes(k)) {
            return `Error: unknown key "${mainKeyRaw}". Valid: ${validKeys.slice(0, 15).join(', ')}…`;
        }

        const ctrlKey = parts.includes('control') || parts.includes('ctrl');
        const shiftKey = parts.includes('shift');
        const altKey = parts.includes('alt');
        const metaKey = parts.includes('meta') || parts.includes('command') || parts.includes('cmd');

        if ((ctrlKey || metaKey) && mainKeyRaw === 'c') {
            try {
                const el = document.activeElement;
                let textToCopy = '';
                if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) {
                    textToCopy = el.value.substring(el.selectionStart || 0, el.selectionEnd || 0);
                } else {
                    textToCopy = window.getSelection()?.toString() || '';
                }
                if (textToCopy) {
                    await navigator.clipboard.writeText(textToCopy);
                } else {
                    document.execCommand('copy');
                }
                return `Pressed "${key}" and copied text to clipboard.`;
            } catch (e) {
                // Ignore errors and fall through to dispatching the event
            }
        }
        
        if ((ctrlKey || metaKey) && mainKeyRaw === 'v') {
            try {
                const text = await navigator.clipboard.readText();
                if (text) {
                    this.type(text);
                    return `Pressed "${key}" and pasted text from clipboard.`;
                }
            } catch (e) {
                // Ignore errors and fall through to dispatching the event
            }
        }

        const opts = { key: k, code: k, bubbles: true, cancelable: true, ctrlKey, shiftKey, altKey, metaKey };
        document.activeElement?.dispatchEvent(new KeyboardEvent('keydown', opts));
        document.activeElement?.dispatchEvent(new KeyboardEvent('keypress', opts));
        document.activeElement?.dispatchEvent(new KeyboardEvent('keyup', opts));

        // Special handling for Enter in input/textarea.
        if (k === 'Enter') {
            const el = document.activeElement;
            if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) {
                el.dispatchEvent(new Event('input', { bubbles: true }));
            }
            // Synthetic Enter never triggers native form submission (browsers
            // require a trusted event) — request it explicitly so "type then
            // press Enter" actually submits.
            const form = (el as HTMLElement | null)?.closest?.('form');
            if (form instanceof HTMLFormElement) form.requestSubmit();
        }

        return `Pressed "${key}".`;
    }

    /** Click a UI control by its `data-ai-id` (see readPageStructure output).
     *  This is the PRIMARY click path — it targets a real element directly,
     *  no coordinate estimation or capture/viewport mapping involved. Looked
     *  up live via querySelector each call, so there is no cache to go stale. */
    clickElement(id: string): string {
        this.assertPermission();
        const selector = `[data-ai-id="${CSS.escape(id)}"]`;
        if (!document.querySelector(selector)) {
            return `Error: no element with id "${id}". Call browser_read_structure to see current ids.`;
        }
        return this.selectAndClick(selector);
    }

    /** Set a native <select>'s value by its `data-ai-id` and visible option text.
     *  Synthetic mouse/keyboard events cannot open a native dropdown's OS-level
     *  popup, so browser_click/click_element can never pick an option — the
     *  value must be set directly through React's native setter. */
    selectOption(id: string, optionText: string): string {
        this.assertPermission();
        const el = document.querySelector(`[data-ai-id="${CSS.escape(id)}"]`) as HTMLSelectElement | null;
        if (!el) return `Error: no element with id "${id}". Call browser_read_structure to see current ids.`;
        if (el.tagName.toLowerCase() !== 'select') return `Error: element "${id}" is not a <select>.`;

        const match = Array.from(el.options).find(o =>
            o.textContent?.trim().toLowerCase() === optionText.trim().toLowerCase()
        );
        if (!match) {
            const available = Array.from(el.options).map(o => o.textContent?.trim()).filter(Boolean).join(', ');
            return `Error: no option "${optionText}" in "${id}". Available: ${available}`;
        }

        const nativeSetter = Object.getOwnPropertyDescriptor(
            window.HTMLSelectElement.prototype, 'value'
        )?.set;
        if (nativeSetter) nativeSetter.call(el, match.value);
        else el.value = match.value;
        el.dispatchEvent(new Event('input', { bubbles: true, cancelable: true }));
        el.dispatchEvent(new Event('change', { bubbles: true }));

        return `Selected "${match.textContent?.trim()}" in "${id}".`;
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

        const pointerId = 1;
        const ptrOpts: PointerEventInit = { bubbles: true, cancelable: true, view: window, clientX: cx, clientY: cy, button: 0, pointerId, pointerType: 'mouse' };
        const mouseOpts: MouseEventInit = { bubbles: true, cancelable: true, view: window, clientX: cx, clientY: cy, button: 0 };
        el.dispatchEvent(new PointerEvent('pointerdown', ptrOpts));
        el.dispatchEvent(new MouseEvent('mousedown', mouseOpts));
        if (typeof el.focus === 'function') el.focus();
        el.dispatchEvent(new PointerEvent('pointerup', ptrOpts));
        el.dispatchEvent(new MouseEvent('mouseup', mouseOpts));
        el.dispatchEvent(new MouseEvent('click', mouseOpts));

        return `Clicked <${el.tagName.toLowerCase()}${el.id ? `#${el.id}` : ''}${el.className ? `.${el.className.split(' ').filter(Boolean).slice(0, 1)}` : ''}> matching "${cssSelector}".`;
    }

    /** Find the actual scrollable container under the given viewport point.
     *  This app shell is a fixed-viewport SPA (root + <main> are overflow-hidden
     *  — see App.tsx) — window/document never scrolls, each page owns its own
     *  overflow-y-auto region, so scrolling must target that element, not window. */
    private scrollableAt(x: number, y: number): Element | null {
        let el: Element | null = document.elementFromPoint(x, y);
        while (el && el !== document.documentElement) {
            const style = getComputedStyle(el);
            if (/(auto|scroll|overlay)/.test(style.overflowY) && el.scrollHeight > el.clientHeight + 1) return el;
            el = el.parentElement;
        }
        return null;
    }

    /** Scroll the page by the given capture-relative delta (0–1). */
    scroll(dx: number, dy: number): string {
        this.assertPermission();
        const factor = 1000; // Scale relative deltas to actual px.
        const sx = Math.round(dx * factor);
        const sy = Math.round(dy * factor);
        const target = this.scrollableAt(window.innerWidth / 2, window.innerHeight / 2);
        if (target) target.scrollBy({ left: sx, top: sy, behavior: 'instant' });
        else window.scrollBy({ left: sx, top: sy, behavior: 'instant' });
        return `Scrolled by (${sx}, ${sy}) px.`;
    }

    /** Scroll to a specific position (fraction 0–1 of total scrollable height). */
    scrollTo(frac: number): string {
        this.assertPermission();
        const f = Math.max(0, Math.min(1, frac));
        const target = this.scrollableAt(window.innerWidth / 2, window.innerHeight / 2);
        if (target) {
            const maxY = Math.max(0, target.scrollHeight - target.clientHeight);
            target.scrollTop = Math.round(maxY * f);
        } else {
            const maxY = Math.max(0, document.documentElement.scrollHeight - window.innerHeight);
            window.scrollTo({ top: Math.round(maxY * f), behavior: 'instant' });
        }
        return `Scrolled to ${Math.round(f * 100)}% of page.`;
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

    /** Get structural info about visible elements (headings, links, buttons, inputs).
     *  Elements tagged with `data-ai-id` are shown with their id in brackets —
     *  pass that id straight to browser_click_element / browser_select_option.
     *  No pixel positions are reported: this list is deliberately incompatible
     *  with browser_click's coordinate args, so the model can't feed one tool's
     *  output into the other and silently click the wrong spot. */
    readPageStructure(): string {
        this.assertPermission();
        const tags = ['h1', 'h2', 'h3', 'h4', 'a', 'button', 'input', 'textarea', 'select', '[role="button"]', '[tabindex]', '[data-ai-id]'];
        const seen = new Set<Element>();
        const items: string[] = [];
        for (const sel of tags) {
            const els = document.querySelectorAll(sel);
            for (const el of els) {
                if (seen.has(el)) continue;
                const rect = el.getBoundingClientRect();
                // Only include elements visible in the viewport.
                if (rect.top < window.innerHeight && rect.bottom > 0 && rect.width > 0) {
                    seen.add(el);
                    const tag = el.tagName.toLowerCase();
                    const text = (el.textContent || '').trim().slice(0, 60);
                    const placeholder = (el as HTMLInputElement).placeholder || '';
                    const label = text || placeholder || tag;
                    const aiId = (el as HTMLElement).dataset?.aiId;
                    const ref = aiId ? `[${aiId}]` : '(no id — use browser_click coordinates)';
                    items.push(`${ref} <${tag}> "${label}"`);
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
