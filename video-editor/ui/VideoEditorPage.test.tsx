import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, act, cleanup } from '@testing-library/react';
import type { Exporter } from '../core/types';

// Fakes for every engine factory: these modules are being implemented in
// parallel, and real decode/canvas code does not run in jsdom anyway.
vi.mock('../core/media', () => ({
  createMediaEngine: () => ({
    probe: vi.fn(), getVideoFrame: vi.fn(), getAudioBuffer: vi.fn(), thumbnail: vi.fn(),
    waveform: vi.fn(), dispose: vi.fn(),
  }),
}));
vi.mock('../core/render', () => ({
  createRenderer: (canvas: HTMLCanvasElement) => ({ kind: 'canvas2d', canvas, resize: vi.fn(), drawFrame: vi.fn(), dispose: vi.fn() }),
}));
vi.mock('../core/playback', () => ({
  createCompositor: () => ({ compose: vi.fn() }),
  createPlaybackController: () => ({ play: vi.fn(), pause: vi.fn(), seek: vi.fn(), refresh: vi.fn(), dispose: vi.fn() }),
}));
const exporterMock = vi.hoisted(() => ({ export: vi.fn<Exporter['export']>() }));
vi.mock('../core/export', () => ({ createExporter: () => exporterMock }));
vi.mock('./timeline/Timeline', () => ({ default: () => <div data-testid="ve-timeline" /> }));
vi.mock('../core/store', async (importOriginal) => {
  const orig = await importOriginal<typeof import('../core/store')>();
  return { ...orig, dispatch: vi.fn(orig.dispatch) };
});

import VideoEditorPage from './VideoEditorPage';
import { __resetForTests, dispatch, getSnapshot } from '../core/store';
import { createDefaultProject } from './placement';
import { DEFAULT_TRANSFORM } from '../core/types';
import type { Clip } from '../core/types';

function seedProjectWithClip(): Clip {
  const project = createDefaultProject('Test', 1080, 1920);
  const clip: Clip = {
    id: 'clip-1', trackId: project.tracks[0].id, mediaId: 'm1', start: 0, duration: 4, inPoint: 0, speed: 1,
    volume: 1, fadeIn: 0, fadeOut: 0, transform: { ...DEFAULT_TRANSFORM }, keyframes: [], effects: [],
  };
  project.media.push({ id: 'm1', kind: 'video', name: 'beach.mp4', file: new Blob(), duration: 4, width: 1080, height: 1920, hasAudio: true });
  project.clips.push(clip);
  act(() => {
    dispatch({ type: 'loadProject', project });
    dispatch({ type: 'select', clipIds: [clip.id] });
  });
  return clip;
}

describe('VideoEditorPage', () => {
  beforeEach(() => {
    __resetForTests();
    vi.mocked(dispatch).mockClear();
    exporterMock.export.mockReset();
  });
  afterEach(cleanup);

  it('shows the New Project panel when no project is loaded', () => {
    render(<VideoEditorPage />);
    expect(screen.getByRole('form', { name: 'New project' })).toBeTruthy();
    expect(screen.queryByTestId('ve-timeline')).toBeNull();
  });

  it('creates a project with the default tracks', () => {
    render(<VideoEditorPage />);
    fireEvent.click(screen.getByRole('radio', { name: /16:9/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Create project' }));
    const project = getSnapshot().project;
    expect(project?.tracks.map(t => t.name)).toEqual(['Video 1', 'Video 2', 'Audio 1', 'Text 1']);
    expect(project?.settings).toMatchObject({ width: 1920, height: 1080, fps: 30 });
    expect(screen.getByTestId('ve-timeline')).toBeTruthy();
  });

  it('inspector commits one updateClip when a slider is released', () => {
    const clip = seedProjectWithClip();
    render(<VideoEditorPage />);
    vi.mocked(dispatch).mockClear();
    const opacity = screen.getByRole('slider', { name: 'Opacity' });
    fireEvent.change(opacity, { target: { value: '0.5' } });
    expect(dispatch).not.toHaveBeenCalled();
    fireEvent.pointerUp(opacity);
    expect(dispatch).toHaveBeenCalledWith({
      type: 'updateClip', clipId: clip.id, patch: { transform: { ...DEFAULT_TRANSFORM, opacity: 0.5 } },
    });
  });

  it('cancelling a running export aborts it without reporting an error', async () => {
    seedProjectWithClip();
    let signal: AbortSignal | undefined;
    exporterMock.export.mockImplementation((_p, _o, _onProgress, s) => {
      signal = s;
      return new Promise<Blob>((_resolve, reject) => {
        s.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')));
      });
    });
    const feedback = vi.fn();
    render(<VideoEditorPage showGlobalFeedback={feedback} />);
    fireEvent.click(screen.getByRole('button', { name: 'Export' }));
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Start export' })); });
    expect(screen.getByText('Preparing')).toBeTruthy();
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Cancel export' })); });
    expect(signal?.aborted).toBe(true);
    expect(feedback).not.toHaveBeenCalled();
    expect(screen.queryByText('Preparing')).toBeNull();
  });
});
