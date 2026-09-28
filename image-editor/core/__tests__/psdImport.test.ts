import { describe, it, expect } from 'vitest';
import { psdBlendMode, isPsdFile } from '../io/psdImport';

describe('psdImport', () => {
  it('maps ag-psd blend names to editor ids, falling back to normal', () => {
    expect(psdBlendMode('color dodge')).toBe('color-dodge');
    expect(psdBlendMode('linear light')).toBe('linear-light');
    expect(psdBlendMode('multiply')).toBe('multiply');
    expect(psdBlendMode('pass through')).toBe('normal');
    expect(psdBlendMode('divide')).toBe('normal');
    expect(psdBlendMode(undefined)).toBe('normal');
  });

  it('recognises PSDs by extension or MIME type', () => {
    expect(isPsdFile(new File([], 'art.PSD'))).toBe(true);
    expect(isPsdFile(new File([], 'x', { type: 'image/vnd.adobe.photoshop' }))).toBe(true);
    expect(isPsdFile(new File([], 'photo.png', { type: 'image/png' }))).toBe(false);
  });
});
