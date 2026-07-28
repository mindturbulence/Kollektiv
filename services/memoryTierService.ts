/**
 * Memory Tier Service — Phase 2 of ISSUE-29 (Knowledge & Obsidian Architecture).
 *
 * Implements the 3-tier memory model from the architecture doc:
 *
 *   Working Memory    — current conversation context (transient, auto-summarized)
 *   Long-term Memory  — durable preferences and patterns (persisted via memoryStorage)
 *   Knowledge Memory  — vault notes, research projects (persisted via obsidianStorage)
 *
 * Each tier has distinct persistence rules and promotion triggers:
 *   - working → long-term: items accessed 3+ times, or explicitly saved
 *   - long-term → knowledge: items accessed 10+ times, or explicitly promoted
 *
 * This service wraps the underlying storage layers and the knowledgeService API,
 * adding automatic tier management on top.
 */

import { knowledgeService } from './knowledgeService';
import type { KnowledgeRef } from './knowledgeService';

// ─── Types ────────────────────────────────────────────────────────────────

export interface WorkingMemoryEntry {
  /** Auto-generated id. */
  id: string;
  /** The conversational context snippet. */
  context: string;
  /** When this entry was created. */
  createdAt: number;
  /** How many times this context has been referenced. */
  accessCount: number;
  /** Whether this entry has been summarized into long-term memory. */
  summarized: boolean;
}

export interface PromotionRule {
  /** Minimum access count to trigger promotion to the next tier. */
  minAccessCount: number;
  /** Whether to auto-promote on access (vs. requiring explicit action). */
  autoPromote: boolean;
}

export interface TierConfig {
  working: PromotionRule;
  longTerm: PromotionRule;
}

// ─── Defaults ─────────────────────────────────────────────────────────────

const DEFAULT_TIER_CONFIG: TierConfig = {
  working: { minAccessCount: 3, autoPromote: true },
  longTerm: { minAccessCount: 10, autoPromote: true },
};

const MAX_WORKING_MEMORY = 20;

// ─── State ────────────────────────────────────────────────────────────────

let _workingMemory: WorkingMemoryEntry[] = [];
let _tierConfig: TierConfig = { ...DEFAULT_TIER_CONFIG };
let _nextId = 0;

// ─── Memory Tier Service ──────────────────────────────────────────────────

export const memoryTierService = {
  // ─── Configuration ──────────────────────────────────────────────────

  /** Override promotion rules at runtime. */
  configure(config: Partial<TierConfig>): void {
    _tierConfig = {
      working: { ...DEFAULT_TIER_CONFIG.working, ...config.working },
      longTerm: { ...DEFAULT_TIER_CONFIG.longTerm, ...config.longTerm },
    };
  },

  // ─── Working Memory ─────────────────────────────────────────────────

  /**
   * Add a context entry to working memory.
   * Working memory is the current conversation context — it's transient
   * and automatically summarized when it grows beyond MAX_WORKING_MEMORY.
   */
  addToWorkingMemory(context: string): void {
    _workingMemory.push({
      id: `wm_${++_nextId}`,
      context,
      createdAt: Date.now(),
      accessCount: 1,
      summarized: false,
    });

    // Trim working memory if it exceeds the limit
    if (_workingMemory.length > MAX_WORKING_MEMORY) {
      this.summarizeWorkingMemory();
    }
  },

  /**
   * Get all working memory entries.
   */
  getWorkingMemory(): WorkingMemoryEntry[] {
    return [..._workingMemory];
  },

  /**
   * Search working memory by keyword.
   */
  searchWorkingMemory(query: string): WorkingMemoryEntry[] {
    const q = query.toLowerCase();
    return _workingMemory.filter((e) => e.context.toLowerCase().includes(q));
  },

  /**
   * Summarize working memory into long-term memory.
   *
   * Condenses all non-summarized entries into a single long-term memory
   * entry, then marks them as summarized.  The summary is stored via
   * the knowledge service as a 'memory' kind item.
   */
  async summarizeWorkingMemory(): Promise<void> {
    const unsummarized = _workingMemory.filter((e) => !e.summarized);
    if (unsummarized.length === 0) return;

    // Build a condensed summary from all unsummarized entries
    // In a future phase, this could use an LLM for intelligent summarization
    const summary = unsummarized
      .map((e) => e.context)
      .join('\n')
      .slice(0, 2000);

    // Capture as a long-term memory via the knowledge service
    // Only mark entries as summarized if the capture succeeds
    const captured = await knowledgeService.capture({
      kind: 'memory',
      content: summary,
      title: `Working memory summary (${new Date().toLocaleDateString()})`,
      tags: ['auto-summary', 'working-memory'],
      tier: 'long-term',
    });

    if (!captured) {
      console.warn('[memoryTier] Failed to capture working memory summary — entries preserved');
      return;
    }

    // Mark all as summarized then remove from working memory
    for (const e of unsummarized) {
      e.summarized = true;
    }
    _workingMemory = _workingMemory.filter((e) => !e.summarized);
  },

  /**
   * Clear working memory entirely.
   */
  clearWorkingMemory(): void {
    _workingMemory = [];
  },

  // ─── Long-term Memory ───────────────────────────────────────────────

  /**
   * Get all long-term memory items from the knowledge index.
   */
  getLongTermMemories(): KnowledgeRef[] {
    return knowledgeService.list(['memory', 'note'], ['long-term']);
  },

  /**
   * Track access to a knowledge item and auto-promote if thresholds are met.
   *
   * Called when a knowledge item is accessed via search or recall.
   * Uses knowledgeService.touchAccess() to persist the access count
   * in the index, then checks auto-promotion thresholds.
   */
  async trackAccess(ref: KnowledgeRef): Promise<KnowledgeRef> {
    // Pure policy check — does NOT increment. The caller (typically
    // knowledgeService.recall() via touchAccess()) owns the increment.
    let currentRef = ref;

    // Check auto-promotion rules — working → long-term
    if (
      currentRef.tier === 'working' &&
      currentRef.accessCount >= _tierConfig.working.minAccessCount &&
      _tierConfig.working.autoPromote
    ) {
      const promoted = await knowledgeService.promote({
        ref: currentRef,
        targetTier: 'long-term',
        reason: `Auto-promoted after ${currentRef.accessCount} accesses`,
      });
      if (promoted) currentRef = promoted;
    }

    // long-term → knowledge
    if (
      currentRef.tier === 'long-term' &&
      currentRef.accessCount >= _tierConfig.longTerm.minAccessCount &&
      _tierConfig.longTerm.autoPromote
    ) {
      const promoted = await knowledgeService.promote({
        ref: currentRef,
        targetTier: 'knowledge',
        reason: `Auto-promoted after ${currentRef.accessCount} accesses`,
      });
      if (promoted) currentRef = promoted;
    }

    return currentRef;
  },

  // ─── Cross-tier Search ──────────────────────────────────────────────

  /**
   * Search across all three tiers.
   *
   * Returns results from working memory + knowledge service search,
   * with working memory results scored first for recency.
   */
  async searchAll(query: string, maxResults = 10): Promise<
    Array<
      { kind: 'working'; workingEntry: WorkingMemoryEntry; snippet: string; score: number }
      | { kind: 'knowledge'; ref: KnowledgeRef; snippet: string; score: number; tier: string }
    >
  > {
    const results: Array<
      { kind: 'working'; workingEntry: WorkingMemoryEntry; snippet: string; score: number }
      | { kind: 'knowledge'; ref: KnowledgeRef; snippet: string; score: number; tier: string }
    > = [];

    // Search working memory
    const wmResults = this.searchWorkingMemory(query);
    for (const wm of wmResults) {
      results.push({
        kind: 'working' as const,
        workingEntry: wm,
        snippet: wm.context.slice(0, 200),
        score: 0.8, // working memory has recency bonus
      });
    }

    // Search knowledge index (long-term + knowledge tiers)
    const ksResults = await knowledgeService.search({ query, maxResults });
    for (const kr of ksResults) {
      results.push({
        kind: 'knowledge' as const,
        ref: kr.ref,
        snippet: kr.snippet,
        score: kr.score,
        tier: kr.ref.tier,
      });
    }

    // Sort by score descending, limit to maxResults
    results.sort((a, b) => b.score - a.score);
    return results.slice(0, maxResults);
  },

  // ─── Stats ──────────────────────────────────────────────────────────

  /**
   * Get memory tier statistics.
   */
  getStats(): { working: number; longTerm: number; knowledge: number } {
    return {
      working: _workingMemory.length,
      longTerm: knowledgeService.list(['memory', 'note'], ['long-term']).length,
      knowledge: knowledgeService.list(['vault_note', 'note'], ['knowledge']).length,
    };
  },
};
