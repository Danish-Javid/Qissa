/**
 * Session routes — the live reading turn loop.
 *
 *  POST /api/sessions              start (story + child -> ReadingSession row)
 *  POST /api/sessions/:id/turn     one protocol turn (read, ladder, PEER…)
 *  POST /api/sessions/:id/close    natural narrative close
 *
 * The ReadingSession row is the durable record; the orchestrator keeps the
 * minutes-long live state in memory. If the server restarted mid-story the
 * live state is gone and the route answers 404 — the client resumes with a
 * fresh session, and the learner model never sees a half-folded line.
 */
import type { LearnerModel, Story, WorldSeed } from '@qissa/core';
import { z } from 'zod';
import type { FastifyInstance } from 'fastify';
import { ageInYears, ctx } from '../context.js';
import type { TurnInput } from '../session/orchestrator.js';
import { denyNotFound, ownedChild, requireAuth } from './guards.js';
import { parseBody, parseParams } from './validate.js';

const StartSchema = z.object({ childId: z.string().min(1).max(64), storyId: z.string().min(1).max(64) }).strict();
const SessionIdParams = z.object({ id: z.string().min(1).max(64) }).strict();

/** Wire schema for the turn protocol — mirrors session/TurnInput exactly.
 *  Unknown `kind` values are rejected, so a crafted payload can never
 *  reach the protocol reducers (FR-I.7). */
const TurnSchema = z
  .discriminatedUnion('kind', [
    z.object({ kind: z.literal('plan-ritual-done') }).strict(),
    z
      .object({
        kind: z.literal('read-line'),
        pageIndex: z.number().int().min(0).max(99),
        spoken: z.array(z.string().max(40)).max(60),
        hesitations: z.array(z.number().int().min(0).max(99)).max(60).optional()
      })
      .strict(),
    z
      .object({
        kind: z.literal('ladder'),
        event: z.enum(['stall', 'waitElapsed', 'attemptFailed', 'readCorrectly', 'selfCorrected']),
        word: z.string().max(30).optional()
      })
      .strict(),
    z.object({ kind: z.literal('utterance'), text: z.string().max(500) }).strict(),
    z.object({ kind: z.literal('page-complete'), pageIndex: z.number().int().min(0).max(99) }).strict(),
    z
      .object({
        kind: z.literal('choose'),
        chosenIndex: z.union([z.literal(0), z.literal(1)]),
        rationale: z.string().max(500).optional()
      })
      .strict()
  ]);

export async function sessionRoutes(app: FastifyInstance): Promise<void> {
  const { prisma, orchestrator, env } = ctx(app);

  /** Prove ownership of a session's child; null = not yours or missing. */
  async function ownedSession(sessionId: string, parentId: string) {
    const session = await prisma.readingSession.findUnique({
      where: { id: sessionId },
      include: { child: true }
    });
    if (session === null || session.child.parentId !== parentId) return null;
    return session;
  }

  app.post('/', { preHandler: requireAuth(app) }, async (request, reply) => {
    const body = parseBody(StartSchema, request.body, reply);
    if (body === null) return;

    const child = await ownedChild(prisma, body.childId, request.auth.parent.id);
    if (child === null) return denyNotFound(reply);

    const [story, learner] = await Promise.all([
      prisma.story.findFirst({ where: { id: body.storyId, childId: child.id } }),
      prisma.learnerModel.findUnique({ where: { childId: child.id } })
    ]);
    if (story === null || learner === null) return denyNotFound(reply);

    const row = await prisma.readingSession.create({
      data: { childId: child.id, storyId: story.id, providerMode: env.PROVIDER_MODE }
    });

    orchestrator.start({
      sessionId: row.id,
      childId: child.id,
      storyId: story.id,
      story: story.content as unknown as Story,
      worldSeed: child.worldSeed as unknown as WorldSeed,
      ageYears: ageInYears(child.birthDate),
      taughtGraphemes: (learner.state as unknown as LearnerModel).taughtGraphemes,
      taughtTrickyWords: (learner.state as unknown as LearnerModel).taughtTrickyWords,
      learnerModel: learner.state as unknown as LearnerModel,
      providerMode: env.PROVIDER_MODE
    });

    return reply.code(201).send({
      sessionId: row.id,
      snapshot: orchestrator.snapshot(row.id),
      // The word-by-word teach→blend→check pass segments each word with the
      // SAME taught set the correction ladder uses server-side, so the client
      // never guesses a word's sounds (a digraph stays one sound). Sent once
      // at start; the per-turn snapshot stays lean.
      taughtGraphemes: (learner.state as unknown as LearnerModel).taughtGraphemes
    });
  });

  app.post('/:id/turn', { preHandler: requireAuth(app) }, async (request, reply) => {
    const params = parseParams(SessionIdParams, request.params, reply);
    if (params === null) return;
    const session = await ownedSession(params.id, request.auth.parent.id);
    if (session === null) return denyNotFound(reply);

    const input = parseBody(TurnSchema, request.body, reply);
    if (input === null) return;

    const result = await orchestrator.turn(params.id, input as TurnInput);
    if (result === null) return denyNotFound(reply);
    return result;
  });

  app.post('/:id/close', { preHandler: requireAuth(app) }, async (request, reply) => {
    const params = parseParams(SessionIdParams, request.params, reply);
    if (params === null) return;
    const session = await ownedSession(params.id, request.auth.parent.id);
    if (session === null) return denyNotFound(reply);

    const result = await orchestrator.close(params.id);
    if (result === null) return denyNotFound(reply);
    return result;
  });
}
