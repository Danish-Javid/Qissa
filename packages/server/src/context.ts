/**
 * Application context — one typed bundle of everything routes need.
 *
 * Decorated onto the Fastify instance at boot so handlers never reach for
 * globals, and tests can build an app with fakes. The module augmentation
 * below is what makes `app.appCtx` type-safe everywhere.
 */
import type { PrismaClient } from '@prisma/client';
import type { FastifyInstance, FastifyRequest } from 'fastify';
import type { Env } from './config.js';
import type { ProviderBundle } from './providers/index.js';
import type { SessionOrchestrator } from './session/orchestrator.js';
import type { ResolvedSession } from './auth/session.js';

export interface AppContext {
  prisma: PrismaClient;
  env: Env;
  providers: ProviderBundle;
  orchestrator: SessionOrchestrator;
}

declare module 'fastify' {
  interface FastifyInstance {
    appCtx: AppContext;
  }
  interface FastifyRequest {
    /** Set by the auth guard on protected routes; null elsewhere. */
    auth: ResolvedSession;
  }
}

/** Convenience accessor — keeps handlers to one line of plumbing. */
export function ctx(app: FastifyInstance): AppContext {
  return app.appCtx;
}

/** Age in whole years from a birth date, clamped to the supported band.
 *  The pedagogy engines are specified for ages 4–7 (FR-D.3). */
export function ageInYears(birthDate: Date, at = new Date()): number {
  const years = Math.floor((at.getTime() - birthDate.getTime()) / (365.25 * 24 * 60 * 60 * 1000));
  return Math.min(Math.max(years, 4), 7);
}

/** TRUE age in whole years (bounded 0–18 for sanity) — used for MODE routing
 *  across the full 1–6 band: First Words (1–2), Learn to Read (3–6), Story
 *  Time (common). The clamped ageInYears above stays for the read-along
 *  pedagogy (FR-D.3, specified 4–7); mode placement must see the real age. */
export function rawAgeInYears(birthDate: Date, at = new Date()): number {
  const years = Math.floor((at.getTime() - birthDate.getTime()) / (365.25 * 24 * 60 * 60 * 1000));
  return Math.min(Math.max(years, 0), 18);
}

/** Reject unknown request fields at the type level too (Zod strict()). */
export function requestId(request: FastifyRequest): string {
  return request.id;
}
