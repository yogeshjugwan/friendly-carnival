'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import type { PublicUser, UserSettings } from '@rc/shared';
import { loadSettings, storeSettings } from './settings';
import { setSessionToken } from './socket';

const API = process.env.NEXT_PUBLIC_SIGNALING_URL ?? 'http://localhost:4100';
const TOKEN_KEY = 'rc.session';

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}

export async function api<T>(path: string, body?: unknown, token?: string | null): Promise<T> {
  let res: Response;
  try {
    res = await fetch(API + path, {
      method: body === undefined ? 'GET' : 'POST',
      headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch {
    // The free server sleeps when idle; the first request can take ~50 s.
    throw new ApiError('Could not reach the server. It may be waking up — try again in a moment.', 0);
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new ApiError((data as { error?: string }).error ?? `Request failed (${res.status})`, res.status);
  return data as T;
}

interface AuthState {
  user: PublicUser | null;
  token: string | null;
  /** True until the stored session has been checked. */
  loading: boolean;
  signup: (email: string, password: string) => Promise<void>;
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  /** Saves to the account when logged in, and always to this browser. */
  saveSettings: (settings: UserSettings) => Promise<void>;
  refresh: () => Promise<void>;
  forget: () => void;
}

const AuthContext = createContext<AuthState | null>(null);

const readToken = () => {
  try {
    return window.localStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
};
const writeToken = (token: string | null) => {
  try {
    if (token) window.localStorage.setItem(TOKEN_KEY, token);
    else window.localStorage.removeItem(TOKEN_KEY);
  } catch {
    /* ignore */
  }
};

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<PublicUser | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const adopt = useCallback((t: string | null, u: PublicUser | null) => {
    writeToken(t);
    setSessionToken(t);
    setToken(t);
    setUser(u);
    // The account is the source of truth for a logged-in user's preferences.
    if (u) storeSettings(u.settings);
  }, []);

  const forget = useCallback(() => adopt(null, null), [adopt]);

  useEffect(() => {
    const stored = readToken();
    if (!stored) {
      setLoading(false);
      return;
    }
    setSessionToken(stored);
    api<PublicUser>('/auth/me', undefined, stored)
      .then((u) => adopt(stored, u))
      .catch((e) => {
        // Only drop the session when the server says it is invalid, not when it is asleep.
        if (e instanceof ApiError && e.status === 401) adopt(null, null);
        else setToken(stored);
      })
      .finally(() => setLoading(false));
  }, [adopt]);

  const value = useMemo<AuthState>(
    () => ({
      user,
      token,
      loading,
      signup: async (email, password) => {
        const res = await api<{ token: string; user: PublicUser }>('/auth/signup', { email, password });
        // Keep the preferences the guest already chose.
        const local = loadSettings();
        const merged = await api<PublicUser>('/auth/settings', { settings: local }, res.token).catch(() => res.user);
        adopt(res.token, merged);
      },
      login: async (email, password) => {
        const res = await api<{ token: string; user: PublicUser }>('/auth/login', { email, password });
        adopt(res.token, res.user);
      },
      logout: async () => {
        await api('/auth/logout', {}, token).catch(() => undefined);
        adopt(null, null);
      },
      saveSettings: async (settings) => {
        storeSettings(settings);
        if (token) setUser(await api<PublicUser>('/auth/settings', { settings }, token));
      },
      refresh: async () => {
        if (token) setUser(await api<PublicUser>('/auth/me', undefined, token));
      },
      forget,
    }),
    [user, token, loading, adopt, forget],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>');
  return ctx;
}
