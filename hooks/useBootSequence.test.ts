import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useBootSequence } from './useBootSequence';

const mocks = vi.hoisted(() => ({
  initNotesStore: vi.fn().mockResolvedValue(undefined),
  initMemoriesStore: vi.fn().mockResolvedValue(undefined),
  initChatStore: vi.fn().mockResolvedValue(undefined),
  gsapSet: vi.fn(),
  fsInitialize: vi.fn().mockResolvedValue(true),
  getMemoriesSync: vi.fn().mockReturnValue([]),
  memoryPromptBlock: vi.fn().mockReturnValue(''),
  syncAgentMemoryToVault: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('../utils/fileUtils', () => ({
  fileSystemManager: { initialize: mocks.fsInitialize },
}));

vi.mock('../utils/notesStorage', () => ({ initNotesStore: mocks.initNotesStore }));
vi.mock('../utils/memoryStorage', () => ({
  initMemoriesStore: mocks.initMemoriesStore,
  getMemoriesSync: mocks.getMemoriesSync,
  memoryPromptBlock: mocks.memoryPromptBlock,
  syncAgentMemoryToVault: mocks.syncAgentMemoryToVault,
}));
vi.mock('../utils/chatStorage', () => ({ initChatStore: mocks.initChatStore }));
vi.mock('../utils/obsidianStorage', () => ({
  initObsidianVault: vi.fn().mockResolvedValue(true),
  ensureFolders: vi.fn().mockResolvedValue(undefined),
  initSearchIndex: vi.fn().mockResolvedValue(undefined),
  indexWikilinksIntoGraph: vi.fn().mockResolvedValue(0),
  indexGalleryAndPrompts: vi.fn().mockResolvedValue(undefined),
}));
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
    settings: {} as any,
    showGlobalFeedback: vi.fn(),
    startupContinue: vi.fn(),
  } as const;

  beforeEach(() => {
    vi.clearAllMocks();
    mocks.fsInitialize.mockResolvedValue(true);
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
    // Generous timeout: initializeApp dynamically imports the real
    // obsidianStorage/knowledgeService modules, and the first test to do so in
    // a full parallel run pays their cold transform cost — more than
    // vi.waitFor's 1s default.
    await vi.waitFor(() => {
      expect(result.current.bootState.initStatus).toBe('SYSTEM READY');
    }, { timeout: 15_000 });
    expect(result.current.bootState.initProgress).toBe(1.0);
  });

  it('handleInitContinue transitions to ready phase', async () => {
    const { result } = renderHook(() => useBootSequence(defaultInput));

    // Generous timeout: initializeApp dynamically imports the real
    // obsidianStorage/knowledgeService modules, and the first test to do so in
    // a full parallel run pays their cold transform cost — more than
    // vi.waitFor's 1s default.
    await vi.waitFor(() => {
      expect(result.current.bootState.initStatus).toBe('SYSTEM READY');
    }, { timeout: 15_000 });

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

    // Generous timeout: initializeApp dynamically imports the real
    // obsidianStorage/knowledgeService modules, and the first test to do so in
    // a full parallel run pays their cold transform cost — more than
    // vi.waitFor's 1s default.
    await vi.waitFor(() => {
      expect(result.current.bootState.initStatus).toBe('SYSTEM READY');
    }, { timeout: 15_000 });

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

  // Regression guard for ISSUE-45: the storage gate was dropped when this hook
  // was extracted from App.tsx, so showWelcome could never become true and the
  // onboarding wizard was unreachable on a fresh install.
  it('shows the welcome/onboarding gate when there is no vault access', async () => {
    mocks.fsInitialize.mockResolvedValue(false);

    const { result } = renderHook(() => useBootSequence(defaultInput));

    await vi.waitFor(() => {
      expect(result.current.bootState.showWelcome).toBe(true);
    });
    expect(result.current.bootState.phase).toBe('initializing');
    expect(result.current.bootState.isLoading).toBe(false);
  });

  it('stays on the loader when vault access is granted', async () => {
    const { result } = renderHook(() => useBootSequence(defaultInput));

    // Generous timeout: initializeApp dynamically imports the real
    // obsidianStorage/knowledgeService modules, and the first test to do so in
    // a full parallel run pays their cold transform cost — more than
    // vi.waitFor's 1s default.
    await vi.waitFor(() => {
      expect(result.current.bootState.initStatus).toBe('SYSTEM READY');
    }, { timeout: 15_000 });
    expect(result.current.bootState.showWelcome).toBe(false);
  });

  // Regression guard: the old gate checked getAgentMemoryBlock(), which is
  // only ever set BY syncAgentMemoryToVault itself — nothing else set it, so
  // the sync never fired on a normal boot. Gate on actual memory presence.
  it('syncs agent memory to the vault when memories exist', async () => {
    mocks.getMemoriesSync.mockReturnValue([{ id: 'm1', fact: 'likes cats', category: 'general', tags: [], createdAt: 1 }]);
    mocks.memoryPromptBlock.mockReturnValue('- likes cats');

    renderHook(() => useBootSequence(defaultInput));

    await vi.waitFor(() => {
      expect(mocks.syncAgentMemoryToVault).toHaveBeenCalledWith('- likes cats');
    }, { timeout: 15_000 });
  });

  it('does not sync agent memory to the vault when there are no memories', async () => {
    mocks.getMemoriesSync.mockReturnValue([]);

    const { result } = renderHook(() => useBootSequence(defaultInput));

    await vi.waitFor(() => {
      expect(result.current.bootState.initStatus).toBe('SYSTEM READY');
    }, { timeout: 15_000 });
    expect(mocks.syncAgentMemoryToVault).not.toHaveBeenCalled();
  });

  it('exposes a loader ref', () => {
    const { result } = renderHook(() => useBootSequence(defaultInput));
    expect(result.current.loaderRef).toBeDefined();
    expect(result.current.loaderRef.current).toBeNull();
  });

  it('initializeApp with customSettings resets hasInitializedRef', async () => {
    const { result } = renderHook(() => useBootSequence(defaultInput));

    // First init runs
    // Generous timeout: initializeApp dynamically imports the real
    // obsidianStorage/knowledgeService modules, and the first test to do so in
    // a full parallel run pays their cold transform cost — more than
    // vi.waitFor's 1s default.
    await vi.waitFor(() => {
      expect(result.current.bootState.initStatus).toBe('SYSTEM READY');
    }, { timeout: 15_000 });

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
