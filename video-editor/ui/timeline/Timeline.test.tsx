// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, fireEvent, cleanup, within, act } from '@testing-library/react';
import Timeline from './Timeline';
import { dispatch as realDispatch, __resetForTests, getSnapshot } from '../../core/store';
import type { Project } from '../../core/types';

vi.mock('../../core/store', async () => {
  const actual = await vi.importActual<typeof import('../../core/store')>('../../core/store');
  return { ...actual, dispatch: vi.fn(actual.dispatch) };
});

// jsdom has neither of these; the drag/zoom code paths depend on them.
if (!window.PointerEvent) {
  window.PointerEvent = class PointerEvent extends MouseEvent {
    pointerId: number;
    constructor(type: string, params: MouseEventInit & { pointerId?: number } = {}) {
      super(type, params);
      this.pointerId = params.pointerId ?? 1;
    }
  };
}
Element.prototype.setPointerCapture = vi.fn();
Element.prototype.releasePointerCapture = vi.fn();
if (typeof ResizeObserver === 'undefined') {
  // @ts-expect-error -- jsdom has no ResizeObserver
  window.ResizeObserver = class { observe() {} disconnect() {} unobserve() {} };
}

function makeProject(): Project {
  return {
    id: 'p1', name: 'Test', settings: { width: 1920, height: 1080, fps: 30, background: '#000' },
    media: [{ id: 'm1', kind: 'video', name: 'clip.mp4', file: new Blob(), duration: 20, width: 1920, height: 1080, hasAudio: true }],
    tracks: [
      { id: 'v1', kind: 'video', name: 'Video 1', muted: false, hidden: false, locked: false },
      { id: 'a1', kind: 'audio', name: 'Audio 1', muted: false, hidden: false, locked: false },
    ],
    clips: [
      { id: 'c1', trackId: 'v1', mediaId: 'm1', start: 2, duration: 5, inPoint: 0, speed: 1, volume: 1, fadeIn: 0, fadeOut: 0, transform: { x: 0, y: 0, scale: 1, rotation: 0, opacity: 1, fit: 'contain' }, keyframes: [], effects: [] },
      { id: 'c2', trackId: 'v1', mediaId: 'm1', start: 7, duration: 4, inPoint: 0, speed: 1, volume: 1, fadeIn: 0, fadeOut: 0, transform: { x: 0, y: 0, scale: 1, rotation: 0, opacity: 1, fit: 'contain' }, keyframes: [], effects: [] },
    ],
    transitions: [],
    markers: [],
    createdAt: 0, updatedAt: 0,
  };
}

beforeEach(() => {
  __resetForTests();
  realDispatch({ type: 'loadProject', project: makeProject() });
  vi.mocked(realDispatch).mockClear();
});
afterEach(cleanup);

/** jsdom returns an all-zero rect for every element; give a clip a wide,
 *  centred hit area so pointerdown lands in its body, not an edge zone. */
function stubWideRect(el: Element) {
  vi.spyOn(el, 'getBoundingClientRect').mockReturnValue({
    left: 0, right: 400, width: 400, top: 0, bottom: 50, height: 50, x: 0, y: 0, toJSON() {},
  } as DOMRect);
}

describe('Timeline', () => {
  it('positions clip blocks at start*zoom', () => {
    render(<Timeline />);
    const zoom = getSnapshot().zoom;
    const c1 = screen.getByTestId('ve-clip-c1');
    expect(c1.style.left).toBe(`${2 * zoom}px`);
    expect(c1.style.width).toBe(`${5 * zoom}px`);
  });

  it('razor tool click dispatches splitClip with a generated id', () => {
    render(<Timeline />);
    fireEvent.click(screen.getByLabelText('Razor tool'));
    const c1 = screen.getByTestId('ve-clip-c1');
    // clipStartTimeAt reads the tracks-scroll container's rect, not the clip's.
    const tracksScroll = screen.getByTestId('ve-track-row-v1').parentElement!;
    stubWideRect(tracksScroll);
    fireEvent.pointerUp(c1, { clientX: 320 }); // 320/80 = 4s, inside clip c1 (2..7)
    expect(realDispatch).toHaveBeenCalledWith(expect.objectContaining({ type: 'splitClip', clipId: 'c1', time: 4, newClipId: expect.any(String) }));
  });

  it('delete with a selection dispatches removeClips (shift = ripple)', () => {
    render(<Timeline />);
    const c1 = screen.getByTestId('ve-clip-c1');
    stubWideRect(c1);
    fireEvent.pointerDown(c1, { clientX: 200, clientY: 10 });
    expect(realDispatch).toHaveBeenCalledWith({ type: 'select', clipIds: ['c1'] });
    const root = screen.getByTestId('ve-timeline');
    fireEvent.keyDown(root, { key: 'Delete', shiftKey: true });
    expect(realDispatch).toHaveBeenCalledWith({ type: 'removeClips', clipIds: ['c1'], ripple: true });
  });

  it('ignores delete when nothing is selected', () => {
    render(<Timeline />);
    const root = screen.getByTestId('ve-timeline');
    fireEvent.keyDown(root, { key: 'Backspace' });
    expect(realDispatch).not.toHaveBeenCalledWith(expect.objectContaining({ type: 'removeClips' }));
  });

  it('trim drag on the right edge dispatches trimClip with the new edge time', () => {
    render(<Timeline />);
    const zoom = getSnapshot().zoom;
    const c1 = screen.getByTestId('ve-clip-c1');
    const width = 5 * zoom;
    vi.spyOn(c1, 'getBoundingClientRect').mockReturnValue({ left: 2 * zoom, right: 2 * zoom + width, width, top: 0, bottom: 50, height: 50, x: 0, y: 0, toJSON() {} } as DOMRect);
    const tracksScroll = screen.getByTestId('ve-track-row-v1').parentElement!;
    vi.spyOn(tracksScroll, 'getBoundingClientRect').mockReturnValue({ left: 0, right: 2000, width: 2000, top: 0, bottom: 500, height: 500, x: 0, y: 0, toJSON() {} } as DOMRect);
    // pointerdown near the right edge
    fireEvent.pointerDown(c1, { clientX: 2 * zoom + width - 1, clientY: 10 });
    fireEvent(window, new PointerEvent('pointermove', { clientX: 2 * zoom + width + zoom, clientY: 10 }));
    fireEvent(window, new PointerEvent('pointerup', { clientX: 2 * zoom + width + zoom, clientY: 10 }));
    expect(realDispatch).toHaveBeenCalledWith(expect.objectContaining({ type: 'trimClip', clipId: 'c1', edge: 'end' }));
  });

  it('S splits selected clips under the playhead in one batch', () => {
    render(<Timeline />);
    const c1 = screen.getByTestId('ve-clip-c1');
    stubWideRect(c1);
    fireEvent.pointerDown(c1, { clientX: 200, clientY: 10 });
    act(() => realDispatch({ type: 'setPlayhead', time: 4 })); // inside c1 (2..7)
    const root = screen.getByTestId('ve-timeline');
    fireEvent.keyDown(root, { key: 's' });
    expect(realDispatch).toHaveBeenCalledWith(expect.objectContaining({
      type: 'batch',
      actions: [expect.objectContaining({ type: 'splitClip', clipId: 'c1', time: 4 })],
    }));
  });

  it('M adds a marker at the playhead', () => {
    render(<Timeline />);
    act(() => realDispatch({ type: 'setPlayhead', time: 3 }));
    const root = screen.getByTestId('ve-timeline');
    fireEvent.keyDown(root, { key: 'm' });
    expect(realDispatch).toHaveBeenCalledWith(expect.objectContaining({ type: 'addMarker', marker: expect.objectContaining({ time: 3 }) }));
  });

  it('Ctrl+Z dispatches undo, Ctrl+Shift+Z dispatches redo', () => {
    render(<Timeline />);
    const root = screen.getByTestId('ve-timeline');
    fireEvent.keyDown(root, { key: 'z', ctrlKey: true });
    expect(realDispatch).toHaveBeenCalledWith({ type: 'undo' });
    fireEvent.keyDown(root, { key: 'z', ctrlKey: true, shiftKey: true });
    expect(realDispatch).toHaveBeenCalledWith({ type: 'redo' });
  });

  it('mute/hide/lock toggle buttons dispatch updateTrack', () => {
    render(<Timeline />);
    // Two tracks (video + audio) each render these labels; scope to Video 1's header.
    const header = screen.getByText('Video 1').closest('div')!;
    fireEvent.click(within(header).getByLabelText('Mute track'));
    expect(realDispatch).toHaveBeenCalledWith({ type: 'updateTrack', trackId: 'v1', patch: { muted: true } });
    fireEvent.click(within(header).getByLabelText('Hide track'));
    expect(realDispatch).toHaveBeenCalledWith({ type: 'updateTrack', trackId: 'v1', patch: { hidden: true } });
    fireEvent.click(within(header).getByLabelText('Lock track'));
    expect(realDispatch).toHaveBeenCalledWith({ type: 'updateTrack', trackId: 'v1', patch: { locked: true } });
  });

  it('add track button dispatches addTrack', () => {
    render(<Timeline />);
    fireEvent.click(screen.getByLabelText('Add audio track'));
    expect(realDispatch).toHaveBeenCalledWith(expect.objectContaining({ type: 'addTrack', track: expect.objectContaining({ kind: 'audio' }) }));
  });

  it('double-clicking a cut adds a 0.5s crossfade', () => {
    render(<Timeline />);
    const badge = screen.getByLabelText('Add crossfade transition');
    fireEvent.doubleClick(badge);
    expect(realDispatch).toHaveBeenCalledWith(expect.objectContaining({
      type: 'addTransition',
      transition: expect.objectContaining({ type: 'crossfade', fromClipId: 'c1', toClipId: 'c2', duration: 0.5 }),
    }));
  });

  it('clamps zoom via setZoom', () => {
    realDispatch({ type: 'setZoom', zoom: 999999 });
    expect(getSnapshot().zoom).toBe(2000);
    realDispatch({ type: 'setZoom', zoom: -50 });
    expect(getSnapshot().zoom).toBe(2);
  });
});
