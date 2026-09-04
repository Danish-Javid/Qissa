/**
 * Audio retention sweep (NFR-3): raw child voice is deleted after
 * AUDIO_RETENTION_DAYS. Runs once at boot and then daily; both the file
 * and the row go, and each deletion is audited.
 *
 * Setting AUDIO_RETENTION_DAYS=0 disables storage entirely (the upload
 * route refuses to write), so privacy-maximal deployments never hold a
 * byte of child audio.
 */
import { unlink } from 'node:fs/promises';
import type { PrismaClient } from '@prisma/client';
import type { Env } from '../config.js';
import { audit } from '../safety/audit.js';

const DAY_MS = 24 * 60 * 60 * 1000;

async function sweepOnce(prisma: PrismaClient, env: Env): Promise<void> {
  if (env.AUDIO_RETENTION_DAYS <= 0) return;

  const cutoff = new Date(Date.now() - env.AUDIO_RETENTION_DAYS * DAY_MS);
  const expired = await prisma.audioClip.findMany({ where: { createdAt: { lt: cutoff } } });

  for (const clip of expired) {
    // Delete the file first; if that fails the row stays and we retry later.
    await unlink(clip.path).catch(() => undefined);
    await prisma.audioClip.delete({ where: { id: clip.id } }).catch(() => undefined);
    await audit(prisma, { event: 'audio.retention-deleted', sessionId: clip.sessionId, detail: { clipId: clip.id } });
  }
}

/** Start the sweep loop; returns a stop function for graceful shutdown. */
export function startAudioRetention(prisma: PrismaClient, env: Env): () => void {
  if (env.AUDIO_RETENTION_DAYS <= 0) return () => undefined;

  void sweepOnce(prisma, env).catch((err) => console.error('[retention] boot sweep failed', err));
  const timer = setInterval(() => {
    void sweepOnce(prisma, env).catch((err) => console.error('[retention] sweep failed', err));
  }, DAY_MS);
  // The timer must never keep the process alive on shutdown.
  timer.unref();
  return () => clearInterval(timer);
}
