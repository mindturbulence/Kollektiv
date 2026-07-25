import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useBootSequence } from './useBootSequence';

const mocks = vi.hoisted(() => ({
  initNotesStore: vi.fn().mockResolvedValue(undefined),
  initMemoriesStore: vi.fn().mockResolvedValue(undefined),
  initChatStore: vi.fn().mockResolvedValue(undefined),
  gsapSet: vi.fn(),
}));

vi.mock('../utils/notesStorage', () => ({ initNotesStore: mocks.initNotesStore }));
vi.mock('../utils/memoryStorage', () => ({ initMemoriesStore: mocks.initMemoriesStore }));
vi.mock('../utils/chatStorage', () => ({ initChatStore: mocks.initChatStore }));
vi.mock('gsap', () => ({
  gsap: {
    set: mocks.gsapSet,
    context: vi.fn(() => ({ revert: vi.fn() })),
    timeline: vi.fn(() => ({
      defaults: vi.fn().mockReturnThis(),
      fromTo: vi.fn().mockReturnThis(),
      to: vi.fn().mockReturnThis(),
      set: vi.fn().mockReturnThis(),
    })),
  },
  Power4: { inOut: 'power4.inOut' },
}));

describe('useBootSequence', () => {
  const defaultInput = {
    auth: {},
    showGlobalFeedback: vi.fn(),
    startupContinue: vi.fn(),
  } as const;

  beforeEach(() => {
    vi.clearAllMocks();
    // Mock sessionStorage
    const store: Record<string, string> = {};
    vi.spyOn(Storage.prototype, 'removeItem').mockImplementation((key) => { delete store[key]; });
  });

  it('starts in loading phase', () => {
    const { result } = renderHook(() => useBootSequence(defaultInput));
    expect(result.current.bootState.phase).toBe('loading');
    expect(result.current.bootState.isLoading).toBe(true);
    expect(result.current.bootState.isInitialized).toBe(false);
  });

  it('calls init stores on mount', async () => {
    renderHook(() => useBootSequence(defaultInput));
    await vi.waitFor(() => {
      expect(mocks.initNotesStore).toHaveBeenCalledTimes(1);
      expect(mocks.initMemoriesStore).toHaveBeenCalledTimes(1);
      expect(mocks.initChatStore).toHaveBeenCalledTimes(1);
    });
  });

  it('sets status to System Ready after init', async () => {
    const { result } = renderHook(() => useBootSequence(defaultInput));
    await vi.waitFor(() => {
      expect(result.current.bootState.initStatus).toBe('SYSTEM READY');
    });
    expect(result.current.bootState.initProgress).toBe(1.0);
  });

  it('handleInitContinue transitions to ready phase', async () => {
    const { result } = renderHook(() => useBootSequence(defaultInput));

    await vi.waitFor(() => {
      expect(result.current.bootState.initStatus).toBe('SYSTEM READY');
    });

    // Attach a fake element to the loader ref so gsap.set gets called
    (result.current.loaderRef as any).current = document.createElement('div');

    act(() => {
      result.current.handleInitContinue(true);
    });

    expect(result.current.bootState.isInitialized).toBe(true);
    expect(result.current.bootState.isLoading).toBe(false);
    expect(result.current.bootState.phase).toBe('ready');
    expect(defaultInput.startupContinue).toHaveBeenCalledWith(true);
    expect(mocks.gsapSet).toHaveBeenCalled();
  });

  it('handleInitContinue with false skips music', async () => {
    const { result } = renderHook(() => useBootSequence(defaultInput));

    await vi.waitFor(() => {
      expect(result.current.bootState.initStatus).toBe('SYSTEM READY');
    });

    act(() => {
      result.current.handleInitContinue(false);
    });

    expect(defaultInput.startupContinue).toHaveBeenCalledWith(false);
  });

  it('does not initialize twice on re-render (StrictMode guard)', async () => {
    const { rerender } = renderHook(() => useBootSequence(defaultInput));
    rerender();
    rerender();
    await vi.waitFor(() => {
      // initNotesStore should ONLY be called once, not 3 times
      expect(mocks.initNotesStore).toHaveBeenCalledTimes(1);
    });
  });

  it('handles init failure gracefully', async () => {
    const testError = new Error('DB connection failed');
    mocks.initNotesStore.mockRejectedValueOnce(testError);

    const { result } = renderHook(() => useBootSequence(defaultInput));

    await vi.waitFor(() => {
      expect(defaultInput.showGlobalFeedback).toHaveBeenCalledWith(
        expect.any(String),
        true,
      );
    });

    expect(result.current.bootState.isLoading).toBe(false);
    expect(result.current.bootState.phase).toBe('error');
  });

  it('exposes a loader ref', () => {
    const { result } = renderHook(() => useBootSequence(defaultInput));
    expect(result.current.loaderRef).toBeDefined();
    expect(result.current.loaderRef.current).toBeNull();
  });

  it('initializeApp with customSettings resets hasInitializedRef', async () => {
    const { result } = renderHook(() => useBootSequence(defaultInput));

    // First init runs
    await vi.waitFor(() => {
      expect(result.current.bootState.initStatus).toBe('SYSTEM READY');
    });

    expect(mocks.initNotesStore).toHaveBeenCalledTimes(1);

    // Call initializeApp with custom settings — should reset and run again
    mocks.initNotesStore.mockClear();
    await act(async () => {
      await result.current.initializeApp({} as any);
    });

    await vi.waitFor(() => {
      expect(mocks.initNotesStore).toHaveBeenCalledTimes(1);
    });
  });
});
