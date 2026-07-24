import { v4 as uuidv4 } from 'uuid';
import { getDb } from './db';
import { appEventBus } from './eventBus';

export interface AssistantNote {
  id: string;
  title: string;
  content: string;
  createdAt: number;
  updatedAt: number;
  source: 'assistant' | 'user';
}

const STORE_NAME = 'notes' as const;
const LEGACY_LS_KEY = 'assistantNotes';
const MIGRATION_FLAG_KEY = 'migrated_notes_v2';

// ── Sync cache ─────────────────────────────────────────────────────────

let _cache: AssistantNote[] = [];
let _initialized = false;

/** @internal test hook — resets module state. Not for production use. */
export const _testReset = (): void => {
  _cache = [];
  _initialized = false;
};

// ── Boot init — called once from App boot sequence ────────────────────

export async function initNotesStore(): Promise<void> {
  if (_initialized) return;

  let alreadyMigrated = false;
  try {
    const db = await getDb();
    alreadyMigrated = !!(await db.get('keyval', MIGRATION_FLAG_KEY));
  } catch {
    // IDB unavailable
  }

  // Try reading from IDB
  try {
    const db = await getDb();
    _cache = await db.getAll(STORE_NAME);
    _cache.sort((a, b) => b.updatedAt - a.updatedAt);
    if (alreadyMigrated) {
      _initialized = true;
      return;
    }
  } catch {
    _cache = [];
  }

  // One-shot migration from localStorage
  try {
    const raw = localStorage.getItem(LEGACY_LS_KEY);
    if (raw) {
      const items: AssistantNote[] = JSON.parse(raw);
      const db = await getDb();
      for (const item of items) {
        await db.add(STORE_NAME, item).catch(() => {});
      }
      _cache = items.sort((a, b) => b.updatedAt - a.updatedAt);
    }
    const db = await getDb();
    await db.put('keyval', true, MIGRATION_FLAG_KEY).catch(() => {});
  } catch (e) {
    console.error(`[migration] Failed to migrate ${LEGACY_LS_KEY}:`, e);
  }

  _initialized = true;
}

// ── Sync read (for UI useState) ───────────────────────────────────────

export function getNotesSync(): AssistantNote[] {
  return _cache;
}

// ── Async CRUD ────────────────────────────────────────────────────────

export async function loadNotes(): Promise<AssistantNote[]> {
  try {
    const db = await getDb();
    _cache = await db.getAll(STORE_NAME);
    _cache.sort((a, b) => b.updatedAt - a.updatedAt);
  } catch {
    _cache = [];
  }
  return _cache;
}

export async function addNote(
  title: string,
  content: string,
  source: 'assistant' | 'user' = 'assistant'
): Promise<AssistantNote> {
  const now = Date.now();
  const note: AssistantNote = {
    id: uuidv4(),
    title: title.trim() || content.trim().slice(0, 40) || 'Untitled note',
    content,
    createdAt: now,
    updatedAt: now,
    source,
  };

  try {
    const db = await getDb();
    await db.add(STORE_NAME, note);
  } catch (e) {
    console.error('[addNote] IDB write failed, cache not updated:', e);
    throw e;
  }

  _cache = [note, ..._cache];
  dualWriteToLocalStorage(_cache);
  appEventBus.emit('notesChanged', _cache);
  return note;
}

export async function updateNote(
  id: string,
  patch: Partial<Pick<AssistantNote, 'title' | 'content'>>
): Promise<AssistantNote | null> {
  try {
    const db = await getDb();
    const existing = await db.get(STORE_NAME, id);
    if (!existing) return null;
    const updated: AssistantNote = { ...existing, ...patch, updatedAt: Date.now() };
    await db.put(STORE_NAME, updated);

    _cache = _cache.map((n) => (n.id === id ? updated : n));
    dualWriteToLocalStorage(_cache);
    appEventBus.emit('notesChanged', _cache);
    return updated;
  } catch (e) {
    console.error('[updateNote] IDB write failed:', e);
    return null;
  }
}

export async function deleteNote(id: string): Promise<boolean> {
  try {
    const db = await getDb();
    await db.delete(STORE_NAME, id);
  } catch (e) {
    console.error('[deleteNote] IDB delete failed:', e);
    return false;
  }

  const prevLength = _cache.length;
  _cache = _cache.filter((n) => n.id !== id);
  if (_cache.length === prevLength) return false;

  dualWriteToLocalStorage(_cache);
  appEventBus.emit('notesChanged', _cache);
  return true;
}

export async function clearNotes(): Promise<void> {
  try {
    const db = await getDb();
    await db.clear(STORE_NAME);
  } catch (e) {
    console.error('[clearNotes] IDB clear failed:', e);
  }

  _cache = [];
  dualWriteToLocalStorage(_cache);
  appEventBus.emit('notesChanged', _cache);
}

// ── Dual-write helper ─────────────────────────────────────────────────

function dualWriteToLocalStorage(data: AssistantNote[]): void {
  try {
    localStorage.setItem(LEGACY_LS_KEY, JSON.stringify(data));
  } catch {
    // localStorage full or unavailable — non-fatal
  }
}