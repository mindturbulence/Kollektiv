import { describe, it, expect } from 'vitest';
import { parseCube } from '../looks/cube';
import { parseRecipe, makeRecipe, COMPONENT_DEFAULTS, LOOK_FORMAT_VERSION } from '../looks/recipe';

const identity2 = `TITLE "Identity"
# comment
LUT_3D_SIZE 2
0 0 0
1 0 0
0 1 0
1 1 0
0 0 1
1 0 1
0 1 1
1 1 1
`;

describe('parseCube', () => {
  it('reads size, title and red-fastest rows as RGBA', () => {
    const lut = parseCube(identity2);
    expect(lut.title).toBe('Identity');
    expect(lut.size).toBe(2);
    expect(lut.data.length).toBe(8 * 4);
    expect([...lut.data.slice(4, 8)]).toEqual([1, 0, 0, 1]);   // index 1 = r fastest
    expect([...lut.data.slice(8, 12)]).toEqual([0, 1, 0, 1]);
    expect(lut.domainMin).toEqual([0, 0, 0]);
    expect(lut.domainMax).toEqual([1, 1, 1]);
  });

  it('keeps DOMAIN_MIN/MAX for the lookup instead of rescaling the table', () => {
    const lut = parseCube(identity2.replace('LUT_3D_SIZE 2', 'DOMAIN_MIN 0 0 0\nDOMAIN_MAX 2 2 2\nLUT_3D_SIZE 2'));
    expect(lut.domainMax).toEqual([2, 2, 2]);
    expect([...lut.data.slice(4, 8)]).toEqual([1, 0, 0, 1]);
  });

  it('rejects 1D LUTs, a wrong row count and garbage', () => {
    expect(() => parseCube('LUT_1D_SIZE 4\n0 0 0')).toThrow(/1D/);
    expect(() => parseCube('LUT_3D_SIZE 2\n0 0 0')).toThrow(/needs 8 rows/);
    expect(() => parseCube('LUT_3D_SIZE 2\n' + 'a b c\n'.repeat(8))).toThrow(/non-numeric/);
    expect(() => parseCube('0 0 0')).toThrow(/LUT_3D_SIZE/);
  });
});

describe('parseRecipe', () => {
  it('round-trips a recipe made from defaults', () => {
    const r = makeRecipe('Warm', [COMPONENT_DEFAULTS.develop, { ...COMPONENT_DEFAULTS.grain, amount: 0.4 }]);
    expect(parseRecipe(JSON.parse(JSON.stringify(r)))).toEqual(r);
  });

  it('clamps numbers, drops unknown kinds and LUTs without an asset, defaults missing fields', () => {
    const r = parseRecipe({
      formatVersion: LOOK_FORMAT_VERSION, name: 'X',
      components: [
        { kind: 'develop', exposure: 99 },
        { kind: 'halation', threshold: 0.8 },
        { kind: 'lut', strength: 0.5 },
        { kind: 'fade', amount: -3, enabled: false },
        { kind: 'curve', rgb: [[1, 1], [0, 0.2], 'x'] },
      ],
    })!;
    expect(r.components.map(c => c.kind)).toEqual(['develop', 'fade', 'curve']);
    expect(r.components[0]).toMatchObject({ exposure: 3, contrast: 0 });
    expect(r.components[1]).toEqual({ kind: 'fade', enabled: false, amount: 0 });
    expect(r.components[2]).toMatchObject({ rgb: [[0, 0.2], [1, 1]] });
  });

  it('rejects another format version and non-objects', () => {
    expect(parseRecipe({ formatVersion: 2, components: [] })).toBeNull();
    expect(parseRecipe('nope')).toBeNull();
  });
});

describe('procedural LUTs and the built-in catalog', () => {
  it('samples every procedural look into an in-range 33³ table', async () => {
    const { PROC_LUTS, buildProcLut } = await import('../looks/procLuts');
    for (const name of Object.keys(PROC_LUTS)) {
      const lut = buildProcLut(name)!;
      expect(lut.size).toBe(33);
      expect(lut.data.length).toBe(33 ** 3 * 4);
      expect(lut.data.every(v => v >= 0 && v <= 1)).toBe(true);
    }
    expect(buildProcLut('nope')).toBeUndefined();
  });

  it('mono looks output grey for a saturated input', async () => {
    const { buildProcLut } = await import('../looks/procLuts');
    for (const name of ['soft-mono', 'hard-mono']) {
      const lut = buildProcLut(name, 2)!;
      const red = [...lut.data.slice(4, 7)];          // entry r=1,g=0,b=0
      expect(Math.max(...red) - Math.min(...red)).toBeLessThan(1e-6);
    }
  });

  it('every built-in look builds a valid recipe that survives parseRecipe', async () => {
    const { BUILTIN_LOOKS } = await import('../looks/builtins');
    for (const look of BUILTIN_LOOKS) {
      const r = look.build();
      expect(parseRecipe(JSON.parse(JSON.stringify(r)))).toEqual(r);
    }
    expect(new Set(BUILTIN_LOOKS.map(l => l.key)).size).toBe(BUILTIN_LOOKS.length);
  });

  it('resolves proc: LUTs synchronously and file: LUTs never synchronously', async () => {
    const { getLut } = await import('../looks/lutRegistry');
    expect(getLut('proc:sepia')?.size).toBe(33);
    const orig = globalThis.fetch;
    globalThis.fetch = (() => new Promise(() => {})) as typeof fetch; // never resolves
    expect(getLut('file:cold-vs-warm')).toBeUndefined();
    globalThis.fetch = orig;
  });
});
