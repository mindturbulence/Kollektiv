import { describe, expect, it } from 'vitest';
import { makeClip, makeMedia } from '../actions/fixtures';
import { clampSlipDelta, computeSlip } from './slip-utils';

describe('clampSlipDelta', () => {
  it('is unconstrained for images and clips without media', () => {
    const clip = makeClip('c1', 't1', { inPoint: 0, duration: 5, speed: 1 });
    expect(clampSlipDelta(clip, undefined, 100)).toBe(100);
    expect(clampSlipDelta(clip, makeMedia('m1', { kind: 'image', duration: 5 }), 100)).toBe(100);
  });

  it('clamps at the head of the source', () => {
    const clip = makeClip('c1', 't1', { inPoint: 1, duration: 5, speed: 1, mediaId: 'm1' });
    expect(clampSlipDelta(clip, makeMedia('m1', { duration: 30 }), -5)).toBe(-1);
  });

  it('clamps at the tail of the source', () => {
    const clip = makeClip('c1', 't1', { inPoint: 10, duration: 5, speed: 1, mediaId: 'm1' });
    // media.duration=20, used=5 -> maxInPoint=15, so +10 clamps to +5
    expect(clampSlipDelta(clip, makeMedia('m1', { duration: 20 }), 10)).toBe(5);
  });
});

describe('computeSlip', () => {
  it('emits an updateClip patch scaled by speed', () => {
    const clip = makeClip('c1', 't1', { inPoint: 2, duration: 5, speed: 2, mediaId: 'm1' });
    const actions = computeSlip(clip, makeMedia('m1', { duration: 30 }), 1); // 1s timeline -> 2s source
    expect(actions).toEqual([{ type: 'updateClip', clipId: 'c1', patch: { inPoint: 4 } }]);
  });

  it('returns [] once already clamped to a bound', () => {
    const clip = makeClip('c1', 't1', { inPoint: 0, duration: 5, speed: 1, mediaId: 'm1' });
    expect(computeSlip(clip, makeMedia('m1', { duration: 30 }), -1)).toEqual([]);
  });
});
