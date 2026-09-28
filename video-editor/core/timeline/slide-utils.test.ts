import { describe, expect, it } from 'vitest';
import { applyEdit } from '../actions/apply';
import { makeClip, makeMedia, makeProject, makeTrack } from '../actions/fixtures';
import { computeSlide } from './slide-utils';

// left[0,5) mid[5,8) right[8,13), all on t1, all backed by the same 60s media
// with headroom on both sides so source limits aren't the binding constraint
// unless the test says otherwise.
function slideFixture() {
  const media = makeMedia('m1', { duration: 60 });
  const track = makeTrack('t1');
  const left = makeClip('left', 't1', { start: 0, duration: 5, inPoint: 10, mediaId: 'm1' });
  const mid = makeClip('mid', 't1', { start: 5, duration: 3, inPoint: 20, mediaId: 'm1' });
  const right = makeClip('right', 't1', { start: 8, duration: 5, inPoint: 30, mediaId: 'm1' });
  return { project: makeProject({ media: [media], tracks: [track], clips: [left, mid, right] }), left, mid, right };
}

describe('computeSlide', () => {
  it('returns [] without both neighbors', () => {
    const { project, mid } = slideFixture();
    expect(computeSlide(project, mid, null, null, 1)).toEqual([]);
  });

  it('shrinks the leading neighbor, moves the clip, and extends the trailing one when sliding right', () => {
    const { project, left, mid, right } = slideFixture();
    const actions = computeSlide(project, mid, left, right, 1);
    expect(actions).toEqual([
      { type: 'trimClip', clipId: 'right', edge: 'start', time: 9, ripple: false },
      { type: 'moveClip', clipId: 'mid', start: 6, trackId: 't1' },
      { type: 'trimClip', clipId: 'left', edge: 'end', time: 6, ripple: false },
    ]);

    let p = project;
    for (const a of actions) {
      const result = applyEdit(p, a);
      expect(result.project).not.toBe(p); // every step must actually apply, none rejected
      p = result.project;
    }
    expect(p.clips.find(c => c.id === 'left')!.duration).toBeCloseTo(6);
    expect(p.clips.find(c => c.id === 'mid')!.start).toBeCloseTo(6);
    expect(p.clips.find(c => c.id === 'right')!.start).toBeCloseTo(9);
  });

  it('clamps to the minimum neighbor duration instead of overshooting', () => {
    const { project, left, mid, right } = slideFixture();
    const actions = computeSlide(project, mid, left, right, -100);
    // left shrinks first; it cannot go below ~1/60s, so the whole slide clamps to left.duration - MIN
    const moveAction = actions.find(a => a.type === 'moveClip');
    expect(moveAction).toBeDefined();
    let p = project;
    for (const a of actions) {
      const result = applyEdit(p, a);
      expect(result.project).not.toBe(p);
      p = result.project;
    }
    expect(p.clips.find(c => c.id === 'left')!.duration).toBeGreaterThan(0);
  });

  it('clamps to source headroom on the extending neighbor', () => {
    const media = makeMedia('m1', { duration: 60 });
    const track = makeTrack('t1');
    // left has almost no source left to extend into (inPoint near media end).
    const left = makeClip('left', 't1', { start: 0, duration: 5, inPoint: 54, mediaId: 'm1' }); // ends at source 59
    const mid = makeClip('mid', 't1', { start: 5, duration: 3, inPoint: 20, mediaId: 'm1' });
    const right = makeClip('right', 't1', { start: 8, duration: 5, inPoint: 30, mediaId: 'm1' });
    const project = makeProject({ media: [media], tracks: [track], clips: [left, mid, right] });

    const actions = computeSlide(project, mid, left, right, 5);
    let p = project;
    for (const a of actions) {
      const result = applyEdit(p, a);
      expect(result.project).not.toBe(p);
      p = result.project;
    }
    const finalLeft = p.clips.find(c => c.id === 'left')!;
    expect(finalLeft.inPoint + finalLeft.duration * finalLeft.speed).toBeLessThanOrEqual(60 + 1e-6);
  });

  it('converts source headroom to timeline seconds via speed on the extending neighbor', () => {
    // left plays at 2x: 1 timeline second consumes 2 source seconds. It
    // consumes source [46,56) of a 60s clip, i.e. 4s of source headroom but
    // only 2 timeline seconds of real headroom — sliding by 3 must clamp to
    // that, not to 4.
    const media = makeMedia('m1', { duration: 60 });
    const track = makeTrack('t1');
    const left = makeClip('left', 't1', { start: 0, duration: 5, inPoint: 46, speed: 2, mediaId: 'm1' });
    const mid = makeClip('mid', 't1', { start: 5, duration: 3, inPoint: 20, mediaId: 'm1' });
    const right = makeClip('right', 't1', { start: 8, duration: 5, inPoint: 30, mediaId: 'm1' });
    const project = makeProject({ media: [media], tracks: [track], clips: [left, mid, right] });

    const actions = computeSlide(project, mid, left, right, 3);
    let p = project;
    for (const a of actions) {
      const result = applyEdit(p, a);
      expect(result.project).not.toBe(p); // every step must apply — a rejected step would half-apply the slide
      p = result.project;
    }
    const finalLeft = p.clips.find(c => c.id === 'left')!;
    expect(finalLeft.inPoint + finalLeft.duration * finalLeft.speed).toBeLessThanOrEqual(60 + 1e-6);
    expect(finalLeft.duration).toBeCloseTo(7); // clamped to 2 timeline seconds, not 3
  });
});
