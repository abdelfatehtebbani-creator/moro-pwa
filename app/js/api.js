import { API_URL } from './config.js';

const TOKEN_KEY = 'moro.token';

export class ApiError extends Error {
  constructor(code, detail) { super(code); this.code = code; this.detail = detail || ''; }
}

export const session = {
  get token() { try { return localStorage.getItem(TOKEN_KEY) || ''; } catch { return ''; } },
  set token(v) { try { v ? localStorage.setItem(TOKEN_KEY, v) : localStorage.removeItem(TOKEN_KEY); } catch { /* storage blocked */ } },
};

/**
 * Calls one server action. Sent as text/plain so the browser does not need a CORS preflight,
 * which Apps Script cannot answer. Network failures become ApiError('offline').
 */
export async function call(action, payload = {}) {
  let res;
  try {
    res = await fetch(API_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify({ action, payload, token: session.token }),
    });
  } catch {
    throw new ApiError('offline');
  }
  if (!res.ok) throw new ApiError('offline', 'HTTP ' + res.status);
  let body;
  try { body = await res.json(); } catch { throw new ApiError('server_error', 'bad json'); }
  if (!body.ok) {
    if (body.error.code === 'auth_required' || body.error.code === 'auth_expired') {
      session.token = '';
      window.dispatchEvent(new CustomEvent('moro:signed-out', { detail: body.error.code }));
    }
    throw new ApiError(body.error.code, body.error.detail);
  }
  return body.data;
}
