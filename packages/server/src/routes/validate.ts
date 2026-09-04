/**
 * Request validation helper — Zod on every body, reject-unknown-fields.
 *
 * Fastify's built-in JSON schema validation is bypassed in favor of the
 * same Zod engines the rest of the system uses; one code path for input
 * contracts means one set of tests covers both. Handlers call this first
 * and bail on null.
 */
import type { FastifyReply } from 'fastify';
import type { ZodType } from 'zod';

/** Parse a request body with Zod. On failure sends 400 and returns null. */
export function parseBody<Output>(schema: ZodType<Output>, body: unknown, reply: FastifyReply): Output | null {
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    const issues = parsed.error.issues.map((i) => `${i.path.join('.') || '(body)'}: ${i.message}`).join('; ');
    void reply.code(400).send({ error: `invalid request: ${issues}` });
    return null;
  }
  return parsed.data;
}

/** Parse URL params with Zod; 400 on failure. */
export function parseParams<Output>(schema: ZodType<Output>, params: unknown, reply: FastifyReply): Output | null {
  return parseBody(schema, params, reply);
}

/** Parse a query string with Zod; 400 on failure. */
export function parseQuery<Output>(schema: ZodType<Output>, query: unknown, reply: FastifyReply): Output | null {
  return parseBody(schema, query, reply);
}
