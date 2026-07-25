import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { KnowledgeSearchResult } from './knowledgeService';

// Mock both modules that buildKnowledgeContextBlock dynamically imports.
// vi.mock is hoisted to the top so it intercepts both static and dynamic imports.
vi.mock('./knowledgeService', () => ({
  knowledgeService: {
    search: vi.fn(),
  },
}));

vi.mock('./memoryTierService', () => ({
  memoryTierService: {
    searchAll: vi.fn(),
  },
}));

// Import AFTER mocks are set up — these are the mocked versions
import { knowledgeService } from './knowledgeService';
import { memoryTierService } from './memoryTierService';
import { buildKnowledgeContextBlock } from './assistantService';

// ─── Helpers ───────────────────────────────────────────────────────────────

const mockSearchResult = (overrides: Partial<KnowledgeSearchResult> = {}): KnowledgeSearchResult => {
  const defaults = {
    ref: { kind: 'note' as const, id: 'test_note_1', title: 'Test Note', sourcePath: undefined as string | undefined, tier: 'long-term' as const, lastAccessedAt: 1000, accessCount: 1, tags: [] as string[] },
    snippet: 'This is a test note with relevant content.',
    score: 0.7,
  };
  return {
    ...defaults,
    ...overrides,
    ref: { ...defaults.ref, ...(overrides.ref || {}) },
  };
};

const mockWorkingEntry = (overrides: Partial<any> = {}) => ({
  kind: 'working' as const,
  workingEntry: {
    id: 'wm_1',
    context: 'Working memory context snippet',
    createdAt: 1000,
    accessCount: 1,
    summarized: false,
  },
  snippet: 'Working memory context snippet',
  score: 0.8,
  ...overrides,
});

// ─── Tests ────────────────────────────────────────────────────────────────

describe('buildKnowledgeContextBlock', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ─── Empty / edge contexts ─────────────────────────────────────────

  describe('empty / edge contexts', () => {
    it('returns empty string for empty context', async () => {
      const result = await buildKnowledgeContextBlock('');
      expect(result).toBe('');
      expect(knowledgeService.search).not.toHaveBeenCalled();
      expect(memoryTierService.searchAll).not.toHaveBeenCalled();
    });

    it('returns empty string for whitespace-only context', async () => {
      const result = await buildKnowledgeContextBlock('   \n  \t  ');
      expect(result).toBe('');
    });

    it('returns empty string for single-char context with no results', async () => {
      vi.mocked(knowledgeService.search).mockResolvedValue([]);
      vi.mocked(memoryTierService.searchAll).mockResolvedValue([]);
      const result = await buildKnowledgeContextBlock('x');
      expect(result).toBe('');
    });
  });

  // ─── Knowledge service results ──────────────────────────────────────

  describe('knowledge service results', () => {
    it('returns a Vault Knowledge section with formatted items', async () => {
      vi.mocked(knowledgeService.search).mockResolvedValue([
        mockSearchResult({
          ref: { kind: 'note', id: 'n1', title: 'Cyberpunk Settings', tags: ['cyberpunk', 'neon'], tier: 'long-term', lastAccessedAt: 1000, accessCount: 2 },
          snippet: 'The city glows with neon signs and hacker culture.',
          score: 0.9,
        }),
        mockSearchResult({
          ref: { kind: 'memory', id: 'm1', title: 'User likes cyberpunk aesthetic', tags: [], tier: 'long-term', lastAccessedAt: 500, accessCount: 1 },
          snippet: 'User likes cyberpunk aesthetic',
          score: 0.6,
        }),
      ]);
      vi.mocked(memoryTierService.searchAll).mockResolvedValue([]);

      const result = await buildKnowledgeContextBlock('cyberpunk');
      expect(result).toContain('## Vault Knowledge');
      expect(result).toContain('Useful context from your notes and memories:');
      expect(result).toContain('[note] Cyberpunk Settings [cyberpunk, neon]');
      expect(result).toContain('[memory] User likes cyberpunk aesthetic');
      expect(result).toContain('neon signs');
      expect(result).not.toContain('## Recent Conversation Context');
    });

    it('passes the correct search options to knowledgeService.search', async () => {
      vi.mocked(knowledgeService.search).mockResolvedValue([]);
      vi.mocked(memoryTierService.searchAll).mockResolvedValue([]);
      await buildKnowledgeContextBlock('portrait photography');

      expect(knowledgeService.search).toHaveBeenCalledWith({
        query: 'portrait photography',
        kinds: ['memory', 'note', 'vault_note', 'prompt'],
        tiers: ['long-term', 'knowledge'],
        maxResults: 8,
      });
    });

    it('includes tag badges when entity has tags', async () => {
      vi.mocked(knowledgeService.search).mockResolvedValue([
        mockSearchResult({
          ref: { kind: 'note', id: 'n1', title: 'Notes', tags: ['portrait', 'lens', 'lighting', 'extra'], tier: 'long-term', lastAccessedAt: 1000, accessCount: 1 },
        }),
      ]);
      vi.mocked(memoryTierService.searchAll).mockResolvedValue([]);

      const result = await buildKnowledgeContextBlock('portrait');
      expect(result).toContain('[portrait, lens, lighting…]');
    });

    it('omits tag badges when entity has no tags', async () => {
      vi.mocked(knowledgeService.search).mockResolvedValue([
        mockSearchResult({ ref: { kind: 'note', id: 'n1', title: 'Plain Note', tags: [], tier: 'long-term', lastAccessedAt: 1000, accessCount: 1 } }),
      ]);
      vi.mocked(memoryTierService.searchAll).mockResolvedValue([]);

      const result = await buildKnowledgeContextBlock('note');
      // The line should be `- [note] Plain Note` — no trailing [tag1, tag2] block
      const lines = result.split('\n').filter(l => l.startsWith('- '));
      expect(lines).toHaveLength(1);
      expect(lines[0]).toBe('- [note] Plain Note');
    });
  });

  // ─── Working memory results ─────────────────────────────────────────

  describe('working memory results', () => {
    it('returns a Recent Conversation Context section', async () => {
      vi.mocked(knowledgeService.search).mockResolvedValue([]);
      vi.mocked(memoryTierService.searchAll).mockResolvedValue([
        mockWorkingEntry({ snippet: 'Discussed new cyberpunk project ideas' }),
        mockWorkingEntry({ snippet: 'User mentioned liking blade runner aesthetic' }),
      ]);

      const result = await buildKnowledgeContextBlock('cyberpunk');
      expect(result).toContain('## Recent Conversation Context');
      expect(result).toContain('From the current session:');
      expect(result).toContain('Discussed new cyberpunk project ideas');
      expect(result).toContain('blade runner aesthetic');
      expect(result).not.toContain('## Vault Knowledge');
    });

    it('passes the correct options to memoryTierService.searchAll', async () => {
      vi.mocked(knowledgeService.search).mockResolvedValue([]);
      vi.mocked(memoryTierService.searchAll).mockResolvedValue([]);
      await buildKnowledgeContextBlock('styles');

      expect(memoryTierService.searchAll).toHaveBeenCalledWith('styles', 5);
    });

    it('filters out knowledge entries from searchAll results (only keeps working)', async () => {
      vi.mocked(knowledgeService.search).mockResolvedValue([]);
      vi.mocked(memoryTierService.searchAll).mockResolvedValue([
        // A knowledge entry mixed in — should be filtered out
        { kind: 'knowledge' as const, ref: { id: 'kr1' } as any, snippet: 'knowledge result', score: 0.5, tier: 'long-term' },
        mockWorkingEntry({ snippet: 'actual working memory' }),
      ]);

      const result = await buildKnowledgeContextBlock('test');
      expect(result).not.toContain('knowledge result');
      expect(result).toContain('actual working memory');
    });
  });

  // ─── Combined results ───────────────────────────────────────────────

  describe('combined results', () => {
    it('returns both sections when both sources have results', async () => {
      vi.mocked(knowledgeService.search).mockResolvedValue([
        mockSearchResult({ ref: { kind: 'note', id: 'n1', title: 'Vault Note', tags: [], tier: 'long-term', lastAccessedAt: 1000, accessCount: 1 } }),
      ]);
      vi.mocked(memoryTierService.searchAll).mockResolvedValue([
        mockWorkingEntry({ snippet: 'WM entry' }),
      ]);

      const result = await buildKnowledgeContextBlock('test');
      expect(result).toContain('## Vault Knowledge');
      expect(result).toContain('## Recent Conversation Context');
    });

    it('sections are separated by double newline', async () => {
      vi.mocked(knowledgeService.search).mockResolvedValue([
        mockSearchResult({ ref: { kind: 'note', id: 'n1', title: 'Note', tags: [], tier: 'long-term', lastAccessedAt: 1000, accessCount: 1 } }),
      ]);
      vi.mocked(memoryTierService.searchAll).mockResolvedValue([
        mockWorkingEntry({ snippet: 'WM' }),
      ]);

      const result = await buildKnowledgeContextBlock('test');
      // The function returns: `\n\nsection1\n\nsection2`
      // So between the two headers there should be a double newline
      expect(result).toMatch(/Vault Knowledge[\s\S]*\n\n## Recent Conversation/);
    });
  });

  // ─── Service unavailable (graceful degradation) ─────────────────────

  describe('service unavailable', () => {
    it('gracefully handles knowledgeService.search throwing', async () => {
      vi.mocked(knowledgeService.search).mockRejectedValue(new Error('IDB unavailable'));
      vi.mocked(memoryTierService.searchAll).mockResolvedValue([
        mockWorkingEntry({ snippet: 'Working memory survives' }),
      ]);

      const result = await buildKnowledgeContextBlock('test');
      expect(result).not.toContain('## Vault Knowledge');
      expect(result).toContain('## Recent Conversation Context');
      expect(result).toContain('Working memory survives');
    });

    it('gracefully handles memoryTierService.searchAll throwing', async () => {
      vi.mocked(knowledgeService.search).mockResolvedValue([
        mockSearchResult({ ref: { kind: 'note', id: 'n1', title: 'Vault survives', tags: [], tier: 'long-term', lastAccessedAt: 1000, accessCount: 1 } }),
      ]);
      vi.mocked(memoryTierService.searchAll).mockRejectedValue(new Error('Not available'));

      const result = await buildKnowledgeContextBlock('test');
      expect(result).toContain('## Vault Knowledge');
      expect(result).toContain('Vault survives');
      expect(result).not.toContain('## Recent Conversation Context');
    });

    it('returns empty when both services throw', async () => {
      vi.mocked(knowledgeService.search).mockRejectedValue(new Error('Service A down'));
      vi.mocked(memoryTierService.searchAll).mockRejectedValue(new Error('Service B down'));

      const result = await buildKnowledgeContextBlock('test');
      expect(result).toBe('');
    });
  });

  // ─── Formatting edge cases ──────────────────────────────────────────

  describe('formatting edge cases', () => {
    it('formats snippet indentation with newlines', async () => {
      vi.mocked(knowledgeService.search).mockResolvedValue([
        mockSearchResult({
          ref: { kind: 'note', id: 'n1', title: 'Multi-line', tags: [], tier: 'long-term', lastAccessedAt: 1000, accessCount: 1 },
          snippet: 'Line one.\nLine two.\nLine three.',
          score: 0.8,
        }),
      ]);
      vi.mocked(memoryTierService.searchAll).mockResolvedValue([]);

      const result = await buildKnowledgeContextBlock('test');
      // The snippet should be indented with 4 spaces and newlines preserved
      expect(result).toContain('    Line one.');
      expect(result).toContain('    Line two.');
      expect(result).toContain('    Line three.');
    });

    it('does not add snippet when snippet equals title (no content match)', async () => {
      vi.mocked(knowledgeService.search).mockResolvedValue([
        mockSearchResult({
          ref: { kind: 'note', id: 'n1', title: 'Title matches', tags: [], tier: 'long-term', lastAccessedAt: 1000, accessCount: 1 },
          snippet: 'Title matches', // same as title — only title matched, not content
          score: 0.5,
        }),
      ]);
      vi.mocked(memoryTierService.searchAll).mockResolvedValue([]);

      const result = await buildKnowledgeContextBlock('title');
      // Should NOT have an indented snippet line since snippet === title
      expect(result).toContain('- [note] Title matches');
      // Check no extra indented content follows it
      const lines = result.split('\n');
      const dashLineIdx = lines.findIndex((l) => l.includes('- [note] Title matches'));
      // Next line (if it exists) shouldn't start with 4 spaces
      const nextLine = lines[dashLineIdx + 1];
      if (nextLine !== undefined) {
        expect(nextLine.startsWith('    ')).toBe(false);
      }
    });
  });
});
