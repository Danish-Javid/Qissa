/**
 * Demo routes — stage setup and teardown in one tap each (FR-K).
 *
 *  POST /api/demo/seed   create a demo child with real, gated stories
 *  POST /api/demo/reset  delete every demo child of the signed-in parent
 *
 * Why this exists: the single largest risk in a live demo is not the software,
 * it is the operator — typing a birth date into a form while a judge watches,
 * discovering the account already has three test children from rehearsal, or
 * landing on an empty digest because no story has been generated yet. This
 * turns all of that into two buttons.
 *
 * The stories it creates are NOT fixtures. Seeding calls the same serveStory
 * pipeline the child track calls, so every story on the demo screen really did
 * pass the decodability gate, the content filter and the density checks, and
 * really did write its provenance and audit rows. A demo that showed
 * hand-placed rows would make the pipeline view a lie, which is the one thing
 * this project cannot afford.
 *
 * Safety: reset is scoped twice over — to the signed-in parent AND to rows
 * carrying `isDemo`. A parent who uses their real account for the demo cannot
 * lose their real child's history to a mistimed tap.
 *
 * Spend: seeding passes the SAME per-child daily budget the child track uses.
 * serveStory treats an omitted budget as unlimited, and because seeding deletes
 * and recreates the child every call -- a fresh childId, so a fresh budget --
 * an omitted budget here would let any signed-in caller loop this route for
 * unbounded paid vendor generations. These routes are additionally absent from
 * a production build unless DEMO_SURFACE=true (see config.demoSurfaceEnabled).
 */
import { z } from 'zod';
import type { FastifyInstance } from 'fastify';
import { Prisma } from '@prisma/client';
import { createLearnerModel, type WorldSeed } from '@qissa/core';
import { ctx, rawAgeInYears } from '../context.js';
import { audit } from '../safety/audit.js';
import { serveStory } from '../story/story-engine.js';
import { requireAuth } from './guards.js';
import { parseBody } from './validate.js';

/** The demo child. Lahore, because that is where this is being judged. */
const DEMO_CHILD = {
  name: 'Ayesha',
  /** Four years old: squarely in the Learn to Read band, so the demo shows
   *  the phonics engine rather than the picture-naming track. Computed from
   *  "now" at seed time so the demo never ages out of its own band. */
  ageYears: 4,
  worldSeed: {
    heroName: 'Ayesha',
    city: 'Lahore',
    petName: 'Simba'
  } satisfies WorldSeed
};

const SeedSchema = z
  .object({
    /** How many stories to generate. Each one runs the full pipeline, so this
     *  is the knob between "fast" and "a digest with something to show". */
    stories: z.number().int().min(1).max(6).default(3)
  })
  .strict();

export async function demoRoutes(app: FastifyInstance): Promise<void> {
  const { prisma, providers, env } = ctx(app);

  app.post('/seed', { preHandler: requireAuth(app) }, async (request, reply) => {
    const body = parseBody(SeedSchema, request.body ?? {}, reply);
    if (body === null) return;

    const parentId = request.auth.parent.id;

    // Start from a clean slate: re-seeding mid-rehearsal should replace the
    // previous demo child, not stack a second one beside it.
    await prisma.child.deleteMany({ where: { parentId, isDemo: true } });

    const birthDate = new Date();
    birthDate.setUTCFullYear(birthDate.getUTCFullYear() - DEMO_CHILD.ageYears);

    const child = await prisma.child.create({
      data: {
        parentId,
        name: DEMO_CHILD.name,
        birthDate,
        isDemo: true,
        worldSeed: DEMO_CHILD.worldSeed as unknown as Prisma.InputJsonValue
      }
    });

    let model = createLearnerModel();
    await prisma.learnerModel.create({
      data: {
        childId: child.id,
        schemaVersion: model.schemaVersion,
        state: model as unknown as Prisma.InputJsonValue
      }
    });
    await audit(prisma, { event: 'child.created', childId: child.id, detail: { demo: true } });

    // Generate sequentially, feeding each story's updated learner model into
    // the next. Running these in parallel would hand every call the same
    // starting model and produce three stories teaching the same sound.
    const ageYears = rawAgeInYears(birthDate);
    const titles: string[] = [];
    for (let i = 0; i < body.stories; i += 1) {
      const result = await serveStory({
        prisma,
        providers,
        childId: child.id,
        worldSeed: DEMO_CHILD.worldSeed,
        learnerModel: model,
        ageYears,
        // Never unlimited -- see the "Spend" note in this module's docstring.
        dailyStoryBudget: env.DAILY_STORY_BUDGET_PER_CHILD
      });
      model = result.updatedModel;
      titles.push(result.story.title);
    }

    await audit(prisma, {
      event: 'demo.seeded',
      childId: child.id,
      detail: { stories: titles.length, providerMode: providers.mode }
    });

    return reply.code(201).send({
      childId: child.id,
      name: child.name,
      stories: titles,
      providerMode: providers.mode,
      sessionCapMinutes: env.SESSION_CAP_MINUTES
    });
  });

  app.post('/reset', { preHandler: requireAuth(app) }, async (request, reply) => {
    // Cascade deletes take the learner model, stories, sessions, miscues and
    // distress alerts with the child (see the schema's onDelete: Cascade).
    // Audit rows are deliberately NOT deleted: the log is append-only, and a
    // reset that could erase its own trace would defeat the point of having
    // one. They carry a childId that no longer resolves, which is correct --
    // the event happened.
    const removed = await prisma.child.deleteMany({
      where: { parentId: request.auth.parent.id, isDemo: true }
    });
    await audit(prisma, { event: 'demo.reset', detail: { childrenRemoved: removed.count } });
    return reply.send({ removed: removed.count });
  });
}
