import { describe, it, expect, vi } from 'vitest';
import { refineBeat, buildBeatPrompt } from './refineBeat';
import { parseShotScript } from './shotScript';
import { validateTimeline } from './videoDirector';

const SCRIPT = [
  '9:16 cinematic video. Total duration 6 seconds.',
  '0–3s: She walks down the street, bag swaying.',
  '3–6s: Five men step out and surround her.',
  'Visual Style: photorealistic, daylight',
  'Important: same woman and outfit throughout',
].join('\n');

describe('buildBeatPrompt', () => {
  it('names the beat, carries neighbours and tail as context, and forbids labels', () => {
    const { system, user } = buildBeatPrompt(SCRIPT, 1, 'make it more tense');
    expect(user).toContain('Five men step out and surround her.');
    expect(user).toContain('She walks down the street');
    expect(user).toContain('make it more tense');
    expect(system).toMatch(/only the rewritten beat/i);
    expect(system).toMatch(/no timestamp|without .*label/i);
  });
});

describe('refineBeat', () => {
  it('replaces only the chosen beat and keeps the timeline valid', async () => {
    const complete = vi.fn().mockResolvedValue('The men close in from three sides as she stops.');
    const out = await refineBeat(SCRIPT, 1, 'more tense', complete);
    const parsed = parseShotScript(out);
    expect(parsed.beats[0].text).toBe('She walks down the street, bag swaying.');
    expect(parsed.beats[1].text).toBe('The men close in from three sides as she stops.');
    expect(parsed.tail).toEqual(parseShotScript(SCRIPT).tail);
    expect(validateTimeline(out, 6).ok).toBe(true);
    expect(complete).toHaveBeenCalledTimes(1);
  });

  it('strips a label, quotes and code fences the model adds', async () => {
    const complete = vi.fn().mockResolvedValue('```\n"3–6s: They circle her slowly."\n```');
    const out = await refineBeat(SCRIPT, 1, '', complete);
    expect(parseShotScript(out).beats[1].text).toBe('They circle her slowly.');
  });

  it('collapses a multi-line answer into one beat', async () => {
    const complete = vi.fn().mockResolvedValue('First sentence.\n\nSecond sentence.');
    const out = await refineBeat(SCRIPT, 0, '', complete);
    expect(parseShotScript(out).beats[0].text).toBe('First sentence. Second sentence.');
  });

  it('rejects an empty answer and a bad index without calling twice', async () => {
    await expect(refineBeat(SCRIPT, 0, '', vi.fn().mockResolvedValue('   '))).rejects.toThrow(/empty/i);
    const complete = vi.fn();
    await expect(refineBeat(SCRIPT, 9, '', complete)).rejects.toThrow(/beat/i);
    expect(complete).not.toHaveBeenCalled();
  });
});
