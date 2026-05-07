/**
 * Auth state for Valley Croft Farm Management System.
 * Role is read from decoded JWT (admin, ceo, finance, employee).
 */

import { createContext, useContext, useMemo, useState, useCallback, useEffect } from 'react';
import { me as getMe } from '@/api/auth';

const TOKEN_KEY = 'token';

function parseJwt(token) {
  try {
    const base64Url = token.split('.')[1];
    const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
    const json = decodeURIComponent(
      atob(base64)
        .split('')
        .map((c) => '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2))
        .join('')
    );
    return JSON.parse(json);
  } catch {
    return null;
  }
}

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [token, setTokenState] = useState(() => localStorage.getItem(TOKEN_KEY));
  const [meUser, setMeUser] = useState(null);

  const jwtUser = useMemo(() => {
    if (!token) return null;
    const payload = parseJwt(token);
    if (!payload) return null;
    return {
      sub: payload.sub,
      role: payload.role ?? payload.role_id ?? null,
      email: payload.email ?? payload.sub,
      exp: payload.exp,
    };
  }, [token]);

  useEffect(() => {
    let cancelled = false;

    async function run() {
      if (!token) {
        setMeUser(null);
        return;
      }
      try {
        const res = await getMe();
        const data = res?.data ?? res;
        if (!cancelled) setMeUser(data && typeof data === 'object' ? data : null);
      } catch {
        // Keep JWT-derived user as fallback if /me fails
        if (!cancelled) setMeUser(null);
      }
    }

    run();
    return () => {
      cancelled = true;
    };
  }, [token]);

  const user = useMemo(() => {
    if (!jwtUser && !meUser) return null;
    // Prefer server profile; fall back to JWT fields
    return {
      ...(jwtUser || {}),
      ...(meUser || {}),
      role: (meUser?.role ?? jwtUser?.role ?? null),
      email: (meUser?.email ?? jwtUser?.email ?? null),
    };
  }, [jwtUser, meUser]);

  const login = useCallback((newToken) => {
    localStorage.setItem(TOKEN_KEY, newToken);
    setTokenState(newToken);
  }, []);

  const logout = useCallback(() => {
    localStorage.removeItem(TOKEN_KEY);
    setTokenState(null);
    setMeUser(null);
  }, []);

  const value = useMemo(
    () => ({
      token,
      user,
      isAuthenticated: !!token && !!user?.role,
      login,
      logout,
    }),
    [token, user, login, logout]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
