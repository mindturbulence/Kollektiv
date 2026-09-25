import { useCallback, useRef } from 'react';
import type { RefObject } from 'react';
import type { ActiveTab } from '../../types';
import { audioService } from '../../services/audioService';
import { resolveFx, prefersReducedMotion, crossfade, FX_META, ROUTE_LABELS, type FxKind } from './routeFx';
import type { TransitionOverlayHandle } from './TransitionOverlay';

type Phase = 'idle' | 'covering' | 'holding' | 'revealing';

interface DirectorOpts {
    overlayRef: RefObject<TransitionOverlayHandle | null>;
    contentRef: RefObject<HTMLDivElement | null>;
    getActiveTab: () => ActiveTab;
    /** Commits the navigation: sets fx kind + activeTab in one React batch. */
    commit: (tab: ActiveTab, kind: FxKind) => void;
}

/**
 * Context Shift Engine — director.
 * Owns the cover -> commit -> hold -> reveal sequence and the interruption policy:
 * re-navigation before commit retargets in place; re-navigation during the reveal
 * fast-paths through the crossfade instead of chaining a second cinematic.
 * The latest destination always wins.
 *
 * M1 (review #1): the full cinematic plays only on the FIRST visit to each
 * module per session (visited set); repeat visits crossfade in 150 ms. The
 * retimed geometries put the cinematic at about 650 ms total.
 */
export const useTransitionDirector = (opts: DirectorOpts) => {
    const phaseRef = useRef<Phase>('idle');
    const pendingRef = useRef<ActiveTab | null>(null);
    const enterTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const visitedRef = useRef<Set<ActiveTab>>(new Set());

    // Opts live in a ref so navigate/run stay referentially stable across renders
    // (the appEventBus subscription depends on that stability).
    const optsRef = useRef(opts);
    optsRef.current = opts;

    const clearEnterFx = useCallback(() => {
        if (enterTimerRef.current) { clearTimeout(enterTimerRef.current); enterTimerRef.current = null; }
        optsRef.current.contentRef.current?.removeAttribute('data-fx');
    }, []);

    /** Never let a stuck overlay promise wedge the director (review #4): if a
     *  timeline is killed (unmount/HMR/abort) its onComplete never fires, so
     *  every await races a generous deadline. The overlay finishing normally
     *  always wins the race; the deadline only exists to un-wedge. */
    const withDeadline = useCallback(<T,>(p: Promise<T>, ms: number): Promise<T> =>
        new Promise<T>((resolve, reject) => {
            let settled = false;
            const timer = setTimeout(() => { if (!settled) { settled = true; reject(new Error('transition deadline')); } }, ms);
            p.then(
                (v) => { if (!settled) { settled = true; clearTimeout(timer); resolve(v); } },
                (e) => { if (!settled) { settled = true; clearTimeout(timer); reject(e); } },
            );
        }), []);

    const run = useCallback(async (tab: ActiveTab) => {
        const { overlayRef, contentRef, getActiveTab, commit } = optsRef.current;
        try {
            const from = getActiveTab();
            const kind = resolveFx(from, tab);
            const visited = visitedRef.current;

            // Repeat visit, sibling workspace switch, or reduced motion: no
            // cinematic. Repeat visits fade the content in 150 ms first so the
            // AnimatePresence swap happens while nothing is visible.
            if (kind === 'context-switch' || prefersReducedMotion() || visited.has(tab)) {
                phaseRef.current = 'revealing';
                if (visited.has(tab) && kind !== 'context-switch' && !prefersReducedMotion()) {
                    await crossfade(contentRef.current);
                }
                audioService.playTransition();
                clearEnterFx();
                commit(tab, kind === 'context-switch' ? kind : 'module-boot');
                visited.add(tab);
                const queued = pendingRef.current;
                pendingRef.current = null;
                phaseRef.current = 'idle';
                if (queued && queued !== tab) void run(queued);
                return;
            }

            const overlay = overlayRef.current;
            if (!overlay) { commit(tab, kind); visited.add(tab); return; }

            const meta = FX_META[kind];

            phaseRef.current = 'covering';
            audioService.playTransition();
            clearEnterFx();
            contentRef.current?.setAttribute('data-fx', 'derez');

            await withDeadline(overlay.cover(meta.geometry, ROUTE_LABELS[tab]), 4000);

            phaseRef.current = 'holding';
            // Retarget: latest navigation requested during the cover wins —
            // even a click back on the origin tab (committing it is a no-op).
            const target = pendingRef.current ?? tab;
            pendingRef.current = null;
            contentRef.current?.removeAttribute('data-fx');
            commit(target, kind);
            visited.add(target);
            audioService.playType();

            await withDeadline(overlay.hold(meta.hold), meta.hold + 4000);

            // Retarget requested during the hold: still behind the cover, swap again.
            if (pendingRef.current) {
                const late = pendingRef.current;
                pendingRef.current = null;
                commit(late, kind);
                visited.add(late);
            }

            phaseRef.current = 'revealing';
            contentRef.current?.setAttribute('data-fx', 'enter');
            audioService.playPanelSlideOut();

            await withDeadline(overlay.reveal(meta.geometry), 4000);

            // Navigation requested mid-reveal: skip chaining a second full
            // cinematic (review #5) — run() routes it through the crossfade
            // when the target was visited, or plays the (now 650 ms) cinematic.
            if (pendingRef.current) {
                const next = pendingRef.current;
                pendingRef.current = null;
                phaseRef.current = 'idle';
                void run(next);
                return;
            }

            phaseRef.current = 'idle';
            // Edge-flash cascade runs up to ~1.3s after reveal; clear the hook after.
            enterTimerRef.current = setTimeout(() => {
                contentRef.current?.removeAttribute('data-fx');
                enterTimerRef.current = null;
            }, 1500);
        } finally {
            // Recovery path (review #4): if a cover/reveal promise never
            // resolves (timeline killed on unmount/HMR, or abort), the director
            // must not wedge in 'covering' swallowing every later navigation.
            phaseRef.current = 'idle';
            pendingRef.current = null;
            optsRef.current.contentRef.current?.removeAttribute('data-fx');
        }
    }, [clearEnterFx]);

    const navigate = useCallback((tab: ActiveTab) => {
        const { getActiveTab } = optsRef.current;
        if (phaseRef.current !== 'idle') {
            // Mid-flight: the latest destination always wins — including a
            // click on the origin tab (review #2); committing it during the
            // hold is a harmless no-op.
            pendingRef.current = tab;
            return;
        }
        if (tab === getActiveTab()) return;
        void run(tab);
    }, [run]);

    return { navigate };
};
