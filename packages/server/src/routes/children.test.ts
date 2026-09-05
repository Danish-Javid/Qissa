/**
 * Child settings tests.
 *
 * The round-trip test exists because of a real bug: `lowBandwidth` was added to
 * ChildSettingsSchema but not to the field-by-field merge below it, so the
 * route validated the field, answered 200, and stored nothing. Silent success
 * is the worst failure mode there is — the dashboard toggle looked like it
 * worked, and the feature simply never engaged.
 *
 * The merge cannot become a spread (a null must CLEAR an override, which a
 * spread cannot express), so instead this asserts that every optional key the
 * schema accepts actually survives a write.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { PrismaClient } from '@prisma/client';
import { parseChildSettings } from '@qissa/core';
import { buildApp } from '../app.js';
import { loadEnv } from '../config.js';
import { getProviders } from '../providers/index.js';
import { SessionOrchestrator } from '../session/orchestrator.js';

const PARENT = { id: 'parent-1', email: 'p@example.com', consentGivenAt: null, locale: 'en' };
const CHILD = {
  id: 'child-1',
  parentId: PARENT.id,
  name: 'Ayesha',
  birthDate: new Date('2021-01-01T00:00:00.000Z'),
  worldSeed: { heroName: 'Ayesha', city: 'Lahore' },
  settings: {},
  isDemo: false,
  createdAt: new Date()
};

function fakePrisma() {
  const update = vi.fn(async ({ data }: { data: { settings: unknown } }) => ({
    ...CHILD,
    settings: data.settings,
    learnerModel: null
  }));
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
    child: { findFirst: async () => CHILD, update },
    auditLog: { create: vi.fn(async () => ({ id: 'a' })) }
  } as unknown as PrismaClient;
  return { prisma, update };
}

// One app for the whole file. buildApp registers helmet, cors and the rate
// limiter, which costs several seconds cold -- enough to blow the default
// 5s timeout on whichever test happens to run first.
const { prisma, update } = fakePrisma();
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

beforeEach(() => {
  update.mockClear();
});

function post(payload: unknown) {
  return instance.inject({
    method: 'POST',
    url: '/api/children/child-1/settings',
    headers: { cookie: 'qissa_session=session-1', 'x-csrf-token': 'tok' },
    payload
  });
}

describe('POST /api/children/:id/settings', () => {
  it('persists every optional setting the schema accepts', async () => {
    const sent = {
      learningTrack: 'learn-to-read' as const,
      storyPacing: 'slow' as const,
      storyTimeEnabled: false,
      sessionCapMinutes: 10,
      lowBandwidth: true
    };
    const res = await post(sent);
    expect(res.statusCode).toBe(200);

    const stored = parseChildSettings(update.mock.calls[0]![0].data.settings);
    for (const [key, value] of Object.entries(sent)) {
      expect(stored[key as keyof typeof stored], `${key} was dropped by the merge`).toEqual(value);
    }
  });

  it('round-trips lowBandwidth in both directions', async () => {
    await post({ lowBandwidth: true });
    expect(parseChildSettings(update.mock.calls[0]![0].data.settings).lowBandwidth).toBe(true);

    await post({ lowBandwidth: false });
    expect(parseChildSettings(update.mock.calls[1]![0].data.settings).lowBandwidth).toBe(false);

  });

  it('rejects unknown settings rather than storing them', async () => {
    const res = await post({ notASetting: true });
    expect(res.statusCode).toBe(400);
    expect(update).not.toHaveBeenCalled();
  });

  it('treats a null override as a clear, not a value', async () => {
    await post({ learningTrack: null, sessionCapMinutes: null });
    const stored = parseChildSettings(update.mock.calls[0]![0].data.settings);
    expect(stored.learningTrack).toBeUndefined();
    expect(stored.sessionCapMinutes).toBeUndefined();
  });
});
