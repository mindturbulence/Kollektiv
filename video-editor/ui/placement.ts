// ─── Kollektiv Video Editor — clip placement + project factories ─────────────
// Pure helpers used by the media bin, inspector and page shell.

import { DEFAULT_TRANSFORM } from '../core/types';
import type { Clip, MediaItem, Project, Track, TrackKind } from '../core/types';

/** dataTransfer type for dragging a media-bin item; payload is the media id. */
export const MEDIA_DRAG_MIME = 'application/x-kollektiv-media-id';

export interface ProjectPreset {
  label: string;
  width: number;
  height: number;
}

export const PROJECT_PRESETS: ProjectPreset[] = [
  { label: '9:16 Vertical', width: 1080, height: 1920 },
  { label: '16:9 Landscape', width: 1920, height: 1080 },
  { label: '1:1 Square', width: 1080, height: 1080 },
];

export const DEFAULT_FPS = 30;
const TEXT_CLIP_SECONDS = 3;

const DEFAULT_TRACKS: Array<[TrackKind, string]> = [
  ['video', 'Video 1'],
  ['video', 'Video 2'],
  ['audio', 'Audio 1'],
  ['text', 'Text 1'],
];

export function createDefaultProject(name: string, width: number, height: number, fps = DEFAULT_FPS): Project {
  const now = Date.now();
  return {
    id: crypto.randomUUID(),
    name: name.trim() || 'Untitled project',
    settings: { width, height, fps, background: '#000000' },
    media: [],
    tracks: DEFAULT_TRACKS.map(([kind, trackName]): Track => ({
      id: crypto.randomUUID(), kind, name: trackName, muted: false, hidden: false, locked: false,
    })),
    clips: [],
    transitions: [],
    markers: [],
    createdAt: now,
    updatedAt: now,
  };
}

/** Earliest start >= `from` where [start, start+duration) overlaps no clip on the track. */
function earliestFreeStart(clips: Clip[], trackId: string, from: number, duration: number): number {
  const onTrack = clips.filter(c => c.trackId === trackId).sort((a, b) => a.start - b.start);
  let t = from;
  for (const c of onTrack) {
    if (c.start < t + duration && c.start + c.duration > t) t = c.start + c.duration;
  }
  return t;
}

/** First unlocked track of `kind` that is free at `at`; otherwise the track with the earliest gap after `at`. */
export function findPlacement(project: Project, kind: TrackKind, at: number, duration: number): { trackId: string; start: number } | null {
  let best: { trackId: string; start: number } | null = null;
  for (const track of project.tracks) {
    if (track.kind !== kind || track.locked) continue;
    const start = earliestFreeStart(project.clips, track.id, at, duration);
    if (start === at) return { trackId: track.id, start };
    if (!best || start < best.start) best = { trackId: track.id, start };
  }
  return best;
}

function baseClip(trackId: string, start: number, duration: number): Clip {
  return {
    id: crypto.randomUUID(), trackId, start, duration, inPoint: 0, speed: 1, volume: 1,
    fadeIn: 0, fadeOut: 0, transform: { ...DEFAULT_TRANSFORM }, keyframes: [], effects: [],
  };
}

/** A clip for `media` at the playhead, or null when no compatible unlocked track exists. */
export function createClipForMedia(project: Project, media: MediaItem, at: number): Clip | null {
  const placement = findPlacement(project, media.kind === 'audio' ? 'audio' : 'video', at, media.duration);
  if (!placement) return null;
  return { ...baseClip(placement.trackId, placement.start, media.duration), mediaId: media.id };
}

export function createTextClip(project: Project, at: number): Clip | null {
  const placement = findPlacement(project, 'text', at, TEXT_CLIP_SECONDS);
  if (!placement) return null;
  return {
    ...baseClip(placement.trackId, placement.start, TEXT_CLIP_SECONDS),
    text: {
      content: 'Your title',
      style: { fontFamily: 'Inter', fontSize: 96, color: '#ffffff', bold: true, italic: false, align: 'center' },
    },
  };
}

/** HH:MM:SS:FF, or MM:SS:FF under an hour. */
export function formatTimecode(seconds: number, fps: number): string {
  const totalFrames = Math.max(0, Math.round(seconds * fps));
  const ff = totalFrames % fps;
  const totalSeconds = Math.floor(totalFrames / fps);
  const ss = totalSeconds % 60;
  const mm = Math.floor(totalSeconds / 60) % 60;
  const hh = Math.floor(totalSeconds / 3600);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${hh > 0 ? `${pad(hh)}:` : ''}${pad(mm)}:${pad(ss)}:${pad(ff)}`;
}
