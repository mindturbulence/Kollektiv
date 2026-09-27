import { describe, expect, it, vi } from 'vitest';
import { createCompositor } from './compositor';
import type { Clip, MediaEngine, MediaItem, Project, Track } from '../types';
import { DEFAULT_TRANSFORM } from '../types';

function bitmap(tag: string): ImageBitmap {
  return { tag, close: vi.fn() } as unknown as ImageBitmap;
}

function fakeMedia(overrides: Partial<MediaEngine> = {}): MediaEngine {
  return {
    probe: vi.fn(),
    getVideoFrame: vi.fn(async () => bitmap('default')),
    getAudioBuffer: vi.fn(async () => null),
    thumbnail: vi.fn(async () => undefined),
    waveform: vi.fn(() => new Float32Array()),
    dispose: vi.fn(),
    ...overrides,
  };
}

function track(overrides: Partial<Track>): Track {
  return { id: 't', kind: 'video', name: 'V', muted: false, hidden: false, locked: false, ...overrides };
}

function clip(overrides: Partial<Clip>): Clip {
  return {
    id: 'c',
    trackId: 't',
    mediaId: 'm',
    start: 0,
    duration: 10,
    inPoint: 0,
    speed: 1,
    volume: 1,
    fadeIn: 0,
    fadeOut: 0,
    transform: { ...DEFAULT_TRANSFORM },
    keyframes: [],
    effects: [],
    ...overrides,
  };
}

function mediaItem(overrides: Partial<MediaItem> = {}): MediaItem {
  return { id: 'm', kind: 'video', name: 'clip.mp4', file: new Blob(), duration: 10, width: 100, height: 100, hasAudio: true, ...overrides };
}

function project(overrides: Partial<Project> = {}): Project {
  return {
    id: 'p',
    name: 'P',
    settings: { width: 1920, height: 1080, fps: 30, background: '#000' },
    media: [mediaItem()],
    tracks: [track({ id: 't' })],
    clips: [],
    transitions: [],
    markers: [],
    createdAt: 0,
    updatedAt: 0,
    ...overrides,
  };
}

describe('createCompositor', () => {
  it('builds a layer for the clip covering time, with source time = inPoint + (t-start)*speed', async () => {
    const returned = bitmap('a');
    const getVideoFrame = vi.fn(async () => returned);
    const media = fakeMedia({ getVideoFrame });
    const compositor = createCompositor(media);
    const p = project({ clips: [clip({ start: 2, duration: 10, inPoint: 1, speed: 2 })] });

    const frame = await compositor.compose(p, 5); // local = 3, source = 1 + 3*2 = 7
    expect(getVideoFrame).toHaveBeenCalledWith('m', expect.anything(), 7);
    expect(frame.layers).toHaveLength(1);
    expect(frame.layers[0].source).toBe(returned);
  });

  it('returns no layer when time is outside every clip', async () => {
    const media = fakeMedia();
    const compositor = createCompositor(media);
    const p = project({ clips: [clip({ start: 0, duration: 5 })] });
    const frame = await compositor.compose(p, 10);
    expect(frame.layers).toHaveLength(0);
  });

  it('orders layers bottom-up by track order', async () => {
    const media = fakeMedia();
    const compositor = createCompositor(media);
    const p = project({
      tracks: [track({ id: 'bottom' }), track({ id: 'top' })],
      clips: [clip({ id: 'c1', trackId: 'bottom' }), clip({ id: 'c2', trackId: 'top', mediaId: undefined, text: { content: 'hi', style: { fontFamily: 'x', fontSize: 10, color: '#fff', bold: false, italic: false, align: 'left' } } })],
    });
    const frame = await compositor.compose(p, 1);
    expect(frame.layers).toHaveLength(2);
    expect('text' in frame.layers[1].source).toBe(true);
  });

  it('skips hidden and audio tracks', async () => {
    const media = fakeMedia();
    const compositor = createCompositor(media);
    const p = project({
      tracks: [track({ id: 'hidden', hidden: true }), track({ id: 'audio', kind: 'audio' })],
      clips: [clip({ id: 'c1', trackId: 'hidden' }), clip({ id: 'c2', trackId: 'audio' })],
    });
    const frame = await compositor.compose(p, 1);
    expect(frame.layers).toHaveLength(0);
  });

  it('builds a text layer without calling the media engine', async () => {
    const getVideoFrame = vi.fn(async () => bitmap('unused'));
    const media = fakeMedia({ getVideoFrame });
    const compositor = createCompositor(media);
    const style = { fontFamily: 'Nunito', fontSize: 12, color: '#fff', bold: false, italic: false, align: 'center' as const };
    const p = project({
      tracks: [track({ id: 't', kind: 'text' })],
      clips: [clip({ id: 'c1', trackId: 't', mediaId: undefined, text: { content: 'hello', style } })],
    });
    const frame = await compositor.compose(p, 1);
    expect(getVideoFrame).not.toHaveBeenCalled();
    expect(frame.layers[0].source).toEqual({ text: 'hello', style });
  });

  it('produces a transition entry inside the cut-centred window and excludes both clips from plain layers', async () => {
    const media = fakeMedia();
    const compositor = createCompositor(media);
    const from = clip({ id: 'from', trackId: 't', start: 0, duration: 5 });
    const to = clip({ id: 'to', trackId: 't', start: 5, duration: 5 });
    const p = project({
      clips: [from, to],
      transitions: [{ id: 'tr', type: 'crossfade', fromClipId: 'from', toClipId: 'to', duration: 2 }], // window [4,6]
    });

    const frame = await compositor.compose(p, 5); // exactly at the cut
    expect(frame.layers).toHaveLength(0);
    expect(frame.transitions).toHaveLength(1);
    expect(frame.transitions[0].progress).toBeCloseTo(0.5);
    expect(frame.transitions[0].type).toBe('crossfade');
  });

  it('draws a plain layer outside the transition window', async () => {
    const media = fakeMedia();
    const compositor = createCompositor(media);
    const from = clip({ id: 'from', trackId: 't', start: 0, duration: 5 });
    const to = clip({ id: 'to', trackId: 't', start: 5, duration: 5 });
    const p = project({
      clips: [from, to],
      transitions: [{ id: 'tr', type: 'crossfade', fromClipId: 'from', toClipId: 'to', duration: 2 }], // window [4,6]
    });

    const frame = await compositor.compose(p, 1); // well before the window
    expect(frame.layers).toHaveLength(1);
    expect(frame.transitions).toHaveLength(0);
  });

  it('closes a fetched bitmap that is not returned when the paired transition layer fails to build', async () => {
    const fromBitmap = bitmap('from');
    const getVideoFrame = vi.fn(async (mediaId: string) => (mediaId === 'from-media' ? fromBitmap : null));
    const media = fakeMedia({ getVideoFrame });
    const compositor = createCompositor(media);
    const from = clip({ id: 'from', trackId: 't', mediaId: 'from-media', start: 0, duration: 5 });
    const to = clip({ id: 'to', trackId: 't', mediaId: 'to-media', start: 5, duration: 5 });
    const p = project({
      media: [mediaItem({ id: 'from-media' }), mediaItem({ id: 'to-media' })],
      clips: [from, to],
      transitions: [{ id: 'tr', type: 'crossfade', fromClipId: 'from', toClipId: 'to', duration: 2 }],
    });

    const frame = await compositor.compose(p, 5);
    expect(frame.transitions).toHaveLength(0);
    expect(frame.layers).toHaveLength(0);
    expect(fromBitmap.close).toHaveBeenCalledTimes(1);
  });
});
