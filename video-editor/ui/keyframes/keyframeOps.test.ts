import { describe, it, expect } from 'vitest';
import type { Clip, Keyframe } from '../../core/types';
import {
  adjacentKeyframeTime, commitPropertyValue, keyframeAt, removeKeyframe, setKeyframe, setKeyframeEasing, valueAt,
} from './keyframeOps';

const FPS = 30;

function makeClip(keyframes: Keyframe[] = []): Clip {
  return {
    id: 'c1', trackId: 't1', mediaId: 'm1', start: 10, duration: 6, inPoint: 0, speed: 1, volume: 1,
    fadeIn: 0, fadeOut: 0,
    transform: { x: 0, y: 0, scale: 1, rotation: 0, opacity: 1, fit: 'contain' },
    keyframes, effects: [],
  };
}

function kf(time: number, value: number, property: Keyframe['property'] = 'opacity', easing: Keyframe['easing'] = 'linear'): Keyframe {
  return { id: `k-${time}-${property}`, time, value, property, easing };
}

describe('keyframeAt', () => {
  it('finds a keyframe within half a frame', () => {
    const clip = makeClip([kf(1, 0.5)]);
    expect(keyframeAt(clip, 'opacity', 1 + 1 / FPS / 4, FPS)?.value).toBe(0.5);
  });
  it('misses beyond half a frame', () => {
    const clip = makeClip([kf(1, 0.5)]);
    expect(keyframeAt(clip, 'opacity', 1.2, FPS)).toBeUndefined();
  });
  it('ignores other properties', () => {
    const clip = makeClip([kf(1, 0.5, 'x')]);
    expect(keyframeAt(clip, 'opacity', 1, FPS)).toBeUndefined();
  });
});

describe('setKeyframe', () => {
  it('adds a new keyframe and keeps the array sorted by time', () => {
    const clip = makeClip([kf(2, 1)]);
    const result = setKeyframe(clip, 'opacity', 0, 0.2, FPS);
    expect(result.map(k => k.time)).toEqual([0, 2]);
  });
  it('replaces the keyframe already at that frame, keeping its id', () => {
    const clip = makeClip([kf(1, 0.5)]);
    const result = setKeyframe(clip, 'opacity', 1, 0.9, FPS);
    expect(result).toHaveLength(1);
    expect(result[0].value).toBe(0.9);
    expect(result[0].id).toBe(clip.keyframes[0].id);
  });
  it('defaults easing to linear for a brand-new keyframe', () => {
    const clip = makeClip([]);
    const result = setKeyframe(clip, 'opacity', 0, 1, FPS);
    expect(result[0].easing).toBe('linear');
  });
  it('preserves an explicit easing override', () => {
    const clip = makeClip([]);
    const result = setKeyframe(clip, 'opacity', 0, 1, FPS, 'hold');
    expect(result[0].easing).toBe('hold');
  });
});

describe('removeKeyframe', () => {
  it('removes the keyframe at that frame', () => {
    const clip = makeClip([kf(1, 0.5), kf(2, 0.9)]);
    const result = removeKeyframe(clip, 'opacity', 1, FPS);
    expect(result.map(k => k.time)).toEqual([2]);
  });
  it('is a no-op when nothing matches', () => {
    const clip = makeClip([kf(1, 0.5)]);
    const result = removeKeyframe(clip, 'opacity', 5, FPS);
    expect(result).toBe(clip.keyframes);
  });
});

describe('setKeyframeEasing', () => {
  it('updates only the matching keyframe', () => {
    const clip = makeClip([kf(1, 0.5), kf(2, 0.9)]);
    const result = setKeyframeEasing(clip, 'opacity', 1, FPS, 'ease-in-out');
    expect(result.find(k => k.time === 1)?.easing).toBe('ease-in-out');
    expect(result.find(k => k.time === 2)?.easing).toBe('linear');
  });
});

describe('adjacentKeyframeTime', () => {
  const clip = makeClip([kf(1, 0), kf(3, 1), kf(5, 0.5, 'x')]);
  it('finds the previous keyframe for a property', () => {
    expect(adjacentKeyframeTime(clip, 'opacity', 4, 'prev')).toBe(3);
  });
  it('finds the next keyframe for a property', () => {
    expect(adjacentKeyframeTime(clip, 'opacity', 2, 'next')).toBe(3);
  });
  it('searches across all properties when property is null', () => {
    expect(adjacentKeyframeTime(clip, null, 4, 'next')).toBe(5);
  });
  it('returns undefined past the last keyframe', () => {
    expect(adjacentKeyframeTime(clip, 'opacity', 10, 'next')).toBeUndefined();
  });
});

describe('valueAt', () => {
  it('delegates to evaluateTransform for transform properties', () => {
    const clip = makeClip([kf(0, 0.2), kf(2, 0.8)]);
    expect(valueAt(clip, 'opacity', 1)).toBeCloseTo(0.5);
  });
  it('returns the keyframed volume level for volume', () => {
    const clip = makeClip([{ id: 'v1', time: 0, property: 'volume', value: 0.5, easing: 'linear' }]);
    expect(valueAt(clip, 'volume', 0)).toBe(0.5);
  });
  it('ignores fades for volume, so committing inside a fade keeps the real level', () => {
    const clip = { ...makeClip([]), volume: 0.8, fadeIn: 1 };
    expect(valueAt(clip, 'volume', 0.25)).toBe(0.8);
  });
});

describe('commitPropertyValue', () => {
  it('updates the base transform value when the property has no keyframes', () => {
    const clip = makeClip([]);
    const patch = commitPropertyValue(clip, 'opacity', 2, FPS, 0.4);
    expect(patch).toEqual({ transform: { ...clip.transform, opacity: 0.4 } });
  });
  it('updates the base volume when volume has no keyframes', () => {
    const clip = makeClip([]);
    const patch = commitPropertyValue(clip, 'volume', 2, FPS, 1.5);
    expect(patch).toEqual({ volume: 1.5 });
  });
  it('writes a keyframe at the playhead when the property already has keyframes', () => {
    const clip = makeClip([kf(0, 0.2)]);
    const patch = commitPropertyValue(clip, 'opacity', 3, FPS, 0.9);
    expect(patch.keyframes).toBeDefined();
    expect(patch.keyframes!.map(k => k.time)).toEqual([0, 3]);
    expect(patch.keyframes!.find(k => k.time === 3)?.value).toBe(0.9);
  });
  it('replaces an existing keyframe at the playhead frame instead of duplicating it', () => {
    const clip = makeClip([kf(0, 0.2), kf(3, 0.5)]);
    const patch = commitPropertyValue(clip, 'opacity', 3, FPS, 0.9);
    expect(patch.keyframes).toHaveLength(2);
    expect(patch.keyframes!.find(k => k.time === 3)?.value).toBe(0.9);
  });
});
