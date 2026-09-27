import { describe, it, expect } from 'vitest';
import { DEFAULT_TRANSFORM } from '../../types';
import type { Clip, MediaItem, Project, Track } from '../../types';
import { buildGainCurve, collectAudibleSegments, sourceWindow } from '../audioMix';

function track(kind: Track['kind'], overrides: Partial<Track> = {}): Track {
  return { id: `t-${kind}`, kind, name: kind, muted: false, hidden: false, locked: false, ...overrides };
}

function media(overrides: Partial<MediaItem> = {}): MediaItem {
  return { id: 'm1', kind: 'video', name: 'clip.mp4', file: new Blob(), duration: 10, width: 1280, height: 720, hasAudio: true, ...overrides };
}

function clip(overrides: Partial<Clip> = {}): Clip {
  return {
    id: 'c1', trackId: 't-video', mediaId: 'm1', start: 0, duration: 5, inPoint: 0, speed: 1, volume: 1,
    fadeIn: 0, fadeOut: 0, transform: DEFAULT_TRANSFORM, keyframes: [], effects: [], ...overrides,
  };
}

function project(overrides: Partial<Project> = {}): Project {
  return {
    id: 'p1', name: 'proj', settings: { width: 1280, height: 720, fps: 30, background: '#000' },
    media: [media()], tracks: [track('video')], clips: [clip()], transitions: [], markers: [],
    createdAt: 0, updatedAt: 0, ...overrides,
  };
}

describe('collectAudibleSegments', () => {
  it('includes a video clip overlapping the range', () => {
    const segs = collectAudibleSegments(project(), { start: 0, end: 5 });
    expect(segs).toHaveLength(1);
    expect(segs[0].overlapStart).toBe(0);
    expect(segs[0].overlapEnd).toBe(5);
  });

  it('clips the overlap to the export range', () => {
    const segs = collectAudibleSegments(project({ clips: [clip({ start: 2, duration: 10 })] }), { start: 0, end: 5 });
    expect(segs[0].overlapStart).toBe(2);
    expect(segs[0].overlapEnd).toBe(5);
  });

  it('excludes clips on a muted track', () => {
    const segs = collectAudibleSegments(
      project({ tracks: [track('video', { muted: true })] }),
      { start: 0, end: 5 },
    );
    expect(segs).toHaveLength(0);
  });

  it('excludes text tracks and clips with no audible media', () => {
    const p = project({
      tracks: [track('text', { id: 't-text' })],
      clips: [clip({ trackId: 't-text', mediaId: undefined, text: { content: 'hi', style: { fontFamily: 'sans', fontSize: 24, color: '#fff', bold: false, italic: false, align: 'left' } } })],
    });
    expect(collectAudibleSegments(p, { start: 0, end: 5 })).toHaveLength(0);
  });

  it('excludes media with hasAudio: false', () => {
    const p = project({ media: [media({ hasAudio: false })] });
    expect(collectAudibleSegments(p, { start: 0, end: 5 })).toHaveLength(0);
  });

  it('drops a clip that does not overlap the range at all', () => {
    const p = project({ clips: [clip({ start: 10, duration: 2 })] });
    expect(collectAudibleSegments(p, { start: 0, end: 5 })).toHaveLength(0);
  });
});

describe('sourceWindow', () => {
  it('maps overlap time to source time honouring inPoint and speed', () => {
    const seg = { clip: clip({ inPoint: 1, speed: 2, start: 0, duration: 5 }), mediaId: 'm1', overlapStart: 1, overlapEnd: 3 };
    expect(sourceWindow(seg)).toEqual({ offset: 1 + 1 * 2, duration: 2 * 2 });
  });
});

describe('buildGainCurve', () => {
  it('ramps from 0 to full volume across a fade-in window', () => {
    const seg = { clip: clip({ fadeIn: 2, duration: 5 }), mediaId: 'm1', overlapStart: 0, overlapEnd: 2 };
    const curve = buildGainCurve(seg);
    expect(curve[0]).toBeCloseTo(0, 5);
    expect(curve[curve.length - 1]).toBeCloseTo(1, 5);
  });

  it('holds full volume outside any fade window', () => {
    const seg = { clip: clip({ duration: 5 }), mediaId: 'm1', overlapStart: 1, overlapEnd: 3 };
    const curve = buildGainCurve(seg);
    for (const v of curve) expect(v).toBeCloseTo(1, 5);
  });
});
