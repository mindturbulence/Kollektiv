import { describe, it, expect, vi, beforeEach } from 'vitest';

const fsm = vi.hoisted(() => ({
  selected: true,
  files: new Map<string, Blob>(),
  saved: [] as { path: string; size: number }[],
}));
vi.mock('../utils/fileUtils', () => ({
  fileSystemManager: {
    isDirectorySelected: () => fsm.selected,
    getFileAsBlob: async (p: string) => fsm.files.get(p) ?? null,
    saveFile: async (p: string, b: Blob) => { fsm.saved.push({ path: p, size: b.size }); return p; },
  },
}));
vi.mock('../utils/galleryStorage', async (orig) => ({
  ...(await orig<typeof import('../utils/galleryStorage')>()),
  loadGalleryItems: async () => [{ id: 'item_1', urls: ['gallery/shots/sunset.png'] }],
}));
const convertVaultFile = vi.hoisted(() => vi.fn(async (_blob: Blob, path: string, target: string) => ({
  blob: new Blob(['converted']), path: `gallery/converted/${path.split('/').pop()!.replace(/\.[^.]+$/, '')}.${target === 'jpeg' ? 'jpg' : target}`,
})));
vi.mock('./convert/convertFile', () => ({ convertVaultFile }));

import { ASSISTANT_TOOLS } from './assistantTools';
const tool = () => ASSISTANT_TOOLS.find(t => t.name === 'convert_file')!;
const ctx = {} as never;

beforeEach(() => {
  fsm.selected = true;
  fsm.files = new Map([['gallery/shots/sunset.png', new Blob(['png'])]]);
  fsm.saved = [];
  convertVaultFile.mockClear();
});

describe('convert_file tool', () => {
  it('is declared with a target enum and registered as a capability', async () => {
    expect(tool().parameters.required).toEqual(['target']);
    expect(tool().parameters.properties.target.enum).toContain('avif');
    const { capabilityRegistry } = await import('./capabilityRegistry');
    expect(capabilityRegistry.get('convert_file')?.execution.toolName).toBe('convert_file');
  });

  it('converts a vault path and saves to gallery/converted/', async () => {
    const out = await tool().execute({ path: 'gallery/shots/sunset.png', target: 'webp', quality: 70, max_edge: 1080 }, ctx);
    expect(convertVaultFile).toHaveBeenCalledWith(expect.any(Blob), 'gallery/shots/sunset.png', 'webp', { quality: 70, maxEdge: 1080 });
    expect(fsm.saved).toEqual([{ path: 'gallery/converted/sunset.webp', size: 9 }]);
    expect(out).toMatch(/saved as gallery\/converted\/sunset\.webp/);
  });

  it('resolves a gallery item id to its first media file', async () => {
    await tool().execute({ gallery_item_id: 'item_1', target: 'jpeg' }, ctx);
    expect(convertVaultFile.mock.calls[0][1]).toBe('gallery/shots/sunset.png');
  });

  it('reports missing inputs, missing files and no vault as errors', async () => {
    expect(await tool().execute({ target: 'png' }, ctx)).toMatch(/pass a vault path/);
    expect(await tool().execute({ path: 'nope.png', target: 'png' }, ctx)).toMatch(/not found/);
    expect(await tool().execute({ gallery_item_id: 'x', target: 'png' }, ctx)).toMatch(/no gallery item/);
    fsm.selected = false;
    expect(await tool().execute({ path: 'gallery/shots/sunset.png', target: 'png' }, ctx)).toMatch(/no vault/);
  });
});
