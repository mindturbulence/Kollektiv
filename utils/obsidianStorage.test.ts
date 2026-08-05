import { describe, it, expect, vi, afterEach } from 'vitest';
import {
  parseFrontmatter,
  serializeWithFrontmatter,
  extractTitle,
  extractWikilinks,
  searchNotes,
} from './obsidianStorage';
import { VaultSearchIndex, _setSearchIndex } from './vaultSearch';

const mockLoadGalleryItems = vi.fn(async () => [] as any[]);
vi.mock('./galleryStorage', () => ({
  loadGalleryItems: () => mockLoadGalleryItems(),
}));
vi.mock('./promptStorage', () => ({
  loadSavedPrompts: async () => [],
}));

describe('parseFrontmatter', () => {
  it('returns empty frontmatter for content without frontmatter', () => {
    const { frontmatter, body } = parseFrontmatter('# Hello\n\nSome text');
    expect(frontmatter).toEqual({});
    expect(body).toBe('# Hello\n\nSome text');
  });

  it('returns empty frontmatter for empty content', () => {
    const { frontmatter, body } = parseFrontmatter('');
    expect(frontmatter).toEqual({});
    expect(body).toBe('');
  });

  it('parses simple key-value frontmatter', () => {
    const content = '---\ntitle: My Note\ndate: 2024-01-01\n---\n\nBody text';
    const { frontmatter, body } = parseFrontmatter(content);
    expect(frontmatter.title).toBe('My Note');
    expect(frontmatter.date).toBe('2024-01-01');
    expect(body).toBe('Body text');
  });

  it('parses tags array in frontmatter', () => {
    const content = '---\ntags: [project, design, "wip"]\n---\n\nBody';
    const { frontmatter, body } = parseFrontmatter(content);
    expect(frontmatter.tags).toEqual(['project', 'design', 'wip']);
    expect(body).toBe('Body');
  });

  it('handles empty frontmatter block', () => {
    const content = '---\n---\n\nBody text';
    const { frontmatter, body } = parseFrontmatter(content);
    expect(frontmatter).toEqual({});
    expect(body).toBe('Body text');
  });

  it('handles frontmatter with quoted values', () => {
    const content = "---\ntitle: \"My Note\"\nalias: 'short'\n---\n\nBody";
    const { frontmatter } = parseFrontmatter(content);
    expect(frontmatter.title).toBe('My Note');
    expect(frontmatter.alias).toBe('short');
  });
});

describe('serializeWithFrontmatter', () => {
  it('returns body unchanged when frontmatter is empty', () => {
    const result = serializeWithFrontmatter('# Hello', {});
    expect(result).toBe('# Hello');
  });

  it('serializes frontmatter before body', () => {
    const result = serializeWithFrontmatter('# Hello', { title: 'Test', tags: ['a', 'b'] });
    expect(result).toContain('---');
    expect(result).toContain('title: Test');
    expect(result).toContain('tags: ["a", "b"]');
    expect(result).toContain('# Hello');
  });

  it('round-trips with parseFrontmatter — semantic equality', () => {
    const original = '---\ntitle: Test\ntags: [a, b]\n---\n\n# Hello';
    const { frontmatter, body } = parseFrontmatter(original);
    // Serialize back and re-parse — should have same frontmatter
    const serialized = serializeWithFrontmatter(body, frontmatter);
    const reparsed = parseFrontmatter(serialized);
    expect(reparsed.frontmatter).toEqual(frontmatter);
    expect(reparsed.body).toBe(body);
  });
});

describe('extractTitle', () => {
  it('extracts from first # heading', () => {
    expect(extractTitle('path/to/note.md', '# My Note\n\ncontent')).toBe('My Note');
  });

  it('falls back to filename when no heading', () => {
    expect(extractTitle('path/to/My-Note.md', 'plain content')).toBe('My-Note');
  });

  it('strips .md extension in fallback', () => {
    expect(extractTitle('note.md', 'no heading')).toBe('note');
  });
});

describe('searchNotes — gallery/prompt pseudo-paths (WP5 regression)', () => {
  afterEach(() => {
    _setSearchIndex(undefined as any);
    mockLoadGalleryItems.mockReset();
  });

  it('resolves content for a gallery:// hit instead of dropping it (readFile cannot read pseudo-paths)', async () => {
    mockLoadGalleryItems.mockResolvedValue([
      { id: 'item1', title: 'Rooftop Scene', prompt: 'a rooftop at golden hour', notes: '', tags: ['cinematic'] },
    ]);

    const index = new VaultSearchIndex();
    await index.build([]); // built=true, no docs yet
    index.addDocument({ path: 'gallery://item1', title: 'Rooftop Scene', content: 'a rooftop at golden hour cinematic', kind: 'gallery_item' });
    _setSearchIndex(index);

    const results = await searchNotes('rooftop', 10);

    expect(results).toHaveLength(1);
    expect(results[0]).toMatchObject({ path: 'gallery://item1', title: 'Rooftop Scene' });
    expect(results[0].snippet).toContain('rooftop');
  });
});

describe('extractWikilinks', () => {
  it('extracts simple wikilinks', () => {
    expect(extractWikilinks('See [[Another Note]] and [[Third]]'))
      .toEqual(['Another Note', 'Third']);
  });

  it('extracts wikilinks with display text', () => {
    expect(extractWikilinks('See [[Target|display text]]'))
      .toEqual(['Target']);
  });

  it('returns empty array for no wikilinks', () => {
    expect(extractWikilinks('No links here')).toEqual([]);
  });

  it('handles multiple wikilinks on same line', () => {
    expect(extractWikilinks('[[A]] and [[B]] and [[C]]'))
      .toEqual(['A', 'B', 'C']);
  });
});