import { describe, it, expect, vi, afterEach } from 'vitest';
import {
  buildExportBundle,
  designDirExists,
  DesignDirExistsError,
  loadBriefDraft,
  saveBriefDraft,
  writeBundleToDirectory,
  type ExportFile,
} from './designExport';
import { compileRecipePrompt, renderBriefMd } from './designRecipePrompt';
import type { DesignRecipe, RecipeBrief } from '../types';

const notFound = () => new DOMException('missing', 'NotFoundError');

/** Minimal in-memory FileSystemDirectoryHandle: only what designExport touches. */
class FakeDir {
  dirs = new Map<string, FakeDir>();
  files = new Map<string, string | Blob>();
  constructor(public name = 'root') {}
  async getDirectoryHandle(name: string, opts?: { create?: boolean }): Promise<FakeDir> {
    let d = this.dirs.get(name);
    if (!d) {
      if (!opts?.create) throw notFound();
      d = new FakeDir(name);
      this.dirs.set(name, d);
    }
    return d;
  }
  async getFileHandle(name: string, opts?: { create?: boolean }) {
    if (!this.files.has(name)) {
      if (!opts?.create) throw notFound();
      this.files.set(name, '');
    }
    return {
      createWritable: async () => ({
        write: async (c: string | Blob) => { this.files.set(name, c); },
        close: async () => {},
      }),
    };
  }
  async removeEntry(name: string) {
    if (!this.dirs.delete(name) && !this.files.delete(name)) throw notFound();
  }
  async *keys() {
    yield* this.dirs.keys();
    yield* this.files.keys();
  }
  asHandle(): FileSystemDirectoryHandle {
    return this as unknown as FileSystemDirectoryHandle;
  }
}

const recipe: DesignRecipe = {
  id: 'r1', createdAt: 1, updatedAt: 1, title: 'T', pageType: 'landing', tags: [], overview: '',
  refs: ['design-library/r1/refs/3.png', 'design-library/r1/refs/7.jpg', 'design-library/r1/refs/9.webp'],
};
const brief: RecipeBrief = { project: 'Acme', pages: 'home + pricing', stack: 'Next.js' };
const png = new Blob(['a'], { type: 'image/png' });
const jpg = new Blob(['b'], { type: 'image/jpeg' });
const webp = new Blob(['c'], { type: 'image/webp' });
const input = {
  recipe,
  designMd: '---\nname: X\n---\n# Overview',
  refs: [{ name: '3.png', blob: png }, { name: '7.jpg', blob: jpg }, { name: '9.webp', blob: webp }],
  brief,
  mode: 'adapt' as const,
  zip: false,
};

const bundleFiles = (zip = false): ExportFile[] => buildExportBundle({ ...input, zip }).files;

describe('buildExportBundle', () => {
  it('produces the four known paths with refs renumbered 1..N and extensions from blob.type', () => {
    const { files, prompt } = buildExportBundle(input);
    expect(files.map((f) => f.path)).toEqual([
      'design/DESIGN.md', 'design/BRIEF.md', 'design/PROMPT.md',
      'design/refs/1.png', 'design/refs/2.jpg', 'design/refs/3.webp',
    ]);
    expect(files[0].content).toBe(input.designMd);
    expect(files[1].content).toBe(renderBriefMd(brief));
    expect(files[2].content).toBe(prompt);
    expect(prompt).toBe(compileRecipePrompt(brief, 'adapt', { zip: false }));
    expect(files[3].content).toBe(png);
    expect(files[5].content).toBe(webp);
  });

  it('zip only adds the unzip line to the prompt', () => {
    const plain = buildExportBundle(input).prompt;
    const zipped = buildExportBundle({ ...input, zip: true }).prompt;
    const [first, ...rest] = zipped.split('\n');
    expect(first).toBe('First unzip design.zip into the repo root.');
    expect(rest.join('\n')).toBe(plain);
  });

  it('reproduce mode reaches the prompt', () => {
    expect(buildExportBundle({ ...input, mode: 'reproduce' }).prompt).toContain('Reproduce the screenshots');
  });

  it('rejects an unsupported image type naming the recipe ref', () => {
    expect(() => buildExportBundle({ ...input, refs: [{ name: 'x', blob: new Blob(['z'], { type: 'image/gif' }) }] }))
      .toThrow(/image\/gif.*refs\/3\.png/);
  });
});

describe('writeBundleToDirectory', () => {
  it('writes every file under design/ on a clean folder', async () => {
    const root = new FakeDir();
    await writeBundleToDirectory(root.asHandle(), bundleFiles(), { overwrite: false });
    expect([...root.dirs.keys()]).toEqual(['design']);
    expect(root.files.size).toBe(0);
    const design = root.dirs.get('design')!;
    expect([...design.files.keys()].sort()).toEqual(['BRIEF.md', 'DESIGN.md', 'PROMPT.md']);
    expect([...design.dirs.get('refs')!.files.keys()]).toEqual(['1.png', '2.jpg', '3.webp']);
    expect(design.files.get('DESIGN.md')).toBe(input.designMd);
  });

  it('throws DesignDirExistsError without overwrite and leaves the folder untouched', async () => {
    const root = new FakeDir();
    const existing = await root.getDirectoryHandle('design', { create: true });
    existing.files.set('DESIGN.md', 'old');
    await expect(writeBundleToDirectory(root.asHandle(), bundleFiles(), { overwrite: false })).rejects.toBeInstanceOf(DesignDirExistsError);
    expect(existing.files.get('DESIGN.md')).toBe('old');
    expect(existing.dirs.size).toBe(0);
  });

  it('overwrite replaces refs and known files but leaves unrelated files alone', async () => {
    const root = new FakeDir();
    root.files.set('README.md', 'mine');
    const design = await root.getDirectoryHandle('design', { create: true });
    design.files.set('DESIGN.md', 'old');
    design.files.set('notes.txt', 'keep me');
    const refs = await design.getDirectoryHandle('refs', { create: true });
    refs.files.set('1.png', 'old1');
    refs.files.set('9.png', 'old9');
    const other = await root.getDirectoryHandle('src', { create: true });
    other.files.set('app.ts', 'code');

    await writeBundleToDirectory(root.asHandle(), bundleFiles(), { overwrite: true });

    expect(root.files.get('README.md')).toBe('mine');
    expect(other.files.get('app.ts')).toBe('code');
    expect(design.files.get('notes.txt')).toBe('keep me');
    expect(design.files.get('DESIGN.md')).toBe(input.designMd);
    expect([...refs.files.keys()]).toEqual(['1.png', '2.jpg', '3.webp']);
    expect(refs.files.get('1.png')).toBe(png);
  });

  it('refuses paths outside design/ before writing anything', async () => {
    const root = new FakeDir();
    for (const path of ['README.md', 'design/../x.txt', 'other/a.txt']) {
      await expect(writeBundleToDirectory(root.asHandle(), [{ path, content: 'x' }], { overwrite: true })).rejects.toThrow(/outside design/);
    }
    expect(root.dirs.size).toBe(0);
    expect(root.files.size).toBe(0);
  });
});

describe('designDirExists', () => {
  it('reports presence and rethrows non-NotFound errors', async () => {
    const root = new FakeDir();
    expect(await designDirExists(root.asHandle())).toBe(false);
    await root.getDirectoryHandle('design', { create: true });
    expect(await designDirExists(root.asHandle())).toBe(true);
    const denied = { getDirectoryHandle: async () => { throw new DOMException('no', 'NotAllowedError'); } };
    await expect(designDirExists(denied as unknown as FileSystemDirectoryHandle)).rejects.toThrow('no');
  });
});

describe('brief draft storage', () => {
  afterEach(() => { vi.restoreAllMocks(); localStorage.clear(); });

  it('round-trips and keeps only valid fields', () => {
    saveBriefDraft({ brief: { project: 'P', pages: 'Q', job: 'J' }, mode: 'reproduce' });
    expect(loadBriefDraft()).toEqual({ brief: { project: 'P', pages: 'Q', job: 'J' }, mode: 'reproduce' });
    localStorage.setItem('kollektiv.designBriefDraft', JSON.stringify({ project: 5, pages: 'ok', mode: 'weird' }));
    expect(loadBriefDraft()).toEqual({ brief: { project: '', pages: 'ok' }, mode: 'adapt' });
  });

  it('ignores invalid JSON and throwing storage', () => {
    localStorage.setItem('kollektiv.designBriefDraft', '{nope');
    expect(loadBriefDraft().brief.project).toBe('');
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new Error('blocked'); });
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('blocked'); });
    expect(loadBriefDraft().mode).toBe('adapt');
    expect(() => saveBriefDraft({ brief: { project: 'a', pages: 'b' }, mode: 'adapt' })).not.toThrow();
  });
});
