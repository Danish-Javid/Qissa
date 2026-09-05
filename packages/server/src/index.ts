/**
 * Server bootstrap — env, Prisma, providers, orchestrator, HTTP listener.
 *
 * Order matters:
 *   1. loadEnv crashes fast on bad configuration (config.ts)
 *   2. the Prisma client connects lazily; a first-query failure is fatal
 *   3. providers are wired once (mock by default, Alibaba behind env keys)
 *   4. the app listens and announces readiness for Docker HEALTHCHECK
 *
 * Graceful shutdown closes the listener, then the DB pool — in-flight
 * turns finish because the orchestrator's DB writes are awaited per turn.
 */
import { loadEnv } from './config.js';
import { db } from './db.js';
import { getProviders } from './providers/index.js';
import { SessionOrchestrator } from './session/orchestrator.js';
import { startAudioRetention } from './jobs/audio-retention.js';
import { buildApp } from './app.js';

async function main(): Promise<void> {
  const env = loadEnv();
  const prisma = db(env.DATABASE_URL);
  const providers = getProviders(env); // throws at boot if misconfigured
  const orchestrator = new SessionOrchestrator(prisma, env);
  const stopRetention = startAudioRetention(prisma, env);

  const app = await buildApp({ prisma, env, providers, orchestrator });

  const shutdown = async (signal: string): Promise<void> => {
    app.log.info(`${signal} received — shutting down`);
    stopRetention();
    await app.close();
    await prisma.$disconnect();
    process.exit(0);
  };
  process.on('SIGINT', () => void shutdown('SIGINT'));
  process.on('SIGTERM', () => void shutdown('SIGTERM'));

  await app.listen({ port: env.PORT, host: '0.0.0.0' });
  app.log.info(
    `Qissa server ready — mode=${providers.mode}, sessionCap=${env.SESSION_CAP_MINUTES}min, audioRetention=${env.AUDIO_RETENTION_DAYS}d`
  );
}

main().catch((err) => {
  // Boot failures must be loud and readable in docker logs.
   
  console.error('[qissa] failed to start:', err);
  process.exit(1);
});
