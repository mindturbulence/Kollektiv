import { beforeEach, describe, expect, it, vi } from 'vitest';

const open = vi.fn();
const getBlob = vi.fn();
const loadItems = vi.fn();
vi.mock('../../video-editor/bridge/openInVideoEditor', () => ({ openInVideoEditor: (...a: unknown[]) => open(...a) }));
vi.mock('../../utils/fileUtils', () => ({ fileSystemManager: { getFileAsBlob: (...a: unknown[]) => getBlob(...a) } }));
vi.mock('../../utils/galleryStorage', () => ({ loadGalleryItems: () => loadItems() }));

import { openClipsInVideoEditor } from './openClips';

beforeEach(() => { open.mockReset(); getBlob.mockReset(); loadItems.mockReset(); });

describe('openClipsInVideoEditor', () => {
  it('reads Gallery files in clip order and opens them named by position', async () => {
    loadItems.mockResolvedValue([{ id: 'a', urls: ['gallery/a.mp4'] }, { id: 'b', urls: ['gallery/b.mp4'] }]);
    getBlob.mockImplementation((p: string) => Promise.resolve(new Blob([p])));
    const n = await openClipsInVideoEditor([{ assetKey: 'b' }, { assetKey: 'a' }]);
    expect(n).toBe(2);
    const files = open.mock.calls[0][0] as { name: string; blob: Blob }[];
    expect(files.map(f => f.name)).toEqual(['canvas-clip-01.mp4', 'canvas-clip-02.mp4']);
    expect(getBlob.mock.calls.map(c => c[0])).toEqual(['gallery/b.mp4', 'gallery/a.mp4']);
  });

  it('skips unreadable clips and throws when none are readable', async () => {
    loadItems.mockResolvedValue([{ id: 'a', urls: ['gallery/a.mp4'] }]);
    getBlob.mockResolvedValue(new Blob(['x']));
    expect(await openClipsInVideoEditor([{ assetKey: 'missing' }, { assetKey: 'a' }])).toBe(1);
    open.mockReset();
    getBlob.mockResolvedValue(null);
    await expect(openClipsInVideoEditor([{ assetKey: 'a' }])).rejects.toThrow(/Gallery/);
    expect(open).not.toHaveBeenCalled();
  });

  it('refuses an empty list', async () => {
    await expect(openClipsInVideoEditor([])).rejects.toThrow(/Run the graph/);
  });
});
