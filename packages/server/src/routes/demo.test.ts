/**
 * Demo route tests.
 *
 * The property under test is the destructive one: reset must be scoped BOTH to
 * the signed-in parent AND to rows carrying `isDemo`. A demo account is often
 * also somebody's real account during a hackathon, and "reset the demo" a
 * minute before going on stage must not be able to delete a real child's
 * reading history.
 */
import { describe, expect, it, vi } from 'vitest';
import type { PrismaClient } from '@prisma/client';
import { buildApp } from '../app.js';
import { loadEnv } from '../config.js';
import { getProviders } from '../providers/index.js';
import { SessionOrchestrator } from '../session/orchestrator.js';

const PARENT = { id: 'parent-1', email: 'demo@qissa.app', consentGivenAt: null, locale: 'en' };

function fakePrisma() {
  const deleteMany = vi.fn(async () => ({ count: 1 }));
  const auditCreate = vi.fn(async () => ({ id: 'a' }));
  const prisma = {
    authSession: {
      findUnique: async () => ({
        id: 'session-1',
        parentId: PARENT.id,
        csrfToken: 'tok',
        expiresAt: new Date(Date.now() + 60_000),
        parent: PARENT
      })
    },
    child: { deleteMany },
    auditLog: { create: auditCreate }
  } as unknown as PrismaClient;
  return { prisma, deleteMany, auditCreate };
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

describe('POST /api/demo/reset', () => {
  it('deletes only demo children, and only the caller’s own', async () => {
    const { prisma, deleteMany } = fakePrisma();
    const instance = await app(prisma);

    const res = await instance.inject({
      method: 'POST',
      url: '/api/demo/reset',
      headers: { cookie: 'qissa_session=session-1', 'x-csrf-token': 'tok' },
      payload: {}
    });

    expect(res.statusCode).toBe(200);
    expect(deleteMany).toHaveBeenCalledTimes(1);
    // Both clauses are load-bearing; losing either one is a data-loss bug.
    expect(deleteMany.mock.calls[0]![0]).toEqual({
      where: { parentId: PARENT.id, isDemo: true }
    });
    await instance.close();
  });

  it('refuses without a session', async () => {
    const { prisma, deleteMany } = fakePrisma();
    const instance = await app(prisma);

    const res = await instance.inject({ method: 'POST', url: '/api/demo/reset', payload: {} });

    expect(res.statusCode).toBe(401);
    expect(deleteMany, 'an unauthenticated request must never reach a delete').not.toHaveBeenCalled();
    await instance.close();
  });

  it('refuses without the CSRF token', async () => {
    const { prisma, deleteMany } = fakePrisma();
    const instance = await app(prisma);

    const res = await instance.inject({
      method: 'POST',
      url: '/api/demo/reset',
      headers: { cookie: 'qissa_session=session-1' },
      payload: {}
    });

    expect(res.statusCode).toBe(403);
    expect(deleteMany).not.toHaveBeenCalled();
    await instance.close();
  });
});

describe('POST /api/demo/seed', () => {
  it('rejects a story count outside the supported range', async () => {
    const { prisma } = fakePrisma();
    const instance = await app(prisma);

    const res = await instance.inject({
      method: 'POST',
      url: '/api/demo/seed',
      headers: { cookie: 'qissa_session=session-1', 'x-csrf-token': 'tok' },
      payload: { stories: 99 }
    });

    expect(res.statusCode).toBe(400);
    await instance.close();
  });

  it('rejects unknown fields rather than silently ignoring them', async () => {
    const { prisma } = fakePrisma();
    const instance = await app(prisma);

    const res = await instance.inject({
      method: 'POST',
      url: '/api/demo/seed',
      headers: { cookie: 'qissa_session=session-1', 'x-csrf-token': 'tok' },
      payload: { stories: 1, childId: 'someone-elses-child' }
    });

    expect(res.statusCode).toBe(400);
    await instance.close();
  });
});
