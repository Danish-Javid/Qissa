/**
 * API client tests.
 *
 * The redirect-loop test is the one that matters. The app probes GET /auth/me
 * on every load; for a signed-out visitor that 401s. The client used to answer
 * a 401 on any /parent* path by assigning /parent/login — including when it
 * was already there, which is a reload, which probes again. Live, that loop
 * reloaded the sign-in page ~40 times in a few seconds and then tripped the
 * global rate limiter, so the first thing a visitor saw was raw JSON:
 * {"error":"Rate limit exceeded, retry in 18 seconds"}.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError, api, csrfToken, forgetSession, setCsrfToken } from './client.js';

const assign = vi.fn();

function atPath(pathname: string): void {
  Object.defineProperty(window, 'location', {
    configurable: true,
    value: { pathname, assign }
  });
}

function respondWith(status: number, body: unknown): void {
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => new Response(JSON.stringify(body), { status }))
  );
}

beforeEach(() => {
  assign.mockClear();
  sessionStorage.clear();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('401 handling', () => {
  it('does NOT redirect when already on the login page', async () => {
    atPath('/parent/login');
    respondWith(401, { error: 'unauthorized' });

    await expect(api.get('/auth/me')).rejects.toBeInstanceOf(ApiError);
    expect(assign, 'assigning the current URL is a reload, and reloads loop').not.toHaveBeenCalled();
  });

  it('redirects to login from any other parent surface', async () => {
    atPath('/parent/digest/abc');
    respondWith(401, { error: 'unauthorized' });

    await expect(api.get('/children/abc/digest')).rejects.toBeInstanceOf(ApiError);
    expect(assign).toHaveBeenCalledWith('/parent/login');
  });

  it('leaves the child loop alone — a child never authenticates', async () => {
    atPath('/child/abc');
    respondWith(401, { error: 'unauthorized' });

    await expect(api.get('/children/abc/learner')).rejects.toBeInstanceOf(ApiError);
    expect(assign).not.toHaveBeenCalled();
  });

  it('drops the stored CSRF token on any 401', async () => {
    atPath('/child/abc');
    setCsrfToken('stale-token');
    respondWith(401, { error: 'unauthorized' });

    await expect(api.get('/auth/me')).rejects.toBeInstanceOf(ApiError);
    expect(csrfToken()).toBeNull();
  });
});

describe('CSRF handling', () => {
  it('adopts a fresh token from any response that carries one', async () => {
    atPath('/parent');
    forgetSession();
    respondWith(200, { email: 'a@b.c', csrfToken: 'fresh-token' });

    await api.get('/auth/me');
    expect(csrfToken()).toBe('fresh-token');
  });

  it('sends the token on mutations but not on reads', async () => {
    atPath('/parent');
    setCsrfToken('tok');
    const fetchMock = vi.fn(
      async (_input: RequestInfo | URL, _init?: RequestInit) => new Response('{}', { status: 200 })
    );
    vi.stubGlobal('fetch', fetchMock);

    await api.get('/auth/me');
    await api.post('/auth/locale', { locale: 'ur' });

    const readHeaders = fetchMock.mock.calls[0]![1]?.headers as Record<string, string>;
    const writeHeaders = fetchMock.mock.calls[1]![1]?.headers as Record<string, string>;
    expect(readHeaders).not.toHaveProperty('X-CSRF-Token');
    expect(writeHeaders).toHaveProperty('X-CSRF-Token', 'tok');
  });
});
