import { v4 as uuidv4 } from 'uuid';
import { getDb } from './db';

// ── Types ─────────────────────────────────────────────────────────────

export type MemoryCategory =
  | 'user_preference'
  | 'style_pattern'
  | 'prompt_formula'
  | 'workflow_step'
  | 'general';

export const MEMORY_CATEGORIES: MemoryCategory[] = [
  'user_preference',
  'style_pattern',
  'prompt_formula',
  'workflow_step',
  'general',
];

export interface MemoryEntry {
  id: string;
  fact: string;
  category: MemoryCategory;
  tags: string[];
  createdAt: number;
}

export interface AddMemoryOptions {
  category?: MemoryCategory;
  tags?: string[];
}

const STORE_NAME = 'memories' as const;
const LEGACY_LS_KEY = 'assistantMemories';
const MIGRATION_FLAG_KEY = 'migrated_memories_v2';
const MAX = 50;

let _cache: MemoryEntry[] = [];
let _initialized = false;

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

  try {
    const db = await getDb();
    _cache = (await db.getAll(STORE_NAME)).map(normalizeEntry);
    _cache.sort((a, b) => b.createdAt - a.createdAt);
    if (alreadyMigrated) {
      _initialized = true;
      return;
    }
  } catch {
    _cache = [];
  }

  try {
    const raw = localStorage.getItem(LEGACY_LS_KEY);
    if (raw) {
      const items: any[] = JSON.parse(raw);
      const db = await getDb();
      for (const item of items) {
        const entry = normalizeEntry(item);
        await db.add(STORE_NAME, entry).catch(() => {});
      }
      _cache = items.map(normalizeEntry).sort((a, b) => b.createdAt - a.createdAt);
    }
    const db = await getDb();
    await db.put('keyval', true, MIGRATION_FLAG_KEY).catch(() => {});
  } catch (e) {
    console.error(`[migration] Failed to migrate ${LEGACY_LS_KEY}:`, e);
  }

  _initialized = true;
}

function normalizeEntry(raw: any): MemoryEntry {
  return {
    id: raw.id,
    fact: raw.fact,
    category: MEMORY_CATEGORIES.includes(raw.category) ? raw.category : 'general',
    tags: Array.isArray(raw.tags) ? raw.tags : [],
    createdAt: raw.createdAt ?? Date.now(),
  };
}

// ── Sync read ─────────────────────────────────────────────────────────

export function getMemoriesSync(): MemoryEntry[] {
  return _cache;
}

// ── Async CRUD ────────────────────────────────────────────────────────

export async function loadMemories(): Promise<MemoryEntry[]> {
  try {
    const db = await getDb();
    _cache = (await db.getAll(STORE_NAME)).map(normalizeEntry);
    _cache.sort((a, b) => b.createdAt - a.createdAt);
  } catch {
    _cache = [];
  }
  return _cache;
}

export async function refreshMemoryCache(): Promise<MemoryEntry[]> {
  return loadMemories();
}

export async function addMemory(
  fact: string,
  options?: AddMemoryOptions,
): Promise<MemoryEntry | null> {
  const trimmed = fact.trim();
  if (!trimmed) return null;
  if (_cache.some((m) => m.fact === trimmed)) return null;

  const entry: MemoryEntry = {
    id: uuidv4(),
    fact: trimmed,
    category: options?.category || 'general',
    tags: options?.tags || [],
    createdAt: Date.now(),
  };

  try {
    const db = await getDb();
    await db.add(STORE_NAME, entry);

    const all = await db.getAll(STORE_NAME);
    if (all.length > MAX) {
      all.sort((a, b) => a.createdAt - b.createdAt);
      const toDelete = all.slice(0, all.length - MAX);
      for (const old of toDelete) {
        await db.delete(STORE_NAME, old.id).catch(() => {});
      }
    }
  } catch (e) {
    console.error('[addMemory] IDB write failed, cache not updated:', e);
    return null;
  }

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

// ── Rich retrieval ────────────────────────────────────────────────────

export function searchMemories(query: string): MemoryEntry[] {
  const q = query.toLowerCase().trim();
  if (!q) return _cache;
  return _cache.filter(
    (m) =>
      m.fact.toLowerCase().includes(q) ||
      m.tags.some((t) => t.toLowerCase().includes(q)),
  );
}

export function getMemoriesByCategory(category?: MemoryCategory): MemoryEntry[] {
  return category ? _cache.filter((m) => m.category === category) : _cache;
}

// ── Context-aware injection ───────────────────────────────────────────

const STOP_WORDS = new Set([
  'the', 'and', 'for', 'are', 'but', 'not', 'you', 'all', 'can',
  'was', 'had', 'has', 'its', 'his', 'her', 'our', 'your', 'their',
  'that', 'this', 'with', 'from', 'what', 'which', 'will', 'been',
  'have', 'were', 'they', 'them', 'some', 'very', 'just', 'also',
]);

function extractKeywords(text: string): string[] {
  return text
    .toLowerCase()
    .split(/[^a-z0-9äöüßèéêëàâùûæœçîïô]+/)
    .filter((w) => w.length >= 4 && !STOP_WORDS.has(w));
}

export function memoryPromptBlock(context?: string): string {
  if (!_cache.length) return '';

  let relevant: MemoryEntry[];
  if (context) {
    const keywords = extractKeywords(context);
    if (!keywords.length) {
      relevant = _cache;
    } else {
      const scored = _cache.map((m) => {
        const factLower = m.fact.toLowerCase();
        const tagLower = m.tags.join(' ').toLowerCase();
        const score = keywords.filter(
          (k) => factLower.includes(k) || tagLower.includes(k),
        ).length;
        return { entry: m, score };
      });
      relevant = scored
        .filter((s) => s.score > 0)
        .sort((a, b) => b.score - a.score)
        .map((s) => s.entry);
    }
  } else {
    relevant = _cache;
  }

  if (!relevant.length) return '';

  const lines = relevant.map(
    (m) => `- ${m.fact}${m.tags.length ? ` [${m.tags.join(', ')}]` : ''}`,
  );
  return `Persistent memories about the user from earlier sessions (use them, do not recite them unprompted):\n${lines.join('\n')}`;
}

let _agentMemoryBlock: string | null = null;

export function getAgentMemoryBlock(): string | null {
  return _agentMemoryBlock;
}

export async function syncAgentMemoryToVault(content: string): Promise<void> {
  _agentMemoryBlock = content;
}