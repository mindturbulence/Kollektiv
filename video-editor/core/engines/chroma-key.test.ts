// No upstream test file exists for chroma-key-engine.ts; this is a new,
// minimal test of the ported per-pixel math in chroma-key.ts.

import { describe, it, expect } from 'vitest';
import { applyChromaKey, DEFAULT_CHROMA_KEY_SETTINGS } from './chroma-key';

const pixel = (r: number, g: number, b: number, a = 255): Uint8ClampedArray =>
  new Uint8ClampedArray([r, g, b, a]);

describe('applyChromaKey', () => {
  it('makes a pure key-color pixel fully transparent', () => {
    const data = pixel(0, 255, 0);
    const imageData = { data, width: 1, height: 1, colorSpace: 'srgb' } as unknown as ImageData;
    applyChromaKey(imageData, DEFAULT_CHROMA_KEY_SETTINGS);
    expect(data[3]).toBe(0);
  });

  it('leaves a far-from-key-color pixel fully opaque', () => {
    const data = pixel(255, 0, 0);
    const imageData = { data, width: 1, height: 1, colorSpace: 'srgb' } as unknown as ImageData;
    applyChromaKey(imageData, DEFAULT_CHROMA_KEY_SETTINGS);
    expect(data[3]).toBe(255);
  });

  it('produces a partial alpha in the edge-softness band', () => {
    // distance from pure green scaled by 1.732 should land inside
    // [tolerance - softness/2, tolerance + softness/2] for some off-green pixel.
    const settings = { ...DEFAULT_CHROMA_KEY_SETTINGS, tolerance: 0.3, edgeSoftness: 0.4 };
    const data = pixel(60, 200, 60);
    const imageData = { data, width: 1, height: 1, colorSpace: 'srgb' } as unknown as ImageData;
    applyChromaKey(imageData, settings);
    expect(data[3]).toBeGreaterThan(0);
    expect(data[3]).toBeLessThan(255);
  });

  it('returns the same ImageData it was given', () => {
    const data = pixel(10, 10, 10);
    const imageData = { data, width: 1, height: 1, colorSpace: 'srgb' } as unknown as ImageData;
    const result = applyChromaKey(imageData, DEFAULT_CHROMA_KEY_SETTINGS);
    expect(result).toBe(imageData);
  });

  it('suppresses green spill without touching alpha=1 pixels', () => {
    const data = pixel(255, 0, 0);
    const before = Array.from(data);
    const imageData = { data, width: 1, height: 1, colorSpace: 'srgb' } as unknown as ImageData;
    applyChromaKey(imageData, { ...DEFAULT_CHROMA_KEY_SETTINGS, spillSuppression: 1 });
    // Fully opaque pixel (alpha=1): suppressSpill is a no-op at alpha>=1.
    expect(data[0]).toBe(before[0]);
    expect(data[1]).toBe(before[1]);
    expect(data[2]).toBe(before[2]);
  });
});
