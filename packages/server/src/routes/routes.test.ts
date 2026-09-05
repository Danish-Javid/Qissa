/**
 * Route-surface contract tests.
 *
 * These exist because a mounting mistake is invisible to unit tests: the
 * audio playback route was once registered as '/:id' on a prefix-less
 * plugin, which (a) never matched the client's GET /api/audio/:id, so every
 * retained clip 404'd on the parent digest, and (b) acted as a catch-all
 * that swallowed every unmatched single-segment GET under /api. Both are
 * asserted here against the real assembled app.
 */
import { describe, expect, it } from 'vitest';
import type { PrismaClient } from '@prisma/client';
import { buildApp } from '../app.js';
import { loadEnv } from '../config.js';
import { getProviders } from '../providers/index.js';
import { SessionOrchestrator } from '../session/orchestrator.js';

/** buildApp touches no table; only the auth guard reads one. */
const prisma = { authSession: { findUnique: async () => null } } as unknown as PrismaClient;

async function app() {
  const env = loadEnv({ DATABASE_URL: 'postgresql://test', LOG_LEVEL: 'silent' });
  const providers = getProviders(env);
  const instance = await buildApp({
    prisma,
    env,
    providers,
    orchestrator: new SessionOrchestrator(prisma, env)
  });
  await instance.ready();
  return instance;
}

describe('route surface', () => {
  it('serves retained audio clips at /api/audio/:id', async () => {
    const instance = await app();
    const res = await instance.inject({ method: 'GET', url: '/api/audio/abc123' });
    // 401 (not 404) proves the route is mounted and reached the auth guard.
    expect(res.statusCode).toBe(401);
    await instance.close();
  });

  it('does not expose a catch-all under /api', async () => {
    const instance = await app();
    for (const url of ['/api/abc123', '/api/nope', '/api/children-typo']) {
      const res = await instance.inject({ method: 'GET', url });
      expect(res.statusCode, `${url} should not be swallowed by a catch-all`).toBe(404);
    }
    await instance.close();
  });

  it('keeps the unauthenticated health probe reachable', async () => {
    const instance = await app();
    const res = await instance.inject({ method: 'GET', url: '/api/health' });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ status: 'ok' });
    await instance.close();
  });
});
