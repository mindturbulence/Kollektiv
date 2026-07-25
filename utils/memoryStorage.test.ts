import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  initMemoriesStore,
  getMemoriesSync,
  loadMemories,
  addMemory,
  deleteMemory,
  memoryPromptBlock,
  _testReset,
} from './memoryStorage';

// Use vi.hoisted so _store is created before vi.mock factory runs
const _store = vi.hoisted(() => new Map<string, any>());
const _lsStore = vi.hoisted(() => new Map<string, string>());

vi.mock('./db', () => ({
  getDb: vi.fn(() =>
    Promise.resolve({
      get: async (table: string, key: string) => _store.get(`${table}:${key}`),
      put: async (_table: string, value: any, key: string) => { _store.set(key, value); },
      add: async (table: string, value: any) => { _store.set(`${table}:${value.id}`, value); },
      delete: async (table: string, key: string) => { _store.delete(`${table}:${key}`); },
      getAll: async (table: string) => {
        const items: any[] = [];
        for (const [k, v] of _store) if (k.startsWith(`${table}:`)) items.push(v);
        return items;
      },
    })
  ),
}));

const _idCounter = vi.hoisted(() => ({ value: 0 }));
vi.mock('uuid', () => ({ v4: () => `test-id-${++_idCounter.value}` }));

beforeEach(() => {
  _testReset();
  vi.clearAllMocks();
  _store.clear();
  _lsStore.clear();
  _idCounter.value = 0;
  (globalThis as any).localStorage = {
    getItem: (k: string) => _lsStore.get(k) ?? null,
    setItem: (k: string, v: string) => { _lsStore.set(k, v); },
    removeItem: (k: string) => { _lsStore.delete(k); },
    clear: () => _lsStore.clear(),
  };
});

describe('memoryStorage', () => {
  it('adds and lists memories', async () => {
    await initMemoriesStore();
    const entry = await addMemory('prefers 85mm portraits');
    expect(entry).not.toBeNull();
    const memories = await loadMemories();
    expect(memories).toHaveLength(1);
    expect(memories[0].fact).toBe('prefers 85mm portraits');
  });

  it('rejects empty and exact duplicates', async () => {
    await initMemoriesStore();
    expect(await addMemory('  ')).toBeNull();
    await addMemory('likes neon');
    expect(await addMemory('likes neon')).toBeNull();
    expect(await loadMemories()).toHaveLength(1);
  });

  it('caps at 50, dropping the oldest', async () => {
    await initMemoriesStore();
    for (let i = 0; i < 55; i++) await addMemory(`fact ${i}`);
    const facts = (await loadMemories()).map(m => m.fact);
    expect(facts).toHaveLength(50);
    expect(facts).not.toContain('fact 0');
    expect(facts).toContain('fact 54');
  });

  it('deletes by id', async () => {
    await initMemoriesStore();
    const m = await addMemory('temp');
    expect(m).not.toBeNull();
    expect(await deleteMemory(m!.id)).toBe(true);
    expect(await deleteMemory(m!.id)).toBe(false);
  });

  it('sync cache returns memories after init', async () => {
    expect(getMemoriesSync()).toHaveLength(0);
    await initMemoriesStore();
    await addMemory('sync test');
    expect(getMemoriesSync()).toHaveLength(1);
  });

  describe('memoryPromptBlock contract', () => {
    const HEADER = 'Persistent memories about the user from earlier sessions (use them, do not recite them unprompted):';

    it('returns empty string when no memories exist', async () => {
      await initMemoriesStore();
      expect(memoryPromptBlock()).toBe('');
    });

    it('returns empty string when cache is empty (no init)', () => {
      _testReset();
      expect(memoryPromptBlock()).toBe('');
    });

    it('is synchronous — returns string, not Promise', async () => {
      await initMemoriesStore();
      const result = memoryPromptBlock();
      expect(typeof result).toBe('string');
      // If it were a Promise, 'then' would be a function
      expect((result as any).then).toBeUndefined();
    });

    it('includes the header line when memories exist', async () => {
      await initMemoriesStore();
      await addMemory('speaks German');
      expect(memoryPromptBlock()).toContain(HEADER);
    });

    it('formats each memory as a bullet line after the header (newest first)', async () => {
      await initMemoriesStore();
      await addMemory('speaks German');
      await addMemory('prefers 85mm portraits');
      const block = memoryPromptBlock();
      const lines = block.split('\n');
      expect(lines[0]).toBe(HEADER);
      // Newest first: prefers 85mm portraits was added second
      expect(lines[1]).toBe('- prefers 85mm portraits');
      expect(lines[2]).toBe('- speaks German');
    });

    it('does not have a trailing newline', async () => {
      await initMemoriesStore();
      await addMemory('test fact');
      const block = memoryPromptBlock();
      expect(block.endsWith('\n')).toBe(false);
    });

    it('ignores memories that were deleted', async () => {
      await initMemoriesStore();
      const m = await addMemory('temporary');
      await addMemory('permanent');
      await deleteMemory(m!.id);
      const block = memoryPromptBlock();
      expect(block).toContain('- permanent');
      expect(block).not.toContain('- temporary');
    });
  });

  it('dual-writes to localStorage on add', async () => {
    await initMemoriesStore();
    await addMemory('dual-write test');
    const ls = JSON.parse(localStorage.getItem('assistantMemories') || '[]');
    expect(ls).toHaveLength(1);
    expect(ls[0].fact).toBe('dual-write test');
  });

  // ── Idempotency ──

  it('does not re-read localStorage on second call (same-session early return)', async () => {
    // Seed localStorage with legacy data
    const legacyData = [{ id: '1', fact: 'migrated', createdAt: 100 }];
    _lsStore.set('assistantMemories', JSON.stringify(legacyData));

    const getItemSpy = vi.spyOn(globalThis.localStorage, 'getItem');

    // First call: migrates from localStorage
    await initMemoriesStore();
    expect(getItemSpy).toHaveBeenCalledWith('assistantMemories');
    expect(getMemoriesSync()).toHaveLength(1);
    getItemSpy.mockClear();

    // Second call: _initialized guard returns early, no localStorage read
    await initMemoriesStore();
    expect(getItemSpy).not.toHaveBeenCalled();
    expect(getMemoriesSync()).toHaveLength(1);
  });

  it('does not re-migrate after _testReset when migration flag exists', async () => {
    // First call — migrate from localStorage into IDB
    const legacyData = [{ id: '2', fact: 'persisted fact', createdAt: 200 }];
    _lsStore.set('assistantMemories', JSON.stringify(legacyData));
    await initMemoriesStore();
    expect(getMemoriesSync()).toHaveLength(1);
    expect(getMemoriesSync()[0].fact).toBe('persisted fact');

    // Manually seed migration flag (mock put/get key-style mismatch workaround)
    _store.set('keyval:migrated_memories_v2', true);

    // Simulate new session
    _testReset();
    _lsStore.clear(); // No legacy data in localStorage on reload

    const getItemSpy = vi.spyOn(globalThis.localStorage, 'getItem');

    // Re-init: should skip migration, load from IDB
    await initMemoriesStore();
    expect(getItemSpy).not.toHaveBeenCalledWith('assistantMemories');
    expect(getMemoriesSync()).toHaveLength(1);
    expect(getMemoriesSync()[0].fact).toBe('persisted fact');
  });

  it('returns null when IDB write fails', async () => {
    const { getDb } = await import('./db');
    (getDb as any).mockRejectedValueOnce(new Error('IDB unavailable'));
    const result = await addMemory('should fail');
    expect(result).toBeNull();
  });
});