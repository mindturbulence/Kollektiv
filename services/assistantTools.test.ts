import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ASSISTANT_TOOLS, geminiToolDeclarations, ollamaToolDeclarations, fallbackProtocolPrompt } from './assistantTools';

// --- Obsidian storage mock (default: not connected) ---
const _obsidianMock = vi.hoisted(() => ({
  connected: false,
  searchResult: [] as Array<Record<string, unknown>>,
  noteResult: null as Record<string, unknown> | null,
  writeResult: { path: '', created: true },
  appendResult: { path: '', appended: true },
  deleteResult: { deleted: true },
  listResult: [] as string[],
  tagsResult: [] as Array<{ tag: string; count: number }>,
  replaceResult: true,
}));

vi.mock('../utils/obsidianStorage', () => ({
  isObsidianConnected: () => _obsidianMock.connected,
  searchNotes: vi.fn(async () => _obsidianMock.searchResult),
  getNote: vi.fn(async () => _obsidianMock.noteResult),
  writeNote: vi.fn(async (path: string) => { _obsidianMock.writeResult = { path, created: true }; }),
  listNotes: vi.fn(async () => _obsidianMock.listResult),
  listTags: vi.fn(async () => _obsidianMock.tagsResult),
  appendToNote: vi.fn(async (path: string) => { _obsidianMock.appendResult = { path, appended: true }; }),
  deleteNoteByPath: vi.fn(async () => { _obsidianMock.deleteResult = { deleted: true }; }),
  replaceInNote: vi.fn(async () => _obsidianMock.replaceResult),
  setFrontmatterKey: vi.fn(async () => {}),
  deleteFrontmatterKey: vi.fn(async () => {}),
  manageTags: vi.fn(async () => []),
  openNoteInPanel: vi.fn((note: unknown) => note),
  getFrontmatter: vi.fn(async () => ({})),
}));

describe('ASSISTANT_TOOLS', () => {
    it('includes get_weather tool', () => {
        const tool = ASSISTANT_TOOLS.find(t => t.name === 'get_weather');
        expect(tool).toBeDefined();
        expect(tool!.description).toContain('weather');
        expect(tool!.parameters.required).toContain('city');
        expect(tool!.parameters.properties.city).toBeDefined();
    });

    it('get_weather returns weather for a valid city', async () => {
        const mockResponse = '☀️ +22°C 15km/h 45%';
        const fetchMock = vi.fn().mockResolvedValue({
            ok: true,
            text: () => Promise.resolve(mockResponse),
        });
        vi.stubGlobal('fetch', fetchMock);

        const tool = ASSISTANT_TOOLS.find(t => t.name === 'get_weather')!;
        const result = await tool.execute({ city: 'Tokyo' }, {} as any);
        expect(result).toContain('Tokyo');
        expect(result).toContain('☀️');
        expect(result).toContain('22°C');
        expect(fetchMock).toHaveBeenCalledWith(
            expect.stringContaining('wttr.in/Tokyo')
        );

        vi.unstubAllGlobals();
    });

    it('get_weather handles HTTP errors', async () => {
        const fetchMock = vi.fn().mockResolvedValue({
            ok: false,
            status: 502,
        });
        vi.stubGlobal('fetch', fetchMock);

        const tool = ASSISTANT_TOOLS.find(t => t.name === 'get_weather')!;
        const result = await tool.execute({ city: 'Nowhere' }, {} as any);
        expect(result).toContain('Could not retrieve weather for Nowhere');

        vi.unstubAllGlobals();
    });

    it('get_weather handles network failures', async () => {
        const fetchMock = vi.fn().mockRejectedValue(new Error('Network error'));
        vi.stubGlobal('fetch', fetchMock);

        const tool = ASSISTANT_TOOLS.find(t => t.name === 'get_weather')!;
        const result = await tool.execute({ city: 'London' }, {} as any);
        expect(result).toContain('failed');
        expect(result).toContain('London');

        vi.unstubAllGlobals();
    });

    it('get_weather encodes special characters in city names', async () => {
        const fetchMock = vi.fn().mockResolvedValue({
            ok: true,
            text: () => Promise.resolve('☁️ +10°C'),
        });
        vi.stubGlobal('fetch', fetchMock);

        const tool = ASSISTANT_TOOLS.find(t => t.name === 'get_weather')!;
        await tool.execute({ city: 'São Paulo,BR' }, {} as any);
        expect(fetchMock).toHaveBeenCalledWith(
            expect.stringContaining(encodeURIComponent('São Paulo,BR'))
        );
        expect(fetchMock).toHaveBeenCalledWith(
            expect.stringContaining('wttr.in')
        );

        vi.unstubAllGlobals();
    });
});

describe('geminiToolDeclarations', () => {
    it('includes get_weather in Gemini declarations', () => {
        const decls = geminiToolDeclarations();
        const weather = decls.find(d => d.name === 'get_weather');
        expect(weather).toBeDefined();
        expect(weather!.description).toContain('weather');
        expect(weather!.parameters.type).toBe('OBJECT');
        expect(weather!.parameters.properties.city).toBeDefined();
        expect(weather!.parameters.required).toContain('city');
    });
});

describe('ollamaToolDeclarations', () => {
    it('includes get_weather in Ollama declarations', () => {
        const decls = ollamaToolDeclarations();
        const weather = decls.find(d => d.function.name === 'get_weather');
        expect(weather).toBeDefined();
        expect(weather!.function.description).toContain('weather');
    });
});

describe('fallbackProtocolPrompt', () => {
    it('lists get_weather in fallback prompt', () => {
        const prompt = fallbackProtocolPrompt('test persona');
        expect(prompt).toContain('get_weather');
        expect(prompt).toContain('city');
    });
});

// ── Knowledge lifecycle mock ──

const mockKnowledgeLifecycleRef = (overrides: Record<string, unknown> = {}) => ({
  kind: 'note',
  id: 'note_001',
  title: 'Test Note',
  sourcePath: 'knowledge/inbox/test_note.md',
  tier: 'long-term',
  tags: ['test'],
  lastAccessedAt: 1000,
  accessCount: 0,
  ...overrides,
});

const mockKnowledgeList = vi.fn();
const mockKnowledgeRecall = vi.fn();
const mockKnowledgeServicePromote = vi.fn();
const mockLifecycleStageFromPath = vi.fn();
const mockLifecyclePromote = vi.fn();

vi.mock('./knowledgeService', () => ({
  knowledgeService: {
    list: mockKnowledgeList,
    recall: mockKnowledgeRecall,
    promote: mockKnowledgeServicePromote,
  },
}));

vi.mock('./knowledgeLifecycle', () => ({
  knowledgeLifecycle: {
    stageFromPath: mockLifecycleStageFromPath,
    promote: mockLifecyclePromote,
  },
}));

describe('knowledge_lifecycle_promote', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('is listed in ASSISTANT_TOOLS', () => {
    const tool = ASSISTANT_TOOLS.find(t => t.name === 'knowledge_lifecycle_promote');
    expect(tool).toBeDefined();
    expect(tool!.description).toContain('lifecycle');
    expect(tool!.parameters.required).toEqual(['kind', 'id', 'target_stage']);
  });

  it('returns error when no matching ref found', async () => {
    mockKnowledgeList.mockReturnValue([]);

    const tool = ASSISTANT_TOOLS.find(t => t.name === 'knowledge_lifecycle_promote')!;
    const result = await tool.execute({ kind: 'note', id: 'nonexistent', target_stage: 'projects' }, {} as any);

    expect(result).toContain('Error: no note item with id "nonexistent"');
    expect(mockKnowledgeList).toHaveBeenCalledWith(['note']);
    expect(mockKnowledgeRecall).not.toHaveBeenCalled();
  });

  it('returns error when recall fails to load content', async () => {
    mockKnowledgeList.mockReturnValue([mockKnowledgeLifecycleRef()]);
    mockKnowledgeRecall.mockResolvedValue(null);

    const tool = ASSISTANT_TOOLS.find(t => t.name === 'knowledge_lifecycle_promote')!;
    const result = await tool.execute({ kind: 'note', id: 'note_001', target_stage: 'projects' }, {} as any);

    expect(result).toContain('Error: could not load content for item');
    expect(mockKnowledgeRecall).toHaveBeenCalledWith(expect.objectContaining({ id: 'note_001' }));
  });

  it('returns info when item is already at the target stage', async () => {
    mockKnowledgeList.mockReturnValue([mockKnowledgeLifecycleRef()]);
    mockKnowledgeRecall.mockResolvedValue('Some content');
    mockLifecycleStageFromPath.mockReturnValue('projects');
    mockLifecyclePromote.mockResolvedValue(null);

    const tool = ASSISTANT_TOOLS.find(t => t.name === 'knowledge_lifecycle_promote')!;
    const result = await tool.execute({ kind: 'note', id: 'note_001', target_stage: 'projects' }, {} as any);

    expect(result).toContain('already in the "projects" stage');
    expect(mockLifecyclePromote).toHaveBeenCalled();
  });

  it('promotes item to the target stage on happy path', async () => {
    mockKnowledgeList.mockReturnValue([mockKnowledgeLifecycleRef()]);
    mockKnowledgeRecall.mockResolvedValue('Note content here');
    mockLifecycleStageFromPath.mockReturnValue('inbox');
    mockLifecyclePromote.mockResolvedValue({ newPath: 'knowledge/projects/note/test_note_note_001.md', stage: 'projects' });

    const tool = ASSISTANT_TOOLS.find(t => t.name === 'knowledge_lifecycle_promote')!;
    const result = await tool.execute({ kind: 'note', id: 'note_001', target_stage: 'projects' }, {} as any);

    expect(result).toContain('Moved "Test Note" from inbox → projects');
    expect(result).toContain('knowledge/projects/note/');
    expect(mockLifecyclePromote).toHaveBeenCalledWith(
      'knowledge/inbox/test_note.md',
      'inbox',
      'projects',
      expect.objectContaining({ kind: 'note', id: 'note_001', title: 'Test Note' }),
      'Note content here',
    );
    expect(mockKnowledgeServicePromote).not.toHaveBeenCalled();
  });

  it('promotes tier to knowledge when target_stage is wiki', async () => {
    mockKnowledgeList.mockReturnValue([mockKnowledgeLifecycleRef()]);
    mockKnowledgeRecall.mockResolvedValue('Wiki content');
    mockLifecycleStageFromPath.mockReturnValue('projects');
    mockLifecyclePromote.mockResolvedValue({ newPath: 'knowledge/wiki/note/test_note_note_001.md', stage: 'wiki' });

    const tool = ASSISTANT_TOOLS.find(t => t.name === 'knowledge_lifecycle_promote')!;
    await tool.execute({ kind: 'note', id: 'note_001', target_stage: 'wiki' }, {} as any);

    expect(mockKnowledgeServicePromote).toHaveBeenCalledWith(
      expect.objectContaining({ targetTier: 'knowledge' }),
    );
  });

  it('promotes tier to knowledge when target_stage is output', async () => {
    mockKnowledgeList.mockReturnValue([mockKnowledgeLifecycleRef()]);
    mockKnowledgeRecall.mockResolvedValue('Output content');
    mockLifecycleStageFromPath.mockReturnValue('inbox');
    mockLifecyclePromote.mockResolvedValue({ newPath: 'knowledge/output/note/test_note_note_001.md', stage: 'output' });

    const tool = ASSISTANT_TOOLS.find(t => t.name === 'knowledge_lifecycle_promote')!;
    await tool.execute({ kind: 'note', id: 'note_001', target_stage: 'output' }, {} as any);

    expect(mockKnowledgeServicePromote).toHaveBeenCalledWith(
      expect.objectContaining({ targetTier: 'knowledge' }),
    );
  });

  it('does not promote tier for inbox or projects targets', async () => {
    mockKnowledgeList.mockReturnValue([mockKnowledgeLifecycleRef()]);
    mockKnowledgeRecall.mockResolvedValue('Content');
    mockLifecycleStageFromPath.mockReturnValue('inbox');
    mockLifecyclePromote.mockResolvedValue({ newPath: 'knowledge/projects/note/test_note_note_001.md', stage: 'projects' });

    const tool = ASSISTANT_TOOLS.find(t => t.name === 'knowledge_lifecycle_promote')!;
    await tool.execute({ kind: 'note', id: 'note_001', target_stage: 'projects' }, {} as any);

    expect(mockKnowledgeServicePromote).not.toHaveBeenCalled();
  });

  it('uses inbox as fallback when sourcePath is undefined', async () => {
    const refNoPath = mockKnowledgeLifecycleRef({ sourcePath: undefined });
    mockKnowledgeList.mockReturnValue([refNoPath]);
    mockKnowledgeRecall.mockResolvedValue('Content');
    mockLifecyclePromote.mockResolvedValue({ newPath: 'knowledge/projects/note/test_note_note_001.md', stage: 'projects' });

    const tool = ASSISTANT_TOOLS.find(t => t.name === 'knowledge_lifecycle_promote')!;
    const result = await tool.execute({ kind: 'note', id: 'note_001', target_stage: 'projects' }, {} as any);

    expect(result).toContain('from inbox → projects');
    // stageFromPath should NOT be called when there's no sourcePath
    expect(mockLifecycleStageFromPath).not.toHaveBeenCalled();
  });
});

describe('Gemini tool declarations (knowledge_lifecycle_promote)', () => {
  it('includes knowledge_lifecycle_promote in Gemini declarations', () => {
    const decls = geminiToolDeclarations();
    const promote = decls.find(d => d.name === 'knowledge_lifecycle_promote');
    expect(promote).toBeDefined();
    expect(promote!.description).toContain('lifecycle');
    expect(promote!.parameters.properties.kind).toBeDefined();
    expect(promote!.parameters.properties.target_stage).toBeDefined();
    expect(promote!.parameters.required).toContain('kind');
  });

  it('includes knowledge_lifecycle_promote in Ollama declarations', () => {
    const decls = ollamaToolDeclarations();
    const promote = decls.find(d => d.function.name === 'knowledge_lifecycle_promote');
    expect(promote).toBeDefined();
    expect(promote!.function.description).toContain('lifecycle');
  });
});

// ── Obsidian tool error paths ──

describe('Obsidian tool error paths', () => {
  beforeEach(() => {
    _obsidianMock.connected = false;
    _obsidianMock.searchResult = [];
    _obsidianMock.noteResult = null;
    _obsidianMock.writeResult = { path: '', created: true };
    _obsidianMock.appendResult = { path: '', appended: true };
    _obsidianMock.deleteResult = { deleted: true };
    _obsidianMock.listResult = [];
    _obsidianMock.tagsResult = [];
    _obsidianMock.replaceResult = true;
  });

  // ── Not connected → all tools return error ──

  it('obsidian_search_notes returns connection error when not connected', async () => {
    const tool = ASSISTANT_TOOLS.find(t => t.name === 'obsidian_search_notes')!;
    const result = await tool.execute({ query: 'test' }, {} as any);
    expect(result).toContain('Error: Obsidian vault is not connected');
    expect(result).toContain('Settings > Integrations > Obsidian Second Brain');
  });

  it('obsidian_get_note returns connection error when not connected', async () => {
    const tool = ASSISTANT_TOOLS.find(t => t.name === 'obsidian_get_note')!;
    const result = await tool.execute({ path: 'test.md' }, {} as any);
    expect(result).toBe('Error: Obsidian vault is not connected.');
  });

  it('obsidian_write_note returns connection error when not connected', async () => {
    const tool = ASSISTANT_TOOLS.find(t => t.name === 'obsidian_write_note')!;
    const result = await tool.execute({ path: 'test.md', content: 'test' }, {} as any);
    expect(result).toBe('Error: Obsidian vault is not connected.');
  });

  it('obsidian_list_notes returns connection error when not connected', async () => {
    const tool = ASSISTANT_TOOLS.find(t => t.name === 'obsidian_list_notes')!;
    const result = await tool.execute({}, {} as any);
    expect(result).toBe('Error: Obsidian vault is not connected.');
  });

  it('obsidian_patch_note returns connection error when not connected', async () => {
    const tool = ASSISTANT_TOOLS.find(t => t.name === 'obsidian_patch_note')!;
    const result = await tool.execute({ path: 'test.md', pattern: 'x', replacement: 'y' }, {} as any);
    expect(result).toBe('Error: Obsidian vault is not connected.');
  });

  it('obsidian_manage_frontmatter returns connection error when not connected', async () => {
    const tool = ASSISTANT_TOOLS.find(t => t.name === 'obsidian_manage_frontmatter')!;
    const result = await tool.execute({ path: 'test.md', key: 'foo' }, {} as any);
    expect(result).toBe('Error: Obsidian vault is not connected.');
  });

  it('obsidian_manage_tags returns connection error when not connected', async () => {
    const tool = ASSISTANT_TOOLS.find(t => t.name === 'obsidian_manage_tags')!;
    const result = await tool.execute({ path: 'test.md', operation: 'list' }, {} as any);
    expect(result).toBe('Error: Obsidian vault is not connected.');
  });

  // ── Connected but note not found ──

  it('obsidian_get_note returns helpful error when note not found', async () => {
    _obsidianMock.connected = true;
    _obsidianMock.noteResult = null;
    const tool = ASSISTANT_TOOLS.find(t => t.name === 'obsidian_get_note')!;
    const result = await tool.execute({ path: 'nonexistent.md' }, {} as any);
    expect(result).toBe('Error: Note not found at "nonexistent.md".');
  });

  it('obsidian_write_note prevents overwrite without flag', async () => {
    _obsidianMock.connected = true;
    _obsidianMock.noteResult = { path: 'test.md', frontmatter: {}, body: 'existing' }; // note exists
    const tool = ASSISTANT_TOOLS.find(t => t.name === 'obsidian_write_note')!;
    const result = await tool.execute({ path: 'test.md', content: 'new' }, {} as any);
    expect(result).toContain('Error: Note already exists at');
    expect(result).toContain('Set overwrite=true to replace');
  });

  it('obsidian_replace_in_note returns no-match message', async () => {
    _obsidianMock.connected = true;
    _obsidianMock.replaceResult = false;
    const tool = ASSISTANT_TOOLS.find(t => t.name === 'obsidian_replace_in_note')!;
    const result = await tool.execute({ path: 'test.md', pattern: 'xyz', replacement: 'abc' }, {} as any);
    expect(result).toBe('No matches found — note unchanged.');
  });

  it('obsidian_manage_frontmatter returns JSON with key/old/new', async () => {
    _obsidianMock.connected = true;
    // getNote returns a note with frontmatter containing the key
    _obsidianMock.noteResult = { path: 'test.md', frontmatter: { existingKey: 'oldValue' }, body: 'body' };
    const tool = ASSISTANT_TOOLS.find(t => t.name === 'obsidian_manage_frontmatter')!;
    const result = await tool.execute({ path: 'test.md', key: 'existingKey', value: 'newVal' }, {} as any);
    const parsed = JSON.parse(result);
    expect(parsed.key).toBe('existingKey');
    expect(parsed.oldValue).toBe('oldValue');
    expect(parsed.newValue).toBe('newVal');
  });

  it('obsidian_manage_tags returns JSON with tags array', async () => {
    _obsidianMock.connected = true;
    const tool = ASSISTANT_TOOLS.find(t => t.name === 'obsidian_manage_tags')!;
    const result = await tool.execute({ path: 'test.md', operation: 'list' }, {} as any);
    expect(result).toBe('{"tags":[]}');
  });
});