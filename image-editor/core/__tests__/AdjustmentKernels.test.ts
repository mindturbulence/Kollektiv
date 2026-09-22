import { describe, it, expect } from 'vitest';
import { applyLevels, applyCurves, buildCurvesLUT, applyHueSaturation, applyExposure } from '../adjust/kernels';

// ─── helpers ─────────────────────────────────────────────────────────────────

function pixel(r: number, g: number, b: number, a = 255): Uint8ClampedArray {
  return new Uint8ClampedArray([r, g, b, a]);
}

// ─── Levels ───────────────────────────────────────────────────────────────────

describe('applyLevels', () => {
  it('identity pass leaves pixel unchanged', () => {
    const px = pixel(128, 64, 200);
    applyLevels(px, 0, 255, 1.0, 0, 255, 0);
    expect(px[0]).toBe(128);
    expect(px[1]).toBe(64);
    expect(px[2]).toBe(200);
  });

  it('maps inWhite=128 to output 255 (stretch)', () => {
    const px = pixel(128, 0, 0);
    applyLevels(px, 0, 128, 1.0, 0, 255, 0);
    expect(px[0]).toBe(255);
  });

  it('clips pixel below inBlack to outBlack', () => {
    const px = pixel(10, 0, 0);
    applyLevels(px, 50, 200, 1.0, 0, 255, 0);
    expect(px[0]).toBe(0);
  });

  it('applies only to the red channel when channel=1', () => {
    const px = pixel(128, 128, 128);
    applyLevels(px, 0, 128, 1.0, 0, 255, 1 /* R */);
    expect(px[0]).toBe(255); // R stretched
    expect(px[1]).toBe(128); // G unchanged
    expect(px[2]).toBe(128); // B unchanged
  });

  it('preserves alpha', () => {
    const px = pixel(100, 100, 100, 200);
    applyLevels(px, 0, 255, 1.0, 0, 255, 0);
    expect(px[3]).toBe(200);
  });
});

// ─── Curves LUT + applyCurves ─────────────────────────────────────────────────

describe('buildCurvesLUT + applyCurves', () => {
  it('identity curve maps every value to itself', () => {
    const lut = buildCurvesLUT([{ x: 0, y: 0 }, { x: 255, y: 255 }]);
    for (let i = 0; i <= 255; i++) {
      expect(lut[i]).toBe(i);
    }
  });

  it('applies identity LUT without changing pixels', () => {
    const lut = buildCurvesLUT([{ x: 0, y: 0 }, { x: 255, y: 255 }]);
    const px = pixel(80, 160, 240);
    applyCurves(px, lut, 0);
    expect(px[0]).toBe(80);
    expect(px[1]).toBe(160);
    expect(px[2]).toBe(240);
  });

  it('inverted curve maps 0→255 and 255→0', () => {
    const lut = buildCurvesLUT([{ x: 0, y: 255 }, { x: 255, y: 0 }]);
    expect(lut[0]).toBe(255);
    expect(lut[255]).toBe(0);
  });
});

// ─── Hue-Saturation ───────────────────────────────────────────────────────────

describe('applyHueSaturation', () => {
  it('leaves white pixel unchanged on zero shifts', () => {
    const px = pixel(255, 255, 255);
    applyHueSaturation(px, 0, 0, 0, false);
    expect(px[0]).toBeGreaterThan(240);
    expect(px[1]).toBeGreaterThan(240);
    expect(px[2]).toBeGreaterThan(240);
  });

  it('leaves black pixel unchanged on zero shifts', () => {
    const px = pixel(0, 0, 0);
    applyHueSaturation(px, 0, 0, 0, false);
    expect(px[0]).toBe(0);
    expect(px[1]).toBe(0);
    expect(px[2]).toBe(0);
  });

  it('colorize tints a gray pixel', () => {
    const px = pixel(128, 128, 128);
    applyHueSaturation(px, 120, 50, 0, true); // green hue
    // should no longer be achromatic
    const isGray = px[0] === px[1] && px[1] === px[2];
    expect(isGray).toBe(false);
  });

  it('preserves alpha', () => {
    const px = pixel(200, 100, 50, 180);
    applyHueSaturation(px, 30, 20, 10, false);
    expect(px[3]).toBe(180);
  });
});

// ─── Exposure ─────────────────────────────────────────────────────────────────

describe('applyExposure', () => {
  it('identity pass (exposure=0, offset=0, gamma=1) leaves pixel unchanged', () => {
    const px = pixel(100, 150, 200);
    applyExposure(px, 0, 0, 1.0);
    expect(px[0]).toBe(100);
    expect(px[1]).toBe(150);
    expect(px[2]).toBe(200);
  });

  it('+1 stop roughly doubles a mid-range pixel (clamped at 255)', () => {
    const px = pixel(100, 100, 100);
    applyExposure(px, 1, 0, 1.0);
    // 100 * 2^1 = 200
    expect(px[0]).toBeCloseTo(200, -1);
  });

  it('clamps overexposed pixel to 255', () => {
    const px = pixel(200, 200, 200);
    applyExposure(px, 2, 0, 1.0); // 200*4 = 800 → clamp to 255
    expect(px[0]).toBe(255);
  });

  it('preserves alpha', () => {
    const px = pixel(100, 100, 100, 200);
    applyExposure(px, 0, 0, 1.0);
    expect(px[3]).toBe(200);
  });
});
