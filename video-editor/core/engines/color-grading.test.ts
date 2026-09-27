// Ported from openreel@5f3c85e packages/core/src/video/color-grading-engine.test.ts
// — MIT, (c) 2024-2026 Augustus Otu and Contributors. Modified for Kollektiv:
// the upstream test reaches private methods via an `as unknown as` cast;
// here the same functions are plain exports, so no cast is needed. LUT
// cases are dropped (LUT isn't ported — see color-grading.ts).

import { describe, it, expect } from 'vitest';
import { buildCurveLUT, applyCurvesToData, applyHslToData, applyWheels, applyColorGrading, DEFAULT_CURVES, DEFAULT_HSL } from './color-grading';
import type { Curves } from './color-grading';

const pixel = (r: number, g: number, b: number, a = 255): Uint8ClampedArray =>
  new Uint8ClampedArray([r, g, b, a]);

describe('buildCurveLUT', () => {
  it('produces an identity ramp for default curve points', () => {
    const lut = buildCurveLUT(DEFAULT_CURVES.rgb);
    for (let i = 0; i < 256; i++) {
      expect(lut[i]).toBe(i);
    }
  });
});

describe('applyCurvesToData', () => {
  it('leaves opaque pixels unchanged with identity curves', () => {
    const data = new Uint8ClampedArray([0, 0, 0, 255, 64, 128, 200, 255, 255, 255, 255, 255]);
    const before = Array.from(data);
    applyCurvesToData(data, DEFAULT_CURVES);
    expect(Array.from(data)).toEqual(before);
  });

  it('maps a known pixel through a non-trivial master curve', () => {
    const invertMaster: Curves = {
      rgb: [{ x: 0, y: 1 }, { x: 1, y: 0 }],
      red: DEFAULT_CURVES.red,
      green: DEFAULT_CURVES.green,
      blue: DEFAULT_CURVES.blue,
    };
    const data = pixel(0, 128, 255);
    const masterLut = buildCurveLUT(invertMaster.rgb);
    const expected = [masterLut[0], masterLut[128], masterLut[255], 255];
    applyCurvesToData(data, invertMaster);
    expect(Array.from(data)).toEqual(expected);
  });

  it('composes channel then master curve', () => {
    const curves: Curves = {
      rgb: [{ x: 0, y: 0.1 }, { x: 1, y: 0.9 }],
      red: [{ x: 0, y: 0.2 }, { x: 1, y: 0.8 }],
      green: DEFAULT_CURVES.green,
      blue: DEFAULT_CURVES.blue,
    };
    const rgbLut = buildCurveLUT(curves.rgb);
    const redLut = buildCurveLUT(curves.red);
    const greenLut = buildCurveLUT(curves.green);
    const blueLut = buildCurveLUT(curves.blue);
    const data = pixel(40, 90, 210);
    const expected = [rgbLut[redLut[40]], rgbLut[greenLut[90]], rgbLut[blueLut[210]], 255];
    applyCurvesToData(data, curves);
    expect(Array.from(data)).toEqual(expected);
  });
});

describe('applyHslToData', () => {
  it('leaves opaque pixels unchanged with neutral params', () => {
    const data = new Uint8ClampedArray([10, 20, 30, 255, 200, 100, 50, 255, 255, 0, 0, 255]);
    const before = Array.from(data);
    applyHslToData(data, DEFAULT_HSL);
    expect(Array.from(data)).toEqual(before);
  });

  it('shifts luminance for the matching hue band', () => {
    const hsl = { hue: [0, 0, 0, 0, 0, 0, 0, 0], saturation: [0, 0, 0, 0, 0, 0, 0, 0], luminance: [0.25, 0, 0, 0, 0, 0, 0, 0] };
    const data = pixel(200, 40, 40);
    const before = Array.from(data);
    applyHslToData(data, hsl);
    expect(Array.from(data)).not.toEqual(before);
    expect(data[3]).toBe(255);
  });
});

describe('applyWheels', () => {
  it('is a no-op for neutral wheels', () => {
    const data = pixel(10, 90, 200);
    const before = Array.from(data);
    applyWheels(data, {
      shadows: { r: 0, g: 0, b: 0 },
      midtones: { r: 0, g: 0, b: 0 },
      highlights: { r: 0, g: 0, b: 0 },
      shadowsLift: 0,
      midtonesGamma: 1,
      highlightsGain: 1,
    });
    expect(Array.from(data)).toEqual(before);
  });

  it('lifts shadows toward the lift color', () => {
    const data = pixel(5, 5, 5); // near-black, all shadow weight
    applyWheels(data, {
      shadows: { r: 0, g: 0, b: 0 },
      midtones: { r: 0, g: 0, b: 0 },
      highlights: { r: 0, g: 0, b: 0 },
      shadowsLift: 0.2,
      midtonesGamma: 1,
      highlightsGain: 1,
    });
    expect(data[0]).toBeGreaterThan(5);
  });
});

describe('applyColorGrading', () => {
  it('is a no-op end to end with an empty grading object', () => {
    const imageData = { data: pixel(12, 34, 56), width: 1, height: 1, colorSpace: 'srgb' } as unknown as ImageData;
    const before = Array.from(imageData.data);
    applyColorGrading(imageData, {});
    expect(Array.from(imageData.data)).toEqual(before);
  });

  it('applies wheels then curves then hsl', () => {
    const imageData = { data: pixel(5, 5, 5), width: 1, height: 1, colorSpace: 'srgb' } as unknown as ImageData;
    const result = applyColorGrading(imageData, {
      wheels: {
        shadows: { r: 0, g: 0, b: 0 },
        midtones: { r: 0, g: 0, b: 0 },
        highlights: { r: 0, g: 0, b: 0 },
        shadowsLift: 0.2,
        midtonesGamma: 1,
        highlightsGain: 1,
      },
    });
    expect(result).toBe(imageData);
    expect(imageData.data[0]).toBeGreaterThan(5);
  });
});
