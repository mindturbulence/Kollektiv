// Ported from openreel@5f3c85e packages/core/src/video/color-grading-defaults.ts
// — MIT, (c) 2024-2026 Augustus Otu and Contributors. Modified for Kollektiv.
// Adapted to this module's `ColorGrading` type; upstream's LUT/temperature/
// tint checks are dropped along with the LUT support in color-grading.ts.

import type { ColorWheels, Curves, HSLBands, ColorGrading, CurvePoint } from './color-grading';

const EPSILON = 1e-6;

function approxEqual(value: number, target: number): boolean {
  return Math.abs(value - target) < EPSILON;
}

function isNeutralRgbChannel(channel: { r: number; g: number; b: number }): boolean {
  return approxEqual(channel.r, 0) && approxEqual(channel.g, 0) && approxEqual(channel.b, 0);
}

function isIdentityCurve(points: CurvePoint[] | undefined): boolean {
  if (!points || points.length === 0) return true;
  if (points.length !== 2) return false;
  const [first, second] = points;
  return approxEqual(first.x, 0) && approxEqual(first.y, 0) && approxEqual(second.x, 1) && approxEqual(second.y, 1);
}

function isAllZero(values: number[] | undefined): boolean {
  if (!values || values.length === 0) return true;
  return values.every((value) => approxEqual(value, 0));
}

export function isNeutralColorWheels(value: ColorWheels | undefined): boolean {
  if (!value) return true;
  return (
    isNeutralRgbChannel(value.shadows) &&
    isNeutralRgbChannel(value.midtones) &&
    isNeutralRgbChannel(value.highlights) &&
    approxEqual(value.shadowsLift, 0) &&
    approxEqual(value.midtonesGamma, 1) &&
    approxEqual(value.highlightsGain, 1)
  );
}

export function isNeutralCurves(value: Curves | undefined): boolean {
  if (!value) return true;
  return (
    isIdentityCurve(value.rgb) &&
    isIdentityCurve(value.red) &&
    isIdentityCurve(value.green) &&
    isIdentityCurve(value.blue)
  );
}

export function isNeutralHsl(value: HSLBands | undefined): boolean {
  if (!value) return true;
  return isAllZero(value.hue) && isAllZero(value.saturation) && isAllZero(value.luminance);
}

export function isNeutralColorGrading(grading: ColorGrading): boolean {
  return isNeutralColorWheels(grading.wheels) && isNeutralCurves(grading.curves) && isNeutralHsl(grading.hsl);
}
