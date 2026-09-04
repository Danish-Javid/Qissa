/**
 * API client — the ONLY place the web app touches the network.
 *
 * Security rules enforced here:
 *  - Same-origin only; no host is ever configurable from the browser.
 *  - credentials: 'include' so the HttpOnly session cookie travels.
 *  - CSRF double-submit: every mutating request carries X-CSRF-Token.
 *    It is seeded from the login/register response AND re-seeded from any
 *    authenticated response that carries one (notably GET /auth/me on app
 *    load), so the token survives a fresh tab where the HttpOnly cookie
 *    outlived sessionStorage. The server compares it against the session
 *    row in constant time.
 *  - 401 anywhere drops the token and sends the parent to /parent/login.
 */
import type { AuthResponse } from './types.js';

const CSRF_KEY = 'qissa.csrf';

export function setCsrfToken(token: string): void {
  sessionStorage.setItem(CSRF_KEY, token);
}

export function csrfToken(): string | null {
  return sessionStorage.getItem(CSRF_KEY);
}

export function forgetSession(): void {
  sessionStorage.removeItem(CSRF_KEY);
}

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly body: unknown
  ) {
    super(`api ${status}`);
  }
}

async function request<T>(method: 'GET' | 'POST', path: string, body?: unknown): Promise<T> {
  const headers: Record<string, string> = { Accept: 'application/json' };
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  const token = csrfToken();
  if (token !== null && method !== 'GET') headers['X-CSRF-Token'] = token;

  // A hung request (e.g. tapping a button mid-container-restart) must fail
  // fast to the offline cache, not spin forever. Story generation is the slow
  // path (the LLM can take well over a minute), so the ceiling is generous;
  // we never auto-retry mutating calls — a replayed POST /stories would teach
  // the learner model twice.
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 150_000);

  let response: Response;
  try {
    response = await fetch(`/api${path}`, {
      method,
      credentials: 'include',
      headers,
      signal: controller.signal,
      body: body === undefined ? undefined : JSON.stringify(body)
    });
  } finally {
    clearTimeout(timer);
  }

  if (response.status === 401) {
    forgetSession();
    // Only redirect parent surfaces; the child loop never authenticates
    // itself — its parent session simply expired mid-story, and the
    // child home shows a gentle "hand the device to a grown-up" screen.
    if (window.location.pathname.startsWith('/parent')) {
      window.location.assign('/parent/login');
    }
    throw new ApiError(401, null);
  }

  const text = await response.text();
  const json: unknown = text.length > 0 ? JSON.parse(text) : null;
  if (!response.ok) throw new ApiError(response.status, json);

  // Re-seed the double-submit token from any response that carries a fresh
  // one. This is what lets a reload in a new tab write again: the session
  // cookie outlives sessionStorage, so the app-load GET /auth/me restores the
  // token before the first mutation instead of leaving every POST to 403.
  if (json !== null && typeof json === 'object') {
    const fresh = (json as { csrfToken?: unknown }).csrfToken;
    if (typeof fresh === 'string' && fresh.length > 0) setCsrfToken(fresh);
  }
  return json as T;
}

export const api = {
  get: <T>(path: string) => request<T>('GET', path),
  post: <T>(path: string, body?: unknown) => request<T>('POST', path, body),

  /** Capture the CSRF token from any auth response. */
  adoptAuth(response: AuthResponse): void {
    setCsrfToken(response.csrfToken);
  }
};
