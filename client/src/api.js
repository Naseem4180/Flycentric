// Local development uses the separate Express server. A deployed client uses
// same-origin /api by default, which works when the frontend host proxies that
// path to the deployed API. Set VITE_API_URL when the API has its own domain.
const configuredApiUrl = import.meta.env.VITE_API_URL?.trim().replace(/\/$/, '');
const isLocalHost = ['localhost', '127.0.0.1'].includes(window.location.hostname)
  || window.location.hostname.startsWith('192.168.')
  || window.location.hostname.startsWith('10.');
export const BASE_URL = configuredApiUrl
  || (isLocalHost ? `${window.location.protocol}//${window.location.hostname}:4000/api` : '/api');

let accessToken = null;
let refreshToken = null;
let onUnauthorized = () => {};
export function setTokens(access, refresh) {
  accessToken = access;
  refreshToken = refresh;
  if (access) localStorage.setItem('fc_access', access); else localStorage.removeItem('fc_access');
  if (refresh) localStorage.setItem('fc_refresh', refresh); else localStorage.removeItem('fc_refresh');
}

export function loadTokens() {
  accessToken = localStorage.getItem('fc_access');
  refreshToken = localStorage.getItem('fc_refresh');
  return { accessToken, refreshToken };
}

export function setUnauthorizedHandler(fn) {
  onUnauthorized = fn;
}

async function request(path, { method = 'GET', body, isForm = false, auth = true } = {}) {
  const headers = {};
  if (!isForm) headers['Content-Type'] = 'application/json';
  if (auth && accessToken) headers['Authorization'] = `Bearer ${accessToken}`;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15000);

  let res;
  try {
    res = await fetch(`${BASE_URL}${path}`, {
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

  if (res.status === 401 && auth) {
    onUnauthorized();
  }

  const contentType = res.headers.get('content-type') || '';
  const data = contentType.includes('application/json') ? await res.json() : await res.text();

  if (!res.ok) {
    const message = typeof data === 'string' && data.includes('<!doctype html')
      ? 'The API server is not connected to this deployment. Set VITE_API_URL to the deployed API URL and redeploy the client.'
      : (data && (data.detail || data.error)) || `Request failed (${res.status})`;
    throw new Error(message);
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
  postForm: (path, formData) => request(path, { method: 'POST', body: formData, isForm: true }),
};
