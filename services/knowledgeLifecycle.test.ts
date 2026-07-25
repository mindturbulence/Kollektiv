/**
 * Unit tests for knowledgeLifecycle.ts — Phase 5 (inbox → projects → output → wiki).
 *
 * Tests cover all 8 API methods of the knowledgeLifecycle singleton:
 *   getStageConfig, getAllStageConfigs, determineStage, generatePath,
 *   buildFrontmatter, promote, stageFromPath, scanVaultFolders
 *
 * Dynamic imports from utils/obsidianStorage are mocked so the tests
 * don't require a real vault connection.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { knowledgeLifecycle, type LifecycleStage } from './knowledgeLifecycle';
import type { KnowledgeKind, KnowledgeTier } from './knowledgeService';

// ─── Mock obsidianStorage module used by promote() and scanVaultFolders() ──

const mockWriteNote = vi.fn();
const mockDeleteNoteByPath = vi.fn();
const mockListNotes = vi.fn();

vi.mock('../utils/obsidianStorage', () => ({
  writeNote: mockWriteNote,
  deleteNoteByPath: mockDeleteNoteByPath,
  listNotes: mockListNotes,
}));

// ─── Helpers ───────────────────────────────────────────────────────────────

const kinds: KnowledgeKind[] = ['memory', 'note', 'vault_note', 'prompt'];
const tiers: KnowledgeTier[] = ['working', 'long-term', 'knowledge'];

// ─── Tests ─────────────────────────────────────────────────────────────────

describe('knowledgeLifecycle', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ── getStageConfig ─────────────────────────────────────────────────────

  describe('getStageConfig', () => {
    it('returns config for inbox stage', () => {
      const config = knowledgeLifecycle.getStageConfig('inbox');
      expect(config.folder).toBe('knowledge/inbox');
      expect(config.autoAccept).toBe(true);
      expect(config.description).toBe('Raw captured items awaiting triage');
    });

    it('returns config for projects stage', () => {
      const config = knowledgeLifecycle.getStageConfig('projects');
      expect(config.folder).toBe('knowledge/projects');
      expect(config.autoAccept).toBe(true);
      expect(config.description).toBe('Active work items being refined');
    });

    it('returns config for output stage', () => {
      const config = knowledgeLifecycle.getStageConfig('output');
      expect(config.folder).toBe('knowledge/output');
      expect(config.autoAccept).toBe(false);
      expect(config.description).toBe('Completed, publishable items');
    });

    it('returns config for wiki stage', () => {
      const config = knowledgeLifecycle.getStageConfig('wiki');
      expect(config.folder).toBe('knowledge/wiki');
      expect(config.autoAccept).toBe(false);
      expect(config.description).toBe('Permanent reference documentation');
    });

    it('returns a copy, not the original config object', () => {
      const config = knowledgeLifecycle.getStageConfig('inbox');
      config.folder = 'hacked';
      // A second read should still return the original value
      const config2 = knowledgeLifecycle.getStageConfig('inbox');
      expect(config2.folder).toBe('knowledge/inbox');
    });
  });

  // ── getAllStageConfigs ─────────────────────────────────────────────────

  describe('getAllStageConfigs', () => {
    it('returns all 4 lifecycle stages', () => {
      const all = knowledgeLifecycle.getAllStageConfigs();
      expect(Object.keys(all)).toEqual(['inbox', 'projects', 'output', 'wiki']);
    });

    it('each stage has folder, autoAccept, and description', () => {
      const all = knowledgeLifecycle.getAllStageConfigs();
      for (const stage of ['inbox', 'projects', 'output', 'wiki'] as LifecycleStage[]) {
        expect(all[stage]).toBeDefined();
        expect(all[stage].folder).toBeDefined();
        expect(typeof all[stage].autoAccept).toBe('boolean');
        expect(all[stage].description).toBeDefined();
      }
    });

    it('returns copies, not the original configs', () => {
      const all = knowledgeLifecycle.getAllStageConfigs();
      all.inbox.folder = 'tampered';
      const all2 = knowledgeLifecycle.getAllStageConfigs();
      expect(all2.inbox.folder).toBe('knowledge/inbox');
    });

    it('inbox and projects have autoAccept=true', () => {
      const all = knowledgeLifecycle.getAllStageConfigs();
      expect(all.inbox.autoAccept).toBe(true);
      expect(all.projects.autoAccept).toBe(true);
    });

    it('output and wiki have autoAccept=false', () => {
      const all = knowledgeLifecycle.getAllStageConfigs();
      expect(all.output.autoAccept).toBe(false);
      expect(all.wiki.autoAccept).toBe(false);
    });
  });

  // ── determineStage ─────────────────────────────────────────────────────

  describe('determineStage', () => {
    it('returns explicitStage when provided, ignoring other logic', () => {
      const result = knowledgeLifecycle.determineStage('memory', 'long-term', [], 'wiki');
      expect(result).toBe('wiki');
    });

    it('returns explicitStage even for working tier', () => {
      const result = knowledgeLifecycle.determineStage('note', 'working', [], 'output');
      expect(result).toBe('output');
    });

    it('returns projects for long-term items with 3+ tags', () => {
      const result = knowledgeLifecycle.determineStage('vault_note', 'long-term', ['tag1', 'tag2', 'tag3']);
      expect(result).toBe('projects');
    });

    it('returns projects for long-term items with exactly 3 tags', () => {
      const result = knowledgeLifecycle.determineStage('memory', 'long-term', ['a', 'b', 'c']);
      expect(result).toBe('projects');
    });

    it('returns inbox for long-term items with < 3 tags', () => {
      const result = knowledgeLifecycle.determineStage('note', 'long-term', ['single_tag']);
      expect(result).toBe('inbox');
    });

    it('returns inbox for long-term items with no tags', () => {
      const result = knowledgeLifecycle.determineStage('prompt', 'long-term');
      expect(result).toBe('inbox');
    });

    it('returns projects for knowledge-tier items', () => {
      const result = knowledgeLifecycle.determineStage('vault_note', 'knowledge');
      expect(result).toBe('projects');
    });

    it('returns projects for knowledge-tier items regardless of tags', () => {
      const result = knowledgeLifecycle.determineStage('memory', 'knowledge', ['tag1']);
      expect(result).toBe('projects');
    });

    it('returns inbox for working-tier items', () => {
      for (const kind of kinds) {
        expect(knowledgeLifecycle.determineStage(kind, 'working')).toBe('inbox');
      }
    });

    it('handles all kind + tier combinations without throwing', () => {
      for (const kind of kinds) {
        for (const tier of tiers) {
          expect(() => knowledgeLifecycle.determineStage(kind, tier)).not.toThrow();
        }
      }
    });
  });

  // ── generatePath ───────────────────────────────────────────────────────

  describe('generatePath', () => {
    it('generates path with title for inbox stage', () => {
      const path = knowledgeLifecycle.generatePath('inbox', 'note', 'abc123', 'My Note');
      expect(path).toMatch(/^knowledge\/inbox\/note\/my_note_abc123\.md$/);
    });

    it('generates path with title for projects stage', () => {
      const path = knowledgeLifecycle.generatePath('projects', 'vault_note', 'xyz789', 'Project Idea');
      expect(path).toMatch(/^knowledge\/projects\/vault_note\/project_idea_xyz789\.md$/);
    });

    it('generates path with title for output stage', () => {
      const path = knowledgeLifecycle.generatePath('output', 'memory', 'mem001', 'Final Result');
      expect(path).toMatch(/^knowledge\/output\/memory\/final_result_mem001\.md$/);
    });

    it('generates path with title for wiki stage', () => {
      const path = knowledgeLifecycle.generatePath('wiki', 'prompt', 'ref001', 'Prompt Reference');
      expect(path).toMatch(/^knowledge\/wiki\/prompt\/prompt_reference_ref001\.md$/);
    });

    it('uses id-slug as fallback when no title provided', () => {
      const path = knowledgeLifecycle.generatePath('inbox', 'note', 'my_long_id_value');
      expect(path).toBe('knowledge/inbox/note/my_long_id_value_my_long_id_value.md');
    });

    it('sanitizes special characters in id', () => {
      const path = knowledgeLifecycle.generatePath('inbox', 'note', 'hello/world:test*name?');
      expect(path).toBe('knowledge/inbox/note/hello_world_test_name__hello_world_test_name_.md');
    });

    it('sanitizes special characters in title', () => {
      const path = knowledgeLifecycle.generatePath('inbox', 'note', 'id123', 'My Cool Note!!! [draft]');
      // Title should be lowercase, spaces/special chars replaced with _, no brackets preserved
      expect(path).toMatch(/knowledge\/inbox\/note\/my_cool_note_+draft_+id123\.md$/);
    });

    it('truncates id to 80 characters', () => {
      const longId = 'a'.repeat(100);
      const path = knowledgeLifecycle.generatePath('inbox', 'note', longId);
      // id portion in path should be truncated (80 chars for id slug)
      const idPart = path.split('_').pop()?.replace('.md', '') || '';
      expect(idPart.length).toBeLessThanOrEqual(80);
    });

    it('truncates title to 40 characters', () => {
      const longTitle = 'a'.repeat(60);
      const path = knowledgeLifecycle.generatePath('inbox', 'note', 'id_val', longTitle);
      const segments = path.split('/');
      const filename = segments[segments.length - 1].replace('.md', '');
      // Format: <title-slug>_<id-slug>
      const titleSlug = filename.split('_id_val')[0];
      expect(titleSlug.length).toBeLessThanOrEqual(40);
    });
  });

  // ── buildFrontmatter ───────────────────────────────────────────────────

  describe('buildFrontmatter', () => {
    const baseRef = { kind: 'note' as KnowledgeKind, title: 'Test Note', tags: ['tag1', 'tag2'], tier: 'long-term' as KnowledgeTier };

    it('produces valid YAML frontmatter with title and kind', () => {
      const fm = knowledgeLifecycle.buildFrontmatter('inbox', baseRef);
      expect(fm).toContain('---');
      expect(fm).toContain('title: "Test Note"');
      expect(fm).toContain('kind: note');
    });

    it('includes lifecycle_stage field', () => {
      const fm = knowledgeLifecycle.buildFrontmatter('projects', baseRef);
      expect(fm).toContain('lifecycle_stage: projects');
    });

    it('includes autoAccept field from stage config', () => {
      const inboxFm = knowledgeLifecycle.buildFrontmatter('inbox', baseRef);
      expect(inboxFm).toContain('autoAccept: true');

      const outputFm = knowledgeLifecycle.buildFrontmatter('output', baseRef);
      expect(outputFm).toContain('autoAccept: false');
    });

    it('includes tags when present', () => {
      const fm = knowledgeLifecycle.buildFrontmatter('inbox', baseRef);
      expect(fm).toContain('tags: ["tag1", "tag2"]');
    });

    it('omits tags line when tags array is empty', () => {
      const fm = knowledgeLifecycle.buildFrontmatter('inbox', { ...baseRef, tags: [] });
      expect(fm).not.toContain('tags:');
    });

    it('includes extra fields when provided', () => {
      const fm = knowledgeLifecycle.buildFrontmatter('output', baseRef, {
        promoted_from: 'inbox',
        promoted_at: '2026-01-01T00:00:00.000Z',
      });
      expect(fm).toContain('promoted_from: inbox');
      expect(fm).toContain('promoted_at: 2026-01-01T00:00:00.000Z');
    });

    it('starts with --- and ends with ---', () => {
      const fm = knowledgeLifecycle.buildFrontmatter('inbox', baseRef);
      expect(fm.startsWith('---')).toBe(true);
      // Frontmatter ends with --- (trailing empty line is removed by filter(Boolean))
      expect(fm.endsWith('---')).toBe(true);
    });

    it('handles special characters in title', () => {
      const fm = knowledgeLifecycle.buildFrontmatter('wiki', {
        ...baseRef, title: 'Note with "quotes" & special chars',
      });
      expect(fm).toContain('title: "Note with "quotes" & special chars"');
    });
  });

  // ── promote ────────────────────────────────────────────────────────────

  describe('promote', () => {
    const baseRef = { kind: 'note' as KnowledgeKind, id: 'note_001', title: 'My Note', tags: [] as string[], tier: 'long-term' as KnowledgeTier };
    const content = 'This is the note body content.';

    it('returns null when fromStage equals toStage', async () => {
      const result = await knowledgeLifecycle.promote('/some/path.md', 'inbox', 'inbox', baseRef, content);
      expect(result).toBeNull();
      expect(mockWriteNote).not.toHaveBeenCalled();
    });

    it('returns null for any stage when from === to', async () => {
      for (const stage of ['inbox', 'projects', 'output', 'wiki'] as LifecycleStage[]) {
        const result = await knowledgeLifecycle.promote(undefined, stage, stage, baseRef);
        expect(result).toBeNull();
      }
    });

    it('writes content to the new vault path with frontmatter', async () => {
      mockWriteNote.mockResolvedValueOnce(undefined);
      const result = await knowledgeLifecycle.promote(undefined, 'inbox', 'projects', baseRef, content);
      expect(result).not.toBeNull();
      expect(result!.newPath).toContain('knowledge/projects/note/');
      expect(result!.stage).toBe('projects');
      expect(mockWriteNote).toHaveBeenCalledTimes(1);
      const [writtenPath, writtenContent] = mockWriteNote.mock.calls[0];
      expect(writtenPath).toContain('knowledge/projects/note/');
      // Written content should include YAML frontmatter fields
      expect(writtenContent).toContain('title: "My Note"');
      expect(writtenContent).toContain('kind: note');
      expect(writtenContent).toContain('lifecycle_stage: projects');
      // Body content should be appended after frontmatter
      expect(writtenContent).toContain(content);
    });

    it('includes promoted_from and promoted_at in frontmatter', async () => {
      mockWriteNote.mockResolvedValueOnce(undefined);
      await knowledgeLifecycle.promote('/old/path.md', 'inbox', 'output', baseRef, content);
      const [, writtenContent] = mockWriteNote.mock.calls[0];
      expect(writtenContent).toContain('promoted_from: inbox');
      expect(writtenContent).toContain('promoted_at:');
    });

    it('deletes the old file when currentPath is provided', async () => {
      mockWriteNote.mockResolvedValueOnce(undefined);
      mockDeleteNoteByPath.mockResolvedValueOnce(undefined);
      await knowledgeLifecycle.promote('/old/path.md', 'inbox', 'projects', baseRef, content);
      expect(mockDeleteNoteByPath).toHaveBeenCalledWith('/old/path.md');
    });

    it('does not delete old file when currentPath is undefined', async () => {
      mockWriteNote.mockResolvedValueOnce(undefined);
      await knowledgeLifecycle.promote(undefined, 'inbox', 'projects', baseRef, content);
      expect(mockDeleteNoteByPath).not.toHaveBeenCalled();
    });

    it('does not fail when deleteNoteByPath throws (non-fatal)', async () => {
      mockWriteNote.mockResolvedValueOnce(undefined);
      mockDeleteNoteByPath.mockRejectedValueOnce(new Error('File not found'));
      const result = await knowledgeLifecycle.promote('/old/path.md', 'inbox', 'projects', baseRef, content);
      expect(result).not.toBeNull();
      expect(result!.newPath).toBeDefined();
    });

    it('returns newPath even when writeNote throws (vault unavailable)', async () => {
      mockWriteNote.mockRejectedValueOnce(new Error('Vault disconnected'));
      const result = await knowledgeLifecycle.promote(undefined, 'inbox', 'projects', baseRef, content);
      // Should still return the path — caller can retry
      expect(result).not.toBeNull();
      expect(result!.newPath).toContain('knowledge/projects/note/');
      expect(result!.stage).toBe('projects');
    });

    it('handles promote from inbox to wiki (all stages pair)', async () => {
      mockWriteNote.mockResolvedValue(undefined);
      const pairs: [LifecycleStage, LifecycleStage][] = [
        ['inbox', 'projects'],
        ['inbox', 'output'],
        ['inbox', 'wiki'],
        ['projects', 'output'],
        ['projects', 'wiki'],
        ['output', 'wiki'],
        ['projects', 'inbox'],
        ['wiki', 'inbox'],
      ];
      for (const [from, to] of pairs) {
        mockWriteNote.mockClear();
        const result = await knowledgeLifecycle.promote(`/old_${from}.md`, from, to, baseRef, content);
        expect(result).not.toBeNull();
        expect(result!.newPath).toContain(`knowledge/${to}/`);
        expect(result!.stage).toBe(to);
      }
    });

    it('returns null when from===to for all 4 stages', async () => {
      for (const stage of ['inbox', 'projects', 'output', 'wiki'] as LifecycleStage[]) {
        expect(await knowledgeLifecycle.promote(undefined, stage, stage, baseRef)).toBeNull();
      }
    });

    it('returns newPath and skips vault write when content is not provided', async () => {
      const result = await knowledgeLifecycle.promote(undefined, 'inbox', 'projects', baseRef);
      // Should return the path without writing or deleting anything
      expect(result).not.toBeNull();
      expect(result!.newPath).toContain('knowledge/projects/note/');
      expect(result!.stage).toBe('projects');
      expect(mockWriteNote).not.toHaveBeenCalled();
      expect(mockDeleteNoteByPath).not.toHaveBeenCalled();
    });
  });

  // ── stageFromPath ──────────────────────────────────────────────────────

  describe('stageFromPath', () => {
    it('returns inbox for paths under knowledge/inbox/', () => {
      expect(knowledgeLifecycle.stageFromPath('knowledge/inbox/my_note.md')).toBe('inbox');
    });

    it('returns projects for paths under knowledge/projects/', () => {
      expect(knowledgeLifecycle.stageFromPath('knowledge/projects/vault_note/idea.md')).toBe('projects');
    });

    it('returns output for paths under knowledge/output/', () => {
      expect(knowledgeLifecycle.stageFromPath('knowledge/output/memory/mem.md')).toBe('output');
    });

    it('returns wiki for paths under knowledge/wiki/', () => {
      expect(knowledgeLifecycle.stageFromPath('knowledge/wiki/prompt/ref.md')).toBe('wiki');
    });

    it('returns null for paths outside lifecycle folders', () => {
      expect(knowledgeLifecycle.stageFromPath('vault/random_note.md')).toBeNull();
      expect(knowledgeLifecycle.stageFromPath('attachments/image.png')).toBeNull();
      expect(knowledgeLifecycle.stageFromPath('')).toBeNull();
    });

    it('returns null for paths that only partially match a folder name', () => {
      // "knowledge/inbox_extra" should NOT match "knowledge/inbox"
      expect(knowledgeLifecycle.stageFromPath('knowledge/inbox_extra/note.md')).toBeNull();
    });

    it('handles paths that match exactly the folder name (no trailing slash)', () => {
      // A path that is exactly the folder should still match (via the second branch `startsWith(config.folder)`)
      expect(knowledgeLifecycle.stageFromPath('knowledge/inbox')).toBe('inbox');
    });
  });

  // ── scanVaultFolders ───────────────────────────────────────────────────

  describe('scanVaultFolders', () => {
    it('returns empty arrays when no files found', async () => {
      mockListNotes.mockResolvedValue([]);
      const result = await knowledgeLifecycle.scanVaultFolders();
      expect(result.inbox).toEqual([]);
      expect(result.projects).toEqual([]);
      expect(result.output).toEqual([]);
      expect(result.wiki).toEqual([]);
    });

    it('calls listNotes for each lifecycle folder', async () => {
      mockListNotes.mockResolvedValue([]);
      await knowledgeLifecycle.scanVaultFolders();
      expect(mockListNotes).toHaveBeenCalledTimes(4);
      expect(mockListNotes).toHaveBeenCalledWith('knowledge/inbox');
      expect(mockListNotes).toHaveBeenCalledWith('knowledge/projects');
      expect(mockListNotes).toHaveBeenCalledWith('knowledge/output');
      expect(mockListNotes).toHaveBeenCalledWith('knowledge/wiki');
    });

    it('returns files grouped by stage', async () => {
      mockListNotes.mockImplementation((prefix: string) => {
        if (prefix === 'knowledge/inbox') return Promise.resolve(['inbox/note1.md', 'inbox/note2.md']);
        if (prefix === 'knowledge/projects') return Promise.resolve(['projects/idea.md']);
        if (prefix === 'knowledge/output') return Promise.resolve([]);
        if (prefix === 'knowledge/wiki') return Promise.resolve(['wiki/ref.md']);
        return Promise.resolve([]);
      });
      const result = await knowledgeLifecycle.scanVaultFolders();
      expect(result.inbox).toEqual(['inbox/note1.md', 'inbox/note2.md']);
      expect(result.projects).toEqual(['projects/idea.md']);
      expect(result.output).toEqual([]);
      expect(result.wiki).toEqual(['wiki/ref.md']);
    });

    it('handles listNotes throwing for a single folder', async () => {
      mockListNotes.mockImplementation((prefix: string) => {
        if (prefix === 'knowledge/inbox') return Promise.resolve(['inbox/n1.md']);
        throw new Error('Folder not found');
      });
      const result = await knowledgeLifecycle.scanVaultFolders();
      // inbox should succeed; others should fall back to empty arrays
      expect(result.inbox).toEqual(['inbox/n1.md']);
      expect(result.projects).toEqual([]);
      expect(result.output).toEqual([]);
      expect(result.wiki).toEqual([]);
    });
  });
});
