/**
 * semanticIndex — IndexedDB vector store with cosine similarity and
 * hash-based resumable backfill.
 *
 * Vectors are stored in the 'keyval' store under a `semantic:` prefix
 * so no DB schema migration is needed.
 *
 * `contentHash` (SHA-256 via hash-wasm) makes backfill resumable:
 * a note whose hash matches the stored value is skipped on re-run.
 */

import { getDb as getRealDb } from './db';
import { embedText } from '../services/embeddingService';
import type { LLMSettings } from '../types';
import type { VaultNote } from './vaultSearch';

// ── Helpers ────────────────────────────────────────────────────────────

const VECTOR_PREFIX = 'semantic:vector:';
const HASH_PREFIX = 'semantic:hash:';
const META_KEY = 'semantic:meta';

/** @internal test hook — replaces the DB provider so tests can avoid real IndexedDB. */
export function _setGetDb(fn: typeof getRealDb | null): void {
  _getDb = fn || getRealDb;
}

let _getDb: typeof getRealDb = getRealDb;

/**
 * Compute SHA-256 hex digest of a string using hash-wasm.
 * Falls back to a simple string-based hash if the wasm module fails to load.
 */
async function sha256(input: string): Promise<string> {
  try {
    const { createSHA256 } = await import('hash-wasm');
    const hasher = await createSHA256();
    hasher.update(input);
    return hasher.digest('hex');
  } catch {
    // Fallback: simple hash (not crypto-secure, but good enough for
    // content-diff detection)
    let hash = 0;
    for (let i = 0; i < input.length; i++) {
      const chr = input.charCodeAt(i);
      hash = ((hash << 5) - hash) + chr;
      hash |= 0; // Convert to 32bit integer
    }
    return Math.abs(hash).toString(16);
  }
}

interface VectorRecord {
  path: string;
  vector: number[];
  contentHash: string;
}

interface IndexMeta {
  count: number;
  approxBytes: number;
}

// ── Cosine similarity ─────────────────────────────────────────────────

/**
 * Compute the cosine similarity between two vectors.
 * Returns 0 for zero-magnitude or length-mismatched inputs (never NaN).
 */
export function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length || a.length === 0) return 0;

  let dot = 0;
  let magA = 0;
  let magB = 0;

  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    magA += a[i] * a[i];
    magB += b[i] * b[i];
  }

  const norm = Math.sqrt(magA) * Math.sqrt(magB);
  if (norm === 0) return 0;
  return dot / norm;
}

// ── Vector store ───────────────────────────────────────────────────────

/**
 * Store or update a vector for a given vault note path.
 */
export async function putVector(
  path: string,
  vector: number[],
  contentHash: string,
): Promise<void> {
  const db = await _getDb();
  await db.put('keyval', { path, vector, contentHash } satisfies VectorRecord, VECTOR_PREFIX + path);
  await db.put('keyval', contentHash, HASH_PREFIX + path);

  // Maintain the path index for getAllVectors / getIndexStats
  await addPath(path);
  await updateMeta(1, vector.length * 8);
}

/**
 * Retrieve all stored vectors.
 */
export async function getAllVectors(): Promise<VectorRecord[]> {
  const db = await _getDb();
  const meta = await db.get('keyval', META_KEY) as IndexMeta | undefined;
  if (!meta || meta.count === 0) return [];

  const paths = await db.get('keyval', 'semantic:paths') as string[] | undefined;
  if (!paths || paths.length === 0) return [];

  const results: VectorRecord[] = [];
  for (const p of paths) {
    const record = await db.get('keyval', VECTOR_PREFIX + p) as VectorRecord | undefined;
    if (record) results.push(record);
  }
  return results;
}

/**
 * Delete a vector by vault note path.
 */
export async function deleteVector(path: string): Promise<void> {
  const db = await _getDb();
  await db.delete('keyval', VECTOR_PREFIX + path);
  await db.delete('keyval', HASH_PREFIX + path);

  const paths = (await db.get('keyval', 'semantic:paths') as string[] | undefined) || [];
  const filtered = paths.filter((p: string) => p !== path);
  await db.put('keyval', filtered, 'semantic:paths');

  const meta = await db.get('keyval', META_KEY) as IndexMeta | undefined;
  if (meta) {
    meta.count = Math.max(0, meta.count - 1);
    await db.put('keyval', meta, META_KEY);
  }
}

/**
 * Get statistics about the vector index.
 */
export async function getIndexStats(): Promise<{ count: number; approxBytes: number }> {
  const db = await _getDb();
  const meta = await db.get('keyval', META_KEY) as IndexMeta | undefined;
  if (meta) return { count: meta.count, approxBytes: meta.approxBytes };

  const paths = (await db.get('keyval', 'semantic:paths') as string[] | undefined) || [];
  return { count: paths.length, approxBytes: 0 };
}

/**
 * Clear all vectors from the store.
 */
export async function clearVectors(): Promise<void> {
  const db = await _getDb();
  const paths = (await db.get('keyval', 'semantic:paths') as string[] | undefined) || [];
  for (const p of paths) {
    await db.delete('keyval', VECTOR_PREFIX + p);
    await db.delete('keyval', HASH_PREFIX + p);
  }
  await db.delete('keyval', 'semantic:paths');
  await db.delete('keyval', META_KEY);
}

// ── Internal helpers ───────────────────────────────────────────────────

async function getStoredHash(path: string): Promise<string | undefined> {
  const db = await _getDb();
  return db.get('keyval', HASH_PREFIX + path) as Promise<string | undefined>;
}

async function updateMeta(countDelta: number, bytesDelta: number): Promise<void> {
  const db = await _getDb();
  const meta = (await db.get('keyval', META_KEY) as IndexMeta | undefined) || { count: 0, approxBytes: 0 };
  meta.count += countDelta;
  meta.approxBytes = Math.max(0, meta.approxBytes + bytesDelta);
  await db.put('keyval', meta, META_KEY);
}

async function addPath(path: string): Promise<void> {
  const db = await _getDb();
  const paths = (await db.get('keyval', 'semantic:paths') as string[] | undefined) || [];
  if (!paths.includes(path)) {
    paths.push(path);
    await db.put('keyval', paths, 'semantic:paths');
  }
}

// ── Hybrid ranking ─────────────────────────────────────────────────────

/**
 * Combine BM25 scores with semantic (cosine) scores into a single hybrid
 * ranking. BM25 scores are normalized to 0-1 across the result set before
 * blending.
 *
 * @param results - BM25-ranked results (must have `path` and `score`).
 * @param queryVec - Embedding vector for the query.
 * @param allVectors - All stored vectors for known paths.
 * @param options - Optional weights (default: 0.6 BM25, 0.4 semantic).
 * @returns A new array re-ranked by hybrid score. Each item receives a
 *          normalized `hybridScore` in addition to the original `score`.
 */
export function hybridRank(
  results: Array<{ path: string; score: number }>,
  queryVec: number[],
  allVectors: Array<{ path: string; vector: number[] }>,
  options?: { bm25Weight?: number; semanticWeight?: number },
): Array<{ path: string; score: number; hybridScore: number }> {
  if (results.length === 0 || !queryVec.length || !allVectors.length) {
    return results.map((r) => ({ ...r, hybridScore: r.score }));
  }

  const bm25W = options?.bm25Weight ?? 0.6;
  const semW = options?.semanticWeight ?? 0.4;

  // Build a map from path to vector
  const vectorMap = new Map(allVectors.map((v) => [v.path, v.vector]));

  // Normalize BM25 scores to 0-1
  const maxScore = Math.max(...results.map((r) => r.score), 0.001);
  const minScore = Math.min(...results.map((r) => r.score), 0);
  const range = maxScore - minScore || 1;

  const hybrid: Array<{ path: string; score: number; hybridScore: number }> = [];
  const seenPaths = new Set<string>();

  // Score existing BM25 results
  for (const r of results) {
    const vec = vectorMap.get(r.path);
    const bm25Norm = (r.score - minScore) / range;
    const semScore = vec ? Math.max(0, cosineSimilarity(queryVec, vec)) : 0;
    hybrid.push({
      path: r.path,
      score: r.score,
      hybridScore: bm25W * bm25Norm + semW * semScore,
    });
    seenPaths.add(r.path);
  }

  // Add semantic neighbours not in BM25 results
  for (const [path, vec] of vectorMap) {
    if (seenPaths.has(path)) continue;
    const semScore = Math.max(0, cosineSimilarity(queryVec, vec));
    if (semScore > 0.5) {
      hybrid.push({
        path,
        score: 0,
        hybridScore: semW * semScore,
      });
    }
  }

  // Sort by hybrid score descending
  hybrid.sort((a, b) => b.hybridScore - a.hybridScore);

  return hybrid;
}

// ── Resumable backfill ─────────────────────────────────────────────────

/**
 * Backfill the vector store from vault notes.
 *
 * Resumption works by content hash: notes whose SHA-256 hash matches the
 * stored value are skipped (costs one cheap hash per note instead of an
 * embedding network call).
 *
 * @param notes - Array of VaultNote from the vault walk.
 * @param settings - LLMSettings (used for Ollama config).
 * @param onProgress - Optional callback with (done, total).
 * @param shouldStop - Optional predicate; when it returns true, backfill
 *                     stops early.
 * @returns Summary of what happened.
 */
export async function backfillVectors(
  notes: VaultNote[],
  settings: LLMSettings,
  onProgress?: (done: number, total: number) => void,
  shouldStop?: () => boolean,
): Promise<{ embedded: number; skipped: number; failed: number }> {
  let embedded = 0;
  let skipped = 0;
  let failed = 0;
  let done = 0;
  const total = notes.length;

  for (const note of notes) {
    if (shouldStop && shouldStop()) break;
    done++;

    const hash = await sha256(note.content);
    const storedHash = await getStoredHash(note.path);

    if (storedHash === hash) {
      skipped++;
      if (onProgress) onProgress(done, total);
      continue;
    }

    const vector = await embedText(note.title + '\n' + note.content, settings);
    if (vector === null) {
      failed++;
      if (onProgress) onProgress(done, total);
      continue;
    }

    await putVector(note.path, vector, hash);
    await addPath(note.path);
    await updateMeta(1, vector.length * 8);
    embedded++;

    if (onProgress) onProgress(done, total);
  }

  return { embedded, skipped, failed };
}
