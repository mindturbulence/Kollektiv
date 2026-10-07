import { describe, it, expect } from 'vitest';
import { deriveRecipeTokens } from './designRecipeTokens';

const palette = (colors: unknown) => deriveRecipeTokens({ colors }).palette;
const fonts = (typography: unknown) => deriveRecipeTokens({ typography }).fonts;

describe('deriveRecipeTokens palette', () => {
  it('normalises 3/4/6/8-digit hex to lowercase #rrggbb, dropping alpha', () => {
    expect(palette({ a: '#FA0', b: '#1234', c: '#AABBCC', d: '#11223344' })).toEqual(['#ffaa00', '#112233', '#aabbcc']);
    expect(palette({ a: '#FA0' })).toEqual(['#ffaa00']);
    expect(palette({ a: '#f0a8' })).toEqual(['#ff00aa']);
    expect(palette({ a: '#AABBCCDD' })).toEqual(['#aabbcc']);
    expect(palette({ a: '  #abc  ' })).toEqual(['#aabbcc']);
  });

  it('rejects anything that is not a CSS hex colour', () => {
    expect(palette({ a: 'red', b: '#12', c: '#12345', d: '#1234567', e: '#12345678f', f: '#ggg', g: 'rgb(0,0,0)', h: 12, i: null, j: ['#fff'], k: { v: '#fff' }, l: '' })).toEqual([]);
  });

  it('orders by role priority, then remaining keys in insertion order', () => {
    expect(
      palette({ zeta: '#000001', border: '#000002', text: '#000003', Accent: '#000004', primary: '#000005', alpha: '#000006' }),
    ).toEqual(['#000004', '#000005', '#000003', '#000002', '#000001']);
  });

  it('does not treat accent-contrast as accent', () => {
    expect(palette({ 'accent-contrast': '#ffffff', accent: '#ff0000', primary: '#0000ff' })).toEqual(['#ff0000', '#0000ff', '#ffffff']);
  });

  it('de-duplicates after normalisation and caps at 5', () => {
    expect(palette({ a: '#fff', b: '#FFFFFF', c: '#ffffffff' })).toEqual(['#ffffff']);
    const many = Object.fromEntries(Array.from({ length: 9 }, (_, i) => [`c${i}`, `#00000${i}`]));
    expect(palette(many)).toEqual(['#000000', '#000001', '#000002', '#000003', '#000004']);
  });

  it('skips invalid values without shifting valid ones out of the cap', () => {
    expect(palette({ accent: 'nope', primary: '#111111' })).toEqual(['#111111']);
  });

  it('returns [] for non-object colors', () => {
    for (const colors of [undefined, null, 5, 'x', ['#fff'], true]) expect(palette(colors)).toEqual([]);
  });
});

describe('deriveRecipeTokens fonts', () => {
  it('uses the first family of the stack, strips quotes, and appends the px size', () => {
    expect(fonts({ display: { fontFamily: '"Inter", system-ui, sans-serif', size: 56 } })).toEqual(['Inter / 56px']);
    expect(fonts({ display: { fontFamily: "'Playfair Display', serif", size: '56' } })).toEqual(['Playfair Display / 56px']);
    expect(fonts({ display: { fontFamily: 'Inter', size: '56px' } })).toEqual(['Inter / 56px']);
    expect(fonts({ display: { fontFamily: 'Inter', size: ' 12.5PX ' } })).toEqual(['Inter / 12.5px']);
  });

  it('uses just the family when the size is missing or unusable', () => {
    for (const size of [undefined, null, '', 'big', '2rem', 0, -4, NaN, {}]) {
      expect(fonts({ display: { fontFamily: 'Inter', size } })).toEqual(['Inter']);
    }
  });

  it('skips roles without a usable family', () => {
    expect(fonts({ display: { size: 56 }, heading: { fontFamily: '', size: 32 }, body: { fontFamily: 7 }, label: 'Inter' })).toEqual([]);
    expect(fonts({ display: { fontFamily: ' , serif', size: 56 }, body: { fontFamily: 'Lora', size: 16 } })).toEqual(['Lora / 16px']);
  });

  it('prefers display then body, de-duplicates identical chips, and caps at 2', () => {
    const all = {
      label: { fontFamily: 'Mono', size: 12 },
      heading: { fontFamily: 'Serif', size: 32 },
      body: { fontFamily: 'Sans', size: 16 },
      display: { fontFamily: 'Serif', size: 56 },
    };
    expect(fonts(all)).toEqual(['Serif / 56px', 'Sans / 16px']);
    expect(fonts({ display: { fontFamily: 'Inter', size: 16 }, body: { fontFamily: 'Inter', size: 16 }, heading: { fontFamily: 'Inter', size: 32 } })).toEqual([
      'Inter / 16px',
      'Inter / 32px',
    ]);
  });

  it('returns [] for non-object typography', () => {
    for (const typography of [undefined, null, 5, 'x', [{ fontFamily: 'Inter' }]]) expect(fonts(typography)).toEqual([]);
  });
});

describe('deriveRecipeTokens robustness', () => {
  it('never throws and returns empty lists for garbage front matter', () => {
    const garbage: unknown[] = [{}, null, undefined, 1, 'x', [], { colors: 1, typography: 2 }, { colors: { a: { b: { c: 1 } } }, typography: { display: [] } }];
    for (const g of garbage) {
      // deliberately outside the declared parameter type
      expect(deriveRecipeTokens(g as Record<string, unknown>)).toEqual({ palette: [], fonts: [] });
    }
  });

  it('derives both fields from one front matter', () => {
    expect(deriveRecipeTokens({ colors: { primary: '#fff' }, typography: { display: { fontFamily: 'Inter', size: 56 } } })).toEqual({
      palette: ['#ffffff'],
      fonts: ['Inter / 56px'],
    });
  });
});
