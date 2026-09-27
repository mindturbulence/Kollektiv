import { describe, expect, it } from 'vitest';
import { resolvePixelEffects, applyPixelEffectSteps } from './pixel-effects';
import { COLOR_GRADE, CHROMA_KEY, encodeColorGrading, encodeChromaKey } from '../effect-params';
import type { Effect } from '../types';

describe('resolvePixelEffects', () => {
  it('skips a neutral colorGrade effect', () => {
    const effects: Effect[] = [{ id: '1', type: COLOR_GRADE, params: encodeColorGrading({}), enabled: true }];
    expect(resolvePixelEffects(effects)).toHaveLength(0);
  });

  it('skips a disabled chromaKey effect', () => {
    const effects: Effect[] = [
      { id: '1', type: CHROMA_KEY, params: encodeChromaKey({ keyColor: { r: 0, g: 1, b: 0 }, tolerance: 0.3, edgeSoftness: 0.1, spillSuppression: 0.5 }), enabled: false },
    ];
    expect(resolvePixelEffects(effects)).toHaveLength(0);
  });

  it('includes a non-neutral colorGrade and an enabled chromaKey, in order', () => {
    const effects: Effect[] = [
      { id: '1', type: COLOR_GRADE, params: encodeColorGrading({ wheels: { shadows: { r: 0.1, g: 0, b: 0 }, midtones: { r: 0, g: 0, b: 0 }, highlights: { r: 0, g: 0, b: 0 }, shadowsLift: 0, midtonesGamma: 1, highlightsGain: 1 } }), enabled: true },
      { id: '2', type: CHROMA_KEY, params: encodeChromaKey({ keyColor: { r: 0, g: 1, b: 0 }, tolerance: 0.3, edgeSoftness: 0.1, spillSuppression: 0.5 }), enabled: true },
    ];
    const steps = resolvePixelEffects(effects);
    expect(steps.map((s) => s.kind)).toEqual([COLOR_GRADE, CHROMA_KEY]);
  });
});

describe('applyPixelEffectSteps', () => {
  it('keys a pure-green pixel to alpha 0 against the default green key color', () => {
    const effects: Effect[] = [
      { id: '1', type: CHROMA_KEY, params: encodeChromaKey({ keyColor: { r: 0, g: 1, b: 0 }, tolerance: 0.3, edgeSoftness: 0.1, spillSuppression: 0.5 }), enabled: true },
    ];
    const data = new Uint8ClampedArray([0, 255, 0, 255]);
    const imageData = { data, width: 1, height: 1 } as ImageData;
    applyPixelEffectSteps(imageData, resolvePixelEffects(effects));
    expect(data[3]).toBe(0);
  });
});
