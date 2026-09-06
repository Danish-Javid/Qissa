/**
 * Auth routes — parent accounts only (children never log in, FR-A.1).
 *
 *  POST /api/auth/register  create account + session
 *  POST /api/auth/login     verify + session
 *  POST /api/auth/logout    revoke session
 *  GET  /api/auth/me        current parent
 *  POST /api/auth/consent   record child-voice consent (NFR-3)
 *  POST /api/auth/locale    set the parent-layer language (FR-J)
 *
 * Passwords: Argon2id with the library's OWASP-aligned defaults. Login
 * failures are uniform ("invalid credentials") and the whole /auth prefix
 * is rate-limited harder than the global default — no guessing oracle.
 */
import { randomBytes } from 'node:crypto';
import { hash, verify } from '@node-rs/argon2';
import { z } from 'zod';
import { LOCALES } from '@qissa/core';
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

/** Youngest age that may hold an account, and the oldest plausible one. */
const MIN_PARENT_AGE = 18;
const MAX_PARENT_AGE = 120;

/**
 * Registration asks who the grown-up is.
 *
 * What this DOES: keeps children from casually creating their own accounts,
 * records an explicit guardian attestation with a timestamp, and gives the
 * digest a real name to address.
 *
 * What this does NOT do: verify identity or parenthood. A self-reported date
 * of birth is an age GATE, not proof — anyone willing to type a different year
 * gets past it. Real verification means documents or a payment rail, neither of
 * which belongs in a children's reading app. Saying so plainly here so nobody
 * later mistakes this for a control it is not.
 */
const RegistrationSchema = CredentialsSchema.extend({
  fullName: z.string().trim().min(2).max(80),
  birthDate: z.iso.date(),
  // Literal true, not boolean: an unchecked box must fail validation rather
  // than quietly record a `false` attestation.
  isGuardian: z.literal(true)
}).strict();

/** Whole years between a date and now, UTC, leap-safe. */
function ageInYears(birthDate: Date, at = new Date()): number {
  let age = at.getUTCFullYear() - birthDate.getUTCFullYear();
  const monthDelta = at.getUTCMonth() - birthDate.getUTCMonth();
  if (monthDelta < 0 || (monthDelta === 0 && at.getUTCDate() < birthDate.getUTCDate())) age -= 1;
  return age;
}

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

const LocaleSchema = z.object({ locale: z.enum(LOCALES) }).strict();

export async function authRoutes(app: FastifyInstance): Promise<void> {
  const { prisma, env } = ctx(app);
  // Warm the decoy at boot so the first unknown-email login is not slower
  // than the rest (which would leak in the other direction).
  void decoyHash();

  app.post('/register', CREDENTIAL_RATE_LIMIT, async (request, reply) => {
    const body = parseBody(RegistrationSchema, request.body, reply);
    if (body === null) return;
    const { email, password, fullName } = body;

    const birthDate = new Date(`${body.birthDate}T00:00:00.000Z`);
    const age = ageInYears(birthDate);
    if (age < MIN_PARENT_AGE || age > MAX_PARENT_AGE) {
      // Stated plainly rather than as a generic validation error: a parent who
      // mistyped a year needs to know which field is wrong. There is no
      // enumeration risk here -- nothing about an existing account leaks.
      return reply.code(422).send({
        error: `Accounts are for grown-ups: the date of birth must be at least ${MIN_PARENT_AGE} years ago.`
      });
    }

    const existing = await prisma.parent.findUnique({ where: { email } });
    if (existing !== null) {
      // 409 is acceptable here: registration is parent-initiated and the
      // email is needed to log in anyway, so this is not an IDOR oracle.
      return reply.code(409).send({ error: 'an account with this email already exists' });
    }

    const passwordHash = await hash(password);
    const parent = await prisma.parent.create({
      data: {
        email,
        passwordHash,
        displayName: fullName,
        birthDate,
        guardianConfirmedAt: new Date()
      }
    });
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
    return {
      email: parent.email,
      displayName: parent.displayName,
      consentGivenAt: parent.consentGivenAt,
      locale: parent.locale,
      csrfToken: session.csrfToken
    };
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

  /** Parent-layer language. The child track is English either way (the phonics
   *  scope teaches English graphemes), so this only ever changes what the
   *  ADULT reads. Zod pins it to the supported set, so an unknown value can
   *  never reach a catalog lookup. */
  app.post('/locale', { preHandler: requireAuth(app) }, async (request, reply) => {
    const body = parseBody(LocaleSchema, request.body, reply);
    if (body === null) return;
    await prisma.parent.update({
      where: { id: request.auth.parent.id },
      data: { locale: body.locale }
    });
    return reply.send({ locale: body.locale });
  });
}
