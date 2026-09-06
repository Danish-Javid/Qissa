/**
 * Early-track art: the catalog is CLOSED.
 *
 * This exists because of a real bypass. EARLY_ART_HINTS is built with
 * Object.fromEntries, so it inherits Object.prototype — and the guard was:
 *
 *     const hint = EARLY_ART_HINTS[params.id];
 *     if (hint === undefined) return denyNotFound(reply);
 *
 * `EARLY_ART_HINTS['constructor']` is the Object function, not undefined, so
 * "constructor", "__proto__", "toString" and friends walked straight past a
 * check that reads as a closed-catalog lookup — each one reaching a PAID
 * vendor image generation with a non-string prompt.
 *
 * The fix is two gates: an id-shape regex (the catalog only ever mints
 * `word-*` and `vig-*`) and Object.hasOwn instead of an undefined test. This
 * file pins both, plus the invariant that makes the regex safe — that every
 * real catalog key actually matches it.
 */
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import type { PrismaClient } from '@prisma/client';
import { buildApp } from '../app.js';
import { loadEnv } from '../config.js';
import { EARLY_ART_HINTS } from '../early/catalog.js';
import { getProviders } from '../providers/index.js';
import { SessionOrchestrator } from '../session/orchestrator.js';

const PARENT = { id: 'parent-1', email: 'p@example.com', consentGivenAt: null, locale: 'en' };

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

function getArt(id: string) {
  return instance.inject({
    method: 'GET',
    url: `/api/early/art/${id}`,
    headers: { cookie: 'qissa_session=session-1' }
  });
}

/** Rejected before any file or vendor is touched: 400 from the id-shape
 *  schema, 404 from the catalog lookup. Which gate fires is an implementation
 *  detail; that one of them does is the security property. */
const REJECTED = [400, 404];

describe('GET /api/early/art/:id', () => {
  it('refuses inherited Object.prototype keys', async () => {
    // Every one of these is `!== undefined` on a plain object literal, and
    // each one used to reach a paid generation.
    for (const key of ['constructor', 'toString', 'valueOf', 'hasOwnProperty', '__defineGetter__']) {
      const res = await getArt(key);
      expect(REJECTED, `${key} must not reach the generator`).toContain(res.statusCode);
    }
  });

  it('refuses a well-shaped id that is not in the catalog', async () => {
    // This one passes the regex, so it isolates the Object.hasOwn gate: the
    // catalog lookup itself must answer 404.
    const res = await getArt('word-definitely-not-a-real-card');
    expect(res.statusCode).toBe(404);
  });

  it('refuses ids outside the catalog id shape', async () => {
    for (const id of ['nope', 'word', 'WORD-apple', 'word_apple', '..', 'word-apple.png']) {
      const res = await getArt(id);
      expect(REJECTED, `${id} must be rejected`).toContain(res.statusCode);
    }
  });

  it('still serves a real catalog id', async () => {
    const known = Object.keys(EARLY_ART_HINTS)[0];
    expect(known, 'the catalog must not be empty').toBeDefined();
    const res = await getArt(known as string);
    // Mock mode draws a deterministic SVG placeholder rather than 404ing.
    expect(res.statusCode).toBe(200);
    expect(res.headers['content-type']).toContain('svg');
  });

  it('documents why the old undefined check was wrong', () => {
    // The bug, preserved as an assertion: the lookup IS defined...
    expect((EARLY_ART_HINTS as Record<string, unknown>)['constructor']).toBeDefined();
    // ...but it is not an own property, which is what the guard meant to ask.
    expect(Object.hasOwn(EARLY_ART_HINTS, 'constructor')).toBe(false);
  });

  it('keeps every catalog key inside the route id shape', () => {
    // If a future card id breaks this, the regex would 404 a legitimate
    // picture — so the invariant is asserted rather than assumed.
    const idShape = /^(?:word|vig)-[a-z0-9-]{1,56}$/;
    for (const key of Object.keys(EARLY_ART_HINTS)) {
      expect(idShape.test(key), `catalog key "${key}" is unreachable through the route`).toBe(true);
    }
  });
});
