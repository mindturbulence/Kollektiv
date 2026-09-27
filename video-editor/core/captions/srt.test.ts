import { describe, it, expect } from 'vitest';
import { parseSrt, serializeSrt } from './srt';

const SAMPLE = `1
00:00:01,000 --> 00:00:03,500
Hello there

2
00:00:04,000 --> 00:00:06,000
Line one
Line two
`;

describe('parseSrt', () => {
  it('parses well-formed cues', () => {
    const { cues, skipped } = parseSrt(SAMPLE);
    expect(skipped).toEqual([]);
    expect(cues).toEqual([
      { start: 1, end: 3.5, text: 'Hello there' },
      { start: 4, end: 6, text: 'Line one\nLine two' },
    ]);
  });

  it('strips a BOM and tolerates CRLF line endings', () => {
    const crlf = '﻿' + SAMPLE.replace(/\n/g, '\r\n');
    const { cues } = parseSrt(crlf);
    expect(cues).toHaveLength(2);
    expect(cues[0].text).toBe('Hello there');
  });

  it('accepts a missing index line', () => {
    const noIndex = '00:00:01,000 --> 00:00:02,000\nNo index here\n';
    const { cues } = parseSrt(noIndex);
    expect(cues).toEqual([{ start: 1, end: 2, text: 'No index here' }]);
  });

  it('accepts dot-separated milliseconds', () => {
    const dotMillis = '1\n00:00:01.250 --> 00:00:02.000\nDot millis\n';
    const { cues } = parseSrt(dotMillis);
    expect(cues[0]).toEqual({ start: 1.25, end: 2, text: 'Dot millis' });
  });

  it('tolerates stray blank lines between blocks', () => {
    const stray = `1\n00:00:01,000 --> 00:00:02,000\nA\n\n\n\n2\n00:00:03,000 --> 00:00:04,000\nB\n`;
    const { cues } = parseSrt(stray);
    expect(cues.map(c => c.text)).toEqual(['A', 'B']);
  });

  it('skips malformed blocks and reports them', () => {
    const broken = `1\nnot a timecode\nOops\n\n2\n00:00:01,000 --> 00:00:02,000\nGood\n`;
    const { cues, skipped } = parseSrt(broken);
    expect(cues).toEqual([{ start: 1, end: 2, text: 'Good' }]);
    expect(skipped).toEqual([{ block: 1, reason: 'no timecode line' }]);
  });

  it('skips a cue with no text and one where end <= start', () => {
    const bad = `1\n00:00:01,000 --> 00:00:02,000\n\n\n2\n00:00:05,000 --> 00:00:04,000\nBackwards\n`;
    const { cues, skipped } = parseSrt(bad);
    expect(cues).toEqual([]);
    expect(skipped).toHaveLength(2);
  });
});

describe('serializeSrt', () => {
  it('round-trips through parseSrt', () => {
    const { cues } = parseSrt(SAMPLE);
    const out = serializeSrt(cues);
    expect(out).not.toContain('\r');
    const reparsed = parseSrt(out);
    expect(reparsed.cues).toEqual(cues);
  });

  it('produces 1-based indices and comma millis', () => {
    const out = serializeSrt([{ start: 0, end: 1.5, text: 'Hi' }]);
    expect(out).toBe('1\n00:00:00,000 --> 00:00:01,500\nHi\n');
  });

  it('returns empty string for no cues', () => {
    expect(serializeSrt([])).toBe('');
  });
});
