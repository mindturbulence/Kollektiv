/**
 * Knowledge Lifecycle — Phase 5 of ISSUE-29 (Knowledge & Obsidian Architecture).
 *
 * Implements the inbox → projects → output → wiki folder projection model.
 *
 * Each lifecycle stage maps to a vault folder and controls where an item's
 * content is persisted.  The lifecycle provides an organizational layer on
 * top of the 3-tier memory model created in Phases 1-2:
 *
 *   Tier                  Lifecycle Stage     Vault Folder
 *   ──────────────────────────────────────────────────────
 *   working               —                    (transient, in-memory)
 *   long-term    ───→    inbox                /knowledge/inbox/
 *   knowledge    ───→    projects | output    /knowledge/projects/
 *                        wiki                 /knowledge/wiki/
 *
 * Promotion rules:
 *   - Items captured as 'memory' or 'note' kind → inbox (default)
 *   - Items with 3+ tags or explicitly classified → projects
 *   - Items explicitly promoted or completed → output
 *   - Items manually elevated for permanent reference → wiki
 *
 * Each stage has a distinct vault path template and frontmatter conventions
 * so that the vault itself becomes navigable by lifecycle stage.
 */

import type { KnowledgeKind, KnowledgeTier } from './knowledgeService';

// ─── Types ────────────────────────────────────────────────────────────────

/** Lifecycle stages a knowledge item can occupy. */
export type LifecycleStage = 'inbox' | 'projects' | 'output' | 'wiki';

/** Configuration for a lifecycle stage. */
export interface StageConfig {
  /** Vault folder path for this stage (relative to vault root). */
  folder: string;
  /** Whether this stage accepts auto-promoted items. */
  autoAccept: boolean;
  /** Description of what belongs here (for frontmatter). */
  description: string;
}

// ─── Stage configuration ──────────────────────────────────────────────────

const STAGE_CONFIG: Record<LifecycleStage, StageConfig> = {
  inbox: {
    folder: 'knowledge/inbox',
    autoAccept: true,
    description: 'Raw captured items awaiting triage',
  },
  projects: {
    folder: 'knowledge/projects',
    autoAccept: true,
    description: 'Active work items being refined',
  },
  output: {
    folder: 'knowledge/output',
    autoAccept: false,
    description: 'Completed, publishable items',
  },
  wiki: {
    folder: 'knowledge/wiki',
    autoAccept: false,
    description: 'Permanent reference documentation',
  },
};

// ─── Default stage assignment ─────────────────────────────────────────────

/** Determine the initial lifecycle stage based on kind and tier. */
function defaultStage(_kind: KnowledgeKind, tier: KnowledgeTier): LifecycleStage {
  // Knowledge-tier items go to projects (or output if explicitly specified)
  if (tier === 'knowledge') return 'projects';
  // Long-term items go to inbox
  if (tier === 'long-term') return 'inbox';
  // Working-tier items have no folder projection
  return 'inbox';
}

// ─── Lifecycle Service ────────────────────────────────────────────────────

export const knowledgeLifecycle = {
  /**
   * Get the configuration for a lifecycle stage.
   */
  getStageConfig(stage: LifecycleStage): StageConfig {
    return { ...STAGE_CONFIG[stage] };
  },

  /**
   * Get all lifecycle stages and their configs.
   */
  getAllStageConfigs(): Record<LifecycleStage, StageConfig> {
    return Object.fromEntries(
      Object.entries(STAGE_CONFIG).map(([key, config]) => [key, { ...config }]),
    ) as Record<LifecycleStage, StageConfig>;
  },

  /**
   * Determine the appropriate lifecycle stage for a new item.
   *
   * Uses a combination of tier, kind, tag count, and explicit override.
   */
  determineStage(kind: KnowledgeKind, tier: KnowledgeTier, tags?: string[], explicitStage?: LifecycleStage): LifecycleStage {
    if (explicitStage) return explicitStage;

    // Items with many tags likely belong in projects (already classified)
    if (tags && tags.length >= 3 && tier === 'long-term') return 'projects';

    return defaultStage(kind, tier);
  },

  /**
   * Generate a vault file path for an item at the given lifecycle stage.
   *
   * Format: {folder}/{kind}/{sanitized-id}.md
   * Example: knowledge/projects/note/my_project_idea.md
   */
  generatePath(stage: LifecycleStage, kind: KnowledgeKind, id: string, title?: string): string {
    const config = STAGE_CONFIG[stage];
    const safeId = id.replace(/[^a-z0-9_-]/gi, '_').slice(0, 80);
    const safeTitle = title
      ? title.replace(/[^a-z0-9_-]/gi, '_').toLowerCase().slice(0, 40)
      : safeId.slice(0, 40);
    return `${config.folder}/${kind}/${safeTitle}_${safeId}.md`;
  },

  /**
   * Build frontmatter for an item being written to a lifecycle folder.
   */
  buildFrontmatter(
    stage: LifecycleStage,
    ref: { kind: KnowledgeKind; title: string; tags: string[]; tier: KnowledgeTier },
    extra?: Record<string, string>,
  ): string {
    const config = STAGE_CONFIG[stage];
    const lines = [
      '---',
      `title: "${ref.title}"`,
      `kind: ${ref.kind}`,
      `lifecycle_stage: ${stage}`,
      `autoAccept: ${config.autoAccept}`,
      ref.tags.length ? `tags: [${ref.tags.map((t) => `"${t}"`).join(', ')}]` : '',
      ...(extra ? Object.entries(extra).map(([k, v]) => `${k}: ${v}`) : []),
      '---',
      '',
    ];
    return lines.filter(Boolean).join('\n');
  },

  /**
   * Promote an item from one lifecycle stage to another.
   *
   * In practice, this means:
   *   1. Reading the current content from the vault
   *   2. Writing it to the new stage's folder with updated frontmatter
   *   3. (Optionally) deleting the old file
   *
   * @returns The new vault path, or the original path if no change needed.
   */
  async promote(
    currentPath: string | undefined,
    fromStage: LifecycleStage,
    toStage: LifecycleStage,
    ref: { kind: KnowledgeKind; id: string; title: string; tags: string[]; tier: KnowledgeTier },
    content?: string,
  ): Promise<{ newPath: string; stage: LifecycleStage } | null> {
    if (fromStage === toStage) return null;

    const newPath = this.generatePath(toStage, ref.kind, ref.id, ref.title);

    // If we have content and the vault is available, write to the new path
    if (content) {
      try {
        const { writeNote } = await import('../utils/obsidianStorage');
        const frontmatter = this.buildFrontmatter(toStage, ref, {
          promoted_from: fromStage,
          promoted_at: new Date().toISOString(),
        });
        await writeNote(newPath, frontmatter + content);

        // Optionally remove old file
        if (currentPath) {
          try {
            const { deleteNoteByPath } = await import('../utils/obsidianStorage');
            await deleteNoteByPath(currentPath);
          } catch {
            // Non-fatal — old file might not exist
          }
        }
      } catch {
        // Vault unavailable — return the path anyway (caller can retry)
      }
    }

    return { newPath, stage: toStage };
  },

  /**
   * Get the lifecycle stage for a given vault path.
   * Returns null if the path doesn't match any known lifecycle folder.
   */
  stageFromPath(path: string): LifecycleStage | null {
    for (const [stage, config] of Object.entries(STAGE_CONFIG)) {
      if (path === config.folder || path.startsWith(config.folder + '/')) {
        return stage as LifecycleStage;
      }
    }
    return null;
  },

  /**
   * Get all items across all lifecycle folders by scanning vault structure.
   *
   * @returns A map of stage → file paths found in that stage's folder.
   */
  async scanVaultFolders(): Promise<Record<LifecycleStage, string[]>> {
    const result: Record<LifecycleStage, string[]> = {
      inbox: [],
      projects: [],
      output: [],
      wiki: [],
    };

    try {
      const { listNotes } = await import('../utils/obsidianStorage');
      for (const [stage, config] of Object.entries(STAGE_CONFIG)) {
        try {
          const files = await listNotes(config.folder);
          result[stage as LifecycleStage] = files;
        } catch (err) {
          console.warn(`[lifecycle] Could not scan ${config.folder}:`, (err as Error)?.message || err);
        }
      }
    } catch {
      // obsidianStorage unavailable
    }

    return result;
  },
};
