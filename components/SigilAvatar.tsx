import React, { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { assistantAvatarStore, type AssistantAvatarSnapshot } from '../utils/assistantAvatarStore';
import type { AssistantMode } from '../utils/assistantMode';

const MODE_LABEL: Record<AssistantMode, string> = {
    connecting: 'Connecting...',
    command: 'STANDBY',
    listening: 'RECEIVING',
    processing: 'ANALYZING',
    responding: 'TRANSMITTING',
};

/** Idle mode label — standby is the only mode ever visible when idle. */
const statusLabel = (mode: AssistantMode, status: string): string =>
    status === 'error' ? 'Error' : MODE_LABEL[mode];

/**
 * The Samaritan sigil (triangle from AssistantPage) wrapped in rings that
 * pulse with the assistant's real voice amplitude. Presentational only: it
 * reads the avatar store directly, so it renders identically inside the main
 * React tree, in a Document PiP window root, or in the extension iframe.
 *
 * Audio reactivity is polled per animation frame from the store's live level
 * (fed by voiceLevelService in the main window; relayed via BroadcastChannel
 * in cross-window surfaces) rather than pushed through React state — a
 * re-render per audio chunk would be wasteful.
 */
export const SigilAvatar: React.FC<{ size?: number; snapshot?: AssistantAvatarSnapshot }> = ({ size = 64, snapshot }) => {
    // Direct-store subscription ONLY when no snapshot is passed. Cross-realm
    // surfaces (extension side panel iframe) must pass their relayed snapshot
    // down: the store singleton in that realm is a forever-default idle copy
    // because the bridge lives in the main window.
    const storeSnap = useSyncExternalStore(
        assistantAvatarStore.subscribe,
        assistantAvatarStore.getSnapshot,
        assistantAvatarStore.getSnapshot,
    );
    const snap = snapshot ?? storeSnap;
    const [level, setLevel] = useState(0);
    const rafRef = useRef(0);

    // Per-frame amplitude → ring scale. Store subscribe re-renders on state
    // changes; this loop only re-renders when amplitude meaningfully moves.
    // rAF is resolved from the element's OWN document: when rendered in a
    // Document PiP window, the main window's rAF throttles to 0 while the
    // Kollektiv tab is hidden — which is exactly when the pop-out avatar is
    // on screen. The PiP window's rAF keeps ticking while it is visible.
    const hostRef = useRef<HTMLDivElement>(null);
    // Cross-realm surfaces get level only via the relayed snapshot — this
    // realm's store is never fed, so getLevel() would read 0 forever.
    const snapshotRef = useRef(snapshot);
    snapshotRef.current = snapshot;
    useEffect(() => {
        const win = hostRef.current?.ownerDocument?.defaultView
            ?? (typeof window !== 'undefined' ? window : null);
        if (!win) return;
        const loop = () => {
            const lvl = snapshotRef.current?.level ?? assistantAvatarStore.getLevel();
            setLevel(prev => (Math.abs(lvl - prev) > 0.01 ? lvl : prev));
            rafRef.current = win.requestAnimationFrame(loop);
        };
        rafRef.current = win.requestAnimationFrame(loop);
        return () => win.cancelAnimationFrame(rafRef.current);
    }, []);

    const active = snap.status === 'live';
    const ringScale = 1 + level * 0.45;
    const ringOpacity = active ? 0.25 + level * 0.75 : 0.12;

    return (
        <div
            ref={hostRef}
            className="relative flex items-center justify-center select-none"
            style={{ width: size, height: size }}
            role="img"
            aria-label={`Assistant ${statusLabel(snap.mode, snap.status)}`}
        >
            {/* Voice-reactive rings */}
            <div
                className="absolute inset-0 rounded-full border border-primary transition-transform duration-75"
                style={{
                    transform: `scale(${ringScale})`,
                    opacity: ringOpacity,
                }}
            />
            <div
                className="absolute rounded-full border border-primary/60 transition-transform duration-100"
                style={{
                    inset: Math.round(size * 0.14),
                    transform: `scale(${1 + level * 0.25})`,
                    opacity: active ? 0.3 + level * 0.6 : 0.1,
                }}
            />

            {/* The sigil itself — mirrors AssistantPage's Sigil */}
            <div
                className={`w-0 h-0 border-l-[10px] border-r-[10px] border-b-[16px] border-l-transparent border-r-transparent transition-opacity duration-300 ${
                    snap.status === 'error' ? 'border-b-error' : 'border-b-primary'
                }`}
                style={{ opacity: snap.status === 'error' ? 0.4 : active ? 1 : 0.55 }}
            />

            {snap.status === 'error' && (
                <div className="absolute inset-0 rounded-full border border-error/60" />
            )}

            {/* Mode label (hidden at small sizes) */}
            {size >= 56 && (
                <span className="absolute -bottom-4 whitespace-nowrap font-mono text-[8px] tracking-[0.25em] uppercase text-primary/70">
                    {statusLabel(snap.mode, snap.status)}
                </span>
            )}
        </div>
    );
};

export default SigilAvatar;
