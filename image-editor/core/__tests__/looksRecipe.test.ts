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
