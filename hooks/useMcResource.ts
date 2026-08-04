import { useCallback, useEffect, useState } from 'react';
import { mcFetch, MissionControlApiError } from '../services/missionControlApi';

export interface McResourceState<T> {
  data: T | null;
  loading: boolean;
  error: string | null;
  /** Machine-readable code from MissionControlApiError (e.g. 'NOT_FOUND'), or null. */
  errorCode: string | null;
  refetch: () => void;
}

/**
 * Shared fetch hook for the native Mission Control panels.
 *
 * Wraps `mcFetch` with local loading/error state + manual refetch, matching the
 * plan's "no react-query; services layer + per-panel hooks" constraint. Panels
 * call `useMcResource<T>('/agents')` and render data/loading/error states.
 */
export function useMcResource<T>(path: string, deps: unknown[] = []): McResourceState<T> {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [errorCode, setErrorCode] = useState<string | null>(null);
  const [nonce, setNonce] = useState(0);

  const refetch = useCallback(() => setNonce((n) => n + 1), []);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    setErrorCode(null);

    mcFetch<T>(path)
      .then((res) => {
        if (cancelled) return;
        setData(res);
      })
      .catch((err) => {
        if (cancelled) return;
        if (err instanceof MissionControlApiError) {
          setError(err.message || `Mission Control error ${err.status}`);
          setErrorCode(err.code);
        } else {
          setError('Failed to load data');
          setErrorCode(null);
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [path, nonce, ...deps]);

  return { data, loading, error, errorCode, refetch };
}
