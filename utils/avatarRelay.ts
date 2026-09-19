/**
 * Avatar Relay (embed-surface side)
 *
 * Hooks for surfaces that live OUTSIDE the main app window's realm — the
 * extension side panel's embedded iframe (#avatar-panel). They consume
 * relayed snapshots from the main window's assistantAvatarStore via
 * BroadcastChannel, because the AnalyserNode lives in the main window.
 *
 * (Document PiP windows do NOT need this — they share the opener's JS realm
 * and can subscribe to the store directly.)
 */

import { useEffect, useState } from 'react';
import { assistantAvatarStore, type AssistantAvatarSnapshot } from './assistantAvatarStore';

/** Announce presence + subscribe to relayed snapshots. The announce interval
 *  keeps the main window's relay alive (it self-stops after a TTL of
 *  silence, so a closed main tab shows as offline in the panel). */
export function useEmbedAvatarRelay(enabled = true): AssistantAvatarSnapshot | null {
    const [snap, setSnap] = useState<AssistantAvatarSnapshot | null>(null);

    useEffect(() => {
        if (!enabled) return;
        const unsub = assistantAvatarStore.subscribeRelayed(setSnap);
        const hello = () => assistantAvatarStore.announceEmbedSurface();
        hello();
        const t = setInterval(hello, 2000);
        return () => {
            unsub();
            clearInterval(t);
        };
    }, [enabled]);

    return snap;
}
