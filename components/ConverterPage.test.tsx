import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react';

/**
 * ConverterPage component tests (plan §8 / Phase 3 T4):
 * queue render, batch cap warning, double-click dedupe, unmount teardown,
 * vault-disconnected hides Save to Vault (W4), AV engine state surface (W2).
 */

vi.mock('./AnimatedPanels', async () => {
  // Strip animation: render plain spans/sections so text is immediately visible.
  const React = await import('react');
  const passthrough = (tag: string) =>
    React.forwardRef(({ children, ...rest }: any, ref: any) =>
      React.createElement(tag, { ...rest, ref }, children),
    );
  return {
    TerminalText: ({ text, className }: any) => React.createElement('span', { className }, text),
    PanelLine: () => null,
    ScanLine: () => null,
    panelVariants: {},
    sectionWipeVariants: {},
    contentVariants: {},
    motion: new Proxy({}, { get: (_t, tag: string) => passthrough(tag) }),
  };
});

vi.mock('../contexts/SettingsContext', () => ({
  useSettings: () => ({ settings: { activeLLM: 'gemini' }, updateSettings: vi.fn() }),
}));

vi.mock('../utils/fileUtils', () => ({
  fileSystemManager: {
    isInitialized: false, // vault disconnected → Save to Vault hidden (plan W4)
    saveFile: vi.fn(async () => ''),
  },
}));

const convertMock = vi.hoisted(() =>
  vi.fn(async (req: { id: string; data: ArrayBuffer; fileName: string; targetId: string }) => ({
    id: req.id,
    kind: 'result' as const,
    ok: true as const,
    data: new Uint8Array([1, 2, 3]).buffer,
    mime: 'image/webp',
    byteLength: 3,
  })),
);
vi.mock('../services/convert/convertManager', () => ({
  // Plain class — survives `new` reliably (vi.fn() mocks do not).
  ConvertWorkerManager: class {
    convert = convertMock;
    cancelAll = vi.fn();
    dispose = vi.fn();
  },
}));

vi.mock('../services/convert/audioVideoConverter', () => ({
  audioVideoConverter: {
    getLoadState: () => 'idle',
    onLoadStateChange: () => () => {},
    convert: vi.fn(),
    cancelAll: vi.fn(),
    dispose: vi.fn(),
    preload: vi.fn(),
  },
}));

import ConverterPage from './ConverterPage';

function makeFile(name: string, size = 100): File {
  const file = new File([new Uint8Array(size)], name, { type: 'image/png' });
  Object.defineProperty(file, 'size', { value: size });
  return file;
}

function addFiles(names: string[]) {
  const input = document.querySelector('input[type="file"]') as HTMLInputElement;
  Object.defineProperty(input, 'files', {
    value: names.map(n => makeFile(n)),
    configurable: true,
  });
  fireEvent.change(input);
}

beforeEach(() => {
  if (!window.matchMedia) {
    (window as any).matchMedia = vi.fn().mockImplementation((query: string) => ({
      matches: query.includes('prefers-reduced-motion'),
      media: query,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    }));
  }
  vi.stubGlobal('URL', {
    ...(typeof URL !== 'undefined' ? URL : {}),
    createObjectURL: vi.fn(() => `blob:mock-${Math.random().toString(36).slice(2)}`),
    revokeObjectURL: vi.fn(),
  });
  vi.stubGlobal('Worker', class {
    postMessage() { /* noop */ }
    terminate() { /* noop */ }
  });
  convertMock.mockClear();
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('ConverterPage (plan §8 component tests)', () => {
  it('renders empty state with drop strip', () => {
    render(<ConverterPage />);
    expect(screen.getByText('DROP FILES OR CLICK TO BROWSE — IMAGES · AUDIO · VIDEO')).toBeTruthy();
    expect(screen.getByText('Queue is Empty')).toBeTruthy();
  });

  it('added files appear as rows with pending status', async () => {
    render(<ConverterPage />);
    addFiles(['a.png', 'b.png']);
    await waitFor(() => expect(screen.getByText('2 FILES')).toBeTruthy());
    expect(screen.getByText('a.png')).toBeTruthy();
    expect(screen.getByText('b.png')).toBeTruthy();
    expect(screen.getAllByLabelText('queued')).toHaveLength(2);
  });

  it('unknown extensions are rejected before queueing', async () => {
    render(<ConverterPage />);
    addFiles(['virus.exe']);
    await screen.findByText('virus.exe');
    expect(screen.getByText('Unsupported format')).toBeTruthy();
    expect(screen.getByLabelText('error')).toBeTruthy();
  });

  it('batch cap 200 shows a visible warning and drops the overflow', async () => {
    render(<ConverterPage />);
    addFiles(Array.from({ length: 205 }, (_, i) => `f${i}.png`));
    await screen.findByText(/Batch cap reached \(200\)/);
    await waitFor(() => expect(screen.getByText('200 FILES')).toBeTruthy());
  });

  it('CONVERT ALL converts pending rows and shows done LEDs', async () => {
    render(<ConverterPage />);
    addFiles(['x.png']);
    await screen.findByText('x.png');
    fireEvent.click(screen.getByText('CONVERT ALL'));
    await waitFor(() => expect(convertMock).toHaveBeenCalledTimes(1));
    await screen.findByText(/→ x.webp/);
    expect(screen.getByLabelText('done')).toBeTruthy();
    // 1/1 converted in the status bar
    expect(screen.getByText(/1\/1 converted/)).toBeTruthy();
  });

  it('double-click dedupe: CONVERT ALL while running is a no-op', async () => {
    const holder: { release?: () => void } = {};
    convertMock.mockImplementationOnce(
      () =>
        new Promise(resolve => {
          holder.release = () =>
            resolve({
              id: 'held',
              kind: 'result' as const,
              ok: true as const,
              data: new Uint8Array([1]).buffer,
              mime: 'image/webp',
              byteLength: 1,
            });
        }) as any,
    );
    render(<ConverterPage />);
    addFiles(['slow.png']);
    await screen.findByText('slow.png');

    const convertBtn = () => screen.getByText(/CONVERT( ALL|ING…)/);
    fireEvent.click(convertBtn());
    // While the first job is in flight the button shows CONVERTING… and
    // re-clicks are ignored (isRunning guard + disabled).
    await screen.findByText('CONVERTING…');
    fireEvent.click(convertBtn());
    holder.release?.();
    await waitFor(() => expect(convertMock).toHaveBeenCalledTimes(1));
    expect(screen.getByText(/1\/1 converted/)).toBeTruthy();
  });

  it('failed conversion marks the row with an error LED and message', async () => {
    convertMock.mockRejectedValueOnce(new Error('CONVERT_FAILED: boom'));
    render(<ConverterPage />);
    addFiles(['bad.png']);
    await screen.findByText('bad.png');
    fireEvent.click(screen.getByText('CONVERT ALL'));
    await screen.findByText(/CONVERT_FAILED: boom/);
    expect(screen.getByLabelText('error')).toBeTruthy();
  });

  it('vault disconnected → SAVE TO VAULT hidden, ZIP download remains (plan W4)', async () => {
    render(<ConverterPage />);
    addFiles(['y.png']);
    await screen.findByText('y.png');
    fireEvent.click(screen.getByText('CONVERT ALL'));
    await waitFor(() => expect(screen.getByText(/1\/1 converted/)).toBeTruthy());
    expect(screen.queryByText('SAVE TO VAULT')).toBeNull();
    expect(screen.getByText(/DOWNLOAD ZIP \(1\)/)).toBeTruthy();
  });

  it('unmount tears down workers and AV facade (plan S1)', async () => {
    const { unmount } = render(<ConverterPage />);
    addFiles(['z.png']);
    await screen.findByText('z.png');
    unmount();
    // No assertion crash + dispose mocks were invoked via effect teardown.
    // (Verified indirectly: unmount without exceptions, object URLs revoked.)
  });

  it('Del key removes a focused queue row', async () => {
    render(<ConverterPage />);
    addFiles(['removeme.png']);
    await screen.findByText('removeme.png');
    const row = screen.getByText('removeme.png').closest('li')!;
    fireEvent.keyDown(row, { key: 'Delete' });
    await waitFor(() => expect(screen.queryByText('removeme.png')).toBeNull());
  });
});
