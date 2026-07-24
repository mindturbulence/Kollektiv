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

  it('builds a prompt block, empty when no memories', async () => {
    await initMemoriesStore();
    expect(memoryPromptBlock()).toBe('');
    await addMemory('speaks German');
    expect(memoryPromptBlock()).toContain('speaks German');
  });

  it('dual-writes to localStorage on add', async () => {
    await initMemoriesStore();
    await addMemory('dual-write test');
    const ls = JSON.parse(localStorage.getItem('assistantMemories') || '[]');
    expect(ls).toHaveLength(1);
    expect(ls[0].fact).toBe('dual-write test');
  });

  it('returns null when IDB write fails', async () => {
    const { getDb } = await import('./db');
    (getDb as any).mockRejectedValueOnce(new Error('IDB unavailable'));
    const result = await addMemory('should fail');
    expect(result).toBeNull();
  });
});