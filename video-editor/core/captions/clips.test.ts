import { describe, it, expect } from 'vitest';
import { captionsToEdit, clipsToCues } from './clips';
import { applyEdit } from '../actions/apply';
import { makeClip, makeProject, makeTrack } from '../actions/fixtures';
import type { Cue } from './srt';
import type { TextStyle } from '../types';

const STYLE: TextStyle = { fontFamily: 'Inter', fontSize: 96, color: '#fff', bold: false, italic: false, align: 'center' };

const CUES: Cue[] = [
  { start: 1, end: 3, text: 'One' },
  { start: 4, end: 6, text: 'Two' },
];

describe('captionsToEdit', () => {
  it('returns null for an empty cue list', () => {
    expect(captionsToEdit(makeProject(), [])).toBeNull();
  });

  it('adds a Captions track and one clip per cue when no text track exists', () => {
    const project = makeProject({ tracks: [makeTrack('t1', { kind: 'video' })] });
    const action = captionsToEdit(project, CUES);
    expect(action?.type).toBe('batch');
    const { project: next } = applyEdit(project, action!);
    const captionsTrack = next.tracks.find(t => t.name === 'Captions');
    expect(captionsTrack).toBeTruthy();
    const clips = next.clips.filter(c => c.trackId === captionsTrack!.id);
    expect(clips).toHaveLength(2);
    expect(clips.map(c => c.text?.content).sort()).toEqual(['One', 'Two']);
    // Bottom-third default position.
    expect(clips[0].transform.y).toBeCloseTo(project.settings.height / 3);
  });

  it('reuses an existing empty, unlocked text track instead of adding a new one', () => {
    const project = makeProject({ tracks: [makeTrack('txt', { kind: 'text' })] });
    const action = captionsToEdit(project, CUES);
    const { project: next } = applyEdit(project, action!);
    expect(next.tracks).toHaveLength(1);
    expect(next.clips.filter(c => c.trackId === 'txt')).toHaveLength(2);
  });

  it('skips a cue that would overlap an already-placed clip on the target track', () => {
    const project = makeProject({ tracks: [makeTrack('txt', { kind: 'text' })] });
    const action = captionsToEdit(project, [
      { start: 0, end: 2, text: 'A' },
      { start: 1, end: 3, text: 'Overlaps A' },
    ]);
    const { project: next } = applyEdit(project, action!);
    const clips = next.clips.filter(c => c.trackId === 'txt');
    expect(clips).toHaveLength(1);
    expect(clips[0].text?.content).toBe('A');
  });

  it('skips a locked text track and creates a new one', () => {
    const project = makeProject({ tracks: [makeTrack('locked-txt', { kind: 'text', locked: true })] });
    const action = captionsToEdit(project, CUES);
    const { project: next } = applyEdit(project, action!);
    expect(next.tracks.filter(t => t.kind === 'text')).toHaveLength(2);
    expect(next.clips.filter(c => c.trackId === 'locked-txt')).toHaveLength(0);
  });
});

describe('clipsToCues', () => {
  it('returns time-ordered cues from the text track', () => {
    const project = makeProject({
      tracks: [makeTrack('txt', { kind: 'text' })],
      clips: [
        makeClip('c2', 'txt', { start: 5, duration: 2, text: { content: 'Second', style: STYLE } }),
        makeClip('c1', 'txt', { start: 0, duration: 2, text: { content: 'First', style: STYLE } }),
      ],
    });
    expect(clipsToCues(project)).toEqual([
      { start: 0, end: 2, text: 'First' },
      { start: 5, end: 7, text: 'Second' },
    ]);
  });

  it('returns an empty array when there is no text track', () => {
    expect(clipsToCues(makeProject({ tracks: [makeTrack('v', { kind: 'video' })] }))).toEqual([]);
  });

  it('prefers a track named Captions over another text track with a title clip', () => {
    const project = makeProject({
      tracks: [makeTrack('title', { kind: 'text', name: 'Text 1' }), makeTrack('caps', { kind: 'text', name: 'Captions' })],
      clips: [
        makeClip('t1', 'title', { start: 0, duration: 3, text: { content: 'Title card', style: STYLE } }),
        makeClip('c1', 'caps', { start: 1, duration: 2, text: { content: 'Caption', style: STYLE } }),
      ],
    });
    expect(clipsToCues(project)).toEqual([{ start: 1, end: 3, text: 'Caption' }]);
  });
});
