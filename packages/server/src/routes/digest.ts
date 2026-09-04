/**
 * Digest route — the parent's window into what happened (FR-I).
 *
 *  GET /api/children/:id/digest
 *
 * One payload renders the whole digest screen:
 *   sessions         recent reading sessions with totals + cap flags
 *   learner          level, mastered/learning/reteach graphemes, fluency
 *   distress         escalation flags (category only — never raw words)
 *   reasoning        the audit trail of pipeline decisions (FR-I.9)
 *   miscues          recent word-level evidence, incl. accent notes
 *   audioClips       references to retained clips (NFR-3)
 */
import type { GraphemeStat, LearnerModel } from '@qissa/core';
import { z } from 'zod';
import type { FastifyInstance } from 'fastify';
import { ctx } from '../context.js';
import { denyNotFound, ownedChild, requireAuth } from './guards.js';
import { parseParams } from './validate.js';

const ChildIdParams = z.object({ id: z.string().min(1).max(64) }).strict();

export async function digestRoutes(app: FastifyInstance): Promise<void> {
  const { prisma } = ctx(app);

  app.get('/:id/digest', { preHandler: requireAuth(app) }, async (request, reply) => {
    const params = parseParams(ChildIdParams, request.params, reply);
    if (params === null) return;

    const child = await ownedChild(prisma, params.id, request.auth.parent.id);
    if (child === null) return denyNotFound(reply);

    const [learner, sessions, alerts, auditRows, miscues, clips] = await Promise.all([
      prisma.learnerModel.findUnique({ where: { childId: child.id } }),
      prisma.readingSession.findMany({
        where: { childId: child.id },
        orderBy: { startedAt: 'desc' },
        take: 15
      }),
      prisma.distressAlert.findMany({
        where: { childId: child.id, severity: 'escalate' },
        orderBy: { createdAt: 'desc' },
        take: 10
      }),
      prisma.auditLog.findMany({ where: { childId: child.id }, orderBy: { createdAt: 'desc' }, take: 40 }),
      prisma.miscue.findMany({
        where: { session: { childId: child.id } },
        orderBy: { createdAt: 'desc' },
        take: 30
      }),
      prisma.audioClip.findMany({
        where: { session: { childId: child.id } },
        orderBy: { createdAt: 'desc' },
        take: 10
      })
    ]);

    const model = learner?.state as unknown as LearnerModel | null;
    const stats: GraphemeStat[] = model ? Object.values(model.graphemeStats) : [];

    return {
      child: { id: child.id, name: child.name, consentGivenAt: request.auth.parent.consentGivenAt },
      learner: model
        ? {
            currentLevel: model.currentLevel,
            mastered: stats.filter((s) => s.status === 'mastered').map((s) => s.grapheme),
            learning: stats.filter((s) => s.status === 'learning' && s.exposures > 0).map((s) => s.grapheme),
            reteach: stats.filter((s) => s.status === 'reteach').map((s) => s.grapheme),
            vocabularyCount: model.vocabulary.length,
            fluency: model.fluency.slice(-10)
          }
        : null,
      sessions: sessions.map((s) => ({
        id: s.id,
        startedAt: s.startedAt,
        endedAt: s.endedAt,
        cappedByServer: s.cappedByServer,
        wordsRead: s.wordsRead,
        wordsCorrect: s.wordsCorrect,
        wordsPerMinute: s.wordsPerMinute,
        costMicroUsd: s.costMicroUsd,
        providerMode: s.providerMode
      })),
      distressEscalations: alerts.map((a) => ({ category: a.category, createdAt: a.createdAt })),
      reasoning: auditRows.map((a) => ({ event: a.event, createdAt: a.createdAt, detail: a.detail })),
      miscues: miscues.map((m) => ({
        expected: m.expected,
        spoken: m.spoken,
        miscueType: m.miscueType,
        grapheme: m.grapheme,
        ladderStep: m.ladderStep,
        accentApplied: m.accentApplied,
        accentNote: m.accentNote
      })),
      audioClips: clips.map((c) => ({ id: c.id, createdAt: c.createdAt }))
    };
  });
}
