import React, { createContext, useContext, useCallback, useEffect, useMemo, useState } from 'react';
import { mcLogin, mcLogout, mcGetMe, MissionControlApiError } from '../services/missionControlApi';
import type { McCurrentUser } from '../services/missionControlTypes';

export type McAuthStatus = 'unknown' | 'authed' | 'anonymous';

interface MissionControlContextValue {
  status: McAuthStatus;
  me: McCurrentUser | null;
  login: (username: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  checkSession: () => Promise<void>;
  /** Last login error message, cleared on next attempt. */
  loginError: string | null;
}

const MissionControlContext = createContext<MissionControlContextValue | undefined>(undefined);

export const MissionControlProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [status, setStatus] = useState<McAuthStatus>('unknown');
  const [me, setMe] = useState<McCurrentUser | null>(null);
  const [loginError, setLoginError] = useState<string | null>(null);

  const checkSession = useCallback(async () => {
    try {
      const res = await mcGetMe();
      setMe(res.user);
      setStatus('authed');
    } catch (err) {
      if (err instanceof MissionControlApiError && err.code === 'UNAUTHENTICATED') {
        setMe(null);
        setStatus('anonymous');
      } else if (err instanceof MissionControlApiError && err.code === 'FORBIDDEN') {
        setMe(null);
        setStatus('anonymous');
        setLoginError('Your account does not have access to Mission Control.');
      } else {
        // Network/proxy unreachable: surface as anonymous so the login view
        // renders with an explanatory error rather than hanging on 'unknown'.
        setMe(null);
        setStatus('anonymous');
        setLoginError('Mission Control is unreachable. Start it with `pnpm dev:mc` (or `pnpm dev:all`).');
      }
    }
  }, []);

  const login = useCallback(async (username: string, password: string) => {
    setLoginError(null);
    try {
      const user = await mcLogin(username, password);
      setMe(user);
      setStatus('authed');
    } catch (err) {
      if (err instanceof MissionControlApiError) {
        setLoginError(err.code === 'NETWORK_ERROR'
          ? 'Mission Control is unreachable. Start it with `pnpm dev:mc` (or `pnpm dev:all`).'
          : err.message || 'Invalid credentials');
      } else {
        setLoginError('Login failed');
      }
      setStatus('anonymous');
      throw err;
    }
  }, []);

  const logout = useCallback(async () => {
    try {
      await mcLogout();
    } finally {
      setMe(null);
      setStatus('anonymous');
    }
  }, []);

  // Any 401 anywhere (panel fetch or SSE auth-expired frame) flips the tab back
  // to the login view without a hard redirect away from the tab.
  useEffect(() => {
    const onAuthExpired = () => {
      setMe(null);
      setStatus('anonymous');
      setLoginError('Session expired — sign in again.');
    };
    window.addEventListener('mc:auth-expired', onAuthExpired);
    return () => window.removeEventListener('mc:auth-expired', onAuthExpired);
  }, []);

  const value = useMemo(
    () => ({ status, me, login, logout, checkSession, loginError }),
    [status, me, login, logout, checkSession, loginError],
  );

  return <MissionControlContext.Provider value={value}>{children}</MissionControlContext.Provider>;
};

export const useMissionControl = (): MissionControlContextValue => {
  const context = useContext(MissionControlContext);
  if (context === undefined) {
    throw new Error('useMissionControl must be used within a MissionControlProvider');
  }
  return context;
};
