import { describe, it, expect } from 'vitest';
import {
  buildTimelineSkeleton, validateTimeline, resolveVideoDuration, buildVideoDirector,
  sanitizeVideoLine, sanitizeVideoStream, maxBeats, beatLabel,
} from './videoDirector';
import { lookupModelProfile } from '../constants/modelProfiles';

const labels = (d: number) => buildTimelineSkeleton(d).map(beatLabel);

describe('buildTimelineSkeleton', () => {
  it('is contiguous and ends at N for every whole duration 1..20', () => {
    for (let d = 1; d <= 20; d++) {
      const beats = buildTimelineSkeleton(d);
      expect(beats[0].start).toBe(0);
      expect(beats[beats.length - 1].end).toBe(d);
      beats.forEach((b, i) => {
        expect(b.end).toBeGreaterThan(b.start);
        if (i) expect(b.start).toBe(beats[i - 1].end);
      });
    }
  });
  it('caps beats by duration', () => {
    expect(buildTimelineSkeleton(4).length).toBeLessThanOrEqual(2);
    expect(buildTimelineSkeleton(15).length).toBe(5);
    expect(maxBeats(60)).toBe(5);
  });
  it('falls back to 6 s for NaN, zero and negatives', () => {
    for (const bad of [NaN, 0, -3, Infinity]) expect(labels(bad)).toEqual(labels(6));
  });
  it('lays out 10 s like the sample', () => {
    expect(labels(10)).toEqual(['0–3s', '3–5s', '5–8s', '8–10s']);
  });
});

describe('validateTimeline', () => {
  it('accepts a contiguous script', () => {
    expect(validateTimeline('0–3s: a\n3–6s: b', 6).ok).toBe(true);
  });
  it('rejects a gap, an overlap, and a wrong end', () => {
    expect(validateTimeline('0–3s: a\n4–6s: b', 6).reason).toMatch(/gap/);
    expect(validateTimeline('0–3s: a\n2–6s: b', 6).reason).toMatch(/overlap/);
    expect(validateTimeline('0–3s: a\n3–5s: b', 6).reason).toMatch(/expected 6/);
    expect(validateTimeline('no beats here', 6).ok).toBe(false);
  });
});

describe('resolveVideoDuration', () => {
  it('snaps to a discrete list and picks the middle by default', () => {
    const veo = lookupModelProfile('Google Veo 3.1', true);
    expect(resolveVideoDuration(veo, '7')).toBe(6);
    expect(resolveVideoDuration(veo, '99')).toBe(8);
    expect(resolveVideoDuration(veo, undefined)).toBe(6);
  });
  it('clamps to a range', () => {
    const kling = lookupModelProfile('Kling 3.0 Pro / Turbo / Omni', true);
    expect(resolveVideoDuration(kling, '60')).toBe(15);
    expect(resolveVideoDuration(kling, '1')).toBe(3);
  });
});

describe('buildVideoDirector', () => {
  it('returns null for models without a dialect (legacy rules stay)', () => {
    expect(buildVideoDirector('Default (General Video)', {})).toBeNull();
    expect(buildVideoDirector('Runway Gen-4.5', {})).toBeNull();
    expect(buildVideoDirector('Stable Diffusion XL', {})).toBeNull();
  });
  it('timestamps dialect lists the computed labels and a header', () => {
    const d = buildVideoDirector('Kling 3.0 Pro / Turbo / Omni', { videoDuration: '10', aspectRatio: '9:16', videoInputType: 'i2v' })!;
    expect(d.timeline).toBe('timestamps');
    expect(d.header).toBe('9:16 cinematic video based on the reference image. Total duration 10 seconds.');
    for (const l of ['0–3s:', '3–5s:', '5–8s:', '8–10s:']) expect(d.rules).toContain(l);
    expect(d.rules).toContain('Keep the exact subject');
  });
  it('sora uses labeled blocks and never mentions seconds in prose', () => {
    const d = buildVideoDirector('Sora 2 (OpenAI) — sunset Sep 2026', { videoDuration: '8' })!;
    expect(d.timeline).toBe('blocks');
    expect(d.header).toBe('');
    expect(d.rules).toContain('Cinematography:');
    expect(d.rules).not.toMatch(/\d+–\d+s:/);
  });
  it('ltx is one paragraph, veo has no timestamp labels', () => {
    expect(buildVideoDirector('LTX-2', {})!.rules).toContain('ONE flowing present-tense paragraph');
    expect(buildVideoDirector('Google Veo 3.1', {})!.rules).toContain('FORBIDDEN: timestamps');
  });
});

describe('sanitizeVideoLine', () => {
  it('strips Keyframe labels everywhere and timestamp labels outside the timestamps dialect', () => {
    expect(sanitizeVideoLine('Keyframe 2s: she turns', 'prose')).toBe('she turns');
    expect(sanitizeVideoLine('0–3s: she walks', 'prose')).toBe('she walks');
    expect(sanitizeVideoLine('0–3s: she walks', 'timestamps')).toBe('0–3s: she walks');
    expect(sanitizeVideoLine('Cinematography:', 'blocks')).toBe('Cinematography:');
  });
  it('works across arbitrary chunk boundaries', async () => {
    async function* src() { for (const c of ['0–', '3s: a wa', 'lk\n3–6s: b', 'ee\ntail']) yield c; }
    let out = '';
    for await (const c of sanitizeVideoStream(src(), 'prose')) out += c;
    expect(out).toBe('a walk\nbee\ntail');
  });
});
