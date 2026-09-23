import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react';

/**
 * T3 regression tests (plan Phase 3): the W6 zipDownload extraction changed
 * ImageResizer's download path. This pins the behavior that must survive the
 * refactor: a multi-image standard batch still produces ONE zip download
 * named `resized_images_*.zip`, containing every successful result —
 * same entry names, same filenames, same succeeded-only membership —
 * now delegated to the shared downloadZip() helper.
 */

vi.mock('../contexts/SettingsContext', () => ({
  useSettings: () => ({ settings: { activeLLM: 'gemini' }, updateSettings: vi.fn() }),
}));

const downloadZipMock = vi.hoisted(() =>
  vi.fn(async (_entries: Array<{ name: string; content: unknown }>, _fileName: string) => 'blob:zip'),
);
const makeUniqueNameMock = vi.hoisted(() =>
  (base: string, ext: string, taken: Set<string>): string => {
    let candidate = `${base}.${ext}`;
    let n = 2;
    while (taken.has(candidate.toLowerCase())) { candidate = `${base}-${n}.${ext}`; n++; }
    taken.add(candidate.toLowerCase());
    return candidate;
  },
);
vi.mock('../utils/zipDownload', () => ({
  downloadZip: downloadZipMock,
  makeUniqueName: makeUniqueNameMock,
}));

import ImageResizer from './ImageResizer';

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

  const ctx = {
    fillStyle: '',
    imageSmoothingQuality: 'high',
    drawImage: vi.fn(),
    getImageData: vi.fn(() => ({ width: 4, height: 4, data: new Uint8ClampedArray(64) })),
    putImageData: vi.fn(),
  };
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(ctx as unknown as CanvasRenderingContext2D);
  vi.spyOn(HTMLCanvasElement.prototype, 'toBlob').mockImplementation(function (
    this: HTMLCanvasElement,
    cb: BlobCallback,
  ) {
    cb(new Blob([new Uint8Array([1, 2, 3])], { type: 'image/png' }));
  });
  class FakeImage {
    onload: (() => void) | null = null;
    onerror: (() => void) | null = null;
    naturalWidth = 8;
    naturalHeight = 8;
    set src(_: string) {
      queueMicrotask(() => this.onload?.());
    }
  }
  vi.stubGlobal('Image', FakeImage);
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  downloadZipMock.mockClear();
});

async function addTwoImages() {
  const input = document.querySelector('input[type="file"]') as HTMLInputElement;
  const makeFile = (name: string) => new File([new Uint8Array([9])], name, { type: 'image/png' });
  Object.defineProperty(input, 'files', {
    value: [makeFile('alpha.png'), makeFile('beta.png')],
    configurable: true,
  });
  fireEvent.change(input);
  await screen.findByText('alpha.png');
  await screen.findByText('beta.png');
}

describe('ImageResizer — W6 zipDownload regression (T3)', () => {
  it('renders the ZIP DOWNLOAD action', () => {
    render(<ImageResizer />);
    expect(screen.getByText('ZIP DOWNLOAD')).toBeTruthy();
  });

  it('standard batch of 2 → one resized_images_*.zip containing both results', async () => {
    render(<ImageResizer />);
    await addTwoImages();

    fireEvent.click(screen.getByText('ZIP DOWNLOAD'));

    await waitFor(() => expect(downloadZipMock).toHaveBeenCalledTimes(1));
    const [entries, fileName] = downloadZipMock.mock.calls[0];
    expect(fileName).toMatch(/^resized_images_\d+\.zip$/);
    expect(entries).toHaveLength(2);
    // Default settings: no prefix, no sequential rename → original bases, jpeg ext
    const names = entries.map((e: { name: string }) => e.name).sort();
    expect(names).toEqual(['alpha.jpeg', 'beta.jpeg']);
  });

  it('sequential rename yields prefix+index names inside the zip entries', async () => {
    render(<ImageResizer />);
    await addTwoImages();

    // Toggle "Sequential Naming" by its label text.
    fireEvent.click(screen.getByText('Sequential Naming'));

    fireEvent.click(screen.getByText('ZIP DOWNLOAD'));
    await waitFor(() => expect(downloadZipMock).toHaveBeenCalledTimes(1));
    const [entries] = downloadZipMock.mock.calls[0];
    expect(entries).toHaveLength(2);
    // newName = prefix + padded index → FILE_PREFIX_001.jpeg etc. (no prefix
    // set → index-only names); either way, not the original base names.
    const names = (entries as Array<{ name: string }>).map(e => e.name).sort();
    expect(names).not.toEqual(['alpha.jpeg', 'beta.jpeg']);
    expect(names.every(n => /^\d{3}\.jpeg$/.test(n))).toBe(true);
  });

  it('entries carry Blob content (succeeded-only membership preserved)', async () => {
    render(<ImageResizer />);
    await addTwoImages();

    fireEvent.click(screen.getByText('ZIP DOWNLOAD'));
    await waitFor(() => expect(downloadZipMock).toHaveBeenCalledTimes(1));
    const [entries] = downloadZipMock.mock.calls[0];
    for (const e of entries) {
      expect((e as { content: unknown }).content).toBeInstanceOf(Blob);
    }
  });
});
