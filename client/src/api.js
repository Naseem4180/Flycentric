// Same-origin dev setups (running client+server on the same machine) work with
// window.location.hostname automatically — this avoids every API call silently
// failing when the app is opened via a LAN IP, a different hostname, or a port
// forward, which previously broke every feature that talks to the API (adding
// questions, the live monitor, CSV import/export, starting an exam) because
// the browser was pointed at a literal "localhost" that didn't match how the
// page itself was being accessed.
export const BASE_URL = import.meta.env.VITE_API_URL || `${window.location.protocol}//${window.location.hostname}:4000/api`;

let accessToken = null;
let refreshToken = null;
let onUnauthorized = () => {};
let refreshScheduled = false;

function shouldRefreshAfterMutation(method, path) {
  if (method === 'GET') return false;
  if (/^\/admin\//.test(path)) return true;
  if (/^\/(content|batches|jobs|doubts)(\/|$)/.test(path)) return true;
  if (/^\/questions(\/|$)/.test(path)) return !/\/reports?$|\/appearance$/.test(path);
  if (/^\/exams\/quizzes(\/|$)/.test(path)) return !/\/start$|\/attempts\//.test(path);
  if (/^\/payments\/[^/]+\/refund$/.test(path)) return true;
  return false;
}

function scheduleRefresh() {
  if (refreshScheduled || typeof window === 'undefined') return;
  refreshScheduled = true;
  window.setTimeout(() => window.location.reload(), 0);
}

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
    const message = (data && (data.detail || data.error)) || `Request failed (${res.status})`;
    throw new Error(message);
  }
  if (shouldRefreshAfterMutation(method, path)) scheduleRefresh();
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
