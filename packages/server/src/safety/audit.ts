/**
 * Audit log access — APPEND-ONLY (FR-I.9).
 *
 * This module exposes exactly one operation: write. There is deliberately no
 * update function, no delete function, and no route that exposes either.
 * Every security-relevant decision in the pipeline — story accepted, story
 * rejected (and why), session capped, distress escalated, audio scheduled
 * for deletion — leaves a row here with enough detail to reconstruct the
 * decision on stage.
 */
import { Prisma, type PrismaClient } from '@prisma/client';

export interface AuditEntry {
  event: string;
  childId?: string;
  sessionId?: string;
  detail?: Record<string, unknown>;
}

/** Insert one audit row. Never throws for audit failures — a lost audit
 *  line must not kill the child's session; the error is logged instead. */
export async function audit(prisma: PrismaClient, entry: AuditEntry): Promise<void> {
  try {
    await prisma.auditLog.create({
      data: {
        event: entry.event,
        childId: entry.childId ?? null,
        sessionId: entry.sessionId ?? null,
        detail: entry.detail === undefined ? undefined : (entry.detail as unknown as Prisma.InputJsonValue)
      }
    });
  } catch (err) {
     
    console.error('[audit] failed to write entry', entry.event, err);
  }
}

/** Read-only access for the /metrics-demo card. */
export function auditQuery(prisma: PrismaClient) {
  return prisma.auditLog;
}
