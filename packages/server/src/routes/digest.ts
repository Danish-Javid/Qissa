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
 *   stories          recent stories with the gate decisions that produced
 *                    them, so the screen can answer "why THIS story?" in the
 *                    parent's own language (FR-I.9, FR-J)
 */
import type { GraphemeStat, LearnerModel, PipelineDecisionLike } from '@qissa/core';
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

    const [learner, sessions, alerts, auditRows, miscues, clips, stories] = await Promise.all([
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
      }),
      prisma.story.findMany({
        where: { childId: child.id },
        orderBy: { createdAt: 'desc' },
        take: 8,
        select: {
          id: true,
          title: true,
          level: true,
          theme: true,
          targetGrapheme: true,
          source: true,
          provenance: true,
          createdAt: true
        }
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
      audioClips: clips.map((c) => ({ id: c.id, createdAt: c.createdAt })),
      // The raw material for the "why this story" section. The wording lives
      // in core (explainStory) so the server and an offline browser produce
      // the same sentences; the route ships facts, not prose.
      stories: stories.map((story) => {
        const provenance = readProvenance(story.provenance);
        return {
          id: story.id,
          title: story.title,
          level: story.level,
          theme: story.theme,
          targetGrapheme: story.targetGrapheme,
          source: story.source,
          createdAt: story.createdAt,
          reviewGraphemes: provenance.reviewGraphemes,
          generator: provenance.generator,
          decisions: provenance.decisions
        };
      })
    };
  });
}

/**
 * Read a story's provenance JSON defensively.
 *
 * The column is Prisma `Json`, so its shape is whatever the engine wrote at
 * the time -- including rows written by an older PROMPT_VERSION, and the seed
 * script's rows. A digest that throws on one malformed legacy row would take
 * the whole screen down, so every field degrades to an empty default instead.
 */
interface ReadProvenance {
  generator: string | null;
  reviewGraphemes: string[];
  decisions: PipelineDecisionLike[];
}

function readProvenance(raw: unknown): ReadProvenance {
  const root = isRecord(raw) ? raw : {};
  const constraints = isRecord(root.constraints) ? root.constraints : {};
  return {
    generator: typeof root.generator === 'string' ? root.generator : null,
    reviewGraphemes: Array.isArray(constraints.reviewGraphemes)
      ? constraints.reviewGraphemes.filter((g): g is string => typeof g === 'string')
      : [],
    decisions: Array.isArray(root.decisions)
      ? root.decisions.filter(isDecision).map((d) => ({
          check: d.check,
          ok: d.ok,
          ...(typeof d.detail === 'string' ? { detail: d.detail } : {})
        }))
      : []
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isDecision(value: unknown): value is { check: string; ok: boolean; detail?: unknown } {
  return isRecord(value) && typeof value.check === 'string' && typeof value.ok === 'boolean';
}
