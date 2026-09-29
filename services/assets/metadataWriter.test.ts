import { describe, expect, it } from 'vitest';
import { buildXmp, parseXmp, readXmpFields, sameMeta, writeMetadata, canWriteMetadata } from './metadataWriter';
import type { AssetMeta } from './assetLibrary';

const b64 = (s: string) => Uint8Array.from(atob(s), c => c.charCodeAt(0));
// 1×1 PNG and a minimal baseline JPEG.
const PNG = b64('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==');
const JPEG = b64('/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////wgALCAABAAEBAREA/8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQABPxA=');

const meta: AssetMeta = { rating: 4, label: 'green', tags: ['sea', 'Ünïcode & <tags>'], caption: 'Sunset "over" water', copyright: '© 2026 Me' };

describe('metadataWriter', () => {
  it('XMP round-trips every field, escaping included', () => {
    expect(parseXmp(buildXmp(meta))).toEqual(meta);
    expect(parseXmp(buildXmp({}))).toEqual({});
  });

  it('writes XMP into a PNG, replaces it on rewrite, keeps the image chunks', () => {
    const once = writeMetadata(PNG, 'png', meta);
    expect(readXmpFields(once, 'png')).toEqual(meta);
    const twice = writeMetadata(once, 'png', { rating: 1 });
    expect(readXmpFields(twice, 'png')).toEqual({ rating: 1 });
    expect(twice.length).toBeLessThan(once.length); // the old chunk is gone, not stacked
    expect(new TextDecoder().decode(twice).includes('IDAT')).toBe(true);
  });

  it('writes XMP (and EXIF) into a JPEG and keeps the scan data', () => {
    const out = writeMetadata(JPEG, 'jpg', meta);
    expect(out[0]).toBe(0xff); expect(out[1]).toBe(0xd8);
    expect(sameMeta(readXmpFields(out, 'jpg')!, meta)).toBe(true);
    const tail = JPEG.subarray(JPEG.length - 20);
    expect(Buffer.from(out.subarray(out.length - 20)).equals(Buffer.from(tail))).toBe(true);
    expect(sameMeta(readXmpFields(writeMetadata(out, 'jpg', { tags: ['x'] }), 'jpg')!, { tags: ['x'] })).toBe(true);
  });

  it('refuses index-only formats loudly', () => {
    expect(canWriteMetadata('webp')).toBe(false);
    expect(() => writeMetadata(PNG, 'webp', meta)).toThrow(/index-only/);
    expect(readXmpFields(PNG, 'png')).toBeNull();
  });
});
