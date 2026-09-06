/**
 * Story routes — the fail-closed pipeline, exposed.
 *
 *  POST /api/stories        generate (or safely fall back to) the next story
 *  GET  /api/stories/:id    fetch a previously served story
 *
 * The heavy lifting lives in src/story/story-engine.ts; these routes only
 * prove ownership, load the learner model, and shape the response.
 */
import { parseChildSettings, resolveStoryPacing, resolveStoryTimeEnabled, type LearnerModel, type WorldSeed } from '@qissa/core';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { z } from 'zod';
import type { FastifyInstance } from 'fastify';
import { ageInYears, ctx, rawAgeInYears } from '../context.js';
import { ART_CACHE_VERSION, stylePrompt } from '../providers/art-style.js';
import { MockImageGenerator } from '../providers/mock/index.js';
import type { ImageResult } from '../providers/interfaces.js';
import { ensurePageArt, illustrationDir, storyArtStatus, warmStoryArt } from '../story/art.js';
import { prefetchStory, serveStory } from '../story/story-engine.js';
import { denyNotFound, ownedChild, requireAuth } from './guards.js';
import { parseBody, parseParams } from './validate.js';

const GenerateSchema = z.object({ childId: z.string().min(1).max(64) }).strict();
const StoryIdParams = z.object({ id: z.string().min(1).max(64) }).strict();
const IllustrationParams = z
  .object({ id: z.string().min(1).max(64), page: z.coerce.number().int().min(0).max(63) })
  .strict();
const GiftParams = z.object({ id: z.string().min(1).max(64) }).strict();

/** Story Time is a receptive cartoon, not a mastery-sized read-along: it asks
 *  for a fixed, longer book so the narrated story runs ~2 minutes for every
 *  age (the read-along keeps its adaptive 4→20 page length). Eight pages of
 *  rich picture-talk, each held until its FLUX art lands, clear two minutes. */
const STORY_TIME_PAGES = 8;

/** In-flight dedup for the GIFT image only; page art is deduped inside
 *  story/art.ts, which both the warmer and the page route go through. */
const pendingImages = new Map<string, Promise<ImageResult>>();

/**
 * The deterministic house-style placeholder used by low-bandwidth mode. One
 * instance, because it holds no per-request state and drawing an SVG is pure.
 */
const placeholderImages = new MockImageGenerator();

/**
 * Pick the image source for a child: the configured vendor, or the local
 * placeholder when the parent has asked for low-bandwidth mode. Returning the
 * SAME object reference as `providers.images` when the setting is off is what
 * lets the caller detect the mode with a cheap identity check.
 */
function chooseImages<T>(settings: unknown, vendor: T): T | MockImageGenerator {
  return parseChildSettings(settings).lowBandwidth === true ? placeholderImages : vendor;
}

export async function storyRoutes(app: FastifyInstance): Promise<void> {
  const { prisma, providers, env } = ctx(app);
  await mkdir(illustrationDir, { recursive: true });

  app.post('/prefetch', { preHandler: requireAuth(app) }, async (request, reply) => {
    // Warm the story cache while the child is still on the door screen, so
    // the tap on "Let's read!" collects a ready story instead of waiting on
    // the generator. Fire-and-forget: prefetch teaches nothing and persists
    // nothing — a 202 here never mutates the learner model.
    const body = parseBody(GenerateSchema, request.body, reply);
    if (body === null) return;

    const child = await ownedChild(prisma, body.childId, request.auth.parent.id);
    if (child === null) return denyNotFound(reply);
    const learner = await prisma.learnerModel.findUnique({ where: { childId: child.id } });
    if (learner === null) return denyNotFound(reply);

    void prefetchStory({
      prisma,
      providers,
      childId: child.id,
      worldSeed: child.worldSeed as unknown as WorldSeed,
      learnerModel: learner.state as unknown as LearnerModel,
      ageYears: ageInYears(child.birthDate)
    }).catch(() => undefined);
    return reply.code(202).send({ queued: true });
  });

  app.post('/', { preHandler: requireAuth(app) }, async (request, reply) => {
    const body = parseBody(GenerateSchema, request.body, reply);
    if (body === null) return;

    const child = await ownedChild(prisma, body.childId, request.auth.parent.id);
    if (child === null) return denyNotFound(reply);

    const learner = await prisma.learnerModel.findUnique({ where: { childId: child.id } });
    if (learner === null) return denyNotFound(reply);

    try {
      const result = await serveStory({
        prisma,
        providers,
        childId: child.id,
        worldSeed: child.worldSeed as unknown as WorldSeed,
        learnerModel: learner.state as unknown as LearnerModel,
        ageYears: ageInYears(child.birthDate),
        dailyStoryBudget: env.DAILY_STORY_BUDGET_PER_CHILD
      });
      return reply.code(201).send({
        storyId: result.storyId,
        source: result.source,
        story: result.story,
        decisions: result.decisions
      });
    } catch {
      // Pipeline exhausted (audit row already written) — 503 with no
      // internals; the client offers the offline cache instead.
      return reply.code(503).send({ error: 'no safe story available right now' });
    }
  });

  /**
   * Story Time — the common RECEPTIVE mode (ages 1–6). It runs the exact same
   * safe, personalized pipeline as the read-along (world seed canon, content
   * filter, theme-carried morals woven INTO the narrative, FLUX art) but with
   * teach=false, so listening never advances what the child can decode. The
   * player narrates each page's rich pictureTalk line over its illustration at
   * the parent-chosen pace. Gated on the parental Story Time toggle BEFORE any
   * spend, and the response echoes the pacing so the client and the parent's
   * control cannot disagree.
   */
  app.post('/story-time', { preHandler: requireAuth(app) }, async (request, reply) => {
    const body = parseBody(GenerateSchema, request.body, reply);
    if (body === null) return;

    const child = await ownedChild(prisma, body.childId, request.auth.parent.id);
    if (child === null) return denyNotFound(reply);

    // resolveStoryTimeEnabled is the SAME pure helper the children list uses to
    // decide whether to show the door, so a child who could see Story Time is
    // always allowed to play it, and a disabled one is refused here too.
    const settings = parseChildSettings(child.settings);
    const ageYears = rawAgeInYears(child.birthDate);
    if (!resolveStoryTimeEnabled(ageYears, settings)) {
      return reply.code(403).send({ error: 'story time is disabled for this child' });
    }

    const learner = await prisma.learnerModel.findUnique({ where: { childId: child.id } });
    if (learner === null) return denyNotFound(reply);

    try {
      const result = await serveStory({
        prisma,
        providers,
        childId: child.id,
        worldSeed: child.worldSeed as unknown as WorldSeed,
        learnerModel: learner.state as unknown as LearnerModel,
        // Raw age, not the read-along 4–7 clamp: a 2-year-old's Story Time
        // should sound like it is for a 2-year-old. promptDensityForAge clamps
        // internally, so an age below the pedagogy band is handled gracefully.
        ageYears,
        teach: false, // receptive — never advance the learner model
        pageCountOverride: STORY_TIME_PAGES, // a longer book, so it runs ~2 min
        dailyStoryBudget: env.DAILY_STORY_BUDGET_PER_CHILD
      });
      // Draw the WHOLE book now, four pages at a time, rather than leaving the
      // client's <img> requests to trigger generation one page ahead of the
      // narration. At the measured ~13s an illustration, lazy drawing meant
      // the last picture landed ~40s into a two-minute story — the child heard
      // page six over page two's placeholder. Fire-and-forget: the story is
      // returned immediately and /art-status tells the player when to start.
      const storyImages = chooseImages(child.settings, providers.images);
      void warmStoryArt({
        storyId: result.storyId,
        pages: result.story.pages.map((p) => ({
          hint: p.illustrationHint ?? 'a warm storybook scene',
          subject: p.text ?? p.illustrationHint ?? ''
        })),
        images: storyImages,
        lowBandwidth: storyImages !== providers.images,
        mock: providers.mode === 'mock'
      }).catch(() => undefined);

      return reply.code(201).send({
        storyId: result.storyId,
        source: result.source,
        story: result.story,
        pacing: resolveStoryPacing(settings)
      });
    } catch {
      // Pipeline exhausted (audit row already written) — 503 with no internals.
      return reply.code(503).send({ error: 'no safe story available right now' });
    }
  });

  app.get('/:id', { preHandler: requireAuth(app) }, async (request, reply) => {
    const params = parseParams(StoryIdParams, request.params, reply);
    if (params === null) return;

    const story = await prisma.story.findUnique({
      where: { id: params.id },
      include: { child: { select: { parentId: true } } }
    });
    if (story === null || story.child.parentId !== request.auth.parent.id) return denyNotFound(reply);

    return { id: story.id, level: story.level, title: story.title, theme: story.theme, source: story.source, content: story.content };
  });

  // Per-page illustration for the picture-walk. Generated on first request and
  // cached on disk; the picture carries the page's meaning before the child
  // decodes (research-backed picture-first protocol). Ownership is re-proven
  // exactly like the story itself — an IDOR must not leak another family's art.
  app.get('/:id/pages/:page/illustration', { preHandler: requireAuth(app) }, async (request, reply) => {
    const params = parseParams(IllustrationParams, request.params, reply);
    if (params === null) return;

    const story = await prisma.story.findUnique({
      where: { id: params.id },
      include: { child: { select: { parentId: true, settings: true } } }
    });
    if (story === null || story.child.parentId !== request.auth.parent.id) return denyNotFound(reply);

    const content = story.content as unknown as {
      pages?: Array<{ text?: string; illustrationHint?: string }>;
    };
    const page = content.pages?.[params.page];
    if (page === undefined) return denyNotFound(reply);
    const hint = page.illustrationHint ?? 'a warm storybook scene';
    // The page's own SENTENCE is the subject, not the illustration hint. The
    // hint is prose that opens with art boilerplate ("warm flat storybook
    // scene: ..."), whereas the sentence is nothing but curriculum words --
    // which is exactly the vocabulary the pictogram table is built from, and
    // is also what the picture is supposed to depict for the child.
    const subject = page.text ?? hint;

    // Low-bandwidth mode: draw the deterministic house-style placeholder
    // locally instead of calling the image vendor. On a metered Pakistani
    // mobile connection a generated PNG per page is by far the heaviest thing
    // this app does, so a parent can ask for words-only without giving up the
    // story. Cached under a distinct suffix so switching the setting back does
    // not serve a placeholder from the real image's cache slot.
    const images = chooseImages(story.child.settings, providers.images);
    const lowBandwidth = images !== providers.images;

    try {
      // Shared with the server-side warmer, so a page the warmer is already
      // drawing is JOINED rather than generated a second time.
      const result = await ensurePageArt({
        storyId: story.id,
        pageIndex: params.page,
        lowBandwidth,
        mock: providers.mode === 'mock',
        images,
        hint,
        subject
      });
      return reply.type(result.mimeType).send(Buffer.from(result.image));
    } catch {
      // Image generation failed — the picture-walk degrades to text-only;
      // never surface vendor internals to the client (fail-closed).
      return reply.code(404).send({ error: 'illustration unavailable' });
    }
  });

  /**
   * Is this story's art ready to play?
   *
   * Story Time narrates itself; if it starts before the pictures exist, the
   * child hears page three while looking at page one's placeholder. The
   * player polls this and holds the curtain until the book is playable, which
   * is only honest because the server starts drawing every page the moment
   * the story is created rather than waiting for the client to ask.
   */
  app.get('/:id/art-status', { preHandler: requireAuth(app) }, async (request, reply) => {
    const params = parseParams(StoryIdParams, request.params, reply);
    if (params === null) return;

    const story = await prisma.story.findUnique({
      where: { id: params.id },
      include: { child: { select: { parentId: true, settings: true } } }
    });
    if (story === null || story.child.parentId !== request.auth.parent.id) return denyNotFound(reply);

    const content = story.content as unknown as { pages?: unknown[] };
    const pageCount = content.pages?.length ?? 0;
    const images = chooseImages(story.child.settings, providers.images);
    const status = await storyArtStatus(story.id, pageCount, {
      lowBandwidth: images !== providers.images,
      mock: providers.mode === 'mock'
    });
    return reply.send(status);
  });

  /**
   * The Story Time / read-along GIFT — one personalized FLUX keepsake drawn at
   * the close to celebrate finishing the story (the "Learn to Read" reward).
   * It reuses the exact illustration pipeline (house art direction, on-disk
   * cache keyed `${id}-gift`, in-flight dedup, fail-closed 404) so a gift is
   * generated once per story and never leaks another family's art: ownership
   * is re-proven the same way. The prompt is celebratory and carries the
   * child's name and the story's theme — warm, no text the child must read.
   */
  app.get('/:id/gift', { preHandler: requireAuth(app) }, async (request, reply) => {
    const params = parseParams(GiftParams, request.params, reply);
    if (params === null) return;

    const story = await prisma.story.findUnique({
      where: { id: params.id },
      include: { child: { select: { parentId: true, name: true, settings: true } } }
    });
    if (story === null || story.child.parentId !== request.auth.parent.id) return denyNotFound(reply);

    const content = story.content as unknown as { theme?: string };
    const hint = `a joyful storybook celebration keepsake: ${story.child.name} cheering proudly, confetti and warm golden light, a happy bravo ending, ${content.theme ?? 'kindness'} theme`;

    // The gift honours low-bandwidth mode too. A parent who asked not to spend
    // data on page art did not quietly agree to spend it on the reward.
    const images = chooseImages(story.child.settings, providers.images);
    const lowBandwidth = images !== providers.images;

    const ext = lowBandwidth || providers.mode === 'mock' ? 'svg' : 'png';
    const suffix = lowBandwidth ? '-gift-lite' : '-gift';
    const filePath = path.join(illustrationDir, `${ART_CACHE_VERSION}-${story.id}${suffix}.${ext}`);
    try {
      const cached = await readFile(filePath);
      return reply.type(ext === 'svg' ? 'image/svg+xml' : 'image/png').send(cached);
    } catch {
      // Not cached yet — generate (or join an in-flight generation) below.
    }

    try {
      let pending = pendingImages.get(filePath);
      if (pending === undefined) {
        pending = images.generateImage(stylePrompt(hint), 'gift');
        pendingImages.set(filePath, pending);
        pending.catch(() => undefined).finally(() => pendingImages.delete(filePath));
      }
      const result = await pending;
      await writeFile(filePath, result.image).catch(() => undefined);
      return reply.type(result.mimeType).send(Buffer.from(result.image));
    } catch {
      // No gift image — the close screen simply omits it (fail-closed).
      return reply.code(404).send({ error: 'gift unavailable' });
    }
  });
}
