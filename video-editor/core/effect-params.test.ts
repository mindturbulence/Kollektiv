import { describe, it, expect } from 'vitest';
import { decodeChromaKey, decodeColorGrading, encodeChromaKey, encodeColorGrading } from './effect-params';
import { DEFAULT_CHROMA_KEY_SETTINGS } from './engines/chroma-key';

describe('effect-params', () => {
  it('round-trips color grading through a JSON string param', () => {
    const grading = { wheels: { shadows: { r: 0.1, g: 0, b: 0 }, midtones: { r: 0, g: 0, b: 0 }, highlights: { r: 0, g: 0, b: 0 }, shadowsLift: 0.1, midtonesGamma: 1.2, highlightsGain: 0.9 } };
    expect(decodeColorGrading(encodeColorGrading(grading))).toEqual(grading);
  });

  it('decodes corrupt or missing color grading as neutral', () => {
    expect(decodeColorGrading({ value: '{not json' })).toEqual({});
    expect(decodeColorGrading({})).toEqual({});
  });

  it('round-trips chroma key and falls back to defaults', () => {
    const s = { keyColor: { r: 0, g: 1, b: 0 }, tolerance: 0.4, edgeSoftness: 0.2, spillSuppression: 0.7 };
    expect(decodeChromaKey(encodeChromaKey(s))).toEqual(s);
    expect(decodeChromaKey({ keyColor: 'green' })).toEqual(DEFAULT_CHROMA_KEY_SETTINGS);
  });
});
