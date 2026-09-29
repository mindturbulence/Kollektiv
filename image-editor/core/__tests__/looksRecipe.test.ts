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
        { kind: 'from-a-newer-build', threshold: 0.8 },
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

describe('varyRecipe', () => {
  it('is deterministic per seed, stays in range and keeps structure', async () => {
    const { varyRecipe } = await import('../looks/randomize');
    const { BUILTIN_LOOKS } = await import('../looks/builtins');
    const base = BUILTIN_LOOKS.find(l => l.key === 'expired-film')!.build();
    const a = varyRecipe(base, 42), b = varyRecipe(base, 42), c = varyRecipe(base, 43);
    expect(a).toEqual(b);
    expect(a).not.toEqual(c);
    expect(a.components.map(x => x.kind)).toEqual(base.components.map(x => x.kind));
    // Varied recipes are still valid recipes (parseRecipe clamps nothing away).
    expect(parseRecipe(JSON.parse(JSON.stringify(a)))).toEqual(a);
  });

  it('no built-in look carries a duplicate component kind', async () => {
    const { BUILTIN_LOOKS } = await import('../looks/builtins');
    for (const l of BUILTIN_LOOKS) {
      const kinds = l.build().components.map(c => c.kind);
      expect(new Set(kinds).size, l.key).toBe(kinds.length);
    }
  });
});

describe('hsl component', () => {
  it('parses to exactly 8 clamped bands', () => {
    const r = parseRecipe({ formatVersion: LOOK_FORMAT_VERSION, components: [{ kind: 'hsl', bands: [[90, -5, 0.5], 'x', [1, 1, 1]] }] })!;
    const hsl = r.components[0] as Extract<typeof r.components[number], { kind: 'hsl' }>;
    expect(hsl.bands).toHaveLength(8);
    expect(hsl.bands[0]).toEqual([30, -1, 0.5]);
    expect(hsl.bands[1]).toEqual([0, 0, 0]);
    expect(hsl.bands[2]).toEqual([1, 1, 1]);
  });
});

describe('texture components', () => {
  it('parses paper and dust with clamping and defaults', () => {
    const r = parseRecipe({ formatVersion: LOOK_FORMAT_VERSION, components: [
      { kind: 'paper', amount: 9, scale: 0 }, { kind: 'dust', scratches: 0.5 },
    ] })!;
    expect(r.components).toEqual([
      { kind: 'paper', enabled: true, amount: 1, scale: 1 },
      { kind: 'dust', enabled: true, amount: 0.4, scratches: 0.5, seed: 1 },
    ]);
  });
});

describe('texture component', () => {
  it('parses a texture with a known blend, defaults an unknown one, drops one without an asset', () => {
    const r = parseRecipe({ formatVersion: LOOK_FORMAT_VERSION, components: [
      { kind: 'texture', assetId: 'user:abc', blend: 'screen', amount: 3 },
      { kind: 'texture', assetId: 'user:def', blend: 'hard-mix' },
      { kind: 'texture', blend: 'overlay' },
    ] })!;
    expect(r.components).toEqual([
      { kind: 'texture', enabled: true, assetId: 'user:abc', blend: 'screen', amount: 1 },
      { kind: 'texture', enabled: true, assetId: 'user:def', blend: 'overlay', amount: 0.6 },
    ]);
  });

  it('develop gains highlights and shadows, clamped, defaulting to 0 for older recipes', () => {
    const r = parseRecipe({ formatVersion: LOOK_FORMAT_VERSION, components: [{ kind: 'develop', exposure: 1, highlights: -5 }] })!;
    expect(r.components[0]).toMatchObject({ exposure: 1, highlights: -1, shadows: 0 });
  });
});
