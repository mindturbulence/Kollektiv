import { describe, expect, it } from 'vitest';
import { parseShotScript, replaceBeat, scriptDuration, serializeShotScript } from './shotScript';
import { validateTimeline } from './videoDirector';

const TS = [
  '9:16 cinematic video. Total duration 10 seconds.',
  'A woman in a red coat stands on a rainy street at dusk.',
  '',
  '0–3s: slow push-in as she looks up',
  '3–5s: she steps forward',
  '5–8s: camera tracks beside her',
  '8–10s: she stops under a neon sign',
  '',
  'Visual Style: neon, wet asphalt, shallow depth of field',
  'Audio: rain, distant traffic',
  'Important: same subject and outfit throughout; smooth continuous motion.',
].join('\n');

const TS_PLAIN = '9:16 cinematic video. Total duration 6 seconds.\n0–3s: walks\n3–6s: stops';

const BLOCKS = [
  'A lighthouse on a cliff at dawn.',
  '',
  'Cinematography:',
  'Camera shot: slow aerial pull-back',
  'Mood: calm, awe',
  '',
  'Actions:',
  '- waves crash below',
  '- the lamp turns off',
  '',
  'Dialogue:',
  'Keeper: "Another night done."',
  'Background Sound: gulls, surf',
].join('\n');

const PARAS = 'A shot of a harbor.\n\nA sailor walks the pier.\n\nThe camera cranes up.';

describe('shotScript', () => {
  it.each([['timestamps', TS], ['timestamps plain', TS_PLAIN], ['blocks', BLOCKS], ['paragraphs', PARAS]])(
    'round-trips %s',
    (_n, text) => {
      const parsed = parseShotScript(text);
      expect(serializeShotScript(parsed)).toBe(text);
      expect(parseShotScript(serializeShotScript(parsed))).toEqual(parsed);
    },
  );

  it('parses the timestamp sample fields', () => {
    const s = parseShotScript(TS);
    expect(s.dialect).toBe('timestamps');
    expect(s.header).toBe('9:16 cinematic video. Total duration 10 seconds.');
    expect(s.lead).toBe('A woman in a red coat stands on a rainy street at dusk.');
    expect(s.beats).toHaveLength(4);
    expect(s.beats[1]).toEqual({ start: 3, end: 5, text: 'she steps forward' });
    expect(s.tail).toHaveLength(3);
    expect(scriptDuration(s)).toBe(10);
  });

  it('parses blocks into lead, bullets and tail', () => {
    const s = parseShotScript(BLOCKS);
    expect(s.dialect).toBe('blocks');
    expect(s.beats.map(b => b.text)).toEqual(['waves crash below', 'the lamp turns off']);
    expect(s.tail).toEqual(['Dialogue:', 'Keeper: "Another night done."', 'Background Sound: gulls, surf']);
    expect(s.lead).toContain('Camera shot: slow aerial pull-back');
    expect(scriptDuration(s)).toBeNull();
  });

  it('accepts hyphen ranges and emits en dash', () => {
    const s = parseShotScript('0-3s: a\n3-6s: b');
    expect(s.beats.map(b => [b.start, b.end])).toEqual([[0, 3], [3, 6]]);
    expect(serializeShotScript(s)).toBe('0–3s: a\n3–6s: b');
    expect(scriptDuration(s)).toBe(6);
  });

  it('tolerates extra whitespace and CRLF', () => {
    const s = parseShotScript('  0 – 3 s :  walks  \r\n\r\n 3–6s:   stops \r\n');
    expect(s.beats.map(b => b.text)).toEqual(['walks', 'stops']);
  });

  it('turns unstructured text into one paragraph beat and empty into none', () => {
    const s = parseShotScript('just a single flowing paragraph\nwith a soft wrap');
    expect(s.dialect).toBe('paragraphs');
    expect(s.beats).toHaveLength(1);
    expect(parseShotScript('').beats).toEqual([]);
    expect(parseShotScript('  \n ').beats).toEqual([]);
  });

  it('replaceBeat is immutable and ignores bad indexes', () => {
    const s = parseShotScript(TS);
    const before = JSON.stringify(s);
    const next = replaceBeat(s, 1, 'she runs');
    expect(JSON.stringify(s)).toBe(before);
    expect(next.beats[1].text).toBe('she runs');
    expect(next.beats[1].start).toBe(3);
    expect(replaceBeat(s, 9, 'x')).toBe(s);
    expect(replaceBeat(s, -1, 'x')).toBe(s);
  });

  it('serialized output passes validateTimeline for contiguous beats', () => {
    const out = serializeShotScript(replaceBeat(parseShotScript(TS), 0, 'edited'));
    expect(validateTimeline(out, 10)).toEqual({ ok: true });
  });
});
