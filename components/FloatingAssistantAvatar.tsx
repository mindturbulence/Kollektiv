import React, { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { audioService } from '../services/audioService';
import { useLiveAssistantContext } from '../contexts/LiveAssistantContext';
import { assistantAvatarStore, type AssistantAvatarSnapshot } from '../utils/assistantAvatarStore';
import { useSyncExternalStore } from 'react';
import SigilAvatar from './SigilAvatar';
import { isPipSupported, openAssistantPip } from '../utils/assistantPip';
import useLocalStorage from '../utils/useLocalStorage';

const POS_KEY = 'assistantAvatarPos';
const DRAG_THRESHOLD_PX = 4;

interface AvatarPos { x: number; y: number }

/** Clamp a position so the avatar stays fully on-screen (viewport-relative). */
const clampToViewport = (x: number, y: number, w: number, h: number): AvatarPos => {
    const maxX = Math.max(0, window.innerWidth - w);
    const maxY = Math.max(0, window.innerHeight - h);
    return {
        x: Math.min(Math.max(0, x), maxX),
        y: Math.min(Math.max(0, y), maxY),
    };
};

/**
 * In-app floating assistant avatar. Always-on-screen sigil orb: click toggles
 * the live voice session (mirrors Ctrl+Space), drag repositions it (persisted),
 * hover reveals the pop-out control (Document PiP — always-on-top mini window).
 * Hidden on the fullscreen assistant page, which is the avatar's "expanded" form.
 *
 * Renders outside the React tree via portal but reads session state through
 * the store (kept fresh by AssistantAvatarBridge) rather than the context —
 * identical behavior to the PiP/embed surfaces.
 */
export const FloatingAssistantAvatar: React.FC<{ hidden?: boolean }> = ({ hidden = false }) => {
    const { toggleLive } = useLiveAssistantContext();
    const snap: AssistantAvatarSnapshot = useSyncExternalStore(
        assistantAvatarStore.subscribe,
        assistantAvatarStore.getSnapshot,
        assistantAvatarStore.getSnapshot,
    );
    const [pos, setPos] = useLocalStorage<AvatarPos>(POS_KEY, { x: 24, y: 120 });
    const [dragging, setDragging] = useState(false);
    const [hovered, setHovered] = useState(false);

    const ref = useRef<HTMLDivElement>(null);
    const dragState = useRef({
        pointerId: -1,
        startX: 0,
        startY: 0,
        originX: 0,
        originY: 0,
        moved: false,
    });

    // Clamp on mount (saved position may come from a larger screen) and on
    // resize, so the avatar can't end up off-screen.
    useEffect(() => {
        const onResize = () => {
            setPos(p => clampToViewport(p.x, p.y, 64, 64));
        };
        onResize();
        window.addEventListener('resize', onResize);
        return () => window.removeEventListener('resize', onResize);
    }, [setPos]);

    const onPointerDown = useCallback((e: React.PointerEvent) => {
        if (e.button !== 0) return;
        const rect = ref.current?.getBoundingClientRect();
        if (!rect) return;
        dragState.current = {
            pointerId: e.pointerId,
            startX: e.clientX,
            startY: e.clientY,
            originX: rect.left,
            originY: rect.top,
            moved: false,
        };
        (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
        setDragging(true);
    }, []);

    const onPointerMove = useCallback((e: React.PointerEvent) => {
        const d = dragState.current;
        if (d.pointerId !== e.pointerId) return;
        const dx = e.clientX - d.startX;
        const dy = e.clientY - d.startY;
        if (!d.moved && Math.hypot(dx, dy) < DRAG_THRESHOLD_PX) return;
        d.moved = true;
        const next = clampToViewport(d.originX + dx, d.originY + dy, 64, 64);
        // Direct DOM write during drag — React state per mousemove jitters.
        if (ref.current) {
            ref.current.style.left = `${next.x}px`;
            ref.current.style.top = `${next.y}px`;
        }
    }, []);

    const endDrag = useCallback((e: React.PointerEvent) => {
        const d = dragState.current;
        if (d.pointerId !== e.pointerId) return;
        dragState.current = { ...d, pointerId: -1 };
        setDragging(false);
        if (d.moved) {
            // Persist wherever the drag ended (read from the live rect — the
            // DOM write above bypassed state).
            const rect = ref.current?.getBoundingClientRect();
            if (rect) setPos(clampToViewport(rect.left, rect.top, 64, 64));
        } else {
            // A click, not a drag — toggle the voice session.
            audioService.playClick();
            toggleLive();
        }
    }, [setPos, toggleLive]);

    const popOut = useCallback(async () => {
        audioService.playClick();
        try {
            await openAssistantPip();
        } catch (err) {
            console.warn('[AssistantAvatar] pop-out failed:', (err as Error)?.message);
        }
    }, []);

    if (typeof document === 'undefined' || hidden) return null;

    const active = snap.status === 'live' || snap.status === 'connecting';
    const showActions = hovered || dragging;

    return createPortal(
        <div
            ref={ref}
            className={`fixed z-[1500] group ${dragging ? 'cursor-grabbing' : 'cursor-grab'}`}
            style={{
                left: pos.x,
                top: pos.y,
                width: 64,
                touchAction: 'none',
                transition: dragging ? 'none' : 'left 0.2s ease, top 0.2s ease',
            }}
            role="button"
            tabIndex={0}
            aria-label={`Assistant avatar — ${active ? 'end live session' : 'start live session'} (drag to move)`}
            title={active ? 'End Live (Ctrl+Space) — drag to move' : 'Go Live (Ctrl+Space) — drag to move'}
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={endDrag}
            onPointerCancel={endDrag}
            onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    audioService.playClick();
                    toggleLive();
                }
            }}
            onMouseEnter={() => setHovered(true)}
            onMouseLeave={() => setHovered(false)}
        >
            <div className={active ? '' : 'opacity-60 hover:opacity-100 transition-opacity'}>
                <SigilAvatar size={64} />
            </div>

            {/* Pop-out control — hover-revealed, only where Document PiP exists */}
            {isPipSupported() && showActions && (
                <button
                    onClick={(e) => { e.stopPropagation(); void popOut(); }}
                    onPointerDown={(e) => e.stopPropagation()}
                    className="absolute -top-2 -right-2 z-10 px-1.5 py-0.5 bg-base-300/95 border border-primary/40
                               text-[8px] font-mono uppercase tracking-[0.2em] text-primary
                               hover:bg-primary/20 cursor-pointer"
                    title="Pop out — always-on-top mini avatar"
                >
                    POP
                </button>
            )}
        </div>,
        document.body,
    );
};

export default FloatingAssistantAvatar;
