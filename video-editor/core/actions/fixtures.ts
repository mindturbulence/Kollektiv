// Test-only fixtures shared by actions/ and timeline/ tests. Not imported by
// any production module.

import type { Clip, Marker, MediaItem, Project, Track } from '../types';
import { DEFAULT_TRANSFORM } from '../types';

/** Deterministic seeded RNG (mulberry32) — no new deps for the property test. */
export function mulberry32(seed: number): () => number {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function makeMedia(id: string, overrides: Partial<MediaItem> = {}): MediaItem {
  return {
    id,
    kind: 'video',
    name: id,
    file: new Blob(),
    duration: 30,
    width: 1920,
    height: 1080,
    hasAudio: true,
    ...overrides,
  };
}

export function makeTrack(id: string, overrides: Partial<Track> = {}): Track {
  return { id, kind: 'video', name: id, muted: false, hidden: false, locked: false, ...overrides };
}

export function makeClip(id: string, trackId: string, overrides: Partial<Clip> = {}): Clip {
  return {
    id,
    trackId,
    start: 0,
    duration: 5,
    inPoint: 0,
    speed: 1,
    volume: 1,
    fadeIn: 0,
    fadeOut: 0,
    transform: DEFAULT_TRANSFORM,
    keyframes: [],
    effects: [],
    ...overrides,
  };
}

export function makeMarker(id: string, time: number, overrides: Partial<Marker> = {}): Marker {
  return { id, time, label: id, ...overrides };
}

export function makeProject(overrides: Partial<Project> = {}): Project {
  return {
    id: 'proj-1',
    name: 'Test project',
    settings: { width: 1920, height: 1080, fps: 30, background: '#000000' },
    media: [],
    tracks: [],
    clips: [],
    transitions: [],
    markers: [],
    createdAt: 0,
    updatedAt: 0,
    ...overrides,
  };
}

/** A project with two tracks, one media item, and three non-overlapping clips, already sorted. */
export function baseProject(): Project {
  const media = makeMedia('m1', { duration: 30 });
  const t1 = makeTrack('t1');
  const t2 = makeTrack('t2', { kind: 'audio' });
  const c1 = makeClip('c1', 't1', { start: 0, duration: 5, mediaId: media.id });
  const c2 = makeClip('c2', 't1', { start: 5, duration: 5, mediaId: media.id, inPoint: 5 });
  const c3 = makeClip('c3', 't2', { start: 0, duration: 4, mediaId: media.id });
  // Pre-sorted by (start, id) — applyEdit's normalize() re-sorts clips this
  // way after every mutation, so the fixture must start in that order or a
  // round-trip back to "the original project" would spuriously mismatch.
  return makeProject({ media: [media], tracks: [t1, t2], clips: [c1, c3, c2] });
}
