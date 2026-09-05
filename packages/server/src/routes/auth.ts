/**
 * Auth routes — parent accounts only (children never log in, FR-A.1).
 *
 *  POST /api/auth/register  create account + session
 *  POST /api/auth/login     verify + session
 *  POST /api/auth/logout    revoke session
 *  GET  /api/auth/me        current parent
 *  POST /api/auth/consent   record child-voice consent (NFR-3)
 *
 * Passwords: Argon2id with the library's OWASP-aligned defaults. Login
 * failures are uniform ("invalid credentials") and the whole /auth prefix
 * is rate-limited harder than the global default — no guessing oracle.
 */
import { randomBytes } from 'node:crypto';
import { hash, verify } from '@node-rs/argon2';
import { z } from 'zod';
import type { FastifyInstance } from 'fastify';
import { clearSessionCookie, createSession, setSessionCookie } from '../auth/session.js';
import { ctx } from '../context.js';
import { requireAuth } from './guards.js';
import { parseBody } from './validate.js';

const CredentialsSchema = z
  .object({
    email: z.email().max(254).transform((e) => e.toLowerCase()),
    // Ten characters is a floor, not a target; Argon2id makes guessing
    // expensive regardless, but weak passwords still deserve a nudge.
    password: z.string().min(10).max(128)
  })
  .strict();

/**
 * The "harder cap" the module docstring promises. The global ceiling (600/min)
 * is sized for a child tapping through a story; it is far too generous for
 * credential endpoints, where it would allow 600 password guesses a minute
 * per IP. Registering it as route options is the only thing that actually
 * narrows the limit — @fastify/rate-limit's global config does NOT tighten
 * per prefix on its own.
 */
const CREDENTIAL_RATE_LIMIT = {
  config: { rateLimit: { max: 10, timeWindow: '1 minute' } }
} as const;

/**
 * A throwaway Argon2id hash of a random secret, computed once at boot.
 *
 * Login must cost the same whether or not the email exists, otherwise the
 * response time is an account-existence oracle: a short-circuited
 * `parent !== null && await verify(...)` returns in microseconds for unknown
 * emails and in ~100ms (a full Argon2id verification) for known ones. We
 * verify against this decoy when the lookup misses, so both paths pay the
 * same KDF cost.
 */
let decoyHashPromise: Promise<string> | null = null;
function decoyHash(): Promise<string> {
  decoyHashPromise ??= hash(randomBytes(32).toString('hex'));
  return decoyHashPromise;
}

export async function authRoutes(app: FastifyInstance): Promise<void> {
  const { prisma, env } = ctx(app);
  // Warm the decoy at boot so the first unknown-email login is not slower
  // than the rest (which would leak in the other direction).
  void decoyHash();

  app.post('/register', CREDENTIAL_RATE_LIMIT, async (request, reply) => {
    const body = parseBody(CredentialsSchema, request.body, reply);
    if (body === null) return;
    const { email, password } = body;

    const existing = await prisma.parent.findUnique({ where: { email } });
    if (existing !== null) {
      // 409 is acceptable here: registration is parent-initiated and the
      // email is needed to log in anyway, so this is not an IDOR oracle.
      return reply.code(409).send({ error: 'an account with this email already exists' });
    }

    const passwordHash = await hash(password);
    const parent = await prisma.parent.create({ data: { email, passwordHash } });
    const session = await createSession(prisma, parent.id, request.headers['user-agent']);
    setSessionCookie(reply, env, session.sessionId, session.expiresAt);
    return reply.code(201).send({ email: parent.email, csrfToken: session.csrfToken });
  });

  app.post('/login', CREDENTIAL_RATE_LIMIT, async (request, reply) => {
    const body = parseBody(CredentialsSchema, request.body, reply);
    if (body === null) return;
    const { email, password } = body;
    const parent = await prisma.parent.findUnique({ where: { email } });

    // Always run a hash verification -- against the real hash when the
    // account exists, against the boot-time decoy when it does not -- so the
    // response time never reveals which case this was. Short-circuiting on
    // `parent === null` here would reintroduce the enumeration oracle.
    const hashToCheck = parent?.passwordHash ?? (await decoyHash());
    const verified = await verify(hashToCheck, password).catch(() => false);
    if (parent === null || !verified) return reply.code(401).send({ error: 'invalid credentials' });

    const session = await createSession(prisma, parent.id, request.headers['user-agent']);
    setSessionCookie(reply, env, session.sessionId, session.expiresAt);
    return reply.send({ email: parent.email, csrfToken: session.csrfToken });
  });

  app.post('/logout', { preHandler: requireAuth(app) }, async (request, reply) => {
    await prisma.authSession.delete({ where: { id: request.auth.session.id } }).catch(() => undefined);
    clearSessionCookie(reply, env);
    return reply.send({ ok: true });
  });

  app.get('/me', { preHandler: requireAuth(app) }, async (request) => {
    const { parent, session } = request.auth;
    // The CSRF token is re-served here on purpose. The HttpOnly session cookie
    // outlives the client's sessionStorage copy of the token, so a reload in a
    // fresh tab is authenticated for reads but would 403 on every write. The
    // app calls this on load to re-seed the double-submit token from the live
    // session row — it is never a guess, only the value the session already
    // holds. See web/src/App.tsx + web/src/api/client.ts (auto-adopt).
    return { email: parent.email, consentGivenAt: parent.consentGivenAt, csrfToken: session.csrfToken };
  });

  /** Voice consent is recorded once and shown back on the digest screen.
   *  Until this is set, the audio-upload route refuses to store clips. */
  app.post('/consent', { preHandler: requireAuth(app) }, async (request, reply) => {
    const { parent } = request.auth;
    const consentGivenAt = parent.consentGivenAt ?? new Date();
    if (parent.consentGivenAt === null) {
      await prisma.parent.update({ where: { id: parent.id }, data: { consentGivenAt } });
    }
    return reply.send({ consentGivenAt });
  });
}
