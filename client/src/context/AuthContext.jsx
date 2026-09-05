import { useState, useEffect, useCallback } from 'react';
import { api, setTokens, loadTokens, setUnauthorizedHandler } from '../api';
import AuthContext from './auth-context';

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(() => Boolean(localStorage.getItem('fc_access')));

  const logout = useCallback(() => {
    // Best-effort server-side revocation of the refresh token so it can't be
    // replayed to mint new access tokens after this device signs out. Local
    // state is always cleared regardless of whether the request succeeds —
    // a network hiccup here must never trap the user in a "signed in" UI.
    const { refreshToken } = loadTokens();
    if (refreshToken) {
      api.post('/auth/logout', { refreshToken }, { auth: false }).catch(() => {});
    }
    setTokens(null, null);
    setUser(null);
  }, []);

  useEffect(() => {
    setUnauthorizedHandler(logout);
    const { accessToken } = loadTokens();
    if (!accessToken) return undefined;

    let active = true;
    api.get('/auth/me')
      .then((d) => { if (active) setUser(d.user); })
      .catch(() => { if (active) logout(); })
      .finally(() => { if (active) setLoading(false); });

    return () => { active = false; };
  }, [logout]);

  async function login(email, password) {
    const data = await api.post('/auth/login', { email, password }, { auth: false });
    setTokens(data.accessToken, data.refreshToken);
    setUser(data.user);
    return data.user;
  }

  async function register(payload) {
    const data = await api.post('/auth/register', payload, { auth: false });
    setTokens(data.accessToken, data.refreshToken);
    setUser(data.user);
    return data.user;
  }

  return (
    <AuthContext.Provider value={{ user, loading, login, register, logout }}>
      {children}
    </AuthContext.Provider>
  );
}
