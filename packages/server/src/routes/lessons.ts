/**
 * Lesson routes — the standalone "Learn to Read" (ages 3–6) phonics lesson.
 *
 *  POST /api/lessons                 build the next lesson + advance mastery
 *  GET  /api/lessons/:childId/gift   one personalized FLUX celebration keepsake
 *
 * This is the "Toddlers Can Read" method as a service, NOT a story: the plan
 * is pure, deterministic pedagogy (buildLessonPlan in @qissa/core), so the
 * server and the browser agree on exactly what one lesson teaches — the next
 * new letter SOUNDS, real decodable words to BLEND with them, and the next
 * SIGHT words. There is no generator and no LLM in the lesson content, so the
 * instruction can never be steered by input; the only child-specific art is
 * the closing celebration gift.
 *
 * Security shape mirrors the story/early routes: parent session required on
 * every route, child ownership re-proven before anything child-scoped, Zod on
 * every input, and an append-only audit row recording what was taught. Serving
 * a lesson advances the mastery model — exactly like the read-along credits on
 * serve — using the same tested primitives (introduceNextGrapheme,
 * teachTrickyWord), so a lesson and a story move the same learner record the
 * same way and can never disagree about what the child knows.
 */
import { Prisma } from '@prisma/client';
import {
  applyLessonToModel,
  buildLessonPlan,
  isPicturableWord,
  type LearnerModel,
  type WorldSeed
} from '@qissa/core';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { z } from 'zod';
import type { FastifyInstance } from 'fastify';
import { ctx } from '../context.js';
import { stylePrompt } from '../providers/art-style.js';
import type { ImageResult } from '../providers/interfaces.js';
import { audit } from '../safety/audit.js';
import { denyNotFound, ownedChild, requireAuth } from './guards.js';
import { parseBody, parseParams } from './validate.js';

const LessonBody = z.object({ childId: z.string().min(1).max(64) }).strict();
const LessonGiftParams = z.object({ childId: z.string().min(1).max(64) }).strict();
/** Word art is keyed by a bare curriculum word: lowercase letters only, short.
 *  The real allow-list check (isPicturableWord) happens in the handler. */
const LessonArtParams = z.object({ word: z.string().regex(/^[a-z]{1,14}$/) }).strict();

/** Personalized FLUX art shares the story illustration cache dir; the
 *  `-lesson-gift` key keeps a lesson keepsake distinct from any story's. */
const illustrationDir = path.resolve(process.cwd(), 'data', 'illustrations');

/** In-flight generation dedup — the client warms the gift while the lesson
 *  plays; the warm and the final <img> must share ONE vendor call, not two. */
const pendingImages = new Map<string, Promise<ImageResult>>();

export async function lessonRoutes(app: FastifyInstance): Promise<void> {
  const { prisma, providers } = ctx(app);
  await mkdir(illustrationDir, { recursive: true });

  app.post('/', { preHandler: requireAuth(app) }, async (request, reply) => {
    const body = parseBody(LessonBody, request.body, reply);
    if (body === null) return;

    const child = await ownedChild(prisma, body.childId, request.auth.parent.id);
    if (child === null) return denyNotFound(reply);

    const learner = await prisma.learnerModel.findUnique({ where: { childId: child.id } });
    if (learner === null) return denyNotFound(reply);

    const model = learner.state as unknown as LearnerModel;
    const worldSeed = child.worldSeed as unknown as WorldSeed;

    // The lesson content is pure and deterministic: the next new sounds, real
    // words to blend with them, and the next sight words — all gated so the
    // child never meets a word she cannot yet sound out.
    const plan = buildLessonPlan(model, worldSeed);

    // Advance the mastery boundary exactly as the read-along credits on serve:
    // the new sounds this lesson taught (which also pulls in the level's tricky
    // words and bumps currentLevel) plus the sight words shown. A review lesson
    // adds no new sounds, so it credits nothing new — fluency practice never
    // silently promotes a reader. Pure and tested in @qissa/core.
    const updated = applyLessonToModel(model, plan);

    await audit(prisma, {
      event: 'lesson.served',
      childId: child.id,
      detail: {
        level: plan.level,
        isReview: plan.isReview,
        newSounds: plan.newSounds.map((s) => s.grapheme),
        blendWords: plan.blendWords.map((b) => b.word),
        sightWords: plan.sightWords.map((s) => s.word)
      }
    });

    await prisma.learnerModel.upsert({
      where: { childId: child.id },
      create: { childId: child.id, schemaVersion: updated.schemaVersion, state: updated as unknown as Prisma.InputJsonValue },
      update: { schemaVersion: updated.schemaVersion, state: updated as unknown as Prisma.InputJsonValue }
    });

    // Word pictures: every CONCRETE word this lesson names gets a FLUX
    // illustration URL (drawn once, cached on disk, shared across children and
    // lessons). Glue and sight words stay text-only — there is no single image
    // a child can point at for "at" or "the", so we never fake one.
    const art: Record<string, string> = {};
    for (const sound of plan.newSounds) {
      if (isPicturableWord(sound.exampleWord)) art[sound.exampleWord] = `/api/lessons/art/${sound.exampleWord}`;
    }
    for (const blend of plan.blendWords) {
      if (isPicturableWord(blend.word)) art[blend.word] = `/api/lessons/art/${blend.word}`;
    }

    return reply.code(201).send({
      plan,
      art,
      // Child-keyed, so the celebration keepsake is drawn once per child and
      // reused (cost-safe); the client warms it while the lesson plays.
      giftUrl: `/api/lessons/${child.id}/gift`
    });
  });

  /**
   * The lesson GIFT — one personalized FLUX keepsake drawn at the close to
   * celebrate learning to read. It reuses the exact illustration pipeline
   * (house art direction, on-disk cache keyed `${childId}-lesson-gift`,
   * in-flight dedup, fail-closed 404) so a gift is generated once per child
   * and never leaks another family's art: ownership is re-proven on the child
   * id before any file or vendor is touched. The prompt is celebratory and
   * carries the child's name — warm, with no text the child must read.
   */
  app.get('/:childId/gift', { preHandler: requireAuth(app) }, async (request, reply) => {
    const params = parseParams(LessonGiftParams, request.params, reply);
    if (params === null) return;

    const child = await ownedChild(prisma, params.childId, request.auth.parent.id);
    if (child === null) return denyNotFound(reply);

    const hint = `a joyful celebration keepsake: ${child.name} beaming with pride, holding up a bright picture book, letters and sounds sparkling in the air around her, confetti and warm golden light, a happy bravo for learning to read`;

    const ext = providers.mode === 'mock' ? 'svg' : 'png';
    const filePath = path.join(illustrationDir, `${child.id}-lesson-gift.${ext}`);
    try {
      const cached = await readFile(filePath);
      return reply.type(ext === 'svg' ? 'image/svg+xml' : 'image/png').send(cached);
    } catch {
      // Not cached yet — generate (or join an in-flight generation) below.
    }

    try {
      let pending = pendingImages.get(filePath);
      if (pending === undefined) {
        // A gift is a celebration, not a noun — say so rather than letting the
        // renderer pick whichever concrete word happens to appear in the prose.
        pending = providers.images.generateImage(stylePrompt(hint), 'gift');
        pendingImages.set(filePath, pending);
        pending.catch(() => undefined).finally(() => pendingImages.delete(filePath));
      }
      const result = await pending;
      await writeFile(filePath, result.image).catch(() => undefined);
      return reply.type(result.mimeType).send(Buffer.from(result.image));
    } catch {
      // No gift image — the celebration screen simply omits it (fail-closed);
      // vendor internals never surface to the client.
      return reply.code(404).send({ error: 'gift unavailable' });
    }
  });

  /**
   * WORD ART — one FLUX picture-book illustration per concrete curriculum word,
   * so the child SEES the thing Buddy is naming ("fern" → a fern) and each new
   * sound sticks to an image. Keyed by the WORD (not the child) so a word is
   * drawn once and reused by every lesson and every family that meets it —
   * cost-safe. The word itself is the allow-list: only concrete curriculum words
   * (isPicturableWord) are ever painted, which bounds vendor spend and keeps
   * arbitrary strings out of the prompt; anything else 404s. Same pipeline as
   * the gift: house art direction, on-disk cache, in-flight dedup, fail-closed.
   */
  app.get('/art/:word', { preHandler: requireAuth(app) }, async (request, reply) => {
    const params = parseParams(LessonArtParams, request.params, reply);
    if (params === null) return;
    if (!isPicturableWord(params.word)) return denyNotFound(reply);

    const ext = providers.mode === 'mock' ? 'svg' : 'png';
    const filePath = path.join(illustrationDir, `word-${params.word}.${ext}`);
    try {
      const cached = await readFile(filePath);
      return reply.type(ext === 'svg' ? 'image/svg+xml' : 'image/png').send(cached);
    } catch {
      // Not cached yet — generate (or join an in-flight generation) below.
    }

    try {
      let pending = pendingImages.get(filePath);
      if (pending === undefined) {
        const hint = `one clear idea a small child can point at: ${params.word} — a warm, friendly picture-book scene, soft rounded shapes, bright gentle colours, no text, no letters`;
        // The exact curriculum word is the subject; never make the offline
        // renderer infer it from prose that also carries the style block.
        pending = providers.images.generateImage(stylePrompt(hint), params.word);
        pendingImages.set(filePath, pending);
        pending.catch(() => undefined).finally(() => pendingImages.delete(filePath));
      }
      const result = await pending;
      await writeFile(filePath, result.image).catch(() => undefined);
      return reply.type(result.mimeType).send(Buffer.from(result.image));
    } catch {
      // No picture — the step simply shows text only (fail-closed); the voice
      // and the letter tile carry on, never a broken image or a vendor error.
      return reply.code(404).send({ error: 'word art unavailable' });
    }
  });
}
