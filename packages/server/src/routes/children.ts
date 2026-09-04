/**
 * Children routes — the 5-minute parent setup (FR-A).
 *
 *  GET  /api/children             list this parent's children
 *  POST /api/children             create child + fresh learner model
 *  GET  /api/children/:id/learner the durable learner model (FR-F)
 *
 * World-seed names are lightly sanitized here (letters, spaces, hyphens)
 * but the story engine re-sanitizes at the decodability gate — defense in
 * depth, because the names end up inside generated story text.
 */
import {
  createLearnerModel,
  parseChildSettings,
  resolveLearningTrack,
  resolveStoryPacing,
  resolveStoryTimeEnabled,
  type ChildSettings,
  type WorldSeed
} from '@qissa/core';
import { Prisma } from '@prisma/client';
import { z } from 'zod';
import type { FastifyInstance } from 'fastify';
import { ctx, rawAgeInYears } from '../context.js';
import { audit } from '../safety/audit.js';
import { denyNotFound, ownedChild, requireAuth } from './guards.js';
import { parseBody, parseParams } from './validate.js';

/** Names and places: letters from any script are stripped to ASCII letters
 *  downstream, so constrain to a safe printable shape here. */
const NameSchema = z
  .string()
  .trim()
  .min(1)
  .max(30)
  .regex(/^[\p{L}][\p{L}' -]*$/u, 'must start with a letter')
  .transform((s) => s.trim());

const WorldSeedSchema = z
  .object({
    heroName: NameSchema,
    siblingName: NameSchema.optional(),
    petName: NameSchema.optional(),
    petKind: z.string().trim().min(1).max(20).optional(),
    city: NameSchema,
    currentChallenge: z.string().trim().max(200).optional()
  })
  .strict();

const CreateChildSchema = z
  .object({
    name: NameSchema,
    // ISO date (yyyy-mm-dd); under-4s get the curated early track, 4+
    // get the reading track — age is derived, never trusted from input.
    birthDate: z.iso.date(),
    worldSeed: WorldSeedSchema
  })
  .strict();

const ChildIdParams = z.object({ id: z.string().min(1).max(64) }).strict();

/**
 * Parental controls over the three modes (FR: parent control of Qissa modes).
 * Every field is optional so a partial update touches only what the parent
 * changed; `.strict()` rejects typos and unknown keys at the edge, and an
 * explicit null clears an override back to the age default. On the way out,
 * parseChildSettings ignores anything malformed — defense in depth.
 */
const ChildSettingsSchema = z
  .object({
    learningTrack: z.enum(['first-words', 'learn-to-read']).nullable().optional(),
    storyPacing: z.enum(['fluent', 'slow']).optional(),
    storyTimeEnabled: z.boolean().optional(),
    sessionCapMinutes: z.number().int().min(1).max(60).nullable().optional()
  })
  .strict();

/** A child row with its learner model, exactly as the list query returns it. */
type ChildRow = Prisma.ChildGetPayload<{ include: { learnerModel: true } }>;

/**
 * Project a child to the wire shape the web app routes on: the durable
 * learner level PLUS the resolved three-mode picture — real (unclamped) age,
 * effective learning track, whether Story Time is on, its pacing, and the
 * cap. All mode fields are resolved SERVER-side from the true age and stored
 * settings, so the client home and the parental gate can never disagree.
 */
function childSummary(c: ChildRow) {
  const settings = parseChildSettings(c.settings);
  const ageYears = rawAgeInYears(c.birthDate);
  return {
    id: c.id,
    name: c.name,
    birthDate: c.birthDate,
    createdAt: c.createdAt,
    level: c.learnerModel ? (c.learnerModel.state as { currentLevel: number }).currentLevel : 1,
    ageYears,
    learningTrack: resolveLearningTrack(ageYears, settings),
    storyTimeEnabled: resolveStoryTimeEnabled(ageYears, settings),
    storyPacing: resolveStoryPacing(settings),
    sessionCapMinutes: settings.sessionCapMinutes ?? null,
    settings
  };
}

export async function childrenRoutes(app: FastifyInstance): Promise<void> {
  const { prisma } = ctx(app);

  app.get('/', { preHandler: requireAuth(app) }, async (request) => {
    const children = await prisma.child.findMany({
      where: { parentId: request.auth.parent.id },
      include: { learnerModel: true },
      orderBy: { createdAt: 'asc' }
    });
    return children.map(childSummary);
  });

  app.post('/', { preHandler: requireAuth(app) }, async (request, reply) => {
    const body = parseBody(CreateChildSchema, request.body, reply);
    if (body === null) return;

    const birthDate = new Date(`${body.birthDate}T00:00:00.000Z`);
    const worldSeed = body.worldSeed as WorldSeed;

    const child = await prisma.child.create({
      data: {
        parentId: request.auth.parent.id,
        name: body.name,
        birthDate,
        worldSeed: worldSeed as unknown as Prisma.InputJsonValue
      }
    });

    // Every child starts with a pristine learner model — day one teaches
    // nothing yet; the first story introduces the first grapheme.
    const model = createLearnerModel();
    await prisma.learnerModel.create({
      data: {
        childId: child.id,
        schemaVersion: model.schemaVersion,
        state: model as unknown as Prisma.InputJsonValue
      }
    });

    await audit(prisma, { event: 'child.created', childId: child.id, detail: { worldSeedHero: worldSeed.heroName } });
    return reply.code(201).send({ id: child.id, name: child.name });
  });

  app.get('/:id/learner', { preHandler: requireAuth(app) }, async (request, reply) => {
    const params = parseParams(ChildIdParams, request.params, reply);
    if (params === null) return;

    const child = await ownedChild(prisma, params.id, request.auth.parent.id);
    if (child === null) return denyNotFound(reply);

    const learner = await prisma.learnerModel.findUnique({ where: { childId: child.id } });
    if (learner === null) return denyNotFound(reply);
    return { schemaVersion: learner.schemaVersion, state: learner.state, updatedAt: learner.updatedAt };
  });

  /**
   * Parental controls for one child. Merges the submitted fields over the
   * stored settings: an omitted field keeps its value, an explicit null
   * clears an override back to the age default. Ownership is re-proven
   * (ownedChild) and the change is audited; the response is the same resolved
   * projection the list returns, so the dashboard updates without a refetch.
   * POST (not PATCH) because the web api client speaks only GET/POST and
   * requireAuth enforces the CSRF double-submit on both.
   */
  app.post('/:id/settings', { preHandler: requireAuth(app) }, async (request, reply) => {
    const params = parseParams(ChildIdParams, request.params, reply);
    if (params === null) return;
    const body = parseBody(ChildSettingsSchema, request.body, reply);
    if (body === null) return;

    const child = await ownedChild(prisma, params.id, request.auth.parent.id);
    if (child === null) return denyNotFound(reply);

    const merged: ChildSettings = parseChildSettings(child.settings);
    if (body.learningTrack !== undefined) {
      if (body.learningTrack === null) delete merged.learningTrack;
      else merged.learningTrack = body.learningTrack;
    }
    if (body.storyPacing !== undefined) merged.storyPacing = body.storyPacing;
    if (body.storyTimeEnabled !== undefined) merged.storyTimeEnabled = body.storyTimeEnabled;
    if (body.sessionCapMinutes !== undefined) {
      if (body.sessionCapMinutes === null) delete merged.sessionCapMinutes;
      else merged.sessionCapMinutes = body.sessionCapMinutes;
    }

    const updated = await prisma.child.update({
      where: { id: child.id },
      data: { settings: merged as unknown as Prisma.InputJsonValue },
      include: { learnerModel: true }
    });

    await audit(prisma, { event: 'child.settings-updated', childId: child.id, detail: { ...merged } });
    return childSummary(updated);
  });
}
