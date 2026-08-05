/**
 * Generation Signals — WP10 of the Adaptation Roadmap.
 *
 * Accumulates implicit signals about generation quality:
 * - Survival: item deleted vs kept (dangling resultItemIds = discarded)
 * - Publish: item published to YouTube or has publishedAt
 * - Param reuse: "Load these settings" button clicked
 * - Naming: real title vs "Untitled Group"
 * - Iteration-stop: the generation you stopped iterating from
 *
 * Signals are written as a composite score on the Generation record.
 * No notes at this stage — the assistant proposes digest writes.
 */

import { loadGenerations, saveGeneration } from '../utils/generationStorage';
import { loadGalleryItems } from '../utils/galleryStorage';
import type { Generation } from '../types';

// ── Signal weights (strongest first) ───────────────────────────────────

const WEIGHTS = {
  /** Item was kept (not deleted). Strongest signal. */
  survival: 0.35,
  /** Item was published. */
  publish: 0.25,
  /** Parameters were reused by another generation. */
  paramReuse: 0.15,
  /** Item has a real title (not "Untitled Group"). */
  naming: 0.10,
  /** Item has notes attached. */
  notes: 0.05,
  /** Item has tags. */
  tags: 0.05,
  /** Item was favorited/pinned. */
  pinned: 0.05,
} as const;

// ── Scoring ────────────────────────────────────────────────────────────

/**
 * Compute a composite quality score for a generation based on its
 * gallery items' signals. Returns 0-1.
 */
function computeScore(gen: Generation, items: Map<string, any>): number {
  if (gen.resultItemIds.length === 0) return 0;

  let totalScore = 0;
  let count = 0;

  for (const itemId of gen.resultItemIds) {
    const item = items.get(itemId);
    if (!item) {
      // Dangling ID = deleted item = strong negative signal
      totalScore += 0.1; // low score for discarded items
      count++;
      continue;
    }

    let score = 0;

    // Survival: item exists = kept
    score += WEIGHTS.survival;

    // Publish: has youtubeUrl or publishedAt
    if (item.youtubeUrl || item.publishedAt) {
      score += WEIGHTS.publish;
    }

    // Naming: not "Untitled Group"
    if (item.title && !item.title.startsWith('Untitled Group')) {
      score += WEIGHTS.naming;
    }

    // Notes attached
    if (item.notes && item.notes.trim().length > 0) {
      score += WEIGHTS.notes;
    }

    // Tags
    if (item.tags && item.tags.length > 0) {
      score += WEIGHTS.tags;
    }

    // Pinned
    if (item.isPinned) {
      score += WEIGHTS.pinned;
    }

    totalScore += Math.min(score, 1);
    count++;
  }

  return count > 0 ? totalScore / count : 0;
}

// ── Public API ─────────────────────────────────────────────────────────

/**
 * Re-score all generations based on current gallery item state.
 * Returns the number of generations scored.
 */
export async function scoreAllGenerations(): Promise<number> {
  const gens = await loadGenerations();
  const items = await loadGalleryItems();
  const itemMap = new Map(items.map(i => [i.id, i]));

  let scored = 0;
  for (const gen of gens) {
    const newScore = computeScore(gen, itemMap);
    // Only update if score changed meaningfully (> 0.01)
    if (gen.score == null || Math.abs(gen.score - newScore) > 0.01) {
      gen.score = Math.round(newScore * 100) / 100;
      gen.scoredAt = Date.now();
      await saveGeneration(gen);
      scored++;
    }
  }

  console.log(`[Signals] Scored ${scored} generations`);
  return scored;
}

/**
 * Score a single generation and save it.
 */
export async function scoreGeneration(genId: string): Promise<number> {
  const gens = await loadGenerations();
  const gen = gens.find(g => g.id === genId);
  if (!gen) return 0;

  const items = await loadGalleryItems();
  const itemMap = new Map(items.map(i => [i.id, i]));

  const score = computeScore(gen, itemMap);
  gen.score = Math.round(score * 100) / 100;
  gen.scoredAt = Date.now();
  await saveGeneration(gen);

  return gen.score;
}

/**
 * Get top-scoring generations (best performers).
 */
export async function getTopGenerations(limit = 10): Promise<Generation[]> {
  const gens = await loadGenerations();
  return gens
    .filter(g => g.score != null && g.status === 'ok')
    .sort((a, b) => (b.score || 0) - (a.score || 0))
    .slice(0, limit);
}

/**
 * Get generations for a specific backend, sorted by score.
 */
export async function getTopGenerationsByBackend(backendId: string, limit = 10): Promise<Generation[]> {
  const gens = await loadGenerations();
  return gens
    .filter(g => g.backendId === backendId && g.score != null && g.status === 'ok')
    .sort((a, b) => (b.score || 0) - (a.score || 0))
    .slice(0, limit);
}
