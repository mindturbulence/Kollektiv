/// <reference types="vite/client" />
/**
 * Assistant Avatar Store
 *
 * Bridges LiveAssistantContext state + voiceLevelService amplitude into a
 * framework-agnostic snapshot that any surface can consume:
 *  - in-app floating avatar (same realm — direct subscription)
 *  - Document PiP window root (same realm, different document — direct
 *    subscription works because documentPictureInPicture windows share the
 *    opener's JS context)
 *  - extension side panel iframe (#avatar-panel) — DIFFERENT realm, so it
 *    consumes the BroadcastChannel relay instead (see relay protocol below)
 *
 * Pattern: external store + useSyncExternalStore. React-visible state only
 * bumps on meaningful changes; the per-frame voice amplitude flows outside
 * React (getLevel polling) so idle cost is ~zero.
 *
 * Relay protocol (channel 'kollektiv-avatar'):
 *  embed → main : { kind: 'hello' }            (every 2s while mounted)
 *  main → embed : { kind: 'snapshot', snapshot } (30fps while hello alive)
 *  embed → main : { kind: 'command', command }  (user pressed a control)
 *
 * The main window only relays while hellos arrive, so nothing broadcasts
 * when no embed surface is open.
 */

import type { AssistantMode } from './assistantMode';

export interface AssistantAvatarSnapshot {
    mode: AssistantMode;
    status: 'idle' | 'connecting' | 'live' | 'error';
    speaking: boolean;
    sharing: boolean;
    controlEnabled: boolean;
    /** Smoothed RMS 0..1 from the assistant's playback graph (0 when idle or
     *  backend doesn't support metering — e.g. ElevenLabs). */
    level: number;
    error: string;
}

export interface AssistantAvatarActions {
    toggleLive: () => void;
    toggleShare: () => void;
    toggleControl: () => void;
}

type Listener = () => void;

export type AvatarRelayCommand = 'toggleLive' | 'toggleShare' | 'toggleControl';

const CHANNEL_NAME = 'kollektiv-avatar';
const HELLO_TTL_MS = 6000;   // stop relaying this long after the last hello
const RELAY_INTERVAL_MS = 33; // ~30fps — smooth ring animation cross-window

/** Relay ticker runs inside a Worker because hidden-tab setInterval is
 *  throttled to ~1Hz — but the extension side panel is MOST useful while the
 *  Kollektiv tab is in the background, and a 1Hz ring animation is useless.
 *  Worker timers are not throttled by page visibility. Blob-Worker matches the repo's CSP
 *  (blob: worklets for RNNoise/VAD); falls back to setInterval if Worker or
 *  blob: is blocked. */
const RELAY_WORKER_SRC = `
let timer = null;
self.onmessage = (e) => {
  const d = e.data || {};
  if (d.kind === 'start') {
    if (timer) clearInterval(timer);
    timer = setInterval(() => self.postMessage('tick'), d.interval || 33);
  } else if (d.kind === 'stop') {
    if (timer) { clearInterval(timer); timer = null; }
  }
};
`;

class AssistantAvatarStore {
    private snapshot: AssistantAvatarSnapshot = {
        mode: 'command',
        status: 'idle',
        speaking: false,
        sharing: false,
        controlEnabled: false,
        level: 0,
        error: '',
    };
    private listeners = new Set<Listener>();
    private channel: BroadcastChannel | null = null;
    private relayWorker: Worker | null = null;
    private relayFallbackTimer: ReturnType<typeof setInterval> | null = null;
    private lastHelloAt = 0;
    private actions: AssistantAvatarActions | null = null;

    /** Live context pushes state here (AssistantAvatarBridge). */
    setState(patch: Partial<Omit<AssistantAvatarSnapshot, 'level'>>): void {
        let changed = false;
        for (const k of Object.keys(patch) as (keyof typeof patch)[]) {
            if (patch[k] !== undefined && this.snapshot[k] !== patch[k]) {
                changed = true;
                break;
            }
        }
        if (changed) {
            // New object reference so useSyncExternalStore consumers re-render.
            this.snapshot = { ...this.snapshot, ...patch };
            this.notify();
            this.relaySnapshot();
        }
    }

    /** Pure amplitude — intentionally NOT React state. The avatar reads this
     *  per animation frame; the relay blends it into snapshots separately. */
    setLevel(level: number): void {
        this.snapshot.level = level;
    }

    getLevel(): number {
        return this.snapshot.level;
    }

    getSnapshot = (): AssistantAvatarSnapshot => this.snapshot;

    subscribe = (listener: Listener): (() => void) => {
        this.listeners.add(listener);
        return () => {
            this.listeners.delete(listener);
        };
    };

    // ─── Actions (main-realm command execution) ──────────────────

    setActions(actions: AssistantAvatarActions | null): void {
        this.actions = actions;
        // The MAIN realm must own a channel from the moment it can execute
        // commands — embed hellos land here, and the relay answers them.
        // (Previously the channel was only opened embed-side, so the main
        // window never heard hellos and the relay never started — the
        // extension panel stayed on AWAITING UPLINK forever.)
        if (actions) this.ensureChannel();
    }

    /** Cross-realm surfaces (extension iframe) send commands over the channel;
     *  the bridge in the main realm executes them against the live context. */
    sendCommand(command: AvatarRelayCommand): void {
        if (this.actions) {
            this.executeCommand(command);
            return;
        }
        // Cross-realm: ask the main window to run it.
        this.ensureChannel();
        try {
            this.channel?.postMessage({ kind: 'command', command });
        } catch { /* channel closed mid-flight */ }
    }

    private executeCommand(command: AvatarRelayCommand): void {
        const a = this.actions;
        if (!a) return;
        if (command === 'toggleLive') a.toggleLive();
        else if (command === 'toggleShare') a.toggleShare();
        else if (command === 'toggleControl') a.toggleControl();
    }

    // ─── Cross-window relay (only while an embed surface is alive) ──

    private ensureChannel(): void {
        if (this.channel || typeof BroadcastChannel === 'undefined') return;
        try {
            this.channel = new BroadcastChannel(CHANNEL_NAME);
            this.channel.onmessage = (e: MessageEvent) => {
                const msg = e.data as { kind?: string; command?: AvatarRelayCommand };
                if (msg?.kind === 'hello') {
                    this.lastHelloAt = Date.now();
                    this.startRelay();
                    this.relaySnapshot();
                } else if (msg?.kind === 'command' && msg.command) {
                    this.executeCommand(msg.command);
                }
            };
        } catch (e) {
            console.warn('[AvatarStore] BroadcastChannel unavailable:', (e as Error)?.message);
        }
    }

    /** Called by embed surfaces on boot (and every 2s): wakes the relay in the
     *  main window. The relay self-stops HELLO_TTL_MS after the last hello. */
    announceEmbedSurface(): void {
        this.ensureChannel();
        try {
            this.channel?.postMessage({ kind: 'hello' });
        } catch { /* channel closed mid-flight */ }
    }

    private startRelay(): void {
        if (this.relayWorker || this.relayFallbackTimer) return;
        // Preferred: Worker-driven tick (unthrottled in hidden tabs).
        try {
            const blob = new Blob([RELAY_WORKER_SRC], { type: 'text/javascript' });
            const worker = new Worker(URL.createObjectURL(blob));
            worker.onmessage = () => this.relayTick();
            worker.onerror = () => {
                // blob: blocked or Worker unavailable — degrade to setInterval
                // (throttled in hidden tabs; better than no relay).
                worker.terminate();
                if (this.relayWorker === worker) this.relayWorker = null;
                this.startFallbackRelay();
            };
            this.relayWorker = worker;
            worker.postMessage({ kind: 'start', interval: RELAY_INTERVAL_MS });
            return;
        } catch { /* fall through to setInterval */ }
        this.startFallbackRelay();
    }

    private startFallbackRelay(): void {
        if (this.relayFallbackTimer || this.relayWorker) return;
        this.relayFallbackTimer = setInterval(() => this.relayTick(), RELAY_INTERVAL_MS);
    }

    private relayTick(): void {
        if (this.lastHelloAt && Date.now() - this.lastHelloAt > HELLO_TTL_MS) {
            this.stopRelay();
            return;
        }
        this.relaySnapshot();
    }

    stopRelay(): void {
        if (this.relayWorker) {
            try { this.relayWorker.postMessage({ kind: 'stop' }); this.relayWorker.terminate(); } catch { /* already gone */ }
            this.relayWorker = null;
        }
        if (this.relayFallbackTimer) {
            clearInterval(this.relayFallbackTimer);
            this.relayFallbackTimer = null;
        }
    }

    private relaySnapshot(): void {
        if (!this.channel) return;
        try {
            this.channel.postMessage({ kind: 'snapshot', snapshot: this.snapshot });
        } catch { /* channel closed mid-flight */ }
    }

    /** Subscribe a cross-realm surface (extension iframe) to relayed
     *  snapshots. Returns an unsubscribe fn. */
    subscribeRelayed(onSnapshot: (s: AssistantAvatarSnapshot) => void): () => void {
        if (typeof BroadcastChannel === 'undefined') return () => {};
        const ch = new BroadcastChannel(CHANNEL_NAME);
        ch.onmessage = (e: MessageEvent) => {
            const msg = e.data as { kind?: string; snapshot?: AssistantAvatarSnapshot };
            if (msg?.kind === 'snapshot' && msg.snapshot) onSnapshot(msg.snapshot);
        };
        return () => { try { ch.close(); } catch { /* already closed */ } };
    }

    private notify(): void {
        for (const l of this.listeners) l();
    }
}

export const assistantAvatarStore = new AssistantAvatarStore();

// Debug/test hook: lets e2e diagnostics inspect or drive the store from
// outside the bundle (window.__assistantAvatarStore.setState({...})).
if (import.meta.env.DEV && typeof window !== 'undefined') {
    (window as unknown as { __assistantAvatarStore?: AssistantAvatarStore }).__assistantAvatarStore = assistantAvatarStore;
}
