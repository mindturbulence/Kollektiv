import { describe, it, expect } from 'vitest';
import { docToLayer } from '../geometry/docToLayer';
import type { LayerTransform } from '../types';

function makeTransform(overrides: Partial<LayerTransform> = {}): LayerTransform {
  return {
    origin: { x: 0, y: 0 },
    size: { width: 100, height: 100 },
    rotation: 0,
    flipH: false,
    flipV: false,
    ...overrides,
  };
}

const INTRINSIC = { intrinsicWidth: 100, intrinsicHeight: 100 };

describe('docToLayer', () => {
  it('is identity when the layer is untransformed', () => {
    const ctx = { transform: makeTransform(), ...INTRINSIC };
    expect(docToLayer(0, 0, ctx)).toEqual({ x: 0, y: 0 });
    expect(docToLayer(50, 50, ctx)).toEqual({ x: 50, y: 50 });
    expect(docToLayer(99.5, 10, ctx)).toEqual({ x: 99.5, y: 10 });
  });

  it('subtracts the layer origin (moved layer)', () => {
    const ctx = { transform: makeTransform({ origin: { x: 200, y: 150 } }), ...INTRINSIC };
    // Layer spans (200..300, 150..250) in doc space. A click at (275,225) is
    // 75px right, 75px down of the origin → bitmap (75,75), not the raw coords.
    expect(docToLayer(275, 225, ctx)).toEqual({ x: 75, y: 75 });
    // The exclusive doc-space edges map to the exclusive bitmap edges.
    expect(docToLayer(250, 250, ctx)).toBeNull();
    // A doc point inside the doc but outside the moved layer is not paintable.
    expect(docToLayer(100, 100, ctx)).toBeNull();
  });

  it('scales doc coords by intrinsic/size (resized layer)', () => {
    // Layer displayed at 200×200 but intrinsic bitmap is 100×100.
    const ctx = {
      transform: makeTransform({ size: { width: 200, height: 200 } }),
      intrinsicWidth: 100,
      intrinsicHeight: 100,
    };
    expect(docToLayer(100, 50, ctx)).toEqual({ x: 50, y: 25 });
  });

  it('un-rotates 90° so the stamp lands where the user clicked', () => {
    // Layer rotated 90° around its centre (50,50). With y-down screen coords,
    // bitmap-space (+x) points down in doc space after rotation, so the doc
    // point (75,25) — up-right of centre — comes from bitmap (25,25).
    const ctx = { transform: makeTransform({ rotation: 90 }), ...INTRINSIC };
    const result = docToLayer(75, 25, ctx);
    expect(result).not.toBeNull();
    expect(result!.x).toBeCloseTo(25, 5);
    expect(result!.y).toBeCloseTo(25, 5);
    // Round trip: docToLayer(75,25) → bitmap (25,25); the forward transform of
    // bitmap (25,25) is doc (75,25). The centre maps to itself.
    const centre = docToLayer(50, 50, ctx);
    expect(centre!.x).toBeCloseTo(50, 5);
    expect(centre!.y).toBeCloseTo(50, 5);
  });

  it('un-rotates 45° preserving distance from centre', () => {
    const ctx = { transform: makeTransform({ rotation: 45 }), ...INTRINSIC };
    // Centre point maps to itself under any rotation.
    const centre = docToLayer(50, 50, ctx);
    expect(centre!.x).toBeCloseTo(50, 5);
    expect(centre!.y).toBeCloseTo(50, 5);
    // A point 10px right of centre in doc space, on a 45°-rotated layer, is
    // 10px from centre along the un-rotated axis.
    const p = docToLayer(60, 50, ctx);
    const dx = p!.x - 50;
    const dy = p!.y - 50;
    expect(Math.hypot(dx, dy)).toBeCloseTo(10, 5);
  });

  it('un-flips horizontally and vertically', () => {
    const flipH = { transform: makeTransform({ flipH: true }), ...INTRINSIC };
    expect(docToLayer(30, 40, flipH)).toEqual({ x: 70, y: 40 });

    const flipV = { transform: makeTransform({ flipV: true }), ...INTRINSIC };
    expect(docToLayer(30, 40, flipV)).toEqual({ x: 30, y: 60 });
  });

  it('returns null for points outside the layer bounds', () => {
    const ctx = { transform: makeTransform(), ...INTRINSIC };
    expect(docToLayer(-1, 50, ctx)).toBeNull();
    expect(docToLayer(50, 120, ctx)).toBeNull();
    expect(docToLayer(100, 50, ctx)).toBeNull();
  });

  it('returns null for degenerate zero-size transforms', () => {
    const ctx = { transform: makeTransform({ size: { width: 0, height: 0 } }), ...INTRINSIC };
    expect(docToLayer(50, 50, ctx)).toBeNull();
  });

  it('handles the full C1 scenario: crop + move + scale together', () => {
    // After a crop the layer sits at origin (−200,−150), displayed 100×100 from
    // a 50×50 intrinsic bitmap (2× upscale). Layer spans (−200..−100, −150..−50).
    const ctx = {
      transform: makeTransform({
        origin: { x: -200, y: -150 },
        size: { width: 100, height: 100 },
      }),
      intrinsicWidth: 50,
      intrinsicHeight: 50,
    };
    // Click at the layer's centre (−150,−100) → bitmap centre (25,25).
    expect(docToLayer(-150, -100, ctx)).toEqual({ x: 25, y: 25 });
    // Click at the layer's bottom-right doc corner (−100,−50) → bitmap (50,50)
    // is exclusive-boundary; one pixel inside lands at (49,49).
    expect(docToLayer(-100.5, -50.5, ctx)).toEqual({ x: 49.75, y: 49.75 });
    // A doc click at (50,50) is far outside the moved layer.
    expect(docToLayer(50, 50, ctx)).toBeNull();
  });
});
