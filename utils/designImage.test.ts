import { describe, it, expect } from 'vitest';
import { refTargetType, fitWithin, topCropRect } from './designImage';

describe('refTargetType', () => {
  it('passes png/jpeg/webp through', () => {
    expect(refTargetType('image/png')).toBe('image/png');
    expect(refTargetType('image/jpeg')).toBe('image/jpeg');
    expect(refTargetType('image/webp')).toBe('image/webp');
  });

  it('converts other images to png', () => {
    expect(refTargetType('image/avif')).toBe('image/png');
    expect(refTargetType('image/gif')).toBe('image/png');
  });

  it('rejects non-images', () => {
    expect(refTargetType('text/plain')).toBeNull();
    expect(refTargetType('')).toBeNull();
  });
});

describe('fitWithin', () => {
  it('never upscales', () => {
    expect(fitWithin(800, 600, 1600)).toEqual({ width: 800, height: 600 });
  });

  it('scales landscape by width', () => {
    expect(fitWithin(3200, 1600, 1600)).toEqual({ width: 1600, height: 800 });
  });

  it('scales portrait by height', () => {
    expect(fitWithin(1000, 4000, 1600)).toEqual({ width: 400, height: 1600 });
  });

  it('leaves an exact fit unchanged', () => {
    expect(fitWithin(1600, 900, 1600)).toEqual({ width: 1600, height: 900 });
  });
});

describe('topCropRect', () => {
  it('keeps a 1440-wide page at full resolution and cuts it at 1600 rows', () => {
    expect(topCropRect(1440, 4500, 1440, 1600)).toEqual({ width: 1440, height: 1600, sourceHeight: 1600, whole: false });
  });

  it('scales a 2x retina capture down to viewport width before cropping', () => {
    expect(topCropRect(2880, 9000, 1440, 1600)).toEqual({ width: 1440, height: 1600, sourceHeight: 3200, whole: false });
  });

  it('uses a narrower ref as is and reports a short page as whole', () => {
    expect(topCropRect(1000, 3125, 1440, 1600)).toEqual({ width: 1000, height: 1600, sourceHeight: 1600, whole: false });
    expect(topCropRect(1440, 900, 1440, 1600)).toEqual({ width: 1440, height: 900, sourceHeight: 900, whole: true });
  });
});
