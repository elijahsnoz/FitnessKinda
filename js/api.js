/* Transport. Same-origin JSON only — there is no other server to talk to. */

class ApiError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
    this.offline = status === 0;
  }
}

async function request(method, path, body) {
  let res;
  try {
    res = await fetch(path, {
      method,
      credentials: 'same-origin',
      headers: body === undefined ? {} : { 'Content-Type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body)
    });
  } catch {
    // No network, or no server at all (the app also runs as plain static files).
    throw new ApiError(0, 'No connection.');
  }

  const text = await res.text();
  let json = null;
  try { json = JSON.parse(text); } catch { /* not json */ }

  if (!res.ok) throw new ApiError(res.status, json?.error || `Request failed (${res.status}).`);
  return json;
}

export const api = {
  me: () => request('GET', '/api/auth/me'),
  signup: (payload) => request('POST', '/api/auth/signup', payload),
  login: (payload) => request('POST', '/api/auth/login', payload),
  logout: () => request('POST', '/api/auth/logout', {}),
  verifyEmail: (token) => request('POST', '/api/auth/verify', { token }),
  requestReset: (email) => request('POST', '/api/auth/request-reset', { email }),
  resetPassword: (token, password) => request('POST', '/api/auth/reset', { token, password }),
  resendVerification: () => request('POST', '/api/auth/resend-verification', {}),

  listEpisodes: () => request('GET', '/api/episodes'),
  createEpisode: (entry) => request('POST', '/api/episodes', entry),
  updateEpisode: (id, patch) => request('PATCH', `/api/episodes/${encodeURIComponent(id)}`, patch),
  deleteEpisode: (id) => request('DELETE', `/api/episodes/${encodeURIComponent(id)}`),

  migrate: (entries) => request('POST', '/api/migrate', { entries }),
  adminMetrics: () => request('GET', '/api/admin/metrics')
};

export { ApiError };
