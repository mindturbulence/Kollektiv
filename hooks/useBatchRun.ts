import { useState, useRef, useCallback, useEffect } from 'react';
import { runBatch, type ItemResult, type BatchResult } from '../services/batchQueue';
import { getOperation } from '../services/batchOperations';
import type { LLMSettings } from '../types';

export interface BatchRunState {
  running: boolean;
  doneCount: number;
  total: number;
  results: ItemResult<any>[];
  summary: BatchResult<any> | null;
}

/** Module-level handle so navigation does not cancel the run. */
let activeHandle: { cancel: () => void } | null = null;

export function useBatchRun(): {
  state: BatchRunState;
  start: (operationId: string, items: any[], settings: LLMSettings) => Promise<void>;
  cancel: () => void;
  reset: () => void;
} {
  const [state, setState] = useState<BatchRunState>({
    running: false,
    doneCount: 0,
    total: 0,
    results: [],
    summary: null,
  });
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; };
  }, []);

  const start = useCallback(async (operationId: string, items: any[], settings: LLMSettings) => {
    // Re-entrant guard: module-level handle is set synchronously
    // before any await, so this check catches concurrent calls.
    if (activeHandle) {
      console.warn('[useBatchRun] start() ignored — batch already running');
      return;
    }

    const op = getOperation(operationId);
    if (!op) return;

    setState({
      running: true,
      doneCount: 0,
      total: items.length,
      results: [],
      summary: null,
    });

    const handle = runBatch(
      items,
      async (item, _i, _cancelBatch) => op.run(item, settings),
      (result, doneCount, _total) => {
        if (!mounted.current) return;
        setState(prev => ({
          ...prev,
          doneCount,
          results: [...prev.results, result],
        }));
      },
    );

    activeHandle = handle;

    const summary = await handle.promise;
    activeHandle = null;

    if (mounted.current) {
      setState({
        running: false,
        doneCount: summary.completed,
        total: items.length,
        results: summary.results,
        summary,
      });
    }
  }, []);

  const cancel = useCallback(() => {
    activeHandle?.cancel();
  }, []);

  const reset = useCallback(() => {
    setState({ running: false, doneCount: 0, total: 0, results: [], summary: null });
  }, []);

  return { state, start, cancel, reset };
}
