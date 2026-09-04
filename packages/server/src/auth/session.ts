/**
 * Server-side sessions — the security heart of the parent layer.
 *
 * Design (plan §2, non-negotiables):
 *  - The cookie carries 32 random bytes (hex). It is an opaque pointer to a
 *    DB row — no data, no signature to verify, revocable with one DELETE.
 *  - HttpOnly (no JS access), SameSite=Strict (no cross-site sends),
 *    Secure in production (HTTPS only).
 *  - CSRF double-submit: the session row stores a token returned to the
 *    client at login; every authenticated mutating request must echo it in
 *    an X-CSRF-Token header. A third-party page cannot read it (HttpOnly
 *    cookie + SameSite=Strict) nor guess it (256-bit random).
 */
import { randomBytes, timingSafeEqual } from 'node:crypto';
// Importing the plugin module pulls in its FastifyRequest/FastifyReply
// augmentations (request.cookies, reply.setCookie, reply.clearCookie).
import '@fastify/cookie';
import type { FastifyReply, FastifyRequest } from 'fastify';
import type { AuthSession, Parent, PrismaClient } from '@prisma/client';
import type { Env } from '../config.js';

export const COOKIE_NAME = 'qissa_session';
export const CSRF_HEADER = 'x-csrf-token';
/** Sessions live 7 days; the cookie and the DB row expire together. */
const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000;

export function cookieOptions(env: Env): {
  path: string;
  httpOnly: true;
  sameSite: 'strict';
  secure: boolean;
} {
  return { path: '/', httpOnly: true, sameSite: 'strict', secure: env.COOKIE_SECURE };
}

/** Create a DB-backed session and return what the client needs. */
export async function createSession(
  prisma: PrismaClient,
  parentId: string,
  userAgent: string | undefined
): Promise<{ sessionId: string; csrfToken: string; expiresAt: Date }> {
  const sessionId = randomBytes(32).toString('hex');
  const csrfToken = randomBytes(32).toString('hex');
  const expiresAt = new Date(Date.now() + SESSION_TTL_MS);
  await prisma.authSession.create({
    data: { id: sessionId, parentId, csrfToken, userAgent: userAgent ?? null, expiresAt }
  });
  return { sessionId, csrfToken, expiresAt };
}

export function setSessionCookie(reply: FastifyReply, env: Env, sessionId: string, expiresAt: Date): void {
  reply.setCookie(COOKIE_NAME, sessionId, { ...cookieOptions(env), expires: expiresAt });
}

export function clearSessionCookie(reply: FastifyReply, env: Env): void {
  reply.clearCookie(COOKIE_NAME, cookieOptions(env));
}

export interface ResolvedSession {
  parent: Parent;
  session: AuthSession;
}

/**
 * Resolve the request's cookie to a live session, or null.
 * Expired rows are deleted lazily here — no cron needed for correctness.
 */
export async function resolveSession(
  request: FastifyRequest,
  prisma: PrismaClient
): Promise<ResolvedSession | null> {
  const sessionId = request.cookies[COOKIE_NAME];
  if (!sessionId) return null;

  const session = await prisma.authSession.findUnique({
    where: { id: sessionId },
    include: { parent: true }
  });
  if (!session) return null;

  if (session.expiresAt.getTime() <= Date.now()) {
    await prisma.authSession.delete({ where: { id: session.id } }).catch(() => undefined);
    return null;
  }
  return { parent: session.parent, session };
}

/**
 * CSRF double-submit check for authenticated mutating requests.
 * Constant-time comparison — timing must not leak how far a guess got.
 */
export function csrfTokenMatches(request: FastifyRequest, expected: string): boolean {
  const provided = request.headers[CSRF_HEADER];
  if (typeof provided !== 'string') return false;
  const a = Buffer.from(provided);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}
