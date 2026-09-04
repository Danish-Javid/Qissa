/**
 * Route guards — authentication, CSRF, and parent-ownership checks.
 *
 * Children never authenticate (FR-A.1): every child-scoped resource is
 * reached THROUGH a parent session, and ownership is re-proven on every
 * request. An IDOR here would leak one child's reading history to another
 * family, so the checks live in one shared place, not scattered per route.
 */
import type { Child, PrismaClient } from '@prisma/client';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { csrfTokenMatches, resolveSession } from '../auth/session.js';

/** Zod-free error shape used by every guard rejection. */
function deny(reply: FastifyReply, code: 401 | 403 | 404, error: string): void {
  void reply.code(code).send({ error });
}

/**
 * preHandler for parent-only routes. Resolves the session cookie, enforces
 * the CSRF double-submit on every mutating method, and attaches
 * `request.auth` for handlers.
 */
export function requireAuth(app: FastifyInstance) {
  return async (request: FastifyRequest, reply: FastifyReply): Promise<void> => {
    const resolved = await resolveSession(request, app.appCtx.prisma);
    if (resolved === null) {
      deny(reply, 401, 'unauthorized');
      return;
    }

    // CSRF double-submit: GET/HEAD are side-effect free; everything else
    // must echo the token it received at login.
    const safeMethod = request.method === 'GET' || request.method === 'HEAD' || request.method === 'OPTIONS';
    if (!safeMethod && !csrfTokenMatches(request, resolved.session.csrfToken)) {
      deny(reply, 403, 'csrf token missing or invalid');
      return;
    }

    request.auth = resolved;
  };
}

/** Load a child only if the signed-in parent owns it; null otherwise. */
export async function ownedChild(prisma: PrismaClient, childId: string, parentId: string): Promise<Child | null> {
  return prisma.child.findFirst({ where: { id: childId, parentId } });
}

/** 404 — deliberately indistinguishable from "does not exist", so an
 *  attacker cannot enumerate other families' child ids. */
export function denyNotFound(reply: FastifyReply): void {
  deny(reply, 404, 'not found');
}
