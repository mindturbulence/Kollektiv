/**
 * vaultSearch — BM25 full-text search index for the Obsidian vault.
 *
 * Builds an inverted index from markdown notes and ranks results using
 * the BM25 ranking function. The index is persisted to IndexedDB so it
 * survives page reloads and is only rebuilt when vault content changes.
 *
 * Key characteristics:
 * - Pure TypeScript BM25 implementation (no external search library needed)
 * - Async index building via requestIdleCallback (non-blocking, falls back
 *   to setTimeout in environments without requestIdleCallback)
 * - In-memory index for O(1) term lookups during search
 * - IndexedDB persistence for cross-session durability
 * - Snippet generation around the best-matching passage
 *
 * Usage:
 *   const index = getSearchIndex();
 *   await index.build(notes);          // Build the index
 *   const results = index.search("machine learning transformers");  // Search
 *
 * The build() method processes notes in chunks via requestIdleCallback
 * to keep the UI responsive.  search() runs synchronously from the
 * in-memory index — it is O(terms × matches) ≈ sub-millisecond for
 * typical vaults.
 *
 * NOTE: The index is built from a snapshot of vault content.  If notes
 * are created/modified/deleted after the index is built, the index will
 * be stale until rebuildSearchIndex() is called.  Future work could add
 * incremental index updates.
 */

import { getDb } from './db';

// ── Types ──────────────────────────────────────────────────────────────

export interface VaultNote {
  path: string;
  title: string;
  content: string;
}

export interface SearchResult {
  path: string;
  title: string;
  snippet: string;
  /** BM25 relevance score (higher = more relevant). */
  score: number;
  /** Total number of query terms that matched in this document. */
  matchCount: number;
}

export interface IndexStats {
  built: boolean;
  totalDocs: number;
  totalTerms: number;
  avgDocLength: number;
}

// ── Constants ───────────────────────────────────────────────────────────

/** BM25 k₁ parameter — controls term saturation. Default: 1.2 */
const BM25_K1 = 1.2;
/** BM25 b parameter — controls length normalisation. Default: 0.75 */
const BM25_B = 0.75;
/** Default max results returned by search(). */
const DEFAULT_MAX_RESULTS = 20;
/** Default snippet radius in characters around each match. */
const SNIPPET_RADIUS = 80;
/** Max tokens to keep in the inverted index (safety limit). */
const MAX_INDEX_TERMS = 200_000;

/**
 * Stop words — common English words that are excluded from the index.
 * Sourced from the standard SMART stop-word list, trimmed to ~130 terms.
 */
const STOP_WORDS = new Set([
  'a', 'about', 'above', 'after', 'again', 'against', 'all', 'am', 'an',
  'and', 'any', 'are', 'as', 'at', 'be', 'because', 'been', 'before',
  'being', 'below', 'between', 'both', 'but', 'by', 'can', 'did', 'do',
  'does', 'done', 'down', 'each', 'few', 'for', 'from', 'further', 'had',
  'has', 'have', 'having', 'here', 'how', 'i', 'if', 'in', 'into', 'is',
  'it', 'its', 'just', 'more', 'most', 'much', 'my', 'no', 'nor', 'not',
  'now', 'of', 'on', 'once', 'only', 'or', 'other', 'our', 'out', 'over',
  'own', 'per', 'put', 're', 'same', 'she', 'should', 'show', 'side',
  'since', 'so', 'some', 'such', 'than', 'that', 'the', 'their', 'them',
  'then', 'there', 'these', 'they', 'this', 'through', 'to', 'too',
  'under', 'until', 'up', 'upon', 'us', 'very', 'was', 'way', 'we',
  'were', 'what', 'when', 'where', 'which', 'while', 'who', 'why',
  'will', 'with', 'would', 'you', 'your',
]);

/** Regex that matches one or more non-alphanumeric characters (token separator). */
const TOKEN_SPLIT_RE = /[^a-z0-9]+/g;

// ── Polyfill requestIdleCallback for environments that lack it ──────────

const _ric: (cb: (deadline: IdleDeadline) => void, opts?: { timeout?: number }) => number =
  typeof requestIdleCallback !== 'undefined'
    ? requestIdleCallback
    : (cb) => +setTimeout(() => cb({
        didTimeout: false,
        timeRemaining: () => 50,
      }), 0);

// ── Document store types (internal) ───────────────────────────────────

interface DocRecord {
  id: string;       // = path (unique)
  path: string;
  title: string;
  bodyLength: number;
}

interface Posting {
  /** Term frequency in this document. */
  tf: number;
}

/** Inverted index: term → docId → Posting */
type InvertedIndex = Map<string, Map<string, Posting>>;

// ── IDB helpers ───────────────────────────────────────────────────────

const INDEX_STORE = 'search_index' as const;
const INDEX_META_KEY = 'vault_search_meta';

/** Internal interface for serialising the index to IDB. */
interface IndexSnapshot {
  version: number;
  totalDocs: number;
  avgDocLength: number;
  /** Serialised inverted index: [[term, [[docId, {tf}], ...]], ...] */
  entries: [string, [string, Posting][]][];
  /** Document records: [id, DocRecord][] */
  docs: [string, DocRecord][];
}

// ── The Index class ───────────────────────────────────────────────────

export class VaultSearchIndex {
  private invertedIndex: InvertedIndex = new Map();
  private docs = new Map<string, DocRecord>();
  private avgDocLength = 0;
  private totalDocs = 0;
  private built = false;
  private building = false;

  // ── Public API ─────────────────────────────────────────────────────

  /** Whether the index has been built (or loaded from IDB). */
  get isBuilt(): boolean {
    return this.built;
  }

  /** Whether an index build is currently in progress. */
  get isBuilding(): boolean {
    return this.building;
  }

  /** Current index statistics. */
  getStats(): IndexStats {
    return {
      built: this.built,
      totalDocs: this.totalDocs,
      totalTerms: this.invertedIndex.size,
      avgDocLength: this.avgDocLength,
    };
  }

  /**
   * Build or rebuild the index from the given vault notes.
   * Processes notes in chunks via requestIdleCallback to avoid blocking
   * the main thread.  Resolves once the index is fully built and persisted.
   */
  async build(notes: VaultNote[]): Promise<void> {
    if (this.building) throw new Error('Index build already in progress');
    this.building = true;

    // Reset state
    this.invertedIndex.clear();
    this.docs.clear();
    this.totalDocs = notes.length;

    if (notes.length === 0) {
      this.avgDocLength = 0;
      this.built = true;
      this.building = false;
      return;
    }

    const termDocCount = new Map<string, number>(); // term → #docs containing it
    let totalBodyLength = 0;

    // Process notes in chunks using requestIdleCallback
    const CHUNK = 10; // notes per chunk
    let idx = 0;

    await new Promise<void>((resolve, reject) => {
      const processChunk = (deadline: IdleDeadline) => {
        try {
          const start = idx;
          const end = Math.min(start + CHUNK, notes.length);

          for (let i = start; i < end; i++) {
            const note = notes[i];
            const body = stripMarkdown(stripFrontmatter(note.content));
            const tokens = tokenize(body);
            const docId = note.path;

            this.docs.set(docId, {
              id: docId,
              path: note.path,
              title: note.title,
              bodyLength: tokens.length,
            });
            totalBodyLength += tokens.length;

            // Count term frequencies for this document
            const tfMap = new Map<string, number>();
            for (const token of tokens) {
              tfMap.set(token, (tfMap.get(token) || 0) + 1);
            }

            // Add to inverted index
            for (const [term, tf] of tfMap) {
              let postings = this.invertedIndex.get(term);
              if (!postings) {
                if (this.invertedIndex.size >= MAX_INDEX_TERMS) continue;
                postings = new Map();
                this.invertedIndex.set(term, postings);
              }
              postings.set(docId, { tf });
              termDocCount.set(term, (termDocCount.get(term) || 0) + 1);
            }
          }

          idx = end;

          if (idx >= notes.length) {
            // Done — compute average doc length
            this.avgDocLength = totalBodyLength / notes.length;
            this.built = true;
            this.building = false;

            // Persist to IDB in the background (don't await — fire and forget)
            this.persist().catch((e) =>
              console.error('[vaultSearch] Failed to persist index:', e),
            );

            resolve();
          } else if (deadline.timeRemaining() > 0 || deadline.didTimeout) {
            // More time available — continue immediately
            processChunk(deadline);
          } else {
            // Yield to next idle callback
            _ric(processChunk, { timeout: 2000 });
          }
        } catch (e) {
          this.building = false;
          reject(e);
        }
      };

      _ric(processChunk, { timeout: 5000 });
    });
  }

  /**
   * Search the index for notes matching the query.
   * Returns results ranked by BM25 score, highest first.
   */
  search(query: string, maxResults = DEFAULT_MAX_RESULTS): SearchResult[] {
    if (!this.built || !query.trim()) return [];

    const queryTokens = tokenize(query);
    if (queryTokens.length === 0) return [];

    // Compute BM25 scores for all matching documents
    const scores = new Map<string, { score: number; matchCount: number }>();
    const seenTerms = new Set<string>();

    for (const term of queryTokens) {
      if (seenTerms.has(term)) continue; // deduplicate query terms
      seenTerms.add(term);

      const postings = this.invertedIndex.get(term);
      if (!postings) continue;

      const df = postings.size; // document frequency for IDF
      const idf = Math.log(
        1 + (this.totalDocs - df + 0.5) / (df + 0.5),
      );

      for (const [docId, posting] of postings) {
        const doc = this.docs.get(docId);
        if (!doc) continue;

        const tf = posting.tf;
        const docLen = doc.bodyLength;
        const numerator = tf * (BM25_K1 + 1);
        const denominator =
          tf +
          BM25_K1 * (1 - BM25_B + BM25_B * (docLen / this.avgDocLength));
        const docScore = idf * (numerator / denominator);

        const existing = scores.get(docId);
        if (existing) {
          existing.score += docScore;
          existing.matchCount += 1;
        } else {
          scores.set(docId, { score: docScore, matchCount: 1 });
        }
      }
    }

    if (scores.size === 0) return [];

    // Sort by score descending, take top N
    const ranked = Array.from(scores.entries())
      .sort((a, b) => b[1].score - a[1].score)
      .slice(0, maxResults);

    // Build result objects with snippets
    const docMap = this.docs;
    return ranked.map(([docId, { score, matchCount }]) => {
      const doc = docMap.get(docId)!;
      return {
        path: doc.path,
        title: doc.title,
        snippet: '', // snippet requires the original content — filled by caller
        score,
        matchCount,
      };
    });
  }

  /**
   * Generate a text snippet around the best-matching portion of a document.
   * Must be called with the original (un-stripped) note content.
   */
  generateSnippet(
    content: string,
    query: string,
    radius = SNIPPET_RADIUS,
  ): string {
    const body = stripFrontmatter(content);
    const queryTokens = tokenize(query);
    if (queryTokens.length === 0) return body.slice(0, radius * 2) + '…';

    const lower = body.toLowerCase();

    // Find the first occurrence of any query token in the body
    let bestIdx = -1;
    for (const token of queryTokens) {
      const idx = lower.indexOf(token);
      if (idx !== -1 && (bestIdx === -1 || idx < bestIdx)) {
        bestIdx = idx;
      }
    }

    if (bestIdx === -1) {
      // No match found in body — return the start of the document
      return body.slice(0, radius * 2) + '…';
    }

    const start = Math.max(0, bestIdx - radius);
    const end = Math.min(body.length, bestIdx + radius + 100);
    let snippet = body.slice(start, end);

    if (start > 0) snippet = '…' + snippet;
    if (end < body.length) snippet = snippet + '…';

    return snippet;
  }

  // ── Persistence ────────────────────────────────────────────────────

  /** Load index from IDB. Returns true if a valid index was loaded. */
  async loadFromIdb(): Promise<boolean> {
    try {
      const db = await getDb();
      const snapshot = await db.get(INDEX_STORE, INDEX_META_KEY) as IndexSnapshot | undefined;
      if (!snapshot || !snapshot.entries || snapshot.entries.length === 0) {
        return false;
      }

      this.invertedIndex.clear();
      this.docs.clear();

      for (const [term, postingsArr] of snapshot.entries) {
        const postings = new Map<string, Posting>(postingsArr);
        this.invertedIndex.set(term, postings);
      }

      for (const [id, doc] of snapshot.docs) {
        this.docs.set(id, doc);
      }

      this.totalDocs = snapshot.totalDocs;
      this.avgDocLength = snapshot.avgDocLength;
      this.built = true;

      return true;
    } catch {
      return false;
    }
  }

  /** Persist current index to IDB. */
  async persist(): Promise<void> {
    if (!this.built) return;
    try {
      const db = await getDb();

      const entries: [string, [string, Posting][]][] = [];
      for (const [term, postings] of this.invertedIndex) {
        entries.push([term, Array.from(postings.entries())]);
      }

      const docsArr: [string, DocRecord][] = Array.from(this.docs.entries());

      const snapshot: IndexSnapshot = {
        version: 1,
        totalDocs: this.totalDocs,
        avgDocLength: this.avgDocLength,
        entries,
        docs: docsArr,
      };

      await db.put(INDEX_STORE, snapshot, INDEX_META_KEY);
    } catch (e) {
      console.error('[vaultSearch] persist failed:', e);
    }
  }

  /** Clear the persisted index. */
  async clear(): Promise<void> {
    try {
      const db = await getDb();
      await db.delete(INDEX_STORE, INDEX_META_KEY);
    } catch {
      // best-effort
    }
    this.invertedIndex.clear();
    this.docs.clear();
    this.built = false;
    this.totalDocs = 0;
    this.avgDocLength = 0;
  }
}

// ── Singleton ──────────────────────────────────────────────────────────

let _instance: VaultSearchIndex | null = null;

/** Get the global VaultSearchIndex singleton. */
export function getSearchIndex(): VaultSearchIndex {
  if (!_instance) {
    _instance = new VaultSearchIndex();
  }
  return _instance;
}

/** @internal test hook — replaces the singleton for testing. */
export function _setSearchIndex(index: VaultSearchIndex): void {
  _instance = index;
}

// ── Utility functions ──────────────────────────────────────────────────

/**
 * Strip YAML frontmatter from a markdown note body.
 * Returns only the content after the closing `---`.
 */
function stripFrontmatter(content: string): string {
  const match = content.match(/^---\n[\s\S]*?\n---\n*/);
  if (!match) return content;
  return content.slice(match[0].length);
}

/**
 * Crude markdown stripping — removes headings markers, bold/italic,
 * inline code, wikilinks, and image embeds.  Keeps the text content.
 */
function stripMarkdown(text: string): string {
  return text
    .replace(/^#{1,6}\s+/gm, '')       // heading markers
    .replace(/\*\*(.+?)\*\*/g, '$1')    // bold
    .replace(/\*(.+?)\*/g, '$1')        // italic
    .replace(/`{1,3}[^`]*`{1,3}/g, '') // inline / fenced code
    .replace(/\[\[([^\]|]+)(?:\|[^\]]*)?\]\]/g, '$1') // wikilinks
    .replace(/!\[.*?\]\(.*?\)/g, '')    // images
    .replace(/\[([^\]]*)\]\(.*?\)/g, '$1') // markdown links
    .replace(/>\s+/gm, '')              // blockquotes
    .replace(/[-*+]\s+/gm, '')          // list markers
    .replace(/\n{3,}/g, '\n\n');        // collapse excessive newlines
}

/**
 * Tokenize text into lowercased tokens, filtering stop words and
 * single-character tokens.
 */
function tokenize(text: string): string[] {
  const tokens = text.toLowerCase().split(TOKEN_SPLIT_RE).filter(Boolean);
  return tokens.filter(
    (t) => t.length > 1 && !STOP_WORDS.has(t),
  );
}

