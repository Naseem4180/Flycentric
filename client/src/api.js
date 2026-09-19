// Local development uses the separate Express server. A deployed client uses
// same-origin /api by default, which works when the frontend host proxies that
// path to the deployed API. Set VITE_API_URL when the API has its own domain.
const configuredApiUrl = import.meta.env.VITE_API_URL?.trim().replace(/\/$/, '');
const isLocalHost = ['localhost', '127.0.0.1'].includes(window.location.hostname)
  || window.location.hostname.startsWith('192.168.')
  || window.location.hostname.startsWith('10.');
export const BASE_URL = configuredApiUrl
  || (isLocalHost ? `${window.location.protocol}//${window.location.hostname}:4000/api` : '/api');

let accessToken = typeof window !== 'undefined' ? localStorage.getItem('fc_access') : null;
let refreshToken = typeof window !== 'undefined' ? localStorage.getItem('fc_refresh') : null;
let onUnauthorized = () => {};
let onSessionExpired = () => {};
let onTokensRefreshed = () => {};
// A single in-flight refresh shared by every request that 401s at the same
// time. Without this, a dashboard that fires five parallel calls would kick
// off five refreshes and four of them would race/fail.
let refreshInFlight = null;
export function setTokens(access, refresh) {
  accessToken = access;
  refreshToken = refresh;
  if (access) localStorage.setItem('fc_access', access); else localStorage.removeItem('fc_access');
  if (refresh) localStorage.setItem('fc_refresh', refresh); else localStorage.removeItem('fc_refresh');
}

export function loadTokens() {
  accessToken = typeof window !== 'undefined' ? localStorage.getItem('fc_access') : null;
  refreshToken = typeof window !== 'undefined' ? localStorage.getItem('fc_refresh') : null;
  return { accessToken, refreshToken };
}

export function setUnauthorizedHandler(fn) {
  onUnauthorized = fn;
}

// Called only when a silent refresh has genuinely failed — i.e. the session
// really is over. The app shows a "Session expired" modal instead of yanking
// the user to /login mid-task.
export function setSessionExpiredHandler(fn) {
  onSessionExpired = fn;
}

export function setTokensRefreshedHandler(fn) {
  onTokensRefreshed = fn;
}

export function getAccessToken() {
  return accessToken;
}

// Silent token refresh. Exchanges the stored refresh token for a new access
// token in the background; the caller then retries its request once.
async function refreshAccessToken() {
  if (refreshInFlight) return refreshInFlight;
  const stored = refreshToken || (typeof window !== 'undefined' ? localStorage.getItem('fc_refresh') : null);
  if (!stored) return null;

  refreshInFlight = (async () => {
    try {
      const res = await fetch(`${BASE_URL}/auth/refresh`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refreshToken: stored }),
      });
      if (!res.ok) {
        // Only trigger hard session expiration if the refresh token itself is dead (401/403).
        // Temporary 5xx errors or network glitches should NOT kill user sessions.
        if (res.status === 401 || res.status === 403) {
          const isExamRoute = typeof window !== 'undefined' && (
            window.location.pathname.includes('/take-exam') ||
            window.location.pathname.includes('/exam')
          );
          if (!isExamRoute) {
            onSessionExpired();
            onUnauthorized();
          }
        }
        return null;
      }
      const data = await res.json();
      if (!data?.accessToken) return null;
      setTokens(data.accessToken, data.refreshToken || stored);
      onTokensRefreshed(data.user || null);
      return data.accessToken;
    } catch {
      // Network failure — do not force log out; return null so caller can decide
      return null;
    } finally {
      setTimeout(() => { refreshInFlight = null; }, 0);
    }
  })();

  return refreshInFlight;
}

async function fire(path, { method, body, isForm, auth }) {
  const headers = {};
  if (!isForm) headers['Content-Type'] = 'application/json';
  const token = accessToken || (typeof window !== 'undefined' ? localStorage.getItem('fc_access') : null);
  if (auth && token) headers['Authorization'] = `Bearer ${token}`;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 30000);

  try {
    return await fetch(`${BASE_URL}${path}`, {
      method,
      headers,
      body: body ? (isForm ? body : JSON.stringify(body)) : undefined,
      signal: controller.signal,
    });
  } catch (err) {
    if (err.name === 'AbortError') throw new Error('The server took too long to respond. Please try again.');
    throw err;
  } finally {
    clearTimeout(timeout);
  }
}

async function request(path, { method = 'GET', body, isForm = false, auth = true, silent = false, _retried = false } = {}) {
  let res = await fire(path, { method, body, isForm, auth });

  const isExamRoute = typeof window !== 'undefined' && (
    window.location.pathname.includes('/take-exam') ||
    window.location.pathname.includes('/exam')
  );

  // Graceful session handling. A 401 no longer means "log out immediately".
  // First try a silent refresh and replay the request once; only if that
  // fails do we treat the session as genuinely over.
  if (res.status === 401 && auth && !_retried) {
    const isAuthCall = path.startsWith('/auth/refresh') || path.startsWith('/auth/login');
    if (!isAuthCall) {
      const fresh = await refreshAccessToken();
      if (fresh) {
        return request(path, { method, body, isForm, auth, silent, _retried: true });
      }
    }
  } else if (res.status === 401 && auth && _retried) {
    if (!silent && !isExamRoute) {
      onSessionExpired();
      onUnauthorized();
    }
  }

  const contentType = res.headers.get('content-type') || '';
  const data = contentType.includes('application/json') ? await res.json() : await res.text();

  if (!res.ok) {
    const message = typeof data === 'string' && data.includes('<!doctype html')
      ? 'The API server is not connected to this deployment. Set VITE_API_URL to the deployed API URL and redeploy the client.'
      : (data && (data.detail || data.error)) || `Request failed (${res.status})`;
    const err = new Error(message);
    if (data && typeof data === 'object') {
      Object.assign(err, data);
    }
    throw err;
  }
  return data;
}

export const api = {
  get: (path, opts) => request(path, { ...opts, method: 'GET' }),
  post: (path, body, opts) => request(path, { ...opts, method: 'POST', body }),
  // Was missing entirely — AdminSettings (Platform Settings page) calls
  // api.put(), which previously threw "api.put is not a function" and broke
  // saving settings for every admin.
  put: (path, body, opts) => request(path, { ...opts, method: 'PUT', body }),
  patch: (path, body, opts) => request(path, { ...opts, method: 'PATCH', body }),
  del: (path, opts) => request(path, { ...opts, method: 'DELETE' }),
  delete: (path, opts) => request(path, { ...opts, method: 'DELETE' }),
  postForm: (path, formData) => request(path, { method: 'POST', body: formData, isForm: true }),
};
