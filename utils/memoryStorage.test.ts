import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  initMemoriesStore,
  getMemoriesSync,
  loadMemories,
  addMemory,
  deleteMemory,
  memoryPromptBlock,
  searchMemories,
  getMemoriesByCategory,
  refreshMemoryCache,
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

  // ── Category & Tags ──

  it('adds memory with category and tags', async () => {
    await initMemoriesStore();
    const entry = await addMemory('prefers 85mm portraits', {
      category: 'user_preference',
      tags: ['portrait', 'photography'],
    });
    expect(entry).not.toBeNull();
    expect(entry!.category).toBe('user_preference');
    expect(entry!.tags).toEqual(['portrait', 'photography']);
  });

  it('defaults to general category when no options given', async () => {
    await initMemoriesStore();
    const entry = await addMemory('something random');
    expect(entry).not.toBeNull();
    expect(entry!.category).toBe('general');
    expect(entry!.tags).toEqual([]);
  });

  it('normalizes legacy entries without category/tags on load', async () => {
    // Seed a legacy entry with no category/tags
    const legacyEntry = { id: 'legacy-1', fact: 'old fact', createdAt: 100 };
    _store.set('memories:legacy-1', legacyEntry);

    await initMemoriesStore();
    const memories = await loadMemories();
    expect(memories).toHaveLength(1);
    expect(memories[0].category).toBe('general');
    expect(memories[0].tags).toEqual([]);
  });

  it('preserves category and tags when re-loading', async () => {
    await initMemoriesStore();
    await addMemory('fine art style', {
      category: 'style_pattern',
      tags: ['art', 'painting'],
    });
    const memories = await loadMemories();
    expect(memories).toHaveLength(1);
    expect(memories[0].category).toBe('style_pattern');
    expect(memories[0].tags).toEqual(['art', 'painting']);
  });

  // ── Rich retrieval ──

  it('searchMemories finds by fact text', async () => {
    await initMemoriesStore();
    await addMemory('prefers 85mm portraits');
    await addMemory('likes neon aesthetic');
    const results = searchMemories('neon');
    expect(results).toHaveLength(1);
    expect(results[0].fact).toBe('likes neon aesthetic');
  });

  it('searchMemories finds by tags', async () => {
    await initMemoriesStore();
    await addMemory('prefers 85mm', { tags: ['portrait', 'lens'] });
    const results = searchMemories('lens');
    expect(results).toHaveLength(1);
  });

  it('searchMemories returns all when query is empty', async () => {
    await initMemoriesStore();
    await addMemory('fact a');
    await addMemory('fact b');
    expect(searchMemories('')).toHaveLength(2);
  });

  it('getMemoriesByCategory filters correctly', async () => {
    await initMemoriesStore();
    await addMemory('prefers 85mm', { category: 'user_preference' });
    await addMemory('likes neon', { category: 'style_pattern' });
    await addMemory('some fact', { category: 'general' });

    expect(getMemoriesByCategory('user_preference')).toHaveLength(1);
    expect(getMemoriesByCategory('style_pattern')).toHaveLength(1);
    expect(getMemoriesByCategory('general')).toHaveLength(1);
    expect(getMemoriesByCategory()).toHaveLength(3);
  });

  it('refreshMemoryCache reloads from IDB', async () => {
    await initMemoriesStore();
    await addMemory('original');
    // Simulate an external add
    const externalEntry = { id: 'external', fact: 'external fact', category: 'general', tags: [], createdAt: Date.now() };
    _store.set('memories:external', externalEntry);

    await refreshMemoryCache();
    const memories = getMemoriesSync();
    expect(memories).toHaveLength(2);
    expect(memories.some(m => m.fact === 'external fact')).toBe(true);
  });

  // ── Context-aware memoryPromptBlock ──

  it('memoryPromptBlock without context returns all memories', async () => {
    await initMemoriesStore();
    await addMemory('speaks German');
    await addMemory('prefers 85mm portraits');
    const block = memoryPromptBlock();
    expect(block).toContain('speaks German');
    expect(block).toContain('prefers 85mm portraits');
  });

  it('memoryPromptBlock with context filters relevant memories', async () => {
    await initMemoriesStore();
    await addMemory('speaks German', { category: 'user_preference' });
    await addMemory('prefers 85mm portraits', { category: 'user_preference' });
    await addMemory('likes neon aesthetic', { category: 'style_pattern' });

    const block = memoryPromptBlock('What lens should I use for portraits?');
    expect(block).toContain('prefers 85mm portraits');
    expect(block).not.toContain('speaks German');
    expect(block).not.toContain('likes neon aesthetic');
  });

  it('memoryPromptBlock with context that matches nothing returns empty', async () => {
    await initMemoriesStore();
    await addMemory('prefers 85mm portraits');
    const block = memoryPromptBlock('quantum physics equations');
    expect(block).toBe('');
  });

  it('tags appear in memoryPromptBlock output', async () => {
    await initMemoriesStore();
    await addMemory('prefers 85mm', { tags: ['portrait', 'lens'] });
    const block = memoryPromptBlock();
    expect(block).toContain('[portrait, lens]');
  });

  // ── Context-aware edge cases ──

  it('empty string context behaves same as no context (all memories)', async () => {
    await initMemoriesStore();
    await addMemory('speaks German');
    await addMemory('prefers 85mm portraits');
    const block = memoryPromptBlock('');
    expect(block).toContain('speaks German');
    expect(block).toContain('prefers 85mm portraits');
  });

  it('context with only stopwords falls back to all memories', async () => {
    await initMemoriesStore();
    await addMemory('speaks German');
    await addMemory('prefers 85mm portraits');
    // All words in this context are stopwords (<4 chars or in stopword set)
    const block = memoryPromptBlock('the and for you all');
    expect(block).toContain('speaks German');
    expect(block).toContain('prefers 85mm portraits');
  });

  it('context with only short words (<4 chars) falls back to all memories', async () => {
    await initMemoriesStore();
    await addMemory('speaks German');
    await addMemory('prefers 85mm portraits');
    const block = memoryPromptBlock('hi my to we');
    expect(block).toContain('speaks German');
    expect(block).toContain('prefers 85mm portraits');
  });

  it('context matches via tags, not just fact text', async () => {
    await initMemoriesStore();
    await addMemory('speaks German', { tags: ['language', 'profile'] });
    await addMemory('prefers 85mm portraits', { tags: ['portrait', 'lens'] });
    // 'lens' is a tag on the second memory, not in the fact text
    const block = memoryPromptBlock('Which lens do you recommend?');
    expect(block).toContain('prefers 85mm portraits');
    expect(block).not.toContain('speaks German');
  });

  it('scores by keyword match count — memories with more matches come first', async () => {
    await initMemoriesStore();
    await addMemory('prefers 85mm portraits', { tags: ['lens'] });       // matches 'portraits' + 'lens' = 2
    await addMemory('warm lighting enhances mood', { tags: ['portrait'] }); // matches 'lighting' + 'portrait' = 2
    await addMemory('speaks German');                                     // matches nothing = 0

    const block = memoryPromptBlock('portrait lighting with 85mm lens');
    const lines = block.split('\n').filter(l => l.startsWith('-'));
    expect(lines).toHaveLength(2); // German excluded

    // Two-match memories should appear before zero-match (which is excluded)
    const firstIndex = block.indexOf('prefers 85mm portraits');
    const secondIndex = block.indexOf('warm lighting');
    expect(firstIndex).not.toBe(-1);
    expect(secondIndex).not.toBe(-1);
  });

  it('is case-insensitive when matching context to memories', async () => {
    await initMemoriesStore();
    await addMemory('Prefers 85mm Portraits');
    await addMemory('speaks german');
    const block = memoryPromptBlock('portrait');
    expect(block).toContain('Prefers 85mm Portraits');
    expect(block).not.toContain('speaks german');
  });

  it('handles unicode characters in context (äöüß)', async () => {
    await initMemoriesStore();
    await addMemory('straße ist lang');
    await addMemory('prefers 85mm portraits');
    const block = memoryPromptBlock('straße');
    expect(block).toContain('straße ist lang');
    expect(block).not.toContain('prefers 85mm portraits');
  });

  it('memory with special characters in fact still matches keywords', async () => {
    await initMemoriesStore();
    await addMemory('user likes [cyberpunk] & neon_aesthetic');
    const block = memoryPromptBlock('cyberpunk aesthetic style');
    expect(block).toContain('cyberpunk');
    expect(block).toContain('neon_aesthetic');
  });

  it('context matching a single memory returns only that one', async () => {
    await initMemoriesStore();
    await addMemory('speaks German');
    await addMemory('prefers 85mm portraits');
    await addMemory('likes neon aesthetic');
    const block = memoryPromptBlock('neon');
    const lines = block.split('\n').filter(l => l.startsWith('-'));
    expect(lines).toHaveLength(1);
    expect(lines[0]).toContain('neon aesthetic');
  });

  it('falls back to all memories when context has no meaningful keywords (words <4 chars)', async () => {
    await initMemoriesStore();
    await addMemory('uses Midjourney for art');
    const block = memoryPromptBlock('for'); // 'for' is 3 chars → extractKeywords returns empty → fallback
    const lines = block.split('\n').filter(l => l.startsWith('-'));
    expect(lines).toHaveLength(1);
  });
});