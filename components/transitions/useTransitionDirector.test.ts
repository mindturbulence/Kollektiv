import { describe, it, expect, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useTransitionDirector } from './useTransitionDirector';

vi.mock('../../services/audioService', () => ({
    audioService: { playTransition: vi.fn(), playType: vi.fn(), playPanelSlideOut: vi.fn() },
}));
vi.mock('./routeFx', () => ({
    resolveFx: () => 'module-boot',
    prefersReducedMotion: () => false,
    crossfade: () => Promise.resolve(),
    FX_META: { 'module-boot': { geometry: 'blinds', hold: 10 } },
    ROUTE_LABELS: new Proxy({}, { get: () => ({ name: '', sub: '', glyph: '' }) }),
}));

describe('useTransitionDirector', () => {
    it('still commits the navigation when the cover never resolves', async () => {
        vi.useFakeTimers();
        const abort = vi.fn();
        const overlay = {
            cover: () => new Promise<void>(() => {}),
            hold: () => Promise.resolve(),
            reveal: () => Promise.resolve(),
            abort,
        };
        const commit = vi.fn();
        const { result } = renderHook(() => useTransitionDirector({
            overlayRef: { current: overlay as any },
            contentRef: { current: null },
            getActiveTab: () => 'dashboard' as any,
            commit,
        }));

        act(() => { result.current.navigate('settings' as any); });
        expect(commit).not.toHaveBeenCalled();
        await act(async () => { await vi.advanceTimersByTimeAsync(4100); });

        expect(commit).toHaveBeenCalledWith('settings', 'module-boot');
        expect(abort).toHaveBeenCalled();
        vi.useRealTimers();
    });
});
