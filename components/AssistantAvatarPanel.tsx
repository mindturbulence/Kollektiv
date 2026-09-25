import React from 'react';
import { useSyncExternalStore } from 'react';
import { assistantAvatarStore, type AssistantAvatarSnapshot, type AvatarRelayCommand } from '../utils/assistantAvatarStore';
import { useEmbedAvatarRelay } from '../utils/avatarRelay';
import SigilAvatar from './SigilAvatar';

export type AvatarPanelSurface = 'pip' | 'embed';

/** Snapshot source per surface. PiP shares the main realm and reads the store
 *  directly; the extension iframe only sees relayed snapshots. Commands go
 *  through store.sendCommand either way — it runs locally when actions are
 *  registered and falls back to the relay otherwise. */
function useAvatarSnapshot(surface: AvatarPanelSurface): AssistantAvatarSnapshot | null {
    const direct = useSyncExternalStore(
        assistantAvatarStore.subscribe,
        assistantAvatarStore.getSnapshot,
        assistantAvatarStore.getSnapshot,
    );
    const relayed = useEmbedAvatarRelay(surface === 'embed');
    return surface === 'pip' ? direct : relayed;
}

/**
 * Compact assistant panel for out-of-window surfaces. Layout is fixed-size
 * (sized for the ~220×260 PiP window and the side panel iframe).
 */
export const AssistantAvatarPanel: React.FC<{ surface: AvatarPanelSurface }> = ({ surface }) => {
    const snap = useAvatarSnapshot(surface);
    const send = (cmd: AvatarRelayCommand) => assistantAvatarStore.sendCommand(cmd);

    if (!snap) {
        // No relay data yet (embed just booted / main window closed).
        return (
            <div className="h-screen w-screen flex flex-col items-center justify-center gap-3 bg-base-100 select-none">
                <div className="w-0 h-0 border-l-[10px] border-r-[10px] border-b-[16px] border-l-transparent border-r-transparent border-b-primary opacity-30" />
                <p className="font-mono text-2xs tracking-[0.1em] text-base-content/60">
                    Waiting for connection
                </p>
                <p className="font-mono text-[8px] tracking-[0.1em] text-base-content/25">
                    Open Kollektiv to connect
                </p>
            </div>
        );
    }

    const live = snap.status === 'live' || snap.status === 'connecting';
    const liveLabel = snap.status === 'live' ? 'END LINK' : snap.status === 'connecting' ? 'Connecting...' : 'GO LIVE';

    return (
        <div className="h-screen w-screen flex flex-col items-center justify-center gap-4 bg-base-100 select-none overflow-hidden p-4">
            {/* Cross-realm: pass the relayed snapshot down — the store singleton
                in this realm is a stale forever-idle copy. */}
            <SigilAvatar size={96} snapshot={snap} />

            {snap.error && (
                <>
                    <p className="font-mono text-[8px] tracking-[0.25em] uppercase text-error text-center">Error</p>
                    <p className="font-mono text-[8px] tracking-[0.2em] uppercase text-error/70 text-center max-w-[90%] leading-relaxed line-clamp-2">
                        {snap.error}
                    </p>
                </>
            )}

            <div className="flex flex-col gap-2 w-full max-w-[180px] mt-2">
                <PanelButton
                    label={liveLabel}
                    accent={live}
                    // Also the retry after a fault — the next start() clears it.
                    onClick={() => send('toggleLive')}
                />
                <div className="flex gap-2">
                    <PanelButton
                        label={snap.sharing ? 'STOP SHARE' : 'SHARE SCREEN'}
                        small
                        accent={snap.sharing}
                        pressed={snap.sharing}
                        onClick={() => send('toggleShare')}
                        disabled={!live}
                    />
                    <PanelButton
                        label={snap.controlEnabled ? 'REVOKE CTRL' : 'CONTROL'}
                        small
                        accent={snap.controlEnabled}
                        pressed={snap.controlEnabled}
                        onClick={() => send('toggleControl')}
                        disabled={!live}
                    />
                </div>
            </div>

            <p className="font-mono text-[7px] tracking-[0.3em] uppercase text-base-content/25 mt-1">
                KOLLEKTIV · CTRL+SPACE
            </p>
        </div>
    );
};

const PanelButton: React.FC<{
    label: string;
    onClick: () => void;
    accent?: boolean;
    small?: boolean;
    disabled?: boolean;
    pressed?: boolean;
}> = ({ label, onClick, accent, small, disabled, pressed }) => (
    <button
        onClick={onClick}
        aria-pressed={pressed}
        disabled={disabled}
        className={`font-mono uppercase border transition-colors text-center w-full ${
            small ? 'text-[8px] tracking-[0.2em] py-1.5 px-1' : 'text-2xs tracking-[0.25em] py-2 px-2'
        } ${
            disabled
                ? 'border-base-content/10 text-base-content/25 cursor-not-allowed'
                : accent
                    ? 'border-primary/60 text-primary hover:bg-primary/10'
                    : 'border-base-content/20 text-base-content/60 hover:border-primary/40 hover:text-primary'
        }`}
    >
        {label}
    </button>
);

export default AssistantAvatarPanel;
