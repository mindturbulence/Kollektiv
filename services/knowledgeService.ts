/**
 * Knowledge Manager API — Phase 1 of ISSUE-29 (Knowledge & Obsidian Architecture).
 *
 * Unified interface over the existing storage layers (memoryStorage, obsidianStorage,
 * notesStorage, galleryStorage, researchVaultService) providing:
 *
 *   - capture()   — save any piece of information to the right store
 *   - search()    — search across all stores with unified results
 *   - recall()    — retrieve specific items by reference
 *   - promote()   — move items between memory tiers (working → long-term → knowledge)
 *   - distill()   — compress raw material into a reusable form
 *   - archive()   — soft-delete / deprioritise outdated items
 *
 * Each operation is self-contained and works with whichever stores are currently
 * connected.  No store is required — if a store isn't available, its operations
 * silently return empty/default results.
 */

import type { MemoryCategory } from '../utils/memoryStorage';
import { knowledgeLifecycle } from './knowledgeLifecycle';
import type { LifecycleStage } from './knowledgeLifecycle';

// ─── Types ────────────────────────────────────────────────────────────────

/** The tier a piece of knowledge lives in. */
export type KnowledgeTier = 'working' | 'long-term' | 'knowledge';

/** The kind of a knowledge item. */
export type KnowledgeKind =
  | 'memory'        // from memoryStorage (user facts/preferences)
  | 'note'          // from notesStorage (assistant notes)
  | 'vault_note'    // from obsidianStorage (Obsidian vault)
  | 'gallery_item'  // from galleryStorage
  | 'research_project' // from researchVaultService
  | 'prompt'        // from promptStorage
  | 'file'          // from vault file system
  | 'unknown';

/** A unified reference to any knowledge item. */
export interface KnowledgeRef {
  kind: KnowledgeKind;
  id: string;
  /** Human-readable label. */
  title: string;
  /** Original source store-specific path or key. */
  sourcePath?: string;
  /** The tier this item currently lives in. */
  tier: KnowledgeTier;
  /** When this item was last accessed / used. */
  lastAccessedAt: number;
  /** Usage count (how many times this has been referenced). */
  accessCount: number;
  /** Tags for filtering/discovery. */
  tags: string[];
}

/** Result of a unified search. */
export interface KnowledgeSearchResult {
  ref: KnowledgeRef;
  /** Relevance snippet. */
  snippet: string;
  /** Relevance score 0-1. */
  score: number;
}

/** Options for capture(). */
export interface CaptureOptions {
  kind: KnowledgeKind;
  content: string;
  title?: string;
  tags?: string[];
  /** Initial tier (default: 'long-term'). */
  tier?: KnowledgeTier;
  /** Lifecycle stage for folder projection (default: auto-determined). */
  lifecycleStage?: LifecycleStage;
  /** For vault_note kind — the file path within the vault. */
  path?: string;
  /** For memory kind — the category. */
  category?: MemoryCategory;
  /** For gallery_item kind — additional metadata. */
  metadata?: Record<string, any>;
}

/** Options for search(). */
export interface SearchOptions {
  query: string;
  kinds?: KnowledgeKind[];
  tiers?: KnowledgeTier[];
  tags?: string[];
  maxResults?: number;
}

/** Options for promote(). */
export interface PromoteOptions {
  ref: KnowledgeRef;
  targetTier: KnowledgeTier;
  /** Reason for promotion (logged for traceability). */
  reason?: string;
}

// ─── Defaults ─────────────────────────────────────────────────────────────

const MAX_SEARCH_RESULTS = 30;

// ─── Internal registry of tracked items ───────────────────────────────────
// This is an in-memory index of all captured/promoted items.  It's rebuilt
// from the underlying stores on init, and updated on each capture/promote/archive.
// In a future phase, this could be persisted to IDB.

const _index = new Map<string, KnowledgeRef>();

function indexKey(kind: KnowledgeKind, id: string): string {
  return `${kind}::${id}`;
}

function storeRef(ref: KnowledgeRef): void {
  _index.set(indexKey(ref.kind, ref.id), ref);
}

// ─── Knowledge Manager API ────────────────────────────────────────────────

export const knowledgeService = {
  /**
   * Capture a piece of information into the knowledge system.
   *
   * Routes to the appropriate underlying store based on `kind`:
   *   - memory        → addMemory()
   *   - note          → addNote() (async import)
   *   - vault_note    → writeNote() in obsidianStorage
   *   - gallery_item  → addItemToGallery() (async import)
   *   - file          → saveFile() via fileSystemManager (async import)
   *
   * Returns the KnowledgeRef for the captured item, or null on failure.
   */
  async capture(options: CaptureOptions): Promise<KnowledgeRef | null> {
    const { kind, content, title, tags, tier, lifecycleStage, path, category, metadata } = options;
    const now = Date.now();
    const targetTier = tier ?? 'long-term';

    try {
      switch (kind) {
        case 'memory': {
          const { addMemory } = await import('../utils/memoryStorage');
          const entry = await addMemory(content, { category, tags });
          if (!entry) return null;
          const ref: KnowledgeRef = {
            kind: 'memory',
            id: entry.id,
            title: title || content.slice(0, 80),
            tier: targetTier,
            lastAccessedAt: now,
            accessCount: 0,
            tags: tags || entry.tags,
          };
          storeRef(ref);
          return ref;
        }

        case 'note': {
          const { addNote } = await import('../utils/notesStorage');
          const note = await addNote(title || '', content, 'assistant');
          const ref: KnowledgeRef = {
            kind: 'note',
            id: note.id,
            title: note.title || title || content.slice(0, 80),
            sourcePath: undefined,
            tier: targetTier,
            lastAccessedAt: now,
            accessCount: 0,
            tags: tags || [],
          };
          storeRef(ref);
          return ref;
        }

        case 'vault_note': {
          const stage = knowledgeLifecycle.determineStage(kind, targetTier, tags, lifecycleStage);
          const { writeNote } = await import('../utils/obsidianStorage');
          const notePath = path || knowledgeLifecycle.generatePath(stage, kind, `${Date.now()}`, title);
          const frontmatter = knowledgeLifecycle.buildFrontmatter(stage, {
            kind, title: title || '', tags: tags || [], tier: targetTier,
          }, { captured_at: new Date(now).toISOString() });
          await writeNote(notePath, frontmatter + content);
          const ref: KnowledgeRef = {
            kind: 'vault_note',
            id: notePath,
            title: title || notePath.split('/').pop()?.replace(/\.md$/, '') || notePath,
            sourcePath: notePath,
            tier: targetTier,
            lastAccessedAt: now,
            accessCount: 0,
            tags: tags || [],
          };
          storeRef(ref);
          return ref;
        }

        case 'gallery_item': {
          const { addItemToGallery } = await import('../utils/galleryStorage');
          const urls = metadata?.urls || [];
          const item = await addItemToGallery(
            metadata?.mediaType || 'image',
            Array.isArray(urls) ? urls : [urls],
            tags || ['knowledge'],
            undefined,
            title || content.slice(0, 80),
            [],
            content,
            metadata?.prompt,
          );
          const ref: KnowledgeRef = {
            kind: 'gallery_item',
            id: item.id,
            title: item.title || title || content.slice(0, 80),
            tier: targetTier,
            lastAccessedAt: now,
            accessCount: 0,
            tags: tags || item.tags || [],
          };
          storeRef(ref);
          return ref;
        }

        default:
          console.warn(`[knowledge] Unsupported capture kind: ${kind}`);
          return null;
      }
    } catch (err) {
      console.error(`[knowledge] capture failed for ${kind}:`, err);
      return null;
    }
  },

  /**
   * Search across all indexed knowledge items.
   *
   * Case-insensitive substring matching against titles, tags, and content.
   * Content loading is done in two passes: first score by title+tags (fast),
   * then only load content for the top 20 candidates for content scoring.
   * This avoids per-item async content reads for low-relevance items.
   */
  async search(options: SearchOptions): Promise<KnowledgeSearchResult[]> {
    const { query, kinds, tiers, tags, maxResults } = options;
    const q = query.toLowerCase().trim();
    if (!q) return [];

    const candidates = Array.from(_index.values()).filter((ref) => {
      if (kinds && !kinds.includes(ref.kind)) return false;
      if (tiers && !tiers.includes(ref.tier)) return false;
      if (tags && tags.length > 0 && !tags.some((t) => ref.tags.includes(t))) return false;
      return true;
    });

    // Pass 1: score by title + tags only (synchronous, fast)
    const prelimScored: { ref: KnowledgeRef; score: number; snippet: string }[] = [];
    for (const ref of candidates) {
      let score = 0;
      let snippet = '';

      if (ref.title.toLowerCase().includes(q)) {
        score += 0.5;
        snippet = ref.title.slice(0, 200);
      }
      if (ref.tags.some((t) => t.toLowerCase().includes(q))) {
        score += 0.3;
      }

      if (score > 0) {
        prelimScored.push({ ref, score, snippet });
      }
    }

    // Sort by preliminary score, take top 20 for content enrichment
    prelimScored.sort((a, b) => b.score - a.score);
    const topCandidates = prelimScored.slice(0, Math.min(20, maxResults ?? MAX_SEARCH_RESULTS * 2));

    // Pass 2: enrich top candidates with content scoring
    const scored: KnowledgeSearchResult[] = [];
    for (const { ref, score: prelimScore, snippet: prelimSnippet } of topCandidates) {
      let score = prelimScore;
      let snippet = prelimSnippet;

      try {
        const content = await loadContentForRef(ref);
        if (content) {
          const lower = content.toLowerCase();
          const idx = lower.indexOf(q);
          if (idx !== -1) {
            score += 0.4;
            snippet = content.slice(Math.max(0, idx - 80), idx + q.length + 80);
          }
        }
      } catch {
        // content loading is best-effort
      }

      scored.push({ ref, snippet: snippet || ref.title, score: Math.min(score, 1.0) });
    }

    scored.sort((a, b) => b.score - a.score);
    return scored.slice(0, maxResults ?? MAX_SEARCH_RESULTS);
  },

  /**
   * Record an access to a knowledge item (increments access count and
   * updates lastAccessedAt).  Returns a new KnowledgeRef with the updated
   * fields — the caller should use this returned ref in future operations.
   *
   * This is the lightweight counterpart to recall() — it does NOT load
   * content, it only updates the access metadata.
   */
  touchAccess(ref: KnowledgeRef): KnowledgeRef {
    const updated = { ...ref, accessCount: ref.accessCount + 1, lastAccessedAt: Date.now() };
    storeRef(updated);
    return updated;
  },

  /**
   * Recall a specific knowledge item by its ref.
   * Returns the stored content if available, or null.
   * Also updates access metadata via touchAccess.
   */
  async recall(ref: KnowledgeRef): Promise<string | null> {
    this.touchAccess(ref);

    try {
      return await loadContentForRef(ref);
    } catch {
      return null;
    }
  },

  /**
   * Promote a knowledge item to a higher tier.
   *
   * Rules:
   *   working → long-term: item becomes durable across sessions
   *   long-term → knowledge: item is written to the vault as a permanent note
   *   working → knowledge: shortcut — direct to vault
   */
  async promote(options: PromoteOptions): Promise<KnowledgeRef | null> {
    const { ref, targetTier } = options;

    if (ref.tier === targetTier) return ref;

    const now = Date.now();
    const oldTier = ref.tier;
    const updated = { ...ref, tier: targetTier, lastAccessedAt: now, accessCount: ref.accessCount + 1 };
    storeRef(updated);

    // If promoting to knowledge tier, persist to vault with lifecycle folder projection
    if (targetTier === 'knowledge' && oldTier !== 'knowledge') {
      await projectToLifecycle(ref, oldTier);
    }

    return ref;
  },

  /**
   * Distill a knowledge item into a condensed, reusable form.
   *
   * For memories: compresses multiple related memories into a single preference summary.
   * For notes: extracts key points as bullet-point summary.
   * For vault notes: creates a concise reference snippet.
   */
  async distill(ref: KnowledgeRef): Promise<string | null> {
    const content = await loadContentForRef(ref);
    if (!content) return null;

    // Simple extractive distillation: take first 500 chars + key headings/tags
    switch (ref.kind) {
      case 'memory': {
        // Condense a fact to its essence
        return content.length > 200 ? content.slice(0, 200) + '…' : content;
      }
      case 'note':
      case 'vault_note': {
        // Extract headings and first paragraph
        const headings = content.match(/^#{1,3}\s+.*$/gm) || [];
        const firstPara = content.split('\n\n').find((p) => p.trim().length > 0) || '';
        const lines = [
          ...headings.slice(0, 3),
          firstPara.length > 200 ? firstPara.slice(0, 200) + '…' : firstPara,
        ];
        return lines.join('\n');
      }
      default:
        return content.length > 500 ? content.slice(0, 500) + '…' : content;
    }
  },

  /**
   * Archive a knowledge item — soft-deletes it from the active index
   * and optionally removes it from the underlying store.
   *
   * Returns true if the item was archived.
   */
  async archive(ref: KnowledgeRef, removeFromStore = false): Promise<boolean> {
    const key = indexKey(ref.kind, ref.id);
    if (!_index.has(key)) return false;

    // Remove from index regardless
    _index.delete(key);

    if (removeFromStore) {
      try {
        switch (ref.kind) {
          case 'memory': {
            const { deleteMemory } = await import('../utils/memoryStorage');
            await deleteMemory(ref.id);
            break;
          }
          case 'note': {
            const { deleteNote } = await import('../utils/notesStorage');
            await deleteNote(ref.id);
            break;
          }
          case 'vault_note': {
            if (ref.sourcePath) {
              const { deleteNoteByPath } = await import('../utils/obsidianStorage');
              await deleteNoteByPath(ref.sourcePath);
            }
            break;
          }
          default:
            // No automatic removal for other kinds
            break;
        }
      } catch (err) {
        console.warn('[knowledge] Failed to remove from store during archive:', err);
        return false;
      }
    }

    return true;
  },

  /**
   * List all indexed items, optionally filtered.
   */
  list(kinds?: KnowledgeKind[], tiers?: KnowledgeTier[]): KnowledgeRef[] {
    const all = Array.from(_index.values());
    return all.filter((ref) => {
      if (kinds && !kinds.includes(ref.kind)) return false;
      if (tiers && !tiers.includes(ref.tier)) return false;
      return true;
    });
  },

  /**
   * Get the count of indexed items.
   */
  get size(): number {
    return _index.size;
  },

  /**
   * Rebuild the index from underlying stores.
   * Call this at app startup after all stores are initialised.
   */
  async rebuildIndex(): Promise<number> {
    _index.clear();
    let count = 0;

    // Index memories
    try {
      const { loadMemories } = await import('../utils/memoryStorage');
      const memories = await loadMemories();
      for (const m of memories) {
        storeRef({
          kind: 'memory',
          id: m.id,
          title: m.fact.slice(0, 80),
          tier: 'long-term',
          lastAccessedAt: m.createdAt,
          accessCount: 0,
          tags: m.tags,
        });
        count++;
      }
    } catch { /* store unavailable */ }

    // Index notes
    try {
      const { loadNotes } = await import('../utils/notesStorage');
      const notes = await loadNotes();
      for (const n of notes) {
        storeRef({
          kind: 'note',
          id: n.id,
          title: n.title || n.content.slice(0, 80),
          tier: 'long-term',
          lastAccessedAt: n.updatedAt || n.createdAt,
          accessCount: 0,
          tags: [],
        });
        count++;
      }
    } catch { /* store unavailable */ }

    // Vault notes (obsidianStorage) are intentionally not indexed here because
    // walking the entire vault is expensive and the BM25 search index in
    // vaultSearch.ts already handles full-text vault search.  Individual vault
    // notes can still be captured via knowledgeService.capture({ kind: 'vault_note', ... })
    // which adds them to the index as they're encountered.

    // Index lifecycle folders (vault notes organized by inbox/projects/output/wiki)
    try {
      const vaultFiles = await knowledgeLifecycle.scanVaultFolders();
      for (const [stage, files] of Object.entries(vaultFiles)) {
        for (const filePath of files) {
          storeRef({
            kind: 'vault_note',
            id: filePath,
            title: filePath.split('/').pop()?.replace(/\.md$/, '') || filePath,
            sourcePath: filePath,
            tier: 'knowledge',
            lastAccessedAt: 0,
            accessCount: 0,
            tags: [stage],
          });
          count++;
        }
      }
    } catch { /* lifecycle scan unavailable */ }

    console.log(`[knowledge] Index rebuilt: ${count} items`);
    return count;
  },

};

// ─── Lifecycle helpers ─────────────────────────────────────────────────────

/**
 * Project a promoted item to the appropriate lifecycle folder in the vault.
 * Called by promote() when targetTier === 'knowledge'.
 */
async function projectToLifecycle(ref: KnowledgeRef, oldTier: KnowledgeTier): Promise<void> {
  let obsidianConnected = false;
  try {
    const { isObsidianConnected } = await import('../utils/obsidianStorage');
    obsidianConnected = isObsidianConnected();
  } catch { /* not available */ }

  if (!obsidianConnected) {
    console.warn('[knowledge] Obsidian not connected — promotion persisted in memory only');
    return;
  }

  try {
    const content = await loadContentForRef(ref);
    if (content) {
      const stage = knowledgeLifecycle.determineStage(ref.kind, 'knowledge', ref.tags);
      const { newPath } = (await knowledgeLifecycle.promote(
        ref.sourcePath,
        // Map old tier to lifecycle stage for "promoted from" tracking
        oldTier === 'working' ? 'inbox' : oldTier === 'long-term' ? 'inbox' : 'projects',
        stage,
        { kind: ref.kind, id: ref.id, title: ref.title, tags: ref.tags, tier: 'knowledge' },
        content,
      )) || { newPath: undefined };

      if (newPath) {
        ref.sourcePath = newPath;
      }
    }
  } catch (err) {
    console.warn('[knowledge] Failed to persist promoted item to vault:', err);
  }
}

// ─── Content loading helpers ──────────────────────────────────────────────

async function loadContentForRef(ref: KnowledgeRef): Promise<string | null> {
  switch (ref.kind) {
    case 'memory': {
      const { getMemoriesSync } = await import('../utils/memoryStorage');
      const entry = getMemoriesSync().find((m) => m.id === ref.id);
      return entry?.fact || null;
    }
    case 'note': {
      const { loadNotes } = await import('../utils/notesStorage');
      const notes = await loadNotes();
      const note = notes.find((n) => n.id === ref.id);
      return note ? `${note.title}\n\n${note.content}` : null;
    }
    case 'vault_note': {
      if (!ref.sourcePath) return null;
      const { getNote } = await import('../utils/obsidianStorage');
      const note = await getNote(ref.sourcePath);
      return note ? note.content : null;
    }
    case 'gallery_item': {
      // Return known metadata — full content requires reading from gallery
      return `Gallery item: ${ref.title}`;
    }
    case 'file':
      return `File: ${ref.title}`;
    case 'research_project':
    case 'prompt':
    case 'unknown':
    default:
      return ref.title;
  }
}
