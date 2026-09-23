import { describe, it, expect } from 'vitest';
import {
  evaluateConversion,
  getTargetsForSource,
  isKnownSourceExt,
  categoryForExt,
} from './convertRegistry';

describe('evaluateConversion — capability matrix (plan W1)', () => {
  it('accepts a valid image pair on the magick engine', () => {
    const v = evaluateConversion({ name: 'a.png', ext: 'png', size: 1000 }, 'webp');
    expect(v.ok).toBe(true);
    expect(v.engine).toBe('magick');
    expect(v.target?.id).toBe('webp');
    expect(v.requiresFfmpegCore).toBe(false);
  });

  it('accepts a valid audio pair on the ffmpeg engine and flags core requirement', () => {
    const v = evaluateConversion({ name: 'a.flac', ext: 'flac', size: 1000 }, 'mp3');
    expect(v.ok).toBe(true);
    expect(v.engine).toBe('ffmpeg');
    expect(v.requiresFfmpegCore).toBe(true);
  });

  it('rejects unknown source extensions', () => {
    const v = evaluateConversion({ name: 'a.xyz', ext: 'xyz', size: 100 }, 'png');
    expect(v.ok).toBe(false);
    expect(v.rejectReason).toBe('unsupported-source');
  });

  it('rejects unknown target ids', () => {
    const v = evaluateConversion({ name: 'a.png', ext: 'png', size: 100 }, 'docx');
    expect(v.ok).toBe(false);
    expect(v.rejectReason).toBe('unsupported-target');
  });

  it('rejects cross-category targets (image→mp3, audio→png)', () => {
    expect(evaluateConversion({ name: 'a.png', ext: 'png', size: 100 }, 'mp3').rejectReason).toBe('unsupported-target');
    expect(evaluateConversion({ name: 'a.mp3', ext: 'mp3', size: 100 }, 'png').rejectReason).toBe('unsupported-target');
  });

  it('rejects same-container no-ops for audio/video (same-format)', () => {
    expect(evaluateConversion({ name: 'a.mp3', ext: 'mp3', size: 100 }, 'mp3').rejectReason).toBe('same-format');
    expect(evaluateConversion({ name: 'a.mp4', ext: 'mp4', size: 100 }, 'mp4').rejectReason).toBe('same-format');
  });

  it('rejects video sources over the 500MB pre-check', () => {
    const big = 501 * 1024 * 1024;
    const v = evaluateConversion({ name: 'a.mp4', ext: 'mp4', size: big }, 'webm');
    expect(v.ok).toBe(false);
    expect(v.rejectReason).toBe('video-too-large');
  });

  it('rejects video sources over the 10min pre-check when duration is known', () => {
    const v = evaluateConversion({ name: 'a.mp4', ext: 'mp4', size: 1000, durationS: 601 }, 'webm');
    expect(v.ok).toBe(false);
    expect(v.rejectReason).toBe('video-too-long');
  });

  it('allows video inside the envelope', () => {
    const v = evaluateConversion({ name: 'a.mp4', ext: 'mp4', size: 1000, durationS: 60 }, 'gif');
    expect(v.ok).toBe(true);
    expect(v.engine).toBe('ffmpeg');
  });

  it('video pre-check does not apply to images of any size', () => {
    const v = evaluateConversion({ name: 'a.png', ext: 'png', size: 600 * 1024 * 1024 }, 'webp');
    expect(v.ok).toBe(true);
  });
});

describe('getTargetsForSource', () => {
  it('returns image targets for image extensions', () => {
    const targets = getTargetsForSource('webp');
    expect(targets.map(t => t.id)).toContain('avif');
    expect(targets.every(t => t.category === 'image')).toBe(true);
  });

  it('returns audio targets for audio extensions', () => {
    expect(getTargetsForSource('flac').map(t => t.id)).toContain('mp3');
  });

  it('returns [] for unknown extensions', () => {
    expect(getTargetsForSource('xyz')).toEqual([]);
  });
});

describe('isKnownSourceExt', () => {
  it('accepts known image/audio/video extensions case-insensitively', () => {
    expect(isKnownSourceExt('png')).toBe(true);
    expect(isKnownSourceExt('HEIC')).toBe(true);
    expect(isKnownSourceExt('mkv')).toBe(true);
  });

  it('rejects unknown extensions', () => {
    expect(isKnownSourceExt('exe')).toBe(false);
    expect(isKnownSourceExt('')).toBe(false);
  });
});

describe('categoryForExt', () => {
  it('classifies correctly', () => {
    expect(categoryForExt('jpg')).toBe('image');
    expect(categoryForExt('ogg')).toBe('audio');
    expect(categoryForExt('mov')).toBe('video');
    expect(categoryForExt('pdf')).toBeUndefined();
  });
});
