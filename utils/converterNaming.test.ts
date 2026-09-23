import { describe, it, expect } from 'vitest';
import { sanitizeBaseName, buildOutputName } from './converterNaming';

describe('sanitizeBaseName', () => {
  it('strips path separators (unix and windows)', () => {
    expect(sanitizeBaseName('../../etc/passwd')).toBe('passwd');
    expect(sanitizeBaseName('C:\\Users\\test\\img')).toBe('img');
  });

  it('removes filesystem-hostile characters', () => {
    expect(sanitizeBaseName('my<>:"|?*file')).toBe('myfile');
  });

  it('removes control characters', () => {
    expect(sanitizeBaseName('bad\u0000\u001fname')).toBe('badname');
  });

  it('caps length at 200 chars leaving room for a suffix', () => {
    const long = 'a'.repeat(300);
    expect(sanitizeBaseName(long).length).toBeLessThanOrEqual(196);
  });

  it('falls back to "converted" when nothing survives', () => {
    expect(sanitizeBaseName('???')).toBe('converted');
    expect(sanitizeBaseName('')).toBe('converted');
  });
});

describe('buildOutputName', () => {
  it('returns base.ext when free', () => {
    const taken = new Set<string>();
    expect(buildOutputName('photo', 'webp', taken)).toBe('photo.webp');
  });

  it('suffixes -2, -3 on collisions (case-insensitive)', () => {
    const taken = new Set<string>();
    expect(buildOutputName('photo', 'webp', taken)).toBe('photo.webp');
    expect(buildOutputName('PHOTO', 'webp', taken)).toBe('PHOTO-2.webp');
    expect(buildOutputName('photo', 'webp', taken)).toBe('photo-3.webp');
  });

  it('registers every issued name in the taken set', () => {
    const taken = new Set<string>();
    buildOutputName('a', 'png', taken);
    buildOutputName('a', 'png', taken);
    expect(taken.has('a.png')).toBe(true);
    expect(taken.has('a-2.png')).toBe(true);
  });
});
