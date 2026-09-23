import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react';

/**
 * AssetsManagerPage component tests (plan Task 4a/4b):
 * welcome state, root/tree wiring, grid render, page cap + LOAD MORE,
 * lightbox nav, and object URL teardown on folder switch + unmount.
 */

// `passthrough` results MUST be memoized per tag: motion.div/motion.section
// etc. need a stable component identity across renders exactly like the real
// `motion/react` does. A Proxy that recomputes on every property access
// hands React a brand-new component type each render, which makes React
// unmount+remount the whole subtree on every state change — real `motion`
// never does this, so the mock must not either.
function makeMotionMock(React: typeof import('react')) {
  const cache = new Map<string, any>();
  const passthrough = (tag: string) => {
    if (!cache.has(tag)) {
      cache.set(tag, React.forwardRef(({ children, ...rest }: any, ref: any) => React.createElement(tag, { ...rest, ref }, children)));
    }
    return cache.get(tag);
  };
  return new Proxy({}, { get: (_t, tag: string) => passthrough(tag) });
}

vi.mock('./AnimatedPanels', async () => {
  const React = await import('react');
  return {
    TerminalText: ({ text, className }: any) => React.createElement('span', { className }, text),
    PanelLine: () => null,
    ScanLine: () => null,
    panelVariants: {},
    sectionWipeVariants: {},
    contentVariants: {},
    motion: makeMotionMock(React),
    AnimatePresence: ({ children }: any) => children,
  };
});

vi.mock('motion/react', async () => {
  const React = await import('react');
  return {
    motion: makeMotionMock(React),
    AnimatePresence: ({ children }: any) => children,
  };
});

function makeFile(id: string, name: string) {
  return {
    id,
    rootId: 'root1',
    path: name,
    name,
    ext: 'png',
    handle: { getFile: vi.fn(async () => new Blob(['x'], { type: 'image/png' })) },
  };
}

const scanDirectoryTreeMock = vi.fn(async (rootId: string) => ({
  id: `${rootId}:`,
  rootId,
  path: '',
  name: 'RootFolder',
  handle: {},
  children: [
    { id: `${rootId}:sub`, rootId, path: 'sub', name: 'sub', handle: {}, children: [] },
  ],
}));

let folderContents: any[] = [makeFile('root1:a.png', 'a.png'), makeFile('root1:b.png', 'b.png')];
const listFolderFilesMock = vi.fn(async () => ({ files: folderContents, truncated: false }));

vi.mock('../services/assets/directoryScanner', () => ({
  scanDirectoryTree: (rootId: string) => scanDirectoryTreeMock(rootId),
  listFolderFiles: () => listFolderFilesMock(),
}));

const listRootsMock = vi.fn(async () => [{ id: 'root1', name: 'RootFolder', handle: {}, addedAt: 1, status: 'granted' as const }]);
const addRootMock = vi.fn();
const addRootFromHandleMock = vi.fn();
const removeRootMock = vi.fn();
const requestRootPermissionMock = vi.fn();

vi.mock('../services/assets/assetRootManager', () => ({
  listRoots: () => listRootsMock(),
  addRoot: () => addRootMock(),
  addRootFromHandle: (h: unknown) => addRootFromHandleMock(h),
  removeRoot: (rootId: string) => removeRootMock(rootId),
  requestRootPermission: (root: unknown) => requestRootPermissionMock(root),
}));

const moveFilesToFolderMock = vi.fn(async (..._args: unknown[]) => ({ moved: [], failed: [] as { path: string; error: string }[] }));
vi.mock('../services/assets/fileOps', () => ({
  moveFilesToFolder: (...args: unknown[]) => moveFilesToFolderMock(...args),
}));

const downloadZipMock = vi.fn(async (..._args: unknown[]) => 'blob:zip');
vi.mock('../utils/zipDownload', () => ({
  downloadZip: (...args: unknown[]) => downloadZipMock(...args),
}));

const emitMock = vi.fn();
vi.mock('../utils/eventBus', () => ({
  appEventBus: { emit: (...args: unknown[]) => emitMock(...args), on: vi.fn(() => () => {}) },
}));

import AssetsManagerPage from './AssetsManagerPage';

let createdUrls: string[] = [];
let revokedUrls: string[] = [];

beforeEach(() => {
  createdUrls = [];
  revokedUrls = [];
  folderContents = [makeFile('root1:a.png', 'a.png'), makeFile('root1:b.png', 'b.png')];
  vi.stubGlobal('URL', {
    ...(typeof URL !== 'undefined' ? URL : {}),
    createObjectURL: vi.fn(() => {
      const url = `blob:mock-${createdUrls.length}`;
      createdUrls.push(url);
      return url;
    }),
    revokeObjectURL: vi.fn((url: string) => {
      revokedUrls.push(url);
    }),
  });
  listRootsMock.mockClear();
  addRootMock.mockReset();
  addRootFromHandleMock.mockReset();
  removeRootMock.mockClear();
  requestRootPermissionMock.mockClear();
  scanDirectoryTreeMock.mockClear();
  listFolderFilesMock.mockClear();
  moveFilesToFolderMock.mockClear();
  downloadZipMock.mockClear();
  emitMock.mockClear();
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('AssetsManagerPage', () => {
  it('shows the welcome state when no roots are configured', async () => {
    listRootsMock.mockResolvedValueOnce([]);
    render(<AssetsManagerPage />);
    await screen.findByText('SELECT A FOLDER TO BEGIN');
  });

  it('renders the folder grid for an existing granted root', async () => {
    render(<AssetsManagerPage />);
    await waitFor(() => expect(listFolderFilesMock).toHaveBeenCalled());
    await waitFor(() => expect(screen.getByText('2 IMAGES')).toBeTruthy());
    expect(screen.getAllByRole('button', { name: /Open/ })).toHaveLength(2);
  });

  it('LOAD MORE appears above the page cap and reveals more cards', async () => {
    folderContents = Array.from({ length: 205 }, (_, i) => makeFile(`root1:f${i}.png`, `f${i}.png`));
    render(<AssetsManagerPage />);
    // Longer timeouts: 205 mocked getFile() calls run under this test, and the
    // default 1000ms waitFor / 5000ms test window can be tight under
    // full-suite parallel load.
    await waitFor(() => expect(screen.getByText('205 IMAGES')).toBeTruthy(), { timeout: 8000 });
    await waitFor(() => expect(screen.getAllByRole('button', { name: /Open/ })).toHaveLength(200), { timeout: 8000 });
    fireEvent.click(screen.getByText(/LOAD MORE/));
    await waitFor(() => expect(screen.getAllByRole('button', { name: /Open/ })).toHaveLength(205), { timeout: 8000 });
  }, 15000);

  it('opens the lightbox on card click and navigates with arrow keys', async () => {
    render(<AssetsManagerPage />);
    await waitFor(() => expect(screen.getByText('2 IMAGES')).toBeTruthy());
    await screen.findAllByRole('button', { name: /Open/ });
    // Wait for the object-URL-load effect to settle (swaps each card's
    // placeholder for an <img>) before querying — grabbing a node reference
    // earlier and clicking it later risks acting on a stale/replaced element.
    await waitFor(() => expect(screen.getAllByRole('img')).toHaveLength(2));
    fireEvent.click(screen.getAllByRole('button', { name: /Open/ })[0]);
    await screen.findByRole('dialog');
    expect(screen.getByText('1 / 2')).toBeTruthy();

    fireEvent.keyDown(window, { key: 'ArrowRight' });
    await waitFor(() => expect(screen.getByText('2 / 2')).toBeTruthy());

    fireEvent.keyDown(window, { key: 'Escape' });
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  });

  it('switching folders revokes the previous folder\'s object URLs', async () => {
    render(<AssetsManagerPage />);
    await waitFor(() => expect(createdUrls.length).toBe(2));
    const firstBatch = [...createdUrls];

    folderContents = [makeFile('root1:sub/c.png', 'c.png')];
    listFolderFilesMock.mockResolvedValueOnce({ files: folderContents, truncated: false });

    fireEvent.click(screen.getByText('sub'));

    await waitFor(() => expect(screen.getByText('1 IMAGE')).toBeTruthy());
    await waitFor(() => firstBatch.every(u => revokedUrls.includes(u)));
    expect(firstBatch.every(u => revokedUrls.includes(u))).toBe(true);
  });

  it('unmount revokes all tracked object URLs (useObjectUrls teardown)', async () => {
    const { unmount } = render(<AssetsManagerPage />);
    await waitFor(() => expect(createdUrls.length).toBe(2));
    unmount();
    await waitFor(() => expect(revokedUrls.length).toBeGreaterThanOrEqual(2));
  });

  it('ctrl+click selects a card and shows the selection toolbar', async () => {
    render(<AssetsManagerPage />);
    await waitFor(() => expect(screen.getByText('2 IMAGES')).toBeTruthy());
    await waitFor(() => expect(screen.getAllByRole('img')).toHaveLength(2));
    const cards = screen.getAllByRole('button', { name: /Open/ });

    fireEvent.click(cards[0], { ctrlKey: true });
    await screen.findByText('1 SELECTED');
    expect(screen.getByRole('checkbox', { name: /Deselect a\.png/ })).toBeTruthy();

    fireEvent.click(cards[1], { ctrlKey: true });
    await screen.findByText('2 SELECTED');
  });

  it('Export downloads a single selected file directly (no zip)', async () => {
    render(<AssetsManagerPage />);
    await waitFor(() => expect(screen.getByText('2 IMAGES')).toBeTruthy());
    await waitFor(() => expect(screen.getAllByRole('img')).toHaveLength(2));
    const cards = screen.getAllByRole('button', { name: /Open/ });
    fireEvent.click(cards[0], { ctrlKey: true });
    await screen.findByText('1 SELECTED');

    fireEvent.click(screen.getByText('Export'));
    await waitFor(() => expect(downloadZipMock).not.toHaveBeenCalled());
  });

  it('Export zips multiple selected files', async () => {
    render(<AssetsManagerPage />);
    await waitFor(() => expect(screen.getByText('2 IMAGES')).toBeTruthy());
    await waitFor(() => expect(screen.getAllByRole('img')).toHaveLength(2));
    const cards = screen.getAllByRole('button', { name: /Open/ });
    fireEvent.click(cards[0], { ctrlKey: true });
    fireEvent.click(cards[1], { ctrlKey: true });
    await screen.findByText('2 SELECTED');

    fireEvent.click(screen.getByText('Export'));
    await waitFor(() => expect(downloadZipMock).toHaveBeenCalledTimes(1));
    const entries = downloadZipMock.mock.calls[0]![0] as { name: string }[];
    expect(entries.map(e => e.name).sort()).toEqual(['a.png', 'b.png']);
  });

  it('Convert emits openInConverter with native File objects for all selected', async () => {
    render(<AssetsManagerPage />);
    await waitFor(() => expect(screen.getByText('2 IMAGES')).toBeTruthy());
    await waitFor(() => expect(screen.getAllByRole('img')).toHaveLength(2));
    const cards = screen.getAllByRole('button', { name: /Open/ });
    fireEvent.click(cards[0], { ctrlKey: true });
    fireEvent.click(cards[1], { ctrlKey: true });
    await screen.findByText('2 SELECTED');

    fireEvent.click(screen.getByText('Convert'));
    await waitFor(() => expect(emitMock).toHaveBeenCalledWith('openInConverter', expect.objectContaining({ files: expect.any(Array) })));
    const [, payload] = emitMock.mock.calls.find(c => c[0] === 'openInConverter')!;
    expect(payload.files).toHaveLength(2);
  });

  it('Edit is disabled unless exactly one asset is selected, and emits openInEditor for one', async () => {
    render(<AssetsManagerPage />);
    await waitFor(() => expect(screen.getByText('2 IMAGES')).toBeTruthy());
    await waitFor(() => expect(screen.getAllByRole('img')).toHaveLength(2));
    const cards = screen.getAllByRole('button', { name: /Open/ });
    fireEvent.click(cards[0], { ctrlKey: true });
    fireEvent.click(cards[1], { ctrlKey: true });
    await screen.findByText('2 SELECTED');
    expect(screen.getByText('Edit').closest('button')?.disabled).toBe(true);

    fireEvent.click(cards[1], { ctrlKey: true }); // deselect one → back to 1
    await screen.findByText('1 SELECTED');
    expect(screen.getByText('Edit').closest('button')?.disabled).toBe(false);

    fireEvent.click(screen.getByText('Edit'));
    await waitFor(() => expect(emitMock).toHaveBeenCalledWith('openInEditor', expect.objectContaining({ blob: expect.anything() })));
  });

  it('dragging a selected card onto a folder tree node moves it there', async () => {
    render(<AssetsManagerPage />);
    await waitFor(() => expect(screen.getByText('2 IMAGES')).toBeTruthy());
    await waitFor(() => expect(screen.getAllByRole('img')).toHaveLength(2));
    const cards = screen.getAllByRole('button', { name: /Open/ });
    fireEvent.click(cards[0], { ctrlKey: true });
    await screen.findByText('1 SELECTED');

    const dataTransfer = { effectAllowed: '', setData: vi.fn(), dropEffect: '' };
    fireEvent.dragStart(cards[0], { dataTransfer });
    fireEvent.dragOver(screen.getByText('sub'), { dataTransfer });
    fireEvent.drop(screen.getByText('sub'), { dataTransfer });

    await waitFor(() => expect(moveFilesToFolderMock).toHaveBeenCalledTimes(1));
    const movedFiles = moveFilesToFolderMock.mock.calls[0]![0] as { name: string }[];
    expect(movedFiles.map(f => f.name)).toEqual(['a.png']);
  });
});
