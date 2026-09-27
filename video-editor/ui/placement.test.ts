import { describe, it, expect } from 'vitest';
import { createClipForMedia, createDefaultProject, findPlacement, formatTimecode } from './placement';
import type { Clip, MediaItem, Project } from '../core/types';

function withClip(project: Project, trackIndex: number, start: number, duration: number): Project {
  const clip = { id: `c${start}`, trackId: project.tracks[trackIndex].id, start, duration } as Clip;
  return { ...project, clips: [...project.clips, clip] };
}

describe('placement', () => {
  it('creates the four default tracks', () => {
    const p = createDefaultProject('Reel', 1080, 1920);
    expect(p.tracks.map(t => t.name)).toEqual(['Video 1', 'Video 2', 'Audio 1', 'Text 1']);
    expect(p.settings).toMatchObject({ width: 1080, height: 1920, fps: 30 });
  });

  it('uses the first free compatible track at the playhead', () => {
    const p = withClip(createDefaultProject('p', 100, 100), 0, 0, 10);
    expect(findPlacement(p, 'video', 2, 3)).toEqual({ trackId: p.tracks[1].id, start: 2 });
  });

  it('falls back to the earliest gap when every track is busy', () => {
    let p = createDefaultProject('p', 100, 100);
    p = withClip(withClip(p, 0, 0, 10), 1, 0, 5);
    expect(findPlacement(p, 'video', 2, 3)).toEqual({ trackId: p.tracks[1].id, start: 5 });
  });

  it('skips locked tracks and routes images to video, audio to audio', () => {
    const p = createDefaultProject('p', 100, 100);
    p.tracks[0].locked = true;
    const image = { id: 'm', kind: 'image', duration: 5 } as MediaItem;
    const audio = { id: 'a', kind: 'audio', duration: 5 } as MediaItem;
    expect(createClipForMedia(p, image, 0)?.trackId).toBe(p.tracks[1].id);
    expect(createClipForMedia(p, audio, 0)?.trackId).toBe(p.tracks[2].id);
  });

  it('formats timecode', () => {
    expect(formatTimecode(61.5, 30)).toBe('01:01:15');
    expect(formatTimecode(3600, 30)).toBe('01:00:00:00');
  });
});
