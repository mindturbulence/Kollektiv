import { describe, expect, it } from 'vitest';
import type { Clip, EditAction, Project } from '../types';
import { applyEdit } from './apply';
import { baseProject, makeClip, makeMarker, makeMedia, makeTrack, mulberry32 } from './fixtures';

function assertInvariants(project: Project): void {
  for (const c of project.clips) {
    expect(c.duration).toBeGreaterThan(0);
    expect(c.inPoint).toBeGreaterThanOrEqual(-1e-6);
    expect(project.tracks.some(t => t.id === c.trackId)).toBe(true);
    if (c.mediaId) {
      const media = project.media.find(m => m.id === c.mediaId);
      if (media && media.kind !== 'image') {
        expect(c.inPoint + c.duration * c.speed).toBeLessThanOrEqual(media.duration + 1e-6);
      }
    }
  }
  const byTrack = new Map<string, Clip[]>();
  for (const c of project.clips) {
    const list = byTrack.get(c.trackId) ?? [];
    list.push(c);
    byTrack.set(c.trackId, list);
  }
  for (const list of byTrack.values()) {
    const sorted = [...list].sort((a, b) => a.start - b.start);
    for (let i = 1; i < sorted.length; i++) {
      expect(sorted[i].start).toBeGreaterThanOrEqual(sorted[i - 1].start + sorted[i - 1].duration - 1e-6);
    }
  }
  for (const t of project.transitions) {
    expect(project.clips.some(c => c.id === t.fromClipId)).toBe(true);
    expect(project.clips.some(c => c.id === t.toClipId)).toBe(true);
  }
}

// ─── Unit tests for tricky variants ──────────────────────────────────────────

describe('addClip / moveClip guards', () => {
  it('rejects addClip onto an occupied range as a no-op', () => {
    const project = baseProject();
    const clip = makeClip('overlap', 't1', { start: 1, duration: 2 });
    const result = applyEdit(project, { type: 'addClip', clip });
    expect(result.project).toBe(project);
  });

  it('rejects moveClip onto a locked track', () => {
    const project = { ...baseProject() };
    project.tracks = project.tracks.map(t => (t.id === 't2' ? { ...t, locked: true } : t));
    const result = applyEdit(project, { type: 'moveClip', clipId: 'c1', start: 10, trackId: 't2' });
    expect(result.project).toBe(project);
  });

  it('moveClip inverse moves the clip back to its original spot', () => {
    const project = baseProject();
    const { project: next, inverse } = applyEdit(project, { type: 'moveClip', clipId: 'c1', start: 12, trackId: 't1' });
    expect(next).not.toBe(project);
    expect(applyEdit(next, inverse).project).toEqual(project);
  });
});

describe('splitClip', () => {
  it('partitions keyframes, assigns fades to outer edges, and re-points transitions', () => {
    let project = baseProject();
    project = {
      ...project,
      clips: project.clips.map(c =>
        c.id === 'c1'
          ? {
              ...c,
              fadeIn: 0.5,
              fadeOut: 0.5,
              keyframes: [
                { id: 'k1', time: 1, property: 'opacity' as const, value: 0.5, easing: 'linear' as const },
                { id: 'k2', time: 4, property: 'opacity' as const, value: 1, easing: 'linear' as const },
              ],
            }
          : c,
      ),
      transitions: [{ id: 'tr1', type: 'crossfade' as const, fromClipId: 'c1', toClipId: 'c2', duration: 1 }],
    };

    const { project: next, inverse } = applyEdit(project, { type: 'splitClip', clipId: 'c1', time: 2.5, newClipId: 'c1b' });

    const left = next.clips.find(c => c.id === 'c1')!;
    const right = next.clips.find(c => c.id === 'c1b')!;
    expect(left.duration).toBeCloseTo(2.5);
    expect(right.duration).toBeCloseTo(2.5);
    expect(left.fadeIn).toBe(0.5);
    expect(left.fadeOut).toBe(0);
    expect(right.fadeIn).toBe(0);
    expect(right.fadeOut).toBe(0.5);
    expect(left.keyframes.map(k => k.time)).toEqual([1]);
    expect(right.keyframes.map(k => k.time)).toEqual([1.5]); // 4 - 2.5
    const tr = next.transitions.find(t => t.id === 'tr1')!;
    expect(tr.fromClipId).toBe('c1b'); // re-pointed to the right half (outer edge)

    assertInvariants(next);
    expect(applyEdit(next, inverse).project).toEqual(project);
  });
});

describe('removeClips', () => {
  it('ripple shifts later clips left and its inverse restores exact positions', () => {
    const project = baseProject();
    const { project: next, inverse } = applyEdit(project, { type: 'removeClips', clipIds: ['c1'], ripple: true });
    const c2 = next.clips.find(c => c.id === 'c2')!;
    expect(c2.start).toBeCloseTo(0); // shifted left by c1's 5s duration
    assertInvariants(next);
    expect(applyEdit(next, inverse).project).toEqual(project);
  });

  it('cascades removal of transitions touching removed clips', () => {
    let project = baseProject();
    project = { ...project, transitions: [{ id: 'tr1', type: 'crossfade' as const, fromClipId: 'c1', toClipId: 'c2', duration: 1 }] };
    const { project: next, inverse } = applyEdit(project, { type: 'removeClips', clipIds: ['c1'], ripple: false });
    expect(next.transitions).toEqual([]);
    expect(applyEdit(next, inverse).project).toEqual(project);
  });
});

describe('removeMedia', () => {
  it('cascades clip/transition removal and its inverse restores original media array order', () => {
    let project = baseProject();
    const m2 = makeMedia('m2');
    const m3 = makeMedia('m3');
    project = { ...project, media: [...project.media, m2, m3] };

    const { project: next, inverse } = applyEdit(project, { type: 'removeMedia', mediaId: project.media[0].id });
    expect(next.media.map(m => m.id)).toEqual(['m2', 'm3']);
    expect(next.clips.some(c => c.mediaId === 'm1')).toBe(false); // c1/c2/c3 all reference m1

    const restored = applyEdit(next, inverse).project;
    expect(restored).toEqual(project); // exact original order: [m1, m2, m3]
  });
});

describe('removeTrack', () => {
  it('sandwiches the restore so re-adding clips to a locked track is not rejected', () => {
    let project = baseProject();
    project = { ...project, tracks: project.tracks.map(t => (t.id === 't1' ? { ...t, locked: true } : t)) };

    const { project: next, inverse } = applyEdit(project, { type: 'removeTrack', trackId: 't1' });
    expect(next.tracks.some(t => t.id === 't1')).toBe(false);
    expect(next.clips.some(c => c.trackId === 't1')).toBe(false);

    const restored = applyEdit(next, inverse).project;
    expect(restored).toEqual(project);
    expect(restored.tracks.find(t => t.id === 't1')!.locked).toBe(true);
  });
});

describe('batch', () => {
  it('applies actions in order and inverts them in reverse order', () => {
    const project = baseProject();
    const actions: EditAction[] = [
      { type: 'addMarker', marker: makeMarker('mk1', 1) },
      { type: 'moveClip', clipId: 'c1', start: 15, trackId: 't1' },
      { type: 'removeClips', clipIds: ['c3'], ripple: false },
    ];
    const { project: next, inverse } = applyEdit(project, { type: 'batch', actions, label: 'multi' });
    expect(next.markers.some(m => m.id === 'mk1')).toBe(true);
    expect(next.clips.find(c => c.id === 'c1')!.start).toBe(15);
    expect(next.clips.some(c => c.id === 'c3')).toBe(false);

    expect(applyEdit(next, inverse).project).toEqual(project);
  });

  it('skips no-op sub-steps without breaking the overall inverse', () => {
    const project = baseProject();
    const actions: EditAction[] = [
      { type: 'removeMarker', markerId: 'does-not-exist' }, // no-op
      { type: 'addMarker', marker: makeMarker('mk1', 2) },
    ];
    const { project: next, inverse } = applyEdit(project, { type: 'batch', actions, label: 'multi2' });
    expect(applyEdit(next, inverse).project).toEqual(project);
  });
});

// ─── Property test: random apply -> inverse round trips ─────────────────────

let idCounter = 0;
function nextId(prefix: string): string {
  idCounter += 1;
  return `${prefix}-${idCounter}`;
}

function randomAction(rng: () => number, project: Project): EditAction {
  const pick = <T,>(arr: readonly T[]): T => arr[Math.floor(rng() * arr.length)];
  const existingClipId = (): string => (project.clips.length && rng() < 0.8 ? pick(project.clips).id : nextId('ghost-clip'));
  const existingTrackId = (): string => (project.tracks.length && rng() < 0.8 ? pick(project.tracks).id : nextId('ghost-track'));

  const kinds = [
    'moveClip', 'trimClip', 'splitClip', 'removeClips', 'updateClip',
    'addClip', 'addTrack', 'removeTrack', 'updateTrack',
    'addMedia', 'removeMedia', 'addMarker', 'removeMarker', 'updateSettings',
    'addTransition', 'removeTransition',
  ] as const;
  const kind = pick(kinds);

  switch (kind) {
    case 'moveClip':
      return { type: 'moveClip', clipId: existingClipId(), start: Math.floor(rng() * 20), trackId: existingTrackId() };
    case 'trimClip': {
      const clipId = existingClipId();
      const clip = project.clips.find(c => c.id === clipId);
      const anchor = clip ? clip.start + clip.duration / 2 : rng() * 10;
      return { type: 'trimClip', clipId, edge: rng() < 0.5 ? 'start' : 'end', time: anchor + (rng() - 0.5) * 4, ripple: rng() < 0.5 };
    }
    case 'splitClip': {
      const clipId = existingClipId();
      const clip = project.clips.find(c => c.id === clipId);
      const time = clip ? clip.start + clip.duration * rng() : rng() * 10;
      return { type: 'splitClip', clipId, time, newClipId: nextId('split') };
    }
    case 'removeClips':
      return { type: 'removeClips', clipIds: [project.clips.length ? pick(project.clips).id : nextId('ghost-clip')], ripple: rng() < 0.5 };
    case 'updateClip': {
      const clipId = existingClipId();
      const patchKind = pick(['volume', 'speed', 'fadeIn', 'fadeOut', 'start'] as const);
      const patch = patchKind === 'speed' ? { speed: 0.5 + rng() * 1.5 }
        : patchKind === 'start' ? { start: rng() * 10 }
        : { [patchKind]: rng() * 2 };
      return { type: 'updateClip', clipId, patch };
    }
    case 'addClip': {
      const trackId = existingTrackId();
      const mediaId = project.media.length && rng() < 0.7 ? pick(project.media).id : undefined;
      return { type: 'addClip', clip: makeClip(nextId('clip'), trackId, { start: rng() * 20, duration: 1 + rng() * 4, mediaId }) };
    }
    case 'addTrack':
      return { type: 'addTrack', track: makeTrack(nextId('track'), { locked: rng() < 0.3 }), index: project.tracks.length ? Math.floor(rng() * project.tracks.length) : 0 };
    case 'removeTrack':
      return { type: 'removeTrack', trackId: existingTrackId() };
    case 'updateTrack':
      return { type: 'updateTrack', trackId: existingTrackId(), patch: { locked: rng() < 0.5, muted: rng() < 0.5 } };
    case 'addMedia':
      return { type: 'addMedia', media: makeMedia(nextId('media'), { duration: 10 + rng() * 30, kind: rng() < 0.2 ? 'image' : 'video' }) };
    case 'removeMedia':
      return { type: 'removeMedia', mediaId: project.media.length && rng() < 0.8 ? pick(project.media).id : nextId('ghost-media') };
    case 'addMarker':
      return { type: 'addMarker', marker: makeMarker(nextId('marker'), rng() * 20) };
    case 'removeMarker':
      return { type: 'removeMarker', markerId: project.markers.length && rng() < 0.8 ? pick(project.markers).id : nextId('ghost-marker') };
    case 'updateSettings':
      return { type: 'updateSettings', patch: { fps: pick([24, 30, 60] as const) } };
    case 'addTransition': {
      const a = project.clips.length ? pick(project.clips).id : nextId('ghost');
      const b = project.clips.length ? pick(project.clips).id : nextId('ghost');
      return { type: 'addTransition', transition: { id: nextId('trans'), type: 'crossfade', fromClipId: a, toClipId: b, duration: 1 } };
    }
    case 'removeTransition':
      return { type: 'removeTransition', transitionId: project.transitions.length && rng() < 0.8 ? pick(project.transitions).id : nextId('ghost-trans') };
  }
}

describe('applyEdit property: apply -> inverse round trips', () => {
  it('every successful edit inverts back to a deep-equal project, and invariants always hold', () => {
    for (let seed = 0; seed < 100; seed++) {
      const rng = mulberry32(seed * 7919 + 1);
      let project = baseProject();
      for (let step = 0; step < 15; step++) {
        const action = randomAction(rng, project);
        const { project: next, inverse } = applyEdit(project, action);
        assertInvariants(next);
        if (next === project) continue;
        const back = applyEdit(next, inverse).project;
        expect(back).toEqual(project);
        project = next;
      }
    }
  });

  it('undoing a full sequence then redoing it reproduces the same states (undo/redo cycle)', () => {
    const rng = mulberry32(12345);
    let project = baseProject();
    const initial = project;
    const steps: Array<{ action: EditAction; inverse: EditAction }> = [];

    for (let i = 0; i < 20; i++) {
      const action = randomAction(rng, project);
      const { project: next, inverse } = applyEdit(project, action);
      if (next === project) continue;
      steps.push({ action, inverse });
      project = next;
    }
    const finalState = project;

    let undone = project;
    for (let i = steps.length - 1; i >= 0; i--) {
      undone = applyEdit(undone, steps[i].inverse).project;
    }
    expect(undone).toEqual(initial);

    let redone = undone;
    for (const step of steps) {
      redone = applyEdit(redone, step.action).project;
    }
    expect(redone).toEqual(finalState);
  });
});
