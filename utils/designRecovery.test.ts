import { describe, it, expect } from 'vitest';
import { planRecovery, type RecoveryFolder } from './designRecovery';
import { serializeDesignSpec } from './designSpec';

const NOW = 1_700_000_000_000;
const md = (frontMatter: Record<string, unknown>, overview = 'A calm   system.') =>
  serializeDesignSpec({ frontMatter, sections: { Overview: overview } });
const folder = (id: string, over: Partial<RecoveryFolder> = {}): RecoveryFolder => ({
  id, hasSpec: true, specText: md({ name: `Name ${id}` }), refNames: [], ...over,
});

describe('planRecovery', () => {
  it('builds an entry with title, other page type, no tags, overview and tokens', () => {
    const text = md({
      name: '  Stripe  ',
      colors: { accent: '#FF0000', background: '#fff' },
      typography: { display: { fontFamily: 'Inter, sans-serif', size: 48 } },
    });
    const { recover, unreadable } = planRecovery([folder('a', { specText: text })], new Set(), NOW);
    expect(unreadable).toEqual([]);
    expect(recover).toEqual([{
      id: 'a', createdAt: NOW, updatedAt: NOW, title: 'Stripe', pageType: 'other', tags: [], refs: [],
      overview: 'A calm system.', palette: ['#ff0000', '#ffffff'], fonts: ['Inter / 48px'],
    }]);
  });

  it('skips known ids and folders without DESIGN.md', () => {
    const { recover, unreadable } = planRecovery(
      [folder('known'), folder('refs-only', { hasSpec: false, specText: null, refNames: ['1.png'] }), folder('new')],
      new Set(['known']), NOW,
    );
    expect(recover.map((r) => r.id)).toEqual(['new']);
    expect(unreadable).toEqual([]);
  });

  it('puts unparseable or unreadable specs in unreadable and never throws', () => {
    const folders = [
      folder('yaml', { specText: '---\nname: [unclosed\n---\n## Overview\nx' }),
      folder('nofm', { specText: 'just text' }),
      folder('empty', { specText: '' }),
      folder('null', { specText: null }),
      folder('undef', { specText: undefined }),
    ];
    const { recover, unreadable } = planRecovery(folders, new Set(), NOW);
    expect(recover).toEqual([]);
    expect(unreadable).toEqual(['yaml', 'nofm', 'empty', 'null', 'undef']);
  });

  it('falls back to the folder id when name is missing, blank or not a string', () => {
    const { recover } = planRecovery(
      [folder('a', { specText: md({}) }), folder('b', { specText: md({ name: '   ' }) }), folder('c', { specText: md({ name: 42 }) })],
      new Set(), NOW,
    );
    expect(recover.map((r) => r.title)).toEqual(['a', 'b', 'c']);
  });

  it('keeps only png/jpg/jpeg/webp refs, sorted by leading integer, odd names last', () => {
    const refNames = ['10.png', 'notes.txt', '2.JPG', 'hero.webp', '1.jpeg', 'a.gif', '2.png', 'Thumbs.db', 'b.png'];
    const { recover } = planRecovery([folder('x', { refNames })], new Set(), NOW);
    expect(recover[0].refs).toEqual([
      'design-library/x/refs/1.jpeg',
      'design-library/x/refs/2.JPG',
      'design-library/x/refs/2.png',
      'design-library/x/refs/10.png',
      'design-library/x/refs/b.png',
      'design-library/x/refs/hero.webp',
    ]);
  });

  it('uses a finite modified time for both timestamps, else now', () => {
    const { recover } = planRecovery(
      [folder('a', { modified: 123 }), folder('b', { modified: Number.NaN }), folder('c', { modified: Infinity })],
      new Set(), NOW,
    );
    expect(recover.map((r) => [r.createdAt, r.updatedAt])).toEqual([[123, 123], [NOW, NOW], [NOW, NOW]]);
  });

  it('is deterministic and idempotent: duplicates and re-planning with the recovered ids add nothing', () => {
    const folders = [folder('a'), folder('a'), folder('b')];
    const first = planRecovery(folders, new Set(), NOW);
    expect(planRecovery(folders, new Set(), NOW)).toEqual(first);
    expect(first.recover.map((r) => r.id)).toEqual(['a', 'b']);
    expect(planRecovery(folders, new Set(first.recover.map((r) => r.id)), NOW)).toEqual({ recover: [], unreadable: [] });
  });
});
