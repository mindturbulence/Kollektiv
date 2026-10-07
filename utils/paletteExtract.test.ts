import { describe, it, expect } from 'vitest';
import { medianCut, extractDesignPalette, type RGBColor } from './paletteExtract';

const mix = (): RGBColor[] => [
  ...Array.from({ length: 20 }, (): RGBColor => [250, 10, 10]),
  ...Array.from({ length: 20 }, (): RGBColor => [10, 10, 250]),
];

describe('medianCut', () => {
  it('returns [] for empty input or maxClusters < 1', () => {
    expect(medianCut([], 5)).toEqual([]);
    expect(medianCut([[1, 2, 3]], 0)).toEqual([]);
  });

  it('n=1 returns the mean colour', () => {
    expect(medianCut([[0, 0, 0], [100, 50, 20]], 1)).toEqual([[50, 25, 10]]);
  });

  it('separates two clear colour clusters', () => {
    const out = medianCut(mix(), 2);
    expect(out).toHaveLength(2);
    expect(out).toContainEqual([250, 10, 10]);
    expect(out).toContainEqual([10, 10, 250]);
  });

  it('is deterministic', () => {
    expect(medianCut(mix(), 4)).toEqual(medianCut(mix(), 4));
  });
});

describe('extractDesignPalette', () => {
  const darks = (): RGBColor[] => [
    ...Array.from({ length: 200 }, (): RGBColor => [8, 9, 10]),
    ...Array.from({ length: 200 }, (): RGBColor => [10, 10, 12]),
    ...Array.from({ length: 200 }, (): RGBColor => [12, 12, 14]),
    ...Array.from({ length: 200 }, (): RGBColor => [9, 11, 13]),
    ...Array.from({ length: 200 }, (): RGBColor => [14, 13, 11]),
  ];

  it('returns empty palettes for empty input', () => {
    expect(extractDesignPalette([])).toEqual({ surfaces: [], accents: [] });
  });

  it('collapses five near-identical darks into one surface', () => {
    const { surfaces, accents } = extractDesignPalette(darks());
    expect(surfaces).toHaveLength(1);
    expect(accents).toEqual([]);
  });

  it('returns a tiny saturated patch on a dark field as an accent', () => {
    const px = [...darks(), ...Array.from({ length: 5 }, (): RGBColor => [90, 80, 240])];
    const { surfaces, accents } = extractDesignPalette(px);
    expect(surfaces[0]).toEqual([8, 9, 10]);
    expect(accents).toEqual([[90, 80, 240]]);
  });

  it('ignores a saturated speck below the noise floor', () => {
    const px = [...darks(), ...Array.from({ length: 5 }, (): RGBColor => [90, 80, 240])];
    const big = [...px, ...Array.from({ length: 20000 }, (): RGBColor => [9, 10, 11])];
    expect(extractDesignPalette(big).accents).toEqual([]);
  });

  it('finds no accents on a greyscale image', () => {
    const grey = Array.from({ length: 1000 }, (_, i): RGBColor => { const v = (i * 7) % 256; return [v, v, v]; });
    expect(extractDesignPalette(grey).accents).toEqual([]);
  });

  it('is deterministic and returns integer channels', () => {
    const px = [...darks(), ...Array.from({ length: 5 }, (): RGBColor => [90, 80, 240])];
    const a = extractDesignPalette(px);
    expect(extractDesignPalette(px)).toEqual(a);
    for (const c of [...a.surfaces, ...a.accents]) for (const v of c) expect(Number.isInteger(v)).toBe(true);
  });
});
