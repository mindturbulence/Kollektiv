import { describe, it, expect } from 'vitest';
import {
  generateExecutionMatrix,
  estimateJobTime,
  formatJobCountWarning,
} from './matrixGenerator';
import type { MatrixDefinition } from './matrixGenerator';

describe('generateExecutionMatrix', () => {
  it('produces the Cartesian product of all dimensions', () => {
    const def: MatrixDefinition = {
      prompts: ['a', 'b'],
      targetModels: ['m1', 'm2'],
      loraWeights: [0, 0.5],
      cfgScales: [7],
      samplers: ['euler'],
    };
    const result = generateExecutionMatrix(def);
    expect(result).toHaveLength(2 * 2 * 2 * 1 * 1);
  });

  it('each item has the correct shape', () => {
    const def: MatrixDefinition = {
      prompts: ['test'],
      targetModels: ['model'],
      loraWeights: [0.5],
      cfgScales: [7],
      samplers: ['euler'],
    };
    const result = generateExecutionMatrix(def);
    expect(result[0]).toEqual({
      prompt: 'test',
      model: 'model',
      loraWeight: 0.5,
      cfgScale: 7,
      sampler: 'euler',
    });
  });

  it('handles a single empty prompts array by using empty string default', () => {
    const def: MatrixDefinition = {
      prompts: [],
      targetModels: ['m1'],
      loraWeights: [],
      cfgScales: [],
      samplers: [],
    };
    const result = generateExecutionMatrix(def);
    expect(result).toHaveLength(1);
    expect(result[0].prompt).toBe('');
    expect(result[0].model).toBe('m1');
    expect(result[0].loraWeight).toBe(0);
    expect(result[0].cfgScale).toBe(7);
    expect(result[0].sampler).toBe('euler');
  });

  it('handles all empty arrays', () => {
    const def: MatrixDefinition = {
      prompts: [],
      targetModels: [],
      loraWeights: [],
      cfgScales: [],
      samplers: [],
    };
    const result = generateExecutionMatrix(def);
    expect(result).toHaveLength(1);
    expect(result[0]).toEqual({
      prompt: '',
      model: '',
      loraWeight: 0,
      cfgScale: 7,
      sampler: 'euler',
    });
  });

  it('produces the correct number: 5 prompts x 4 models x 3 CFG x 3 samplers = 180', () => {
    const def: MatrixDefinition = {
      prompts: ['p1', 'p2', 'p3', 'p4', 'p5'],
      targetModels: ['m1', 'm2', 'm3', 'm4'],
      loraWeights: [0, 0.5, 1],
      cfgScales: [5, 7, 9],
      samplers: ['euler', 'dpmpp_2m', 'uni_pc'],
    };
    const result = generateExecutionMatrix(def);
    expect(result).toHaveLength(5 * 4 * 3 * 3 * 3);
    expect(result).toHaveLength(540);
  });

  it('all items in the matrix are unique', () => {
    const def: MatrixDefinition = {
      prompts: ['a', 'b', 'c'],
      targetModels: ['m1', 'm2'],
      loraWeights: [0, 0.5],
      cfgScales: [7, 9],
      samplers: ['euler', 'dpmpp_2m'],
    };
    const result = generateExecutionMatrix(def);
    const serialized = result.map((r) => JSON.stringify(r));
    expect(new Set(serialized).size).toBe(serialized.length);
  });

  it('iterates in prompt-first order', () => {
    const def: MatrixDefinition = {
      prompts: ['p1', 'p2'],
      targetModels: ['m1', 'm2'],
      loraWeights: [0],
      cfgScales: [7],
      samplers: ['euler'],
    };
    const result = generateExecutionMatrix(def);
    expect(result[0].prompt).toBe('p1');
    expect(result[0].model).toBe('m1');
    // p1 loops over all models first, then p2
    expect(result[2].prompt).toBe('p2');
    expect(result[2].model).toBe('m1');
  });
});

describe('estimateJobTime', () => {
  it('returns seconds for < 60s', () => {
    expect(estimateJobTime(1, 30)).toBe('30s');
  });

  it('returns minutes and seconds when there is a remainder', () => {
    expect(estimateJobTime(3, 30)).toBe('1m 30s');
  });

  it('returns minutes only when seconds is 0', () => {
    expect(estimateJobTime(2, 30)).toBe('1m');
  });

  it('returns hours and minutes for large counts', () => {
    expect(estimateJobTime(200, 30)).toBe('1h 40m');
  });

  it('defaults to 30s per job', () => {
    expect(estimateJobTime(2)).toBe('1m');
  });

  it('handles zero jobs', () => {
    expect(estimateJobTime(0, 30)).toBe('0s');
  });
});

describe('formatJobCountWarning', () => {
  it('includes the job count and estimate', () => {
    const msg = formatJobCountWarning(180, 30);
    expect(msg).toContain('180 jobs');
    expect(msg).toContain('1h 30m');
    expect(msg).toContain('Proceed?');
  });

  it('accepts default seconds per job', () => {
    const msg = formatJobCountWarning(25);
    expect(msg).toContain('25 jobs');
    expect(msg).toContain('Proceed?');
  });
});
