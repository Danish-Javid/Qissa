/**
 * App assembly — plugins, security headers, route registration, and the
 * SPA fallback that serves the built PWA from the same origin.
 *
 * Security stack registered here (plan §"Security — non-negotiable"):
 *   @fastify/helmet       strict CSP, no sniff, no referrer leakage
 *   @fastify/rate-limit   global ceiling + harder cap on /api/auth and /api/tts
 *   @fastify/cors         explicit allowlist, credentials for cookies
 *   @fastify/cookie       HttpOnly session cookies
 *
 * X-Forwarded-For is trusted only from TRUSTED_PROXY_NETS, because the rate
 * limiter keys on the client IP and a spoofable header empties every bucket.
 * The demo/pitch surface is registered only when demoSurfaceEnabled() says so.
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
import { demoSurfaceEnabled } from './config.js';
import { authRoutes } from './routes/auth.js';
import { childrenRoutes } from './routes/children.js';
import { demoRoutes } from './routes/demo.js';
import { digestRoutes } from './routes/digest.js';
import { earlyRoutes } from './routes/early.js';
import { healthRoutes, metricsRoutes } from './routes/health.js';
import { lessonRoutes } from './routes/lessons.js';
import { sessionRoutes } from './routes/sessions.js';
import { storyRoutes } from './routes/stories.js';
import { voiceRoutes } from './routes/voice.js';

export async function buildApp(appCtx: AppContext): Promise<FastifyInstance> {
  // Trust X-Forwarded-For ONLY from explicitly listed proxies; empty means the
  // client IP is the socket's own address. The blanket `NODE_ENV === 'production'`
  // this replaces trusted every hop, which lets a caller send a fresh
  // X-Forwarded-For per request and reset its own rate-limit bucket -- defeating
  // both the global ceiling and the credential cap whenever the app port is
  // reachable without a proxy in front of it (a published compose port, say).
  const trustedProxies = appCtx.env.TRUSTED_PROXY_NETS;
  const app = Fastify({
    logger: { level: appCtx.env.LOG_LEVEL },
    // The PWA posts JSON only; capping the body blunts resource-exhaustion.
    bodyLimit: 4 * 1024 * 1024,
    trustProxy: trustedProxies.length > 0 ? trustedProxies : false
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

    // Stage/judging surfaces -- one-tap demo seed/reset and the pitch card.
    // Registered only when the demo surface is on (default: off in production),
    // so a public build has NO route here at all and the /api not-found handler
    // answers 404. Seeding drives paid vendor generations and the metrics card
    // reports platform-wide aggregates to any signed-in parent; neither belongs
    // on an internet-reachable deployment.
    if (demoSurfaceEnabled(appCtx.env)) {
      await api.register(demoRoutes, { prefix: '/demo' });
      await api.register(metricsRoutes);
    }
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
