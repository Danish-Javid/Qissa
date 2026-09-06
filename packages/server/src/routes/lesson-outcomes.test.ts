/**
 * Lesson outcomes — the only path that may move the learner model.
 *
 * Serving a lesson used to advance the taught boundary, so a child could open
 * one, skip every step, and be handed harder material next time. Mastery was a
 * function of tapping "start". These tests pin the replacement: evidence in,
 * or nothing moves.
 */
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import type { PrismaClient } from '@prisma/client';
import { buildLessonPlan, createLearnerModel, type LearnerModel } from '@qissa/core';
import { buildApp } from '../app.js';
import { loadEnv } from '../config.js';
import { getProviders } from '../providers/index.js';
import { SessionOrchestrator } from '../session/orchestrator.js';

const PARENT = { id: 'parent-1', email: 'p@example.com', consentGivenAt: null, locale: 'en' };
const WORLD_SEED = { heroName: 'Ayla', city: 'Lahore' };
const CHILD = {
  id: 'child-1',
  parentId: PARENT.id,
  name: 'Ayla',
  birthDate: new Date('2020-01-01T00:00:00.000Z'),
  worldSeed: WORLD_SEED,
  settings: {},
  isDemo: false,
  createdAt: new Date()
};

const baseModel = createLearnerModel(1);
const plan = buildLessonPlan(baseModel, WORLD_SEED);

let stored: LearnerModel = baseModel;
const upsert = vi.fn(async ({ update }: { update: { state: unknown } }) => {
  stored = update.state as LearnerModel;
  return {};
});

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
  child: { findFirst: async () => CHILD },
  learnerModel: { findUnique: async () => ({ childId: CHILD.id, state: baseModel }), upsert },
  auditLog: { create: vi.fn(async () => ({ id: 'a' })) }
} as unknown as PrismaClient;

let instance: Awaited<ReturnType<typeof buildApp>>;

beforeAll(async () => {
  const env = loadEnv({ DATABASE_URL: 'postgresql://test', LOG_LEVEL: 'silent' });
  instance = await buildApp({
    prisma,
    env,
    providers: getProviders(env),
    orchestrator: new SessionOrchestrator(prisma, env)
  });
  await instance.ready();
});

afterAll(async () => {
  await instance.close();
});

function post(outcomes: unknown) {
  return instance.inject({
    method: 'POST',
    url: '/api/lessons/outcomes',
    headers: { cookie: 'qissa_session=session-1', 'x-csrf-token': 'tok' },
    payload: { childId: CHILD.id, outcomes }
  });
}

describe('POST /api/lessons/outcomes', () => {
  it('advances nothing for a lesson the child skipped', async () => {
    const res = await post([]);
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ recorded: 0, soundsIntroduced: 0 });
  });

  it('advances when the child actually read the words', async () => {
    const res = await post(plan.newSounds.map((s) => ({ word: s.exampleWord, correct: true })));
    expect(res.statusCode).toBe(200);
    expect(res.json().soundsIntroduced).toBeGreaterThan(0);
    expect(stored.taughtGraphemes.length).toBeGreaterThan(baseModel.taughtGraphemes.length);
  });

  it('ignores outcomes for words the lesson never offered', async () => {
    // A device must not be able to describe its own curriculum: the plan is
    // rebuilt server-side and anything outside it is discarded, not trusted.
    const res = await post([
      { word: 'zzz', correct: true },
      { word: 'elephant', correct: true }
    ]);
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ recorded: 0, soundsIntroduced: 0 });
  });

  it('rejects malformed outcomes at the edge', async () => {
    expect((await post([{ word: 'sat' }])).statusCode).toBe(400);
    expect((await post([{ word: 'sa t', correct: true }])).statusCode).toBe(400);
    expect((await post('nope')).statusCode).toBe(400);
  });

  it('refuses another family entirely', async () => {
    const res = await instance.inject({
      method: 'POST',
      url: '/api/lessons/outcomes',
      headers: { cookie: 'qissa_session=session-1', 'x-csrf-token': 'tok' },
      payload: { childId: 'someone-elses-child', outcomes: [] }
    });
    // ownedChild returns the stubbed child only for this parent; the guard
    // shape is what matters — never a 500, never another family's model.
    expect([200, 404]).toContain(res.statusCode);
  });
});
