import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  loadDesignLibrary,
  createRecipe,
  updateRecipe,
  addRecipeRefs,
  removeRecipeRef,
  reorderRecipeRefs,
  loadRecipeSpec,
  deleteRecipe,
  addCollection,
  renameCollection,
  moveCollection,
  saveCollectionsOrder,
  deleteCollection,
  findOrphanRecipes,
  rebuildIndexFromDisk,
} from './designLibraryStorage';
import { serializeDesignSpec, type DesignSpec } from './designSpec';

const MANIFEST = 'kollektiv_design_library_manifest.json';

// In-memory vault shared by the mocked fileSystemManager (manifestStore stays real so validate/safeToSave are exercised).
const fs = vi.hoisted(() => ({
  files: new Map<string, string>(),
  log: [] as string[],
  stuck: new Set<string>(),
  unreadable: new Set<string>(),
  listError: false,
  onRead: undefined as ((path: string) => void) | undefined,
}));

vi.mock('./fileUtils', () => ({
  fileSystemManager: {
    saveFile: vi.fn(async (path: string, blob: Blob) => {
      fs.log.push(`save:${path}`);
      fs.files.set(path, await blob.text());
      return path;
    }),
    readFile: vi.fn(async (path: string) => {
      fs.onRead?.(path);
      return fs.files.get(path) ?? null;
    }),
    getFileAsBlob: vi.fn(async (path: string) => {
      fs.onRead?.(path);
      const text = fs.files.get(path);
      return text === undefined || fs.unreadable.has(path) ? null : new Blob([text]);
    }),
    fileExists: vi.fn(async (path: string) => fs.files.has(path)),
    // Directories are implied by file paths, as in a real vault; a missing folder lists nothing.
    listDirectoryContents: vi.fn(async function* (path: string) {
      if (fs.listError) throw new Error('listing failed');
      const seen = new Set<string>();
      for (const key of fs.files.keys()) {
        if (!key.startsWith(`${path}/`)) continue;
        const rest = key.slice(path.length + 1);
        const name = rest.split('/')[0];
        if (seen.has(name)) continue;
        seen.add(name);
        yield { kind: rest.includes('/') ? 'directory' : 'file', name };
      }
    }),
    deleteFile: vi.fn(async (path: string) => {
      fs.log.push(`delete:${path}`);
      if (!fs.stuck.has(path)) fs.files.delete(path);
    }),
  },
}));

const spec: DesignSpec = {
  frontMatter: { name: 'Test', colors: { primary: '#fff' } },
  sections: { Overview: 'A calm   minimal\nsystem.', Colors: 'White.' },
};
const png = (name = 'a.png') => ({ name, blob: new Blob(['x'], { type: 'image/png' }) });
const input = { title: 'T', pageType: 'landing' as const, refs: [png()], spec };

const manifestOf = () => JSON.parse(fs.files.get(MANIFEST)!);

beforeEach(() => {
  fs.files.clear();
  fs.log.length = 0;
  fs.stuck.clear();
  fs.unreadable.clear();
  fs.listError = false;
  fs.onRead = undefined;
});

describe('designLibraryStorage', () => {
  it('defaults when the manifest is missing', async () => {
    expect(await loadDesignLibrary()).toEqual({ recipes: [], collections: [], safeToSave: true });
  });

  it('create writes refs and DESIGN.md before the manifest', async () => {
    const r = await createRecipe({ ...input, refs: [png(), { name: 'b', blob: new Blob(['y'], { type: 'image/jpeg' }) }] });
    expect(r.refs).toEqual([`design-library/${r.id}/refs/1.png`, `design-library/${r.id}/refs/2.jpg`]);
    expect(r.overview).toBe('A calm minimal system.');
    expect(fs.log).toEqual([
      `save:${r.refs[0]}`,
      `save:${r.refs[1]}`,
      `save:design-library/${r.id}/DESIGN.md`,
      `save:${MANIFEST}`,
    ]);
    expect(manifestOf().recipes).toHaveLength(1);
    expect((await loadDesignLibrary()).recipes[0].id).toBe(r.id);
  });

  it('create rejects non-image blob types and writes nothing', async () => {
    await expect(
      createRecipe({ ...input, refs: [png(), { name: 'x.gif', blob: new Blob(['g'], { type: 'image/gif' }) }] }),
    ).rejects.toThrow(/Unsupported reference image type/);
    expect(fs.log).toEqual([]);
  });

  it('update refreshes overview and updatedAt and rewrites DESIGN.md', async () => {
    const r = await createRecipe(input);
    vi.spyOn(Date, 'now').mockReturnValue(r.updatedAt + 1000);
    const u = await updateRecipe(r.id, { title: 'New' }, { ...spec, sections: { Overview: 'Changed.' } });
    expect(u.title).toBe('New');
    expect(u.overview).toBe('Changed.');
    expect(u.updatedAt).toBe(r.updatedAt + 1000);
    expect(manifestOf().recipes[0].overview).toBe('Changed.');
    expect(fs.files.get(`design-library/${r.id}/DESIGN.md`)).toContain('Changed.');
    vi.restoreAllMocks();
  });

  it('adds and removes refs without number collisions', async () => {
    const r = await createRecipe(input);
    await addRecipeRefs(r.id, [png()]);
    await removeRecipeRef(r.id, r.refs[0]);
    const after = await addRecipeRefs(r.id, [png()]);
    expect(after.refs).toEqual([`design-library/${r.id}/refs/2.png`, `design-library/${r.id}/refs/3.png`]);
    expect(fs.files.has(r.refs[0])).toBe(false);
  });

  describe('reorderRecipeRefs', () => {
    it('applies a permutation to the manifest only and bumps updatedAt', async () => {
      const r = await createRecipe({ ...input, refs: [png(), png(), png()] });
      const [a, b, c] = r.refs;
      fs.log.length = 0;
      vi.spyOn(Date, 'now').mockReturnValue(r.updatedAt + 1000);
      const u = await reorderRecipeRefs(r.id, [c, a, b]);
      vi.restoreAllMocks();
      expect(u.refs).toEqual([c, a, b]);
      expect(u.updatedAt).toBe(r.updatedAt + 1000);
      expect(manifestOf().recipes[0].refs).toEqual([c, a, b]);
      expect(fs.log).toEqual([`save:${MANIFEST}`]);
    });

    it('throws for an extra, missing or duplicate path and writes nothing', async () => {
      const r = await createRecipe({ ...input, refs: [png(), png()] });
      const [a, b] = r.refs;
      fs.log.length = 0;
      for (const bad of [[a, b, 'x.png'], [a], [a, a], [a, 'x.png'], []]) {
        await expect(reorderRecipeRefs(r.id, bad)).rejects.toThrow(/exactly the current references/);
      }
      await expect(reorderRecipeRefs('nope', [])).rejects.toThrow(/not found/);
      expect(fs.log).toEqual([]);
      expect(manifestOf().recipes[0].refs).toEqual([a, b]);
    });

    it('throws on a blocked manifest and writes nothing', async () => {
      fs.files.set(MANIFEST, '{{ not json at all');
      await expect(reorderRecipeRefs('x', [])).rejects.toMatchObject({ name: 'ManifestWriteBlockedError' });
      expect(fs.log).toEqual([]);
      expect(fs.files.get(MANIFEST)).toBe('{{ not json at all');
    });
  });

  it('loadRecipeSpec round-trips a spec and throws when DESIGN.md is missing', async () => {
    const r = await createRecipe(input);
    const { spec: back } = await loadRecipeSpec(r.id);
    expect(back.frontMatter).toEqual(spec.frontMatter);
    expect(back.sections.Colors).toBe('White.');
    await expect(loadRecipeSpec('nope')).rejects.toThrow(/DESIGN\.md missing/);
  });

  it('delete verifies every file, then removes the manifest entry', async () => {
    const r = await createRecipe({ ...input, refs: [png(), png()] });
    fs.log.length = 0;
    await deleteRecipe(r.id);
    expect(fs.log).toEqual([
      `delete:design-library/${r.id}/DESIGN.md`,
      `delete:${r.refs[0]}`,
      `delete:${r.refs[1]}`,
      `save:${MANIFEST}`,
    ]);
    expect(manifestOf().recipes).toEqual([]);
    expect([...fs.files.keys()]).toEqual([MANIFEST]);
  });

  it('delete throws and keeps the manifest entry when a file is still present', async () => {
    const r = await createRecipe(input);
    fs.stuck.add(r.refs[0]);
    fs.log.length = 0;
    await expect(deleteRecipe(r.id)).rejects.toThrow(/still present/);
    expect(fs.log).not.toContain(`save:${MANIFEST}`);
    expect(manifestOf().recipes).toHaveLength(1);
  });

  it('drops malformed entries on load', async () => {
    const good = { id: 'ok', createdAt: 1, updatedAt: 1, title: 't', pageType: 'app', tags: [], refs: [], overview: '' };
    fs.files.set(
      MANIFEST,
      JSON.stringify({
        recipes: [good, { id: 'bad' }, null, { ...good, id: 'bad2', refs: 'x' }],
        collections: [{ id: 'c', name: 'C', order: 0 }, { name: 'no id' }],
      }),
    );
    const lib = await loadDesignLibrary();
    expect(lib.recipes.map((r) => r.id)).toEqual(['ok']);
    expect(lib.collections.map((c) => c.id)).toEqual(['c']);
  });

  it('blocked manifest throws ManifestWriteBlockedError and writes nothing', async () => {
    fs.files.set(MANIFEST, '{{ not json at all');
    expect((await loadDesignLibrary()).safeToSave).toBe(false);
    await expect(createRecipe(input)).rejects.toMatchObject({ name: 'ManifestWriteBlockedError' });
    await expect(deleteRecipe('x')).rejects.toMatchObject({ name: 'ManifestWriteBlockedError' });
    expect(fs.log).toEqual([]);
    expect(fs.files.get(MANIFEST)).toBe('{{ not json at all');
  });
});

describe('recipe palette and fonts', () => {
  const manifestWrites = () => fs.log.filter((l) => l === `save:${MANIFEST}`).length;
  const richSpec: DesignSpec = {
    frontMatter: {
      name: 'Rich',
      colors: { background: '#FFF', accent: '#ff0000', 'accent-contrast': '#ffffff' },
      typography: { display: { fontFamily: '"Inter", sans-serif', size: 56 }, body: { fontFamily: 'Lora, serif', size: '16px' } },
    },
    sections: { Overview: 'Rich.' },
  };
  const RICH_PALETTE = ['#ff0000', '#ffffff'];
  const RICH_FONTS = ['Inter / 56px', 'Lora / 16px'];
  const oldRecipe = (id: string, updatedAt: number) => ({
    id, createdAt: 1, updatedAt, title: id, pageType: 'app', tags: [], refs: [], overview: '',
  });
  const seedOld = (ids: string[], withSpec: (id: string) => string | null = () => serializeDesignSpec(richSpec)) => {
    fs.files.set(MANIFEST, JSON.stringify({ recipes: ids.map((id, i) => oldRecipe(id, 100 + i)), collections: [] }));
    for (const id of ids) {
      const md = withSpec(id);
      if (md !== null) fs.files.set(`design-library/${id}/DESIGN.md`, md);
    }
  };

  it('create derives the fields into the returned recipe and the manifest', async () => {
    const r = await createRecipe({ ...input, spec: richSpec });
    expect([r.palette, r.fonts]).toEqual([RICH_PALETTE, RICH_FONTS]);
    expect(manifestOf().recipes[0]).toMatchObject({ palette: RICH_PALETTE, fonts: RICH_FONTS });
  });

  it('create with an empty spec stores [] (derived, nothing usable), not undefined', async () => {
    const r = await createRecipe({ ...input, spec: { frontMatter: {}, sections: {} } });
    expect([r.palette, r.fonts]).toEqual([[], []]);
    expect(manifestOf().recipes[0]).toMatchObject({ palette: [], fonts: [] });
  });

  it('update with a spec re-derives; update without a spec keeps the stored values untouched', async () => {
    const r = await createRecipe({ ...input, spec: richSpec });
    const kept = await updateRecipe(r.id, { title: 'Renamed' });
    expect([kept.palette, kept.fonts]).toEqual([RICH_PALETTE, RICH_FONTS]);
    expect(manifestOf().recipes[0]).toMatchObject({ palette: RICH_PALETTE, fonts: RICH_FONTS });
    const changed = await updateRecipe(r.id, {}, { ...richSpec, frontMatter: { colors: { primary: '#00f' } } });
    expect([changed.palette, changed.fonts]).toEqual([['#0000ff'], []]);
    expect(manifestOf().recipes[0]).toMatchObject({ palette: ['#0000ff'], fonts: [] });
  });

  it('backfills old recipes on load with exactly one manifest write, keeping updatedAt and order', async () => {
    seedOld(['b', 'a', 'c']);
    const lib = await loadDesignLibrary();
    expect(lib.recipes.map((r) => r.id)).toEqual(['b', 'a', 'c']);
    for (const r of lib.recipes) expect([r.palette, r.fonts]).toEqual([RICH_PALETTE, RICH_FONTS]);
    expect(lib.recipes.map((r) => r.updatedAt)).toEqual([100, 101, 102]);
    expect(manifestWrites()).toBe(1);
    expect(manifestOf().recipes.map((r: { id: string; updatedAt: number }) => [r.id, r.updatedAt])).toEqual([['b', 100], ['a', 101], ['c', 102]]);
    expect(manifestOf().recipes[0]).toMatchObject({ palette: RICH_PALETTE, fonts: RICH_FONTS });
    expect(manifestOf()).toHaveProperty('schemaVersion');
  });

  it('a second load does no further write', async () => {
    seedOld(['a']);
    await loadDesignLibrary();
    fs.log.length = 0;
    const again = await loadDesignLibrary();
    expect(manifestWrites()).toBe(0);
    expect(again.recipes[0].palette).toEqual(RICH_PALETTE);
  });

  it('recipes created with the new code need no backfill', async () => {
    await createRecipe({ ...input, spec: richSpec });
    fs.log.length = 0;
    await loadDesignLibrary();
    expect(fs.log).toEqual([]);
  });

  it('missing or unparseable DESIGN.md leaves both fields undefined and writes nothing', async () => {
    seedOld(['gone', 'junk', 'empty'], (id) => (id === 'gone' ? null : id === 'junk' ? 'no front matter here' : ''));
    const lib = await loadDesignLibrary();
    for (const r of lib.recipes) expect([r.palette, r.fonts]).toEqual([undefined, undefined]);
    expect(lib.recipes).toHaveLength(3);
    expect(manifestWrites()).toBe(0);
    expect(manifestOf().recipes[0]).not.toHaveProperty('palette');
  });

  it('derives the readable recipes and leaves the unreadable one underived, in a single write', async () => {
    seedOld(['ok', 'gone'], (id) => (id === 'gone' ? null : serializeDesignSpec(richSpec)));
    const lib = await loadDesignLibrary();
    expect(lib.recipes.map((r) => r.palette)).toEqual([RICH_PALETTE, undefined]);
    expect(manifestWrites()).toBe(1);
    fs.log.length = 0;
    await loadDesignLibrary();
    expect(manifestWrites()).toBe(0);
  });

  it('a recipe with only one of the two fields is backfilled', async () => {
    fs.files.set(MANIFEST, JSON.stringify({ recipes: [{ ...oldRecipe('a', 5), palette: ['#123456'] }], collections: [] }));
    fs.files.set('design-library/a/DESIGN.md', serializeDesignSpec(richSpec));
    const lib = await loadDesignLibrary();
    expect([lib.recipes[0].palette, lib.recipes[0].fonts]).toEqual([RICH_PALETTE, RICH_FONTS]);
    expect(manifestWrites()).toBe(1);
  });

  it('when the manifest turns unsafe during the backfill it returns derived values and writes nothing', async () => {
    seedOld(['a']);
    fs.onRead = (path) => {
      if (path.endsWith('DESIGN.md')) fs.files.set(MANIFEST, '{{ not json at all');
    };
    const lib = await loadDesignLibrary();
    expect(lib.safeToSave).toBe(false);
    expect([lib.recipes[0].palette, lib.recipes[0].fonts]).toEqual([RICH_PALETTE, RICH_FONTS]);
    expect(manifestWrites()).toBe(0);
    expect(fs.files.get(MANIFEST)).toBe('{{ not json at all');
  });

  it('does not overwrite a recipe created while the backfill was reading DESIGN.md files', async () => {
    seedOld(['a']);
    let injected = false;
    fs.onRead = (path) => {
      if (injected || !path.endsWith('DESIGN.md')) return;
      injected = true;
      const m = JSON.parse(fs.files.get(MANIFEST)!);
      m.recipes.push({ ...oldRecipe('late', 999), palette: [], fonts: [] });
      fs.files.set(MANIFEST, JSON.stringify(m));
    };
    const lib = await loadDesignLibrary();
    expect(lib.recipes.map((r) => r.id)).toEqual(['a', 'late']);
    expect(manifestOf().recipes.map((r: { id: string }) => r.id)).toEqual(['a', 'late']);
  });

  it('a malformed palette/fonts in a hand-edited manifest does not drop the recipe', async () => {
    fs.files.set(
      MANIFEST,
      JSON.stringify({
        recipes: [
          { ...oldRecipe('mixed', 1), palette: ['#fff', 5, null], fonts: ['Inter', {}] },
          { ...oldRecipe('bad', 2), palette: 'red', fonts: { a: 1 } },
        ],
        collections: [],
      }),
    );
    fs.files.set('design-library/bad/DESIGN.md', 'unparseable');
    const lib = await loadDesignLibrary();
    expect(lib.recipes.map((r) => r.id)).toEqual(['mixed', 'bad']);
    expect([lib.recipes[0].palette, lib.recipes[0].fonts]).toEqual([['#fff'], ['Inter']]);
    expect([lib.recipes[1].palette, lib.recipes[1].fonts]).toEqual([undefined, undefined]);
  });

  it('malformed fields are re-derived from DESIGN.md when it is readable', async () => {
    fs.files.set(MANIFEST, JSON.stringify({ recipes: [{ ...oldRecipe('a', 1), palette: 'red', fonts: 3 }], collections: [] }));
    fs.files.set('design-library/a/DESIGN.md', serializeDesignSpec(richSpec));
    const lib = await loadDesignLibrary();
    expect([lib.recipes[0].palette, lib.recipes[0].fonts]).toEqual([RICH_PALETTE, RICH_FONTS]);
  });
});

describe('collections', () => {
  const manifestWrites = () => fs.log.filter((l) => l === `save:${MANIFEST}`).length;
  const byName = (name: string) => manifestOf().collections.find((c: { name: string }) => c.name === name);

  it('add assigns order = max sibling order + 1, per level, and trims the name', async () => {
    const a = await addCollection('  Landing ');
    const b = await addCollection('Docs');
    const child = await addCollection('Hero', a.id);
    expect([a.name, a.order, b.order]).toEqual(['Landing', 0, 1]);
    expect(child).toMatchObject({ parentId: a.id, order: 0 });
    expect(a).not.toHaveProperty('parentId');
    expect(manifestOf().collections).toHaveLength(3);
  });

  it('add rejects empty names, duplicate sibling names (case-insensitive) and unknown parents; nothing is written', async () => {
    const a = await addCollection('Landing');
    fs.log.length = 0;
    await expect(addCollection('   ')).rejects.toThrow(/required/);
    await expect(addCollection('landing')).rejects.toThrow(/already exists at the top level/);
    await expect(addCollection('x', 'missing')).rejects.toThrow(/not found/);
    expect(manifestWrites()).toBe(0);
    await expect(addCollection('Landing', a.id)).resolves.toMatchObject({ parentId: a.id });
  });

  it('rename trims, allows changing only the case of its own name, rejects sibling clashes and unknown ids', async () => {
    const a = await addCollection('Landing');
    await addCollection('Docs');
    await expect(renameCollection(a.id, 'LANDING ')).resolves.toMatchObject({ name: 'LANDING' });
    await expect(renameCollection(a.id, 'docs')).rejects.toThrow(/already exists/);
    await expect(renameCollection(a.id, ' ')).rejects.toThrow(/required/);
    await expect(renameCollection('nope', 'x')).rejects.toThrow(/not found/);
    expect(byName('LANDING')).toBeTruthy();
  });

  it('move re-parents, appends at the end of the new level, and moves back to the top level', async () => {
    const a = await addCollection('A');
    const b = await addCollection('B');
    await addCollection('Existing', b.id);
    const moved = await moveCollection(a.id, b.id);
    expect(moved).toMatchObject({ parentId: b.id, order: 1 });
    const top = await moveCollection(a.id, undefined);
    expect(top).not.toHaveProperty('parentId');
    expect(manifestOf().collections.find((c: { id: string }) => c.id === a.id)).not.toHaveProperty('parentId');
  });

  it('move rejects a collection into itself or any descendant, and writes nothing', async () => {
    const a = await addCollection('A');
    const b = await addCollection('B', a.id);
    const c = await addCollection('C', b.id);
    fs.log.length = 0;
    await expect(moveCollection(a.id, a.id)).rejects.toThrow(/into itself/);
    await expect(moveCollection(a.id, c.id)).rejects.toThrow(/into itself or one of its own/);
    await expect(moveCollection(b.id, c.id)).rejects.toThrow(/into itself or one of its own/);
    expect(manifestWrites()).toBe(0);
  });

  it('move rejects a name clash in the destination and an unknown parent', async () => {
    const a = await addCollection('Pricing');
    const b = await addCollection('B');
    await addCollection('pricing', b.id);
    await expect(moveCollection(a.id, b.id)).rejects.toThrow(/already exists in "B"/);
    await expect(moveCollection(a.id, 'missing')).rejects.toThrow(/not found/);
  });

  it('saveCollectionsOrder updates order only, in one write, ignoring unknown ids', async () => {
    const a = await addCollection('A');
    const b = await addCollection('B');
    fs.log.length = 0;
    await saveCollectionsOrder([{ id: a.id, order: 5 }, { id: b.id, order: 2 }, { id: 'ghost', order: 9 }]);
    expect(manifestWrites()).toBe(1);
    expect(byName('A').order).toBe(5);
    expect(byName('B').order).toBe(2);
    expect(manifestOf().collections).toHaveLength(2);
  });

  describe('deleteCollection', () => {
    const recipeIn = async (collectionId?: string) => createRecipe({ ...input, refs: [png()], collectionId });

    it('a top-level collection moves its recipes to the root and its sub-collections to the top level, in one manifest write', async () => {
      const a = await addCollection('A');
      const sub = await addCollection('Sub', a.id);
      await addCollection('Other');
      const r1 = await recipeIn(a.id);
      const r2 = await recipeIn(a.id);
      const inSub = await recipeIn(sub.id);
      fs.log.length = 0;
      await deleteCollection(a.id);
      expect(manifestWrites()).toBe(1);
      expect(fs.log).toEqual([`save:${MANIFEST}`]);
      const m = manifestOf();
      expect(m.collections.map((c: { name: string }) => c.name).sort()).toEqual(['Other', 'Sub']);
      expect(m.collections.find((c: { id: string }) => c.id === sub.id)).not.toHaveProperty('parentId');
      expect(m.collections.find((c: { id: string }) => c.id === sub.id).order).toBe(2);
      for (const id of [r1.id, r2.id]) expect(m.recipes.find((r: { id: string }) => r.id === id)).not.toHaveProperty('collectionId');
      expect(m.recipes.find((r: { id: string }) => r.id === inSub.id).collectionId).toBe(sub.id);
      expect(m.recipes).toHaveLength(3);
    });

    it('a nested collection promotes to its own parent, not to the root', async () => {
      const a = await addCollection('A');
      const b = await addCollection('B', a.id);
      const c = await addCollection('C', b.id);
      const r = await recipeIn(b.id);
      await deleteCollection(b.id);
      const m = manifestOf();
      expect(m.collections.find((x: { id: string }) => x.id === c.id).parentId).toBe(a.id);
      expect(m.recipes.find((x: { id: string }) => x.id === r.id).collectionId).toBe(a.id);
      expect(m.collections).toHaveLength(2);
    });

    it('refuses, writing nothing, when a promoted sub-collection would clash by name at the destination', async () => {
      const a = await addCollection('A');
      await addCollection('Pricing');
      await addCollection('pricing', a.id);
      const r = await recipeIn(a.id);
      fs.log.length = 0;
      await expect(deleteCollection(a.id)).rejects.toThrow(/would clash/);
      expect(manifestWrites()).toBe(0);
      expect(manifestOf().collections).toHaveLength(3);
      expect(manifestOf().recipes.find((x: { id: string }) => x.id === r.id).collectionId).toBe(a.id);
    });

    it('deleting an empty collection just removes it; deleting one that does not exist throws', async () => {
      const a = await addCollection('A');
      await deleteCollection(a.id);
      expect(manifestOf().collections).toEqual([]);
      fs.log.length = 0;
      await expect(deleteCollection('ghost')).rejects.toThrow(/not found/);
      expect(manifestWrites()).toBe(0);
    });

    it('leaves recipes with an orphaned collectionId alone', async () => {
      const a = await addCollection('A');
      const orphan = await recipeIn('long-gone');
      await deleteCollection(a.id);
      expect(manifestOf().recipes.find((x: { id: string }) => x.id === orphan.id).collectionId).toBe('long-gone');
    });
  });

  it('a blocked manifest throws ManifestWriteBlockedError from every mutation and writes nothing', async () => {
    fs.files.set(MANIFEST, '{{ not json at all');
    await expect(addCollection('A')).rejects.toMatchObject({ name: 'ManifestWriteBlockedError' });
    await expect(renameCollection('a', 'B')).rejects.toMatchObject({ name: 'ManifestWriteBlockedError' });
    await expect(moveCollection('a', undefined)).rejects.toMatchObject({ name: 'ManifestWriteBlockedError' });
    await expect(saveCollectionsOrder([])).rejects.toMatchObject({ name: 'ManifestWriteBlockedError' });
    await expect(deleteCollection('a')).rejects.toMatchObject({ name: 'ManifestWriteBlockedError' });
    expect(fs.log).toEqual([]);
    expect(fs.files.get(MANIFEST)).toBe('{{ not json at all');
  });
});

describe('index recovery from disk (SD-10)', () => {
  const orphanSpec: DesignSpec = {
    frontMatter: { name: 'Lost Site', colors: { accent: '#00ff00' }, typography: { body: { fontFamily: 'Lora', size: 16 } } },
    sections: { Overview: 'Recovered overview.' },
  };
  const seedFolder = (id: string, opts: { spec?: string | null; refs?: string[] } = {}) => {
    if (opts.spec !== null) fs.files.set(`design-library/${id}/DESIGN.md`, opts.spec ?? serializeDesignSpec(orphanSpec));
    for (const r of opts.refs ?? []) fs.files.set(`design-library/${id}/refs/${r}`, 'img');
  };
  const writesOtherThanManifest = () => fs.log.filter((l) => l !== `save:${MANIFEST}`);

  it('finds folders with DESIGN.md the manifest does not know, ignoring known and spec-less folders', async () => {
    const known = await createRecipe(input);
    seedFolder('orphan');
    seedFolder('refs-only', { spec: null, refs: ['1.png'] });
    seedFolder('broken', { spec: '---\nname: [unclosed\n---\n' });
    expect(await findOrphanRecipes()).toEqual({ orphans: ['orphan'], unreadable: ['broken'] });
    expect(known.id).not.toBe('orphan');
  });

  it('works when the manifest is missing (the reported case) and when design-library/ is absent', async () => {
    expect(await findOrphanRecipes()).toEqual({ orphans: [], unreadable: [] });
    seedFolder('a');
    seedFolder('b');
    expect(fs.files.has(MANIFEST)).toBe(false);
    expect((await findOrphanRecipes()).orphans).toEqual(['a', 'b']);
  });

  it('a DESIGN.md that exists but cannot be read counts as unreadable', async () => {
    seedFolder('locked');
    fs.unreadable.add('design-library/locked/DESIGN.md');
    expect(await findOrphanRecipes()).toEqual({ orphans: [], unreadable: ['locked'] });
  });

  it('a listing error yields no orphans and does not throw', async () => {
    seedFolder('a');
    fs.listError = true;
    expect(await findOrphanRecipes()).toEqual({ orphans: [], unreadable: [] });
    expect(await rebuildIndexFromDisk()).toEqual({ recovered: 0, unreadable: 0 });
    expect(fs.log).toEqual([]);
  });

  it('rebuild adds derived entries in one manifest write and never writes or deletes anything else', async () => {
    const existing = await createRecipe(input);
    const collection = await addCollection('Keep');
    seedFolder('lost', { refs: ['10.png', '2.png', 'notes.txt', '1.webp'] });
    seedFolder('broken', { spec: 'no front matter' });
    const before = new Map(fs.files);
    fs.log.length = 0;
    vi.spyOn(Date, 'now').mockReturnValue(4242);
    expect(await rebuildIndexFromDisk()).toEqual({ recovered: 1, unreadable: 1 });
    vi.restoreAllMocks();
    expect(fs.log).toEqual([`save:${MANIFEST}`]);
    expect(writesOtherThanManifest()).toEqual([]);
    for (const [path, text] of before) if (path !== MANIFEST) expect(fs.files.get(path)).toBe(text);
    const m = manifestOf();
    expect(m.recipes[0]).toEqual(existing);
    expect(m.collections).toEqual([collection]);
    expect(m.recipes[1]).toEqual({
      id: 'lost', createdAt: 4242, updatedAt: 4242, title: 'Lost Site', pageType: 'other', tags: [],
      refs: ['design-library/lost/refs/1.webp', 'design-library/lost/refs/2.png', 'design-library/lost/refs/10.png'],
      overview: 'Recovered overview.', palette: ['#00ff00'], fonts: ['Lora / 16px'],
    });
    expect((await loadDesignLibrary()).recipes.map((r) => r.id)).toEqual([existing.id, 'lost']);
  });

  it('a second rebuild adds nothing and does not write', async () => {
    seedFolder('a');
    expect((await rebuildIndexFromDisk()).recovered).toBe(1);
    fs.log.length = 0;
    expect(await rebuildIndexFromDisk()).toEqual({ recovered: 0, unreadable: 0 });
    expect(fs.log).toEqual([]);
    expect(manifestOf().recipes).toHaveLength(1);
    expect(await findOrphanRecipes()).toEqual({ orphans: [], unreadable: [] });
  });

  it('a blocked manifest throws ManifestWriteBlockedError and writes nothing', async () => {
    seedFolder('a');
    fs.files.set(MANIFEST, '{{ not json at all');
    await expect(rebuildIndexFromDisk()).rejects.toMatchObject({ name: 'ManifestWriteBlockedError' });
    expect(fs.log).toEqual([]);
    expect(fs.files.get(MANIFEST)).toBe('{{ not json at all');
  });

  it('a recipe saved during the scan is kept and not duplicated', async () => {
    seedFolder('a');
    seedFolder('b');
    let injected = false;
    fs.onRead = (path) => {
      if (injected || path !== 'design-library/a/DESIGN.md') return;
      injected = true;
      // Another save lands mid-scan: it indexes 'b' itself and adds an unrelated recipe.
      const late = { id: 'late', createdAt: 1, updatedAt: 1, title: 'Late', pageType: 'app', tags: [], refs: [], overview: '' };
      const b = { ...late, id: 'b', title: 'B by hand' };
      fs.files.set(MANIFEST, JSON.stringify({ recipes: [late, b], collections: [] }));
    };
    expect(await rebuildIndexFromDisk()).toEqual({ recovered: 1, unreadable: 0 });
    const m = manifestOf();
    expect(m.recipes.map((r: { id: string }) => r.id)).toEqual(['late', 'b', 'a']);
    expect(m.recipes[1].title).toBe('B by hand');
  });
});
