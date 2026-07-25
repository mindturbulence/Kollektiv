import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  initNotesStore,
  getNotesSync,
  loadNotes,
  addNote,
  updateNote,
  deleteNote,
  clearNotes,
  _testReset,
} from './notesStorage';

const _store = vi.hoisted(() => new Map<string, any>());
const _lsStore = vi.hoisted(() => new Map<string, string>());

vi.mock('./db', () => ({
  getDb: vi.fn(() =>
    Promise.resolve({
      get: async (table: string, key: string) => _store.get(`${table}:${key}`),
      put: async (table: string, value: any) => { _store.set(`${table}:${value.id}`, value); },
      add: async (table: string, value: any) => { _store.set(`${table}:${value.id}`, value); },
      delete: async (table: string, key: string) => { _store.delete(`${table}:${key}`); },
      getAll: async (table: string) => {
        const items: any[] = [];
        for (const [k, v] of _store) if (k.startsWith(`${table}:`)) items.push(v);
        return items;
      },
      clear: async (table: string) => {
        for (const k of _store.keys()) if (k.startsWith(`${table}:`)) _store.delete(k);
      },
    })
  ),
}));

const _idCounter = vi.hoisted(() => ({ value: 0 }));
vi.mock('uuid', () => ({ v4: () => `test-id-${++_idCounter.value}` }));

vi.mock('./eventBus', () => ({
  appEventBus: { emit: vi.fn(), on: vi.fn(() => () => {}), off: vi.fn() },
}));

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

describe('notesStorage', () => {
  it('adds a note with derived title and lists newest first', async () => {
    await initNotesStore();
    const first = await addNote('', 'remember the neon palette');
    // Small delay so sort order is deterministic
    await new Promise(r => setTimeout(r, 5));
    const second = await addNote('Palette', 'cyan + magenta');
    const notes = await loadNotes();
    expect(notes).toHaveLength(2);
    expect(notes[0].id).toBe(second.id); // newest first
    expect(notes[1].id).toBe(first.id);
    expect(notes[1].title).toBe('remember the neon palette');
  });

  it('updates title/content and persists', async () => {
    await initNotesStore();
    const n = await addNote('a', 'b');
    const updated = await updateNote(n.id, { content: 'c' });
    expect(updated?.content).toBe('c');
    const notes = await loadNotes();
    expect(notes[0].content).toBe('c');
  });

  it('update of unknown id returns null', async () => {
    await initNotesStore();
    expect(await updateNote('nope', { title: 'x' })).toBeNull();
  });

  it('deletes and clears', async () => {
    await initNotesStore();
    const n = await addNote('a', 'b');
    expect(await deleteNote(n.id)).toBe(true);
    expect(await deleteNote(n.id)).toBe(false);
    await addNote('a', 'b');
    await clearNotes();
    expect(await loadNotes()).toHaveLength(0);
  });

  it('survives corrupted localStorage', async () => {
    (globalThis as any).localStorage.setItem('assistantNotes', '{broken');
    await initNotesStore();
    expect(await loadNotes()).toEqual([]);
  });

  it('sync cache returns notes after init', async () => {
    expect(getNotesSync()).toHaveLength(0);
    await initNotesStore();
    await addNote('sync', 'test');
    expect(getNotesSync()).toHaveLength(1);
  });

  it('dual-writes to localStorage on add', async () => {
    await initNotesStore();
    await addNote('dual', 'write test');
    const ls = JSON.parse(localStorage.getItem('assistantNotes') || '[]');
    expect(ls).toHaveLength(1);
    expect(ls[0].title).toBe('dual');
  });

  // ── Idempotency ──

  it('does not re-read localStorage on second call (same-session early return)', async () => {
    const legacyData = [{ id: 'n1', title: 'legacy', content: 'old', createdAt: 100, updatedAt: 100 }];
    _lsStore.set('assistantNotes', JSON.stringify(legacyData));

    const getItemSpy = vi.spyOn(globalThis.localStorage, 'getItem');

    await initNotesStore();
    expect(getItemSpy).toHaveBeenCalledWith('assistantNotes');
    expect(getNotesSync()).toHaveLength(1);
    getItemSpy.mockClear();

    await initNotesStore();
    expect(getItemSpy).not.toHaveBeenCalled();
    expect(getNotesSync()).toHaveLength(1);
  });

  it('does not re-migrate after _testReset when migration flag exists', async () => {
    const legacyData = [{ id: 'n2', title: 'persisted', content: 'data', createdAt: 200, updatedAt: 200 }];
    _lsStore.set('assistantNotes', JSON.stringify(legacyData));
    await initNotesStore();
    expect(getNotesSync()).toHaveLength(1);

    _store.set('keyval:migrated_notes_v2', true);

    _testReset();
    _lsStore.clear();

    const getItemSpy = vi.spyOn(globalThis.localStorage, 'getItem');

    await initNotesStore();
    expect(getItemSpy).not.toHaveBeenCalledWith('assistantNotes');
    expect(getNotesSync()).toHaveLength(1);
    expect(getNotesSync()[0].title).toBe('persisted');
  });
});