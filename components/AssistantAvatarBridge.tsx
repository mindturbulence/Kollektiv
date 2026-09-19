import React, { useEffect, useRef } from 'react';
import { useLiveAssistantContext } from '../contexts/LiveAssistantContext';
import { useAssistantSignals } from '../utils/useAssistantSignals';
import { assistantAvatarStore } from '../utils/assistantAvatarStore';
import { voiceLevelService } from '../services/voiceLevelService';

/**
 * Headless store bridge. Lives INSIDE <LiveAssistantProvider> so it can read
 * the live session context, and feeds everything the avatar surfaces need:
 *
 *  - snapshot state (status/mode/speaking/error) → store.setState
 *  - control actions (mic/share/control toggles) → store.setActions, so
 *    out-of-tree surfaces (PiP root, extension iframe) can drive the session
 *  - per-frame voice amplitude → store.setLevel (relay + PiP polling)
 *
 * Renders nothing. Cheap when idle: the rAF loop is the only recurring cost
 * (a 256-sample RMS read) and rAF pauses in background tabs.
 */
export const AssistantAvatarBridge: React.FC = () => {
    const ctx = useLiveAssistantContext();
    const { mode, error } = useAssistantSignals();

    // Push snapshot state on every meaningful change.
    useEffect(() => {
        assistantAvatarStore.setState({
            status: ctx.status,
            mode,
            speaking: ctx.speaking,
            sharing: ctx.sharing,
            controlEnabled: ctx.controlEnabled,
            error,
        });
    }, [ctx.status, mode, ctx.speaking, ctx.sharing, ctx.controlEnabled, error]);

    // Register actions so PiP/embed surfaces can drive the session. Kept in a
    // ref-fresh closure: the callbacks come from the provider's current render,
    // and re-registering on identity change keeps them from going stale.
    const { toggleLive, toggleShare, controlEnabled, grantControl, revokeControl } = ctx;
    useEffect(() => {
        assistantAvatarStore.setActions({
            toggleLive,
            toggleShare,
            toggleControl: () => {
                if (controlEnabled) revokeControl();
                else grantControl();
            },
        });
        return () => assistantAvatarStore.setActions(null);
    }, [toggleLive, toggleShare, controlEnabled, grantControl, revokeControl]);

    // Per-frame amplitude feed. Runs while any surface could be watching —
    // effectively always — but each tick is a single 256-float RMS read.
    const rafRef = useRef(0);
    useEffect(() => {
        const loop = () => {
            assistantAvatarStore.setLevel(voiceLevelService.getLevel());
            rafRef.current = requestAnimationFrame(loop);
        };
        rafRef.current = requestAnimationFrame(loop);
        return () => cancelAnimationFrame(rafRef.current);
    }, []);

    // Session teardown drops the analyser — flush the meter so the avatar
    // doesn't freeze on the last level.
    useEffect(() => {
        if (ctx.status === 'idle' || ctx.status === 'error') {
            assistantAvatarStore.setLevel(0);
        }
    }, [ctx.status]);

    return null;
};

export default AssistantAvatarBridge;
