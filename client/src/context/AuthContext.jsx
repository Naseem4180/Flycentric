import { useState, useEffect, useCallback, useRef } from 'react';
import {
  api, setTokens, loadTokens, setUnauthorizedHandler,
  setSessionExpiredHandler, setTokensRefreshedHandler,
} from '../api';
import AuthContext from './auth-context';

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(() => Boolean(localStorage.getItem('fc_access')));
  // True only when a silent refresh has already been tried and failed, so the
  // session really is over. Drives the "Session expired" modal instead of a
  // hard redirect that would throw away whatever the user was doing.
  const [sessionExpired, setSessionExpired] = useState(false);
  // Bumped whenever auth state settles into "signed in". Pages watch this to
  // re-fetch, which is what fixes the blank dashboard: previously a page could
  // mount and fire its requests before the token was in place, get nothing,
  // and never try again.
  const [authVersion, setAuthVersion] = useState(0);
  const userRef = useRef(null);

  useEffect(() => { userRef.current = user; }, [user]);

  const logout = useCallback(() => {
    const { refreshToken } = loadTokens();
    if (refreshToken) {
      api.post('/auth/logout', { refreshToken }, { auth: false }).catch(() => {});
    }
    setTokens(null, null);
    setUser(null);
    setSessionExpired(false);
  }, []);

  // Clears local state without calling the server. Used when the session has
  // already expired — the refresh token is dead, so /auth/logout would just
  // 401 again.
  const clearSession = useCallback(() => {
    setTokens(null, null);
    setUser(null);
  }, []);

  useEffect(() => {
    setUnauthorizedHandler(() => {
      setTokens(null, null);
      setUser(null);
    });
    setSessionExpiredHandler(() => {
      // Only worth showing the modal to someone who was actually signed in.
      if (userRef.current) setSessionExpired(true);
    });
    setTokensRefreshedHandler((refreshedUser) => {
      if (refreshedUser) setUser(refreshedUser);
      setSessionExpired(false);
    });
  }, []);

  useEffect(() => {
    const { accessToken, refreshToken } = loadTokens();
    if (!accessToken && !refreshToken) { setLoading(false); return undefined; }

    let active = true;
    // /auth/me transparently refreshes via the api layer when the stored
    // access token has already expired, so a returning user with a valid
    // refresh token is restored rather than bounced to the login screen.
    api.get('/auth/me')
      .then((d) => {
        if (!active) return;
        setUser(d.user);
        setAuthVersion((v) => v + 1);
      })
      .catch(() => { if (active) clearSession(); })
      .finally(() => { if (active) setLoading(false); });

    return () => { active = false; };
  }, [clearSession]);

  async function login(email, password) {
    const data = await api.post('/auth/login', { email, password }, { auth: false });
    // Tokens are set BEFORE user state, so any effect reacting to the user
    // becoming non-null already has a usable Authorization header.
    setTokens(data.accessToken, data.refreshToken);
    setUser(data.user);
    setSessionExpired(false);
    setAuthVersion((v) => v + 1);
    return data.user;
  }

  async function register(payload) {
    const data = await api.post('/auth/register', payload, { auth: false });
    setTokens(data.accessToken, data.refreshToken);
    setUser(data.user);
    setSessionExpired(false);
    setAuthVersion((v) => v + 1);
    return data.user;
  }

  // Used by the "Session expired" modal's sign-in-again action.
  function dismissExpired() {
    setSessionExpired(false);
    clearSession();
  }

  return (
    <AuthContext.Provider
      value={{ user, loading, login, register, logout, sessionExpired, dismissExpired, authVersion }}
    >
      {children}
    </AuthContext.Provider>
  );
}
