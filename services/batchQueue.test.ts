import { describe, it, expect, vi } from 'vitest';
import { runBatch } from './batchQueue';

describe('runBatch', () => {
  it('runs every item and reports completion', async () => {
    const op = vi.fn(async (n: number) => n * 2);
    const { promise } = runBatch([1, 2, 3], op);
    const result = await promise;
    expect(result.completed).toBe(3);
    expect(result.failed).toBe(0);
    expect(result.results.map(r => r.output)).toEqual([2, 4, 6]);
  });

  it('continues past a failing item', async () => {
    const op = async (n: number) => {
      if (n === 2) throw new Error('boom');
      return n;
    };
    const result = await runBatch([1, 2, 3], op).promise;
    expect(result.completed).toBe(2);
    expect(result.failed).toBe(1);
    expect(result.results[1].status).toBe('failed');
    expect(result.results[1].error).toBe('boom');
    expect(result.results[2].status).toBe('done');
  });

  it('reports progress per item', async () => {
    const onProgress = vi.fn();
    await runBatch([1, 2], async n => n, onProgress).promise;
    expect(onProgress).toHaveBeenCalledTimes(2);
    expect(onProgress.mock.calls[0][1]).toBe(1);
    expect(onProgress.mock.calls[1][1]).toBe(2);
    expect(onProgress.mock.calls[0][2]).toBe(2);
  });

  it('stops before the next item when cancelled and preserves completed results', async () => {
    const handle = runBatch([1, 2, 3], async (n, _i, cancelBatch) => {
      if (n === 1) cancelBatch();
      return n;
    });
    const result = await handle.promise;
    expect(result.cancelled).toBe(true);
    expect(result.completed).toBe(1);
    expect(result.results[1].status).toBe('cancelled');
    expect(result.results[2].status).toBe('cancelled');
  });

  it('runs items strictly in order', async () => {
    const order: number[] = [];
    await runBatch([1, 2, 3], async n => { order.push(n); }).promise;
    expect(order).toEqual([1, 2, 3]);
  });

  it('handles an empty item list', async () => {
    const result = await runBatch([], async () => {}).promise;
    expect(result.completed).toBe(0);
    expect(result.results).toEqual([]);
  });

  it('stringifies a non-Error throw', async () => {
    const result = await runBatch([1], async () => { throw 'plain string'; }).promise;
    expect(result.results[0].error).toContain('plain string');
  });
});
