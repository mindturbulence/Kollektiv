// Ported from openreel@5f3c85e packages/core/src/video/color-grading-defaults.test.ts
// — MIT, (c) 2024-2026 Augustus Otu and Contributors. Modified for Kollektiv:
// dropped LUT/temperature/tint cases (not ported; see color-grading.ts).

import { describe, it, expect } from 'vitest';
import { DEFAULT_COLOR_WHEELS, DEFAULT_CURVES, DEFAULT_HSL } from './color-grading';
import type { ColorWheels, Curves, HSLBands } from './color-grading';
import { isNeutralColorWheels, isNeutralCurves, isNeutralHsl, isNeutralColorGrading } from './color-grading-defaults';

describe('isNeutralColorWheels', () => {
  it('treats undefined as neutral', () => {
    expect(isNeutralColorWheels(undefined)).toBe(true);
  });

  it('treats the seeded default as neutral', () => {
    expect(isNeutralColorWheels({ ...DEFAULT_COLOR_WHEELS })).toBe(true);
  });

  it('is not neutral when a wheel channel is non-zero', () => {
    const value: ColorWheels = { ...DEFAULT_COLOR_WHEELS, shadows: { r: 0.1, g: 0, b: 0 } };
    expect(isNeutralColorWheels(value)).toBe(false);
  });

  it('is not neutral when gamma is non-default', () => {
    const value: ColorWheels = { ...DEFAULT_COLOR_WHEELS, midtonesGamma: 1.5 };
    expect(isNeutralColorWheels(value)).toBe(false);
  });

  it('is not neutral when gain is non-default', () => {
    const value: ColorWheels = { ...DEFAULT_COLOR_WHEELS, highlightsGain: 0.8 };
    expect(isNeutralColorWheels(value)).toBe(false);
  });

  it('is not neutral when lift is non-default', () => {
    const value: ColorWheels = { ...DEFAULT_COLOR_WHEELS, shadowsLift: 0.2 };
    expect(isNeutralColorWheels(value)).toBe(false);
  });
});

describe('isNeutralCurves', () => {
  it('treats undefined as neutral', () => {
    expect(isNeutralCurves(undefined)).toBe(true);
  });

  it('treats the identity default as neutral', () => {
    expect(isNeutralCurves({ ...DEFAULT_CURVES })).toBe(true);
  });

  it('is not neutral when a control point is added', () => {
    const value: Curves = { ...DEFAULT_CURVES, rgb: [{ x: 0, y: 0 }, { x: 0.5, y: 0.6 }, { x: 1, y: 1 }] };
    expect(isNeutralCurves(value)).toBe(false);
  });

  it('is not neutral when an endpoint is moved', () => {
    const value: Curves = { ...DEFAULT_CURVES, red: [{ x: 0, y: 0.1 }, { x: 1, y: 1 }] };
    expect(isNeutralCurves(value)).toBe(false);
  });
});

describe('isNeutralHsl', () => {
  it('treats undefined as neutral', () => {
    expect(isNeutralHsl(undefined)).toBe(true);
  });

  it('treats the all-zero default as neutral', () => {
    expect(isNeutralHsl({ ...DEFAULT_HSL })).toBe(true);
  });

  it('is not neutral when a hue band is non-zero', () => {
    const value: HSLBands = { ...DEFAULT_HSL, hue: [0, 0, 10, 0, 0, 0, 0, 0] };
    expect(isNeutralHsl(value)).toBe(false);
  });

  it('is not neutral when a saturation band is non-zero', () => {
    const value: HSLBands = { ...DEFAULT_HSL, saturation: [0.2, 0, 0, 0, 0, 0, 0, 0] };
    expect(isNeutralHsl(value)).toBe(false);
  });

  it('is not neutral when a luminance band is non-zero', () => {
    const value: HSLBands = { ...DEFAULT_HSL, luminance: [0, 0, 0, 0, 0, 0, 0, -0.3] };
    expect(isNeutralHsl(value)).toBe(false);
  });
});

describe('isNeutralColorGrading', () => {
  it('is neutral for empty settings', () => {
    expect(isNeutralColorGrading({})).toBe(true);
  });

  it('is neutral for reset/seeded-default settings', () => {
    expect(
      isNeutralColorGrading({ wheels: { ...DEFAULT_COLOR_WHEELS }, curves: { ...DEFAULT_CURVES }, hsl: { ...DEFAULT_HSL } }),
    ).toBe(true);
  });

  it('is not neutral when wheels differ', () => {
    expect(isNeutralColorGrading({ wheels: { ...DEFAULT_COLOR_WHEELS, shadowsLift: 0.5 } })).toBe(false);
  });

  it('is not neutral when curves differ', () => {
    expect(
      isNeutralColorGrading({ curves: { ...DEFAULT_CURVES, rgb: [{ x: 0, y: 0 }, { x: 0.3, y: 0.5 }, { x: 1, y: 1 }] } }),
    ).toBe(false);
  });

  it('is not neutral when HSL differs', () => {
    expect(isNeutralColorGrading({ hsl: { ...DEFAULT_HSL, hue: [5, 0, 0, 0, 0, 0, 0, 0] } })).toBe(false);
  });
});
