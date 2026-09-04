/**
 * Health + metrics-demo routes.
 *
 *  GET /api/health        liveness for Docker HEALTHCHECK (no auth, no DB)
 *  GET /api/metrics-demo  the pitch card: pipeline honesty numbers (auth)
 *
 * The metrics card exists because the product's claims are its pitch:
 * rejection rate, fallback rate, accent catches, session caps, distress
 * escalations and vendor spend — all straight from the audit trail.
 */
import type { FastifyInstance } from 'fastify';
import { ctx } from '../context.js';
import { requireAuth } from './guards.js';

export async function healthRoutes(app: FastifyInstance): Promise<void> {
  app.get('/health', async () => ({ status: 'ok', uptime: process.uptime() }));
}

export async function metricsRoutes(app: FastifyInstance): Promise<void> {
  const { prisma, providers } = ctx(app);

  app.get('/metrics-demo', { preHandler: requireAuth(app) }, async () => {
    const [accepted, rejected, fallbacks, capped, escalations, accentCatches, sessions] = await Promise.all([
      prisma.auditLog.count({ where: { event: 'story.accepted' } }),
      prisma.auditLog.count({ where: { event: { startsWith: 'story.rejected' } } }),
      prisma.auditLog.count({ where: { event: { startsWith: 'story.fallback' } } }),
      prisma.auditLog.count({ where: { event: 'session.capped' } }),
      prisma.distressAlert.count({ where: { severity: 'escalate' } }),
      prisma.miscue.count({ where: { accentApplied: true } }),
      prisma.readingSession.findMany({
        select: { costMicroUsd: true, wordsRead: true, wordsCorrect: true },
        orderBy: { startedAt: 'desc' },
        take: 100
      })
    ]);

    const totalWordsRead = sessions.reduce((sum, s) => sum + s.wordsRead, 0);
    const totalWordsCorrect = sessions.reduce((sum, s) => sum + s.wordsCorrect, 0);
    const totalCostMicroUsd = sessions.reduce((sum, s) => sum + s.costMicroUsd, 0);
    const storyDecisions = accepted + rejected;

    return {
      providerMode: providers.mode,
      pipeline: {
        storiesAccepted: accepted,
        storiesRejected: rejected,
        fallbacksServed: fallbacks,
        // The headline statistic: the gate rejects rather than risks.
        rejectionRate: storyDecisions > 0 ? rejected / storyDecisions : null
      },
      sessions: {
        recent: sessions.length,
        cappedByServer: capped,
        wordsRead: totalWordsRead,
        accuracy: totalWordsRead > 0 ? totalWordsCorrect / totalWordsRead : null,
        costMicroUsd: totalCostMicroUsd
      },
      safety: { distressEscalations: escalations, accentVariantCatches: accentCatches }
    };
  });
}
