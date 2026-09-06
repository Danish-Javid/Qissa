/**
 * Early track routes — the 0–4 "First Words" + "Kindness Corner" session.
 *
 *  POST /api/early/session          start a run: audit row + this run's deck
 *  GET  /api/early/art/:id          one illustration (disk-cached, deduped)
 *  POST /api/early/word-met         a word was met (append-only audit row)
 *  POST /api/early/vignette-done    a kindness scene was completed (audit row)
 *
 * Security shape mirrors the story routes: parent session required on every
 * route, child ownership re-proven before anything child-scoped, Zod on
 * every input. The catalog is static curated content — there is no
 * generator in this track, so the narration can never be steered by input.
 * Progress lands in the append-only audit log (no learner-model write yet:
 * at this age the session is about exposure, not mastery scores). The same
 * audit log is the spaced-repetition memory AND the per-run counter: the
 * session row count slides the deck rotation so no two runs repeat.
 */
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { z } from 'zod';
import type { FastifyInstance } from 'fastify';
import { ctx } from '../context.js';
import { buildDeck, EARLY_ART_HINTS, WORD_CARDS, VIGNETTES, type EarlyHistory } from '../early/catalog.js';
import { ART_CACHE_VERSION, stylePrompt } from '../providers/art-style.js';
import type { ImageResult } from '../providers/interfaces.js';
import { audit } from '../safety/audit.js';
import { denyNotFound, ownedChild, requireAuth } from './guards.js';
import { parseBody, parseParams } from './validate.js';

const SessionBody = z.object({ childId: z.string().min(1).max(64) }).strict();
/** Art ids are catalog keys, and the catalog only ever mints two shapes:
 *  `word-<card id>` and `vig-<vignette id>`. Pinning the shape here means a
 *  key that could never be in the catalog is rejected before any lookup. */
const ArtParams = z.object({ id: z.string().regex(/^(?:word|vig)-[a-z0-9-]{1,56}$/) }).strict();
const WordMetSchema = z
  .object({ childId: z.string().min(1).max(64), cardId: z.enum(WORD_CARDS.map((c) => c.id) as [string, ...string[]]) })
  .strict();
const VignetteDoneSchema = z
  .object({
    childId: z.string().min(1).max(64),
    vignetteId: z.enum(VIGNETTES.map((v) => v.id) as [string, ...string[]]),
    answeredKind: z.boolean()
  })
  .strict();
const QuizSchema = z
  .object({
    childId: z.string().min(1).max(64),
    cardId: z.enum(WORD_CARDS.map((c) => c.id) as [string, ...string[]]),
    correct: z.boolean(),
    attempts: z.number().int().min(1).max(9)
  })
  .strict();

/** On-disk art cache — curated pictures are drawn once and reused by every
 *  family forever (unlike story art, nothing here is child-specific). */
const earlyArtDir = path.resolve(process.cwd(), 'data', 'early-art');

/** In-flight generation dedup — many clients prefetch the same card while
 *  the picture is still being drawn; they must share ONE vendor call. */
const pendingImages = new Map<string, Promise<ImageResult>>();

export async function earlyRoutes(app: FastifyInstance): Promise<void> {
  const { prisma, providers } = ctx(app);
  await mkdir(earlyArtDir, { recursive: true });

  // Starting a run is a write on purpose: the audit row IS the run counter
  // that slides today's rotation, so every session draws something new.
  app.post('/session', { preHandler: requireAuth(app) }, async (request, reply) => {
    const body = parseBody(SessionBody, request.body, reply);
    if (body === null) return;

    const child = await ownedChild(prisma, body.childId, request.auth.parent.id);
    if (child === null) return denyNotFound(reply);

    // Spaced-repetition state, derived from the append-only audit log:
    // what this child has met, and which words their last quiz missed.
    const rows = await prisma.auditLog.findMany({
      where: { childId: child.id, event: { in: ['early.word-met', 'early.quiz'] } },
      orderBy: { createdAt: 'asc' },
      select: { event: true, detail: true }
    });
    const seen = new Set<string>();
    const lastQuiz = new Map<string, boolean>();
    for (const row of rows) {
      const detail = row.detail as { cardId?: string; correct?: boolean } | null;
      if (detail === null || detail.cardId === undefined) continue;
      seen.add(detail.cardId);
      if (row.event === 'early.quiz') lastQuiz.set(detail.cardId, detail.correct === true);
    }
    const history: EarlyHistory = {
      seen: [...seen],
      missed: [...lastQuiz.entries()].filter(([, ok]) => !ok).map(([id]) => id)
    };

    // Runs before this one = the rotation slide for this draw.
    const run = await prisma.auditLog.count({
      where: { childId: child.id, event: 'early.session' }
    });
    await audit(prisma, { event: 'early.session', childId: child.id, detail: { run } });

    const deck = buildDeck(child.id, history, new Date(), run);
    return {
      words: deck.words.map((c) => ({
        id: c.id,
        word: c.word,
        say: c.say,
        ask: c.ask,
        praise: c.praise,
        artUrl: `/api/early/art/word-${c.id}`
      })),
      vignette: {
        id: deck.vignette.id,
        title: deck.vignette.title,
        sceneLines: deck.vignette.sceneLines,
        question: deck.vignette.question,
        kindPraise: deck.vignette.kindPraise,
        gentleFix: deck.vignette.gentleFix,
        artUrl: `/api/early/art/vig-${deck.vignette.id}`
      },
      quiz: deck.quiz
    };
  });

  // One curated illustration. The id is validated against the closed catalog
  // map — an unknown id is a 404 before any file or vendor is touched. Art
  // here is identical for every family, so ownership is "signed-in parent",
  // exactly like the catalog itself.
  app.get('/art/:id', { preHandler: requireAuth(app) }, async (request, reply) => {
    const params = parseParams(ArtParams, request.params, reply);
    if (params === null) return;

    // Object.hasOwn, not `=== undefined`: EARLY_ART_HINTS is built with
    // Object.fromEntries, so it inherits Object.prototype and a lookup of
    // "constructor" / "__proto__" / "toString" returns something defined.
    // The bare undefined check therefore let those keys through to a PAID
    // vendor generation with a non-string prompt. An own-property test is the
    // only lookup that means what this guard reads as.
    if (!Object.hasOwn(EARLY_ART_HINTS, params.id)) return denyNotFound(reply);
    const hint = EARLY_ART_HINTS[params.id] as string;

    const ext = providers.mode === 'mock' ? 'svg' : 'png';
    const filePath = path.join(earlyArtDir, `${ART_CACHE_VERSION}-${params.id}.${ext}`);
    try {
      const cached = await readFile(filePath);
      return reply.type(ext === 'svg' ? 'image/svg+xml' : 'image/png').send(cached);
    } catch {
      // Not cached yet — generate (or join an in-flight generation), persist, serve.
    }

    try {
      let pending = pendingImages.get(filePath);
      if (pending === undefined) {
        // For a word card the id IS the word ("word-apple"), so pass that
        // rather than the art prose. The prose is written for an image model
        // and often never names the thing -- the dog card reads "a happy
        // puppy wagging its tail", which the offline renderer matched on
        // "tail". It happened to draw a dog; it just as easily would not have.
        const subject = params.id.startsWith('word-') ? params.id.slice('word-'.length) : hint;
        pending = providers.images.generateImage(stylePrompt(hint), subject);
        pendingImages.set(filePath, pending);
        pending.catch(() => undefined).finally(() => pendingImages.delete(filePath));
      }
      const result = await pending;
      await writeFile(filePath, result.image).catch(() => undefined);
      return reply.type(result.mimeType).send(Buffer.from(result.image));
    } catch {
      // Drawing failed — the player shows a friendly emoji instead; vendor
      // internals never surface (fail-closed, same as story illustration).
      return reply.code(404).send({ error: 'illustration unavailable' });
    }
  });

  app.post('/word-met', { preHandler: requireAuth(app) }, async (request, reply) => {
    const body = parseBody(WordMetSchema, request.body, reply);
    if (body === null) return;

    const child = await ownedChild(prisma, body.childId, request.auth.parent.id);
    if (child === null) return denyNotFound(reply);

    await audit(prisma, { event: 'early.word-met', childId: child.id, detail: { cardId: body.cardId } });
    return { ok: true };
  });

  app.post('/vignette-done', { preHandler: requireAuth(app) }, async (request, reply) => {
    const body = parseBody(VignetteDoneSchema, request.body, reply);
    if (body === null) return;

    const child = await ownedChild(prisma, body.childId, request.auth.parent.id);
    if (child === null) return denyNotFound(reply);

    await audit(prisma, {
      event: 'early.kindness',
      childId: child.id,
      detail: { vignetteId: body.vignetteId, answeredKind: body.answeredKind }
    });
    return { ok: true };
  });

  // One quiz round result. `correct` means first tap right; a miss lands
  // this card in the next deck's review slots (spacing effect).
  app.post('/quiz', { preHandler: requireAuth(app) }, async (request, reply) => {
    const body = parseBody(QuizSchema, request.body, reply);
    if (body === null) return;

    const child = await ownedChild(prisma, body.childId, request.auth.parent.id);
    if (child === null) return denyNotFound(reply);

    await audit(prisma, {
      event: 'early.quiz',
      childId: child.id,
      detail: { cardId: body.cardId, correct: body.correct, attempts: body.attempts }
    });
    return { ok: true };
  });
}
