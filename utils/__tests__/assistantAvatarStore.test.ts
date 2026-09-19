import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
    assistantAvatarStore,
    type AssistantAvatarSnapshot,
} from '../assistantAvatarStore';

const baseSnapshot: AssistantAvatarSnapshot = {
    mode: 'command',
    status: 'idle',
    speaking: false,
    sharing: false,
    controlEnabled: false,
    level: 0,
    error: '',
};

describe('assistantAvatarStore', () => {
    beforeEach(() => {
        assistantAvatarStore.setState(baseSnapshot);
        assistantAvatarStore.setLevel(0);
        assistantAvatarStore.stopRelay();
    });

    it('starts with a default idle snapshot', () => {
        const snap = assistantAvatarStore.getSnapshot();
        expect(snap.status).toBe('idle');
        expect(snap.level).toBe(0);
        expect(snap.mode).toBe('command');
    });

    it('setState applies patches immutably', () => {
        const before = assistantAvatarStore.getSnapshot();
        assistantAvatarStore.setState({ status: 'live' });
        const after = assistantAvatarStore.getSnapshot();

        expect(after.status).toBe('live');
        expect(after).not.toBe(before); // new reference for useSyncExternalStore
        expect(before.status).toBe('idle'); // old snapshot untouched
    });

    it('setState with no change keeps the same reference', () => {
        assistantAvatarStore.setState({ status: 'live' });
        const before = assistantAvatarStore.getSnapshot();

        assistantAvatarStore.setState({ status: 'live' }); // no-op
        expect(assistantAvatarStore.getSnapshot()).toBe(before);
    });

    it('notifies subscribers only on meaningful changes', () => {
        const listener = vi.fn();
        const unsub = assistantAvatarStore.subscribe(listener);
        try {
            assistantAvatarStore.setState({ speaking: true });
            expect(listener).toHaveBeenCalledTimes(1);

            assistantAvatarStore.setState({ speaking: true }); // no change
            expect(listener).toHaveBeenCalledTimes(1);

            assistantAvatarStore.setState({ speaking: false });
            expect(listener).toHaveBeenCalledTimes(2);
        } finally {
            unsub();
        }
    });

    it('level updates do not re-render (kept outside React state)', () => {
        const before = assistantAvatarStore.getSnapshot();
        const listener = vi.fn();
        const unsub = assistantAvatarStore.subscribe(listener);
        try {
            assistantAvatarStore.setLevel(0.7);
            expect(assistantAvatarStore.getLevel()).toBe(0.7);
            expect(assistantAvatarStore.getSnapshot()).toBe(before);
            expect(listener).not.toHaveBeenCalled();
        } finally {
            unsub();
        }
    });

    it('commands run directly when actions are registered (main realm)', () => {
        const toggleLive = vi.fn();
        assistantAvatarStore.setActions({ toggleLive, toggleShare: vi.fn(), toggleControl: vi.fn() });
        try {
            assistantAvatarStore.sendCommand('toggleLive');
            expect(toggleLive).toHaveBeenCalledTimes(1);
        } finally {
            assistantAvatarStore.setActions(null);
        }
    });

    it('commands fall back to the relay when no actions are registered (embed realm)', () => {
        // No actions registered → sendCommand must not throw; it posts on the
        // channel instead (BroadcastChannel may not exist in jsdom — fine).
        expect(() => assistantAvatarStore.sendCommand('toggleShare')).not.toThrow();
    });

    it('subscribes and unsubscribes cleanly', () => {
        const listener = vi.fn();
        const unsub = assistantAvatarStore.subscribe(listener);
        unsub();
        assistantAvatarStore.setState({ status: 'connecting' });
        expect(listener).not.toHaveBeenCalled();
    });
});
