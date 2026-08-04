/**
 * Mission Control native UI — API client.
 *
 * Same-origin fetch client for the vendored Mission Control fork's JSON API,
 * reached through Kollektiv's reverse proxy at `/mission-control/api/*`.
 * Mirrors `mission-control/src/lib/api-client.ts` contract: credentials
 * always sent, typed errors, 401 → UNAUTHENTICATED (the login gate listens).
 */

import type { McCurrentUser, McMeResponse } from './missionControlTypes';

const MC_API = '/mission-control/api';

export type MissionControlApiErrorCode =
  | 'UNAUTHENTICATED'
  | 'FORBIDDEN'
  | 'NOT_FOUND'
  | 'CLIENT_ERROR'
  | 'SERVER_ERROR'
  | 'NETWORK_ERROR'
  | 'PARSE_ERROR';

export class MissionControlApiError extends Error {
  readonly code: MissionControlApiErrorCode;
  readonly status: number;
  readonly payload?: unknown;

  constructor(code: MissionControlApiErrorCode, status: number, message: string, payload?: unknown) {
    super(message);
    this.name = 'MissionControlApiError';
    this.code = code;
    this.status = status;
    this.payload = payload;
  }
}

export async function mcFetch<T>(path: string, init: RequestInit = {}): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${MC_API}${path}`, { credentials: 'include', ...init });
  } catch {
    throw new MissionControlApiError('NETWORK_ERROR', 0, 'Mission Control unreachable');
  }

  if (res.status === 401) {
    // Let the login gate flip back to the login view on any mid-session 401.
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('mc:auth-expired'));
    }
    throw new MissionControlApiError('UNAUTHENTICATED', 401, 'Session expired');
  }
  if (res.status === 403) {
    throw new MissionControlApiError('FORBIDDEN', 403, await errorMessage(res, 'Forbidden'));
  }
  if (res.status === 404) {
    throw new MissionControlApiError('NOT_FOUND', 404, await errorMessage(res, 'Not found'));
  }
  if (!res.ok) {
    throw new MissionControlApiError(
      'SERVER_ERROR',
      res.status,
      await errorMessage(res, `Mission Control error ${res.status}`)
    );
  }

  try {
    return (await res.json()) as T;
  } catch {
    throw new MissionControlApiError('PARSE_ERROR', res.status, 'Invalid JSON response');
  }
}

/**
 * Read the server's `{ error: string }` payload when present, falling back to
 * a generic message. Mirrors mission-control's `api-client.ts` contract so
 * panels show actionable messages (e.g. "Config file not found") instead of
 * bare status names.
 */
async function errorMessage(res: Response, fallback: string): Promise<string> {
  try {
    const payload = (await res.json()) as { error?: unknown } | null;
    if (payload && typeof payload.error === 'string' && payload.error) {
      return payload.error;
    }
  } catch {
    // Body is not JSON — fall through to the generic message.
  }
  return fallback;
}

/** POST /api/auth/login — returns the authenticated user (cookie is set by the browser). */
export async function mcLogin(username: string, password: string): Promise<McCurrentUser> {
  const res = await fetch(`${MC_API}/auth/login`, {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password }),
  });
  if (res.status === 401) {
    throw new MissionControlApiError('UNAUTHENTICATED', 401, 'Invalid credentials');
  }
  if (!res.ok) {
    throw new MissionControlApiError('CLIENT_ERROR', res.status, 'Login failed');
  }
  const body = (await res.json()) as { user: McCurrentUser };
  return body.user;
}

export const mcLogout = () => mcFetch<{ ok: boolean }>('/auth/logout', { method: 'POST' });

export const mcGetMe = () => mcFetch<McMeResponse>('/auth/me');
