import { describe, it, expect } from 'vitest';
import {
  buildTimelineSkeleton, validateTimeline, resolveVideoDuration, buildVideoDirector,
  sanitizeVideoLine, sanitizeVideoStream, maxBeats, beatLabel, videoCaps,
} from './videoDirector';
import { lookupModelProfile } from '../constants/modelProfiles';
import { TARGET_VIDEO_AI_MODELS, TARGET_IMAGE_AI_MODELS, TARGET_AUDIO_AI_MODELS } from '../constants/models';

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
  it('returns null for non-video targets and uses the timestamp dialect for every other video model', () => {
    expect(buildVideoDirector('Stable Diffusion XL', {})).toBeNull();
    expect(buildVideoDirector('Default (General Video)', {})!.timeline).toBe('timestamps');
    expect(buildVideoDirector('Pika Art v3.0', {})!.timeline).toBe('timestamps');
    expect(buildVideoDirector('Runway Gen-4.5', {})!.timeline).toBe('paragraph');
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

describe('paragraph splitting by length', () => {
  it('paragraph dialect: Short is one paragraph, Medium 3–4, Long 4–5', () => {
    expect(buildVideoDirector('LTX-2', {}, 'Short')!.rules).toContain('SINGLE PARAGRAPH');
    expect(buildVideoDirector('LTX-2', {})!.rules).toContain('SINGLE PARAGRAPH');
    const med = buildVideoDirector('LTX-2', {}, 'Medium')!.rules;
    expect(med).toContain('3 to 4 short present-tense paragraphs');
    expect(med).not.toContain('ONE flowing');
    expect(buildVideoDirector('LTX-2', {}, 'Long')!.rules).toContain('4 to 5 short');
  });
  it('prose dialect splits the arc into paragraphs for Medium and Long only', () => {
    expect(buildVideoDirector('Google Veo 3.1', {}, 'Medium')!.rules).toContain('2 to 3 paragraphs');
    expect(buildVideoDirector('Google Veo 3.1', {}, 'Long')!.rules).toContain('3 to 5 paragraphs');
    expect(buildVideoDirector('Google Veo 3.1', {}, 'Short')!.rules).not.toContain('paragraphs separated');
  });
});

describe('audio direction', () => {
  it('auto writes audio rules for native-audio models, scaled to the clip', () => {
    const r = buildVideoDirector('Google Veo 3.1', { videoDuration: '8' })!.rules;
    expect(r).toContain('AUDIO (generated together with the video)');
    expect(r).toContain('about 3 short line(s) for 8 seconds');
  });
  it('off says the clip is silent and drops the Audio line', () => {
    expect(buildVideoDirector('Google Veo 3.1', { videoAudio: 'off' })!.rules).toContain('AUDIO: none');
    expect(buildVideoDirector('Kling 3.0 Pro / Turbo / Omni', { videoAudio: 'off' })!.rules).not.toContain('"Audio: ..."');
  });
  it('direct injects the user dialogue and sound direction verbatim', () => {
    const r = buildVideoDirector('Kling 3.0 Pro / Turbo / Omni', { videoAudio: 'direct', videoDialogue: 'Maya: "We go."', videoSfx: 'distant sirens' })!.rules;
    expect(r).toContain('Maya: "We go."');
    expect(r).toContain('distant sirens');
  });
  it('direct without text injects nothing extra', () => {
    expect(buildVideoDirector('Sora 2 (OpenAI) — sunset Sep 2026', { videoAudio: 'direct' })!.rules).not.toContain('USER DIALOGUE');
  });
});

describe('videoCaps', () => {
  it('reports lists, ranges and the 3–15 s default', () => {
    expect(videoCaps('Google Veo 3.1').durations).toEqual([4, 6, 8]);
    expect(videoCaps('Kling 3.0 Pro / Turbo / Omni')).toMatchObject({ min: 3, max: 15, durations: null });
    expect(videoCaps('Default (General Video)')).toMatchObject({ min: 3, max: 15, timeline: 'timestamps', audio: undefined });
  });
});

describe('Wan profile resolution', () => {
  const all = [...TARGET_VIDEO_AI_MODELS, ...TARGET_IMAGE_AI_MODELS, ...TARGET_AUDIO_AI_MODELS];
  it('Wan 2.x profile matches exactly WAN 2.5 and 2.7 across every target list', () => {
    expect(all.filter(m => lookupModelProfile(m).name === 'Wan 2.x').sort()).toEqual(['WAN 2.5', 'WAN 2.7 (Open Weights)']);
  });
  it('legacy Wan / HunYuan profile keeps WAN Video v2 and HunYuan, with no dialect fields', () => {
    expect(all.filter(m => lookupModelProfile(m).name === 'Wan / Hunyuan Video').sort()).toEqual(['HunYuan Video v2', 'WAN Video v2 (T2V)']);
    expect(lookupModelProfile('HunYuan Video v2', true).videoTimeline).toBeUndefined();
  });
  it('Wan 2.x gets timestamps, 2–15 s and native audio', () => {
    expect(videoCaps('WAN 2.7 (Open Weights)')).toMatchObject({ timeline: 'timestamps', min: 2, max: 15, audio: true });
  });
  it('Luma is a silent 5 / 10 s paragraph model', () => {
    expect(videoCaps('Luma Ray (v3)')).toMatchObject({ timeline: 'paragraph', durations: [5, 10], audio: false });
  });
});

describe('per-model video audio', () => {
  it('Veo 2 is silent, Veo 3 / 3.1 / 3.1 Lite are native', () => {
    expect(videoCaps('Google Veo 2').audio).toBe(false);
    for (const m of ['Google Veo 3', 'Google Veo 3.1', 'Google Veo 3.1 Lite']) expect(videoCaps(m).audio).toBe(true);
  });
  it('buildVideoDirector writes no audio direction for Veo 2 even with audio on', () => {
    expect(buildVideoDirector('Google Veo 2', { videoAudio: 'auto' })!.rules).toContain('AUDIO: none');
    expect(buildVideoDirector('Google Veo 3', { videoAudio: 'auto' })!.rules).not.toContain('AUDIO: none');
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
