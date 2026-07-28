/**
 * Sequential batch queue.
 *
 * ponytail: sequential on purpose. Parallel calls to one provider trip rate
 * limits, and executionEngine.ts:11-13 made the same call for the same
 * reason. Add concurrency only when a measured run proves it is the
 * bottleneck and the provider tolerates it.
 *
 * Deliberately knows nothing about prompts, gallery items, or providers —
 * batchOperations.ts supplies the operation.
 */

export type ItemStatus = 'pending' | 'running' | 'done' | 'failed' | 'cancelled';

export interface ItemResult<T> {
  index: number;
  input: T;
  status: ItemStatus;
  output?: any;
  error?: string;
  ms: number;
}

export interface BatchResult<T> {
  results: ItemResult<T>[];
  completed: number;
  failed: number;
  cancelled: boolean;
  totalMs: number;
}

export interface BatchHandle<T> {
  promise: Promise<BatchResult<T>>;
  cancel: () => void;
}

export function runBatch<T>(
  items: T[],
  op: (item: T, index: number, cancelBatch: () => void) => Promise<any>,
  onProgress?: (result: ItemResult<T>, doneCount: number, total: number) => void,
): BatchHandle<T> {
  let cancelled = false;
  const cancel = () => { cancelled = true; };

  const promise = (async (): Promise<BatchResult<T>> => {
    const started = performance.now();
    const results: ItemResult<T>[] = [];
    let completed = 0, failed = 0;

    for (let i = 0; i < items.length; i++) {
      if (cancelled) {
        results.push({ index: i, input: items[i], status: 'cancelled', ms: 0 });
        continue;
      }
      const itemStart = performance.now();
      let result: ItemResult<T>;
      try {
        const output = await op(items[i], i, cancel);
        result = { index: i, input: items[i], status: 'done', output, ms: performance.now() - itemStart };
        completed++;
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        result = { index: i, input: items[i], status: 'failed', error: message, ms: performance.now() - itemStart };
        failed++;
      }
      results.push(result);
      onProgress?.(result, completed + failed, items.length);
    }

    return { results, completed, failed, cancelled, totalMs: performance.now() - started };
  })();

  return { promise, cancel };
}
