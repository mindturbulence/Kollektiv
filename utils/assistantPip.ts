/**
 * Assistant Pop-Out (Document Picture-in-Picture)
 *
 * Opens the floating always-on-top avatar window:
 *  - Chromium 116+ and Firefox 151+ support the Document PiP API — the window
 *    is always-on-top across tabs AND other applications.
 *  - Safari / older Firefox: not supported → callers should hide the control
 *    (isPipSupported()) rather than degrade to video-PiP, which freezes the
 *    moment the main tab is backgrounded (rAF throttling) — worse than
 *    nothing for an always-visible avatar.
 *
 * The PiP document shares the opener's JS realm, so the mounted React root
 * reads assistantAvatarStore / voiceLevelService directly — no relay needed.
 *
 * Gotchas handled here (per the Document PiP spec):
 *  - requestWindow() MUST run inside a user gesture (button click).
 *  - Only one PiP window is allowed — a second call focuses the existing one.
 *  - Styles do NOT carry over: every <style>/<link> is cloned into the PiP
 *    document, plus the data-theme attribute so daisyUI tokens resolve.
 *  - The window is unmounted on 'pagehide' (user closed it) to release the
 *    React root and stop its rAF loops.
 */

import React from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { AssistantAvatarPanel } from '../components/AssistantAvatarPanel';

interface DocumentPictureInPicture {
    readonly window: Window | null;
    requestWindow(options?: { width?: number; height?: number; disallowReturnToOpener?: boolean }): Promise<Window>;
}

declare global {
    interface Window {
        documentPictureInPicture?: DocumentPictureInPicture;
    }
}

export function isPipSupported(): boolean {
    return typeof window !== 'undefined' && 'documentPictureInPicture' in window;
}

let pipRoot: Root | null = null;

/** Open (or focus) the always-on-top avatar window. Must be called from a
 *  user gesture. Resolves once the panel is mounted. */
export async function openAssistantPip(): Promise<Window> {
    const dpip = window.documentPictureInPicture;
    if (!dpip) throw new Error('Document Picture-in-Picture not supported in this browser.');

    // Only one PiP window is allowed — focus instead of throwing.
    if (dpip.window) {
        dpip.window.focus();
        return dpip.window;
    }

    const pipWindow = await dpip.requestWindow({
        width: 240,
        height: 320,
        disallowReturnToOpener: false,
    });

    copyAppStyles(pipWindow);
    copyAppTheme(pipWindow);

    // Separate React root — the main tree's contexts don't reach this document.
    // The panel reads the store singleton directly (shared realm).
    pipRoot = createRoot(pipWindow.document.body);
    pipRoot.render(React.createElement(AssistantAvatarPanel, { surface: 'pip' }));

    pipWindow.addEventListener('pagehide', () => {
        pipRoot?.unmount();
        pipRoot = null;
    });

    return pipWindow;
}

/**
 * Clone every stylesheet from the app document into the PiP document.
 * - <style> tags (Vite dev injects these): cloned verbatim.
 * - <link rel=stylesheet> (production build): cloned by href — same-origin,
 *   so the PiP document fetches the same CSS.
 * Inline style attributes on <html>/<body> are copied too (theme scripts).
 */
function copyAppStyles(pipWindow: Window): void {
    try {
        // <style> elements first.
        for (const styleEl of Array.from(document.querySelectorAll('style'))) {
            pipWindow.document.head.appendChild(styleEl.cloneNode(true));
        }
        // Stylesheet <link>s.
        for (const linkEl of Array.from(document.querySelectorAll('link[rel="stylesheet"]'))) {
            pipWindow.document.head.appendChild(linkEl.cloneNode(true));
        }
    } catch (e) {
        console.warn('[AssistantPip] style copy failed:', (e as Error)?.message);
    }
}

/** Mirror the app's daisyUI theme attribute so theme tokens (--p, base colors)
 *  resolve inside the PiP document. Also observed live: switching themes in
 *  the app re-themes the avatar window. */
function copyAppTheme(pipWindow: Window): void {
    const apply = () => {
        const theme = document.documentElement.getAttribute('data-theme');
        if (theme) pipWindow.document.documentElement.setAttribute('data-theme', theme);
        // Body classes carry font stacks / base colors in some themes.
        pipWindow.document.body.className = document.body.className;
    };
    apply();
    try {
        const observer = new MutationObserver(apply);
        observer.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
        pipWindow.addEventListener('pagehide', () => observer.disconnect(), { once: true });
    } catch { /* observation is best-effort */ }
}
