/**
 * App assembly — plugins, security headers, route registration, and the
 * SPA fallback that serves the built PWA from the same origin.
 *
 * Security stack registered here (plan §"Security — non-negotiable"):
 *   @fastify/helmet       strict CSP, no sniff, no referrer leakage
 *   @fastify/rate-limit   global ceiling + harder cap on /api/auth
 *   @fastify/cors         explicit allowlist, credentials for cookies
 *   @fastify/cookie       HttpOnly session cookies
 *
 * Same-origin serving means the child's browser talks to exactly one
 * origin; there is no third-party script, font, or telemetry on the page.
 */
import { existsSync } from 'node:fs';
import path from 'node:path';
import Fastify, { type FastifyError, type FastifyInstance } from 'fastify';
import fastifyCookie from '@fastify/cookie';
import fastifyCors from '@fastify/cors';
import fastifyHelmet from '@fastify/helmet';
import fastifyRateLimit from '@fastify/rate-limit';
import fastifyStatic from '@fastify/static';
import type { AppContext } from './context.js';
import { authRoutes } from './routes/auth.js';
import { childrenRoutes } from './routes/children.js';
import { digestRoutes } from './routes/digest.js';
import { earlyRoutes } from './routes/early.js';
import { healthRoutes, metricsRoutes } from './routes/health.js';
import { lessonRoutes } from './routes/lessons.js';
import { sessionRoutes } from './routes/sessions.js';
import { storyRoutes } from './routes/stories.js';
import { voiceRoutes } from './routes/voice.js';

export async function buildApp(appCtx: AppContext): Promise<FastifyInstance> {
  const app = Fastify({
    logger: { level: appCtx.env.LOG_LEVEL },
    // The PWA posts JSON only; capping the body blunts resource-exhaustion.
    bodyLimit: 4 * 1024 * 1024,
    trustProxy: appCtx.env.NODE_ENV === 'production' // behind the Docker bridge
  });

  // Decorate before any plugin registers so guards can reach the context.
  await app.decorate('appCtx', appCtx);

  await app.register(fastifyCookie);

  await app.register(fastifyCors, {
    // Empty allowlist = no cross-origin reads at all (same-origin PWA).
    origin: appCtx.env.CORS_ORIGINS.length > 0 ? appCtx.env.CORS_ORIGINS : false,
    credentials: true
  });

  await app.register(fastifyHelmet, {
    contentSecurityPolicy: {
      directives: {
        'default-src': ["'self'"],
        // Inline styles are needed by some PWA shells; scripts never are.
        'style-src': ["'self'", "'unsafe-inline'"],
        'img-src': ["'self'", 'data:', 'blob:'],
        'media-src': ["'self'", 'blob:'],
        'connect-src': ["'self'"],
        'worker-src': ["'self'"],
        'manifest-src': ["'self'"],
        'base-uri': ["'none'"],
        'frame-ancestors': ["'none'"],
        'object-src': ["'none'"],
        'form-action': ["'self'"]
      }
    },
    hsts: appCtx.env.COOKIE_SECURE ? undefined : false, // HSTS only over HTTPS
    crossOriginResourcePolicy: { policy: 'same-origin' }
  });

  await app.register(fastifyRateLimit, {
    global: true,
    max: 600,
    timeWindow: '1 minute'
  });

  // ---------------------------------------------------------------- routes
  await app.register(async (api) => {
    // The credential endpoints carry their own, much tighter ceiling; it is
    // declared as route options inside authRoutes (CREDENTIAL_RATE_LIMIT),
    // because registering the plugin globally does not narrow a prefix.
    await api.register(authRoutes, { prefix: '/auth' });
    await api.register(childrenRoutes, { prefix: '/children' });
    await api.register(earlyRoutes, { prefix: '/early' });
    await api.register(lessonRoutes, { prefix: '/lessons' });
    await api.register(storyRoutes, { prefix: '/stories' });
    await api.register(sessionRoutes, { prefix: '/sessions' });
    await api.register(digestRoutes, { prefix: '/children' });
    await api.register(voiceRoutes, { prefix: '/' });
    await api.register(healthRoutes);
    await api.register(metricsRoutes);
  }, { prefix: '/api' });

  // ------------------------------------------------- PWA static + SPA fallback
  // The web bundle's location depends on the server's working directory:
  //   container  cwd = repo root (/srv/qissa)  -> packages/web/dist
  //   local dev  cwd = packages/server         -> ../web/dist
  // Accept both layouts instead of assuming one.
  const webDistCandidates = [
    path.resolve(process.cwd(), 'packages', 'web', 'dist'),
    path.resolve(process.cwd(), '..', 'web', 'dist')
  ];
  const webDist = webDistCandidates.find((dir) => existsSync(dir));
  if (webDist) {
    await app.register(fastifyStatic, { root: webDist });
    // Any non-API GET is the SPA; the client router takes over.
    app.setNotFoundHandler((request, reply) => {
      if (request.method === 'GET' && !request.url.startsWith('/api')) {
        return reply.sendFile('index.html');
      }
      return reply.code(404).send({ error: 'not found' });
    });
  }

  // Uniform error surface: never leak stack traces or vendor details.
  app.setErrorHandler((error: FastifyError, request, reply) => {
    request.log.error(error);
    const status = error.statusCode && error.statusCode >= 400 && error.statusCode < 600 ? error.statusCode : 500;
    void reply.code(status).send({ error: status < 500 ? error.message : 'internal error' });
  });

  return app;
}
