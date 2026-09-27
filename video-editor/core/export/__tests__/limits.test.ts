import { describe, it, expect } from 'vitest';
import { evenDimensions } from '../limits';

describe('evenDimensions', () => {
  it('leaves already-even dimensions unchanged', () => {
    expect(evenDimensions(1920, 1080)).toEqual({ width: 1920, height: 1080 });
  });

  it('rounds odd dimensions to the nearest even number', () => {
    expect(evenDimensions(1921, 1079)).toEqual({ width: 1922, height: 1080 });
  });

  it('never produces less than 2px on either edge', () => {
    expect(evenDimensions(1, 1)).toEqual({ width: 2, height: 2 });
  });
});
