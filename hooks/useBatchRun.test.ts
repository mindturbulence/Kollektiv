import { describe, it, expect, vi } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';

vi.mock('../services/batchOperations', () => ({
  getOperation: () => ({ id: 'x', label: 'X', inputKind: 'prompt', run: async (i: any) => i }),
}));

import { useBatchRun } from './useBatchRun';

describe('useBatchRun', () => {
  it('starts idle', () => {
    const { result } = renderHook(() => useBatchRun());
    expect(result.current.state.running).toBe(false);
    expect(result.current.state.total).toBe(0);
  });

  it('reports progress and finishes', async () => {
    const { result } = renderHook(() => useBatchRun());
    await act(async () => { await result.current.start('x', [1, 2, 3], {} as any); });
    await waitFor(() => expect(result.current.state.running).toBe(false));
    expect(result.current.state.summary?.completed).toBe(3);
  });

  it('rejects an unknown operation id', async () => {
    const { result } = renderHook(() => useBatchRun());
    await act(async () => { await result.current.start('missing', [1], {} as any); });
    expect(result.current.state.running).toBe(false);
  });

  it('resets back to idle', async () => {
    const { result } = renderHook(() => useBatchRun());
    await act(async () => { await result.current.start('x', [1], {} as any); });
    act(() => result.current.reset());
    expect(result.current.state.summary).toBeNull();
  });
});
