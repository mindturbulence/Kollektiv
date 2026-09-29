import { describe, expect, it } from 'vitest';
import { autoExposure, developSize, isRawFile, jpegStarts } from '../io/rawImport';

describe('rawImport helpers', () => {
  it('recognises RAW files by extension', () => {
    expect(isRawFile(new File([], 'IMG_1.CR3'))).toBe(true);
    expect(isRawFile(new File([], 'shot.dng'))).toBe(true);
    expect(isRawFile(new File([], 'photo.jpg', { type: 'image/jpeg' }))).toBe(false);
  });

  it('finds embedded JPEG starts', () => {
    const b = new Uint8Array(64);
    b.set([0xff, 0xd8, 0xff, 0xe0], 10);
    b.set([0xff, 0xd8, 0xff, 0x00], 30); // not a marker byte → ignored
    b.set([0xff, 0xd8, 0xff, 0xdb], 40);
    expect(jpegStarts(b)).toEqual([10, 40]);
  });

  it('auto exposure brings the 99th percentile to white', () => {
    const n = 1000, data = new Uint16Array(n * 3).fill(16384); // quarter of full scale
    expect(autoExposure({ width: n, height: 1, data })).toBeCloseTo(2, 1);
    expect(autoExposure({ width: n, height: 1, data: new Uint16Array(n * 3).fill(65535) })).toBe(0);
  });

  it('fits 45 MP output inside the editor limit', () => {
    expect(developSize(8256, 5504)).toEqual({ width: 8192, height: 5461 });
    expect(developSize(6000, 4000)).toEqual({ width: 6000, height: 4000 });
  });
});
