import { v4 as uuidv4 } from 'uuid';
import { getDb } from './db';

export interface MemoryEntry {
  id: string;
  fact: string;
  createdAt: number;
}

const STORE_NAME = 'memories' as const;
const LEGACY_LS_KEY = 'assistantMemories';
const MIGRATION_FLAG_KEY = 'migrated_memories_v2';
const MAX = 50;

// ── Sync cache ─────────────────────────────────────────────────────────

let _cache: MemoryEntry[] = [];
let _initialized = false;

/** @internal test hook — resets module state. Not for production use. */
export const _testReset = (): void => {
  _cache = [];
  _initialized = false;
  _agentMemoryBlock = null;
};

// ── Boot init — called once from App boot sequence ────────────────────

export async function initMemoriesStore(): Promise<void> {
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
    _cache.sort((a, b) => b.createdAt - a.createdAt);
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
      const items: MemoryEntry[] = JSON.parse(raw);
      const db = await getDb();
      for (const item of items) {
        await db.add(STORE_NAME, item).catch(() => {});
      }
      _cache = items.sort((a, b) => b.createdAt - a.createdAt);
    }
    const db = await getDb();
    await db.put('keyval', true, MIGRATION_FLAG_KEY).catch(() => {});
  } catch (e) {
    console.error(`[migration] Failed to migrate ${LEGACY_LS_KEY}:`, e);
  }

  _initialized = true;
}

// ── Sync read (for UI useState) ───────────────────────────────────────

export function getMemoriesSync(): MemoryEntry[] {
  return _cache;
}

// ── Async CRUD ────────────────────────────────────────────────────────

export async function loadMemories(): Promise<MemoryEntry[]> {
  try {
    const db = await getDb();
    _cache = await db.getAll(STORE_NAME);
    _cache.sort((a, b) => b.createdAt - a.createdAt);
  } catch {
    _cache = [];
  }
  return _cache;
}

export async function addMemory(fact: string): Promise<MemoryEntry | null> {
  const trimmed = fact.trim();
  if (!trimmed) return null;
  // Deduplicate against cache (fast) and IDB (authoritative)
  if (_cache.some((m) => m.fact === trimmed)) return null;

  const entry: MemoryEntry = { id: uuidv4(), fact: trimmed, createdAt: Date.now() };

  try {
    const db = await getDb();
    await db.add(STORE_NAME, entry);

    // Enforce MAX — delete oldest entries if over limit
    const all = await db.getAll(STORE_NAME);
    if (all.length > MAX) {
      all.sort((a, b) => a.createdAt - b.createdAt); // oldest first
      const toDelete = all.slice(0, all.length - MAX);
      for (const old of toDelete) {
        await db.delete(STORE_NAME, old.id).catch(() => {});
      }
    }
  } catch (e) {
    console.error('[addMemory] IDB write failed, cache not updated:', e);
    return null;
  }

  // Update cache (enforce max — newest first)
  _cache = [entry, ..._cache].slice(0, MAX);
  dualWriteToLocalStorage(_cache);
  return entry;
}

export async function deleteMemory(id: string): Promise<boolean> {
  try {
    const db = await getDb();
    await db.delete(STORE_NAME, id);
  } catch (e) {
    console.error('[deleteMemory] IDB delete failed:', e);
    return false;
  }

  const prevLength = _cache.length;
  _cache = _cache.filter((m) => m.id !== id);
  if (_cache.length === prevLength) return false;

  dualWriteToLocalStorage(_cache);
  return true;
}

// ── Dual-write helper ─────────────────────────────────────────────────

function dualWriteToLocalStorage(data: MemoryEntry[]): void {
  try {
    localStorage.setItem(LEGACY_LS_KEY, JSON.stringify(data));
  } catch {
    // localStorage full or unavailable — non-fatal
  }
}

/**
 * System-prompt block injected by buildSystemIdentity. Empty string when
 * there is nothing remembered, so it adds zero tokens by default.
 */
export function memoryPromptBlock(): string {
  if (!_cache.length) return '';
  return `Persistent memories about the user from earlier sessions (use them, do not recite them unprompted):\n${_cache.map((m) => `- ${m.fact}`).join('\n')}`;
}

/**
 * A cached block of agent memory (AGENT.md content) for use by the
 * memory consolidation service. Updated by syncAgentMemoryToVault.
 */
let _agentMemoryBlock: string | null = null;

export function getAgentMemoryBlock(): string | null {
  return _agentMemoryBlock;
}

/**
 * Persist the consolidated AGENT.md content to both the in-memory cache
 * and the vault (via the file system manager). Currently caches in-memory;
 * vault persistence requires the FileSystemManager to be available.
 */
export async function syncAgentMemoryToVault(content: string): Promise<void> {
  _agentMemoryBlock = content;
}