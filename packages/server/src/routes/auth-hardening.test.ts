/**
 * Auth hardening contract tests.
 *
 * Both properties here were documented in the README and the auth module's
 * own docstring long before they were true:
 *
 *  1. The credential endpoints must carry a tighter rate limit than the
 *     global 600/min ceiling, which would otherwise allow 600 password
 *     guesses a minute per IP.
 *  2. Login must not short-circuit the Argon2id verification for unknown
 *     emails — the response time would then be an account-existence oracle.
 */
import { describe, expect, it, vi } from 'vitest';
import type { PrismaClient } from '@prisma/client';
import { buildApp } from '../app.js';
import { loadEnv } from '../config.js';
import { getProviders } from '../providers/index.js';
import { SessionOrchestrator } from '../session/orchestrator.js';

const CREDENTIALS = { email: 'nobody@example.com', password: 'correct-horse-battery' };

function fakePrisma(findUnique: () => Promise<unknown>) {
  return {
    authSession: { findUnique: async () => null },
    parent: { findUnique: vi.fn(findUnique) }
  } as unknown as PrismaClient;
}

async function app(prisma: PrismaClient) {
  const env = loadEnv({ DATABASE_URL: 'postgresql://test', LOG_LEVEL: 'silent' });
  const instance = await buildApp({
    prisma,
    env,
    providers: getProviders(env),
    orchestrator: new SessionOrchestrator(prisma, env)
  });
  await instance.ready();
  return instance;
}

describe('credential endpoint hardening', () => {
  it('rate-limits login far below the global ceiling', async () => {
    const prisma = fakePrisma(async () => null);
    const instance = await app(prisma);

    const codes: number[] = [];
    for (let i = 0; i < 15; i += 1) {
      const res = await instance.inject({
        method: 'POST',
        url: '/api/auth/login',
        payload: CREDENTIALS,
        headers: { 'x-forwarded-for': '203.0.113.7' }
      });
      codes.push(res.statusCode);
    }

    // The global ceiling is 600/min; 15 attempts must already be throttled.
    expect(codes).toContain(429);
    expect(codes.filter((c) => c === 429).length).toBeGreaterThanOrEqual(5);
    await instance.close();
  });

  it('verifies a password hash even when the email is unknown', async () => {
    const prisma = fakePrisma(async () => null);
    const instance = await app(prisma);

    const res = await instance.inject({ method: 'POST', url: '/api/auth/login', payload: CREDENTIALS });
    expect(res.statusCode).toBe(401);
    expect(res.json()).toEqual({ error: 'invalid credentials' });

    // The decoy verification is what makes the timing uniform. An unknown
    // email that short-circuits returns in microseconds; a real Argon2id
    // verification cannot. This is a floor, not a timing assertion.
    const started = process.hrtime.bigint();
    await instance.inject({ method: 'POST', url: '/api/auth/login', payload: CREDENTIALS });
    const elapsedMs = Number(process.hrtime.bigint() - started) / 1e6;
    expect(elapsedMs).toBeGreaterThan(5);

    await instance.close();
  });
});
