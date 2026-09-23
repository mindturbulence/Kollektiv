import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react';

/**
 * T3 regression tests (plan Phase 3): the W6 zipDownload extraction changed
 * VideoToFrames' downloadAllFrames. This pins the behavior that must survive
 * the refactor: with N extracted frames, "ZIP (N)" still downloads ONE zip
 * named `frames_<title>.zip` whose entries are the frame_###_<t>s.jpg names,
 * deduped through makeUniqueName — now delegated to the shared helper.
 */

vi.mock('./GalleryPickerModal', () => ({
  default: () => null,
}));
vi.mock('../utils/fileUtils', () => ({
  fileSystemManager: {
    isDirectorySelected: vi.fn(() => false),
    getFileAsBlob: vi.fn(async () => null),
    saveFile: vi.fn(async () => ''),
  },
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

import { VideoToFrames } from './VideoToFrames';

/**
 * jsdom has no media stack. The component renders real <video> elements, so
 * patch the HTMLVideoElement PROTOTYPE (not the global class) to emulate:
 *  - duration=1s, 8×8 video dimensions
 *  - currentTime setter dispatching 'seeked' (extractSingleFrame's trigger)
 */
const videoProto = Object.getPrototypeOf(document.createElement('video')) as Record<string, PropertyDescriptor>;
const savedDescriptors: Array<[string, PropertyDescriptor | undefined]> = [];

function installVideoStub() {
  const patch = (prop: string, desc: PropertyDescriptor) => {
    savedDescriptors.push([prop, Object.getOwnPropertyDescriptor(videoProto, prop)]);
    Object.defineProperty(videoProto, prop, { ...desc, configurable: true });
  };
  patch('duration', { get: () => 1 });
  patch('videoWidth', { get: () => 8 });
  patch('videoHeight', { get: () => 8 });
  patch('currentTime', {
    get(this: HTMLVideoElement & { _ct?: number }) { return this._ct ?? 0; },
    set(this: HTMLVideoElement & { _ct?: number }, t: number) {
      this._ct = t;
      // Fire async so the 'seeked' listener registered just before is present.
      queueMicrotask(() => this.dispatchEvent(new Event('seeked')));
    },
  });
}

function restoreVideoStub() {
  for (const [prop, desc] of savedDescriptors) {
    if (desc) Object.defineProperty(videoProto, prop, desc);
    else delete (videoProto as Record<string, unknown>)[prop];
  }
  savedDescriptors.length = 0;
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
  vi.stubGlobal('MediaRecorder', {
    isTypeSupported: vi.fn(() => false),
  });

  const ctx = { drawImage: vi.fn() };
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(ctx as unknown as CanvasRenderingContext2D);
  vi.spyOn(HTMLCanvasElement.prototype, 'toBlob').mockImplementation(function (
    this: HTMLCanvasElement,
    cb: BlobCallback,
  ) {
    cb(new Blob([new Uint8Array([7])], { type: 'image/jpeg' }));
  });

  installVideoStub();
});

afterEach(() => {
  restoreVideoStub();
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  downloadZipMock.mockClear();
});

async function loadVideoAndExtract() {
  const input = document.querySelector('#extractor-file') as HTMLInputElement;
  const file = new File([new Uint8Array([1])], 'clip.mp4', { type: 'video/mp4' });
  Object.defineProperty(input, 'files', { value: [file], configurable: true });
  fireEvent.change(input);
  fireEvent.click(await screen.findByText('EXTRACT'));
  // duration=1s, default step=1s → frames at t=0 and t=1
  await screen.findByText(/ZIP \(2\)/);
}

describe('VideoToFrames — W6 zipDownload regression (T3)', () => {
  it('extracted frames → one frames_<title>.zip with frame names', async () => {
    render(<VideoToFrames />);
    await loadVideoAndExtract();

    fireEvent.click(screen.getByText(/ZIP \(2\)/));
    await waitFor(() => expect(downloadZipMock).toHaveBeenCalledTimes(1));

    const [entries, fileName] = downloadZipMock.mock.calls[0];
    expect(fileName).toBe('frames_clip.mp4.zip');
    expect(entries).toHaveLength(2);
    const names = (entries as Array<{ name: string }>).map(e => e.name).sort();
    expect(names).toEqual(['frame_000_0.00s.jpg', 'frame_001_1.00s.jpg']);
    for (const e of entries as Array<{ content: unknown }>) {
      expect(e.content).toBeInstanceOf(Blob);
    }
  });
});
