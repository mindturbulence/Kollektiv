import { useCallback, useRef } from 'react';
import type { RefObject } from 'react';
import type { ActiveTab } from '../../types';
import { audioService } from '../../services/audioService';
import { resolveFx, prefersReducedMotion, FX_META, ROUTE_LABELS, type FxKind } from './routeFx';
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
 * re-navigation before commit retargets in place; re-navigation after commit is
 * queued and chained after the reveal finishes. The latest destination always wins.
 */
export const useTransitionDirector = (opts: DirectorOpts) => {
    const phaseRef = useRef<Phase>('idle');
    const pendingRef = useRef<ActiveTab | null>(null);
    const enterTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    // Opts live in a ref so navigate/run stay referentially stable across renders
    // (the appEventBus subscription depends on that stability).
    const optsRef = useRef(opts);
    optsRef.current = opts;

    const clearEnterFx = useCallback(() => {
        if (enterTimerRef.current) { clearTimeout(enterTimerRef.current); enterTimerRef.current = null; }
        optsRef.current.contentRef.current?.removeAttribute('data-fx');
    }, []);

    const run = useCallback(async (tab: ActiveTab) => {
        const { overlayRef, contentRef, getActiveTab, commit } = optsRef.current;
        const from = getActiveTab();
        const kind = resolveFx(from, tab);

        // Sibling workspace switch: PromptsPage's nested AnimatePresence owns the
        // visual; the shell plays no overlay. Reduced motion: plain commit.
        if (kind === 'context-switch' || prefersReducedMotion()) {
            audioService.playTransition();
            clearEnterFx();
            commit(tab, kind === 'context-switch' ? kind : 'module-boot');
            return;
        }

        const overlay = overlayRef.current;
        if (!overlay) { commit(tab, kind); return; }

        const meta = FX_META[kind];

        phaseRef.current = 'covering';
        audioService.playTransition();
        clearEnterFx();
        contentRef.current?.setAttribute('data-fx', 'derez');

        await overlay.cover(meta.geometry, ROUTE_LABELS[tab]);

        phaseRef.current = 'holding';
        // Retarget: latest navigation requested during the cover wins.
        const target = pendingRef.current ?? tab;
        pendingRef.current = null;
        contentRef.current?.removeAttribute('data-fx');
        commit(target, kind);
        audioService.playType();

        await overlay.hold(meta.hold);

        // Retarget requested during the hold: still behind the cover, swap again.
        if (pendingRef.current) {
            const late = pendingRef.current;
            pendingRef.current = null;
            commit(late, kind);
        }

        phaseRef.current = 'revealing';
        contentRef.current?.setAttribute('data-fx', 'enter');
        audioService.playPanelSlideOut();

        await overlay.reveal(meta.geometry);

        phaseRef.current = 'idle';
        // Edge-flash cascade runs up to ~1.3s after reveal; clear the hook after.
        enterTimerRef.current = setTimeout(() => {
            contentRef.current?.removeAttribute('data-fx');
            enterTimerRef.current = null;
        }, 1500);

        // Navigation requested mid-reveal chains a fresh transition now.
        if (pendingRef.current) {
            const next = pendingRef.current;
            pendingRef.current = null;
            void run(next);
        }
    }, [clearEnterFx]);

    const navigate = useCallback((tab: ActiveTab) => {
        const { getActiveTab } = optsRef.current;
        if (phaseRef.current !== 'idle') {
            // Mid-flight: remember only the latest destination.
            if (tab !== getActiveTab()) pendingRef.current = tab;
            return;
        }
        if (tab === getActiveTab()) return;
        void run(tab);
    }, [run]);

    return { navigate };
};
