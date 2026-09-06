/**
 * The story engine — the fail-closed content pipeline (NFR-5.1, FR-I.9).
 *
 *   constraints -> generate -> validate -> moderate -> shape-check -> persist
 *
 * ANY rung failing rejects the generated story. The child is never left
 * staring at a spinner: the engine then serves the first hand-written
 * cached story that ALSO passes every check for this child, and if none
 * does, it asks the deterministic mock generator (which self-validates).
 * Every decision — accept, reject, fallback, and why — is written to the
 * append-only audit log and echoed into the story's provenance column,
 * which is what the parent digest's "reasoning timeline" renders.
 *
 * Trust model: the generator is untrusted. Even the mock goes through the
 * full gauntlet; the pipeline never special-cases its own code.
 */
import { Prisma, type PrismaClient } from '@prisma/client';
import {
  buildStoryConstraints,
  cachedStories,
  foundationGroup,
  introduceNextGrapheme,
  isBootstrap,
  markThemeSeen,
  phonicsScope,
  teachTrickyWord,
  tokenize,
  validateText,
  TARGET_GRAPHEME_MIN_OCCURRENCES,
  REVIEW_GRAPHEME_MIN_OCCURRENCES,
  type DecodabilityContext,
  type LearnerModel,
  type Story,
  type StoryConstraints,
  type WorldSeed
} from '@qissa/core';
import { audit } from '../safety/audit.js';
import { filterText } from '../safety/content-filter.js';
import { MockStoryGenerator } from '../providers/mock/index.js';
import type { GeneratedStory, ProviderBundle } from '../providers/index.js';

/** Prompt contract version — bumps when the generator prompt changes, so
 *  audit rows can be tied to the exact wording that produced a story. */
export const PROMPT_VERSION = 'qissa-story-2.1';

export type StorySource = 'generated' | 'cache' | 'deterministic-fallback';

export interface ServeStoryInput {
  prisma: PrismaClient;
  providers: ProviderBundle;
  childId: string;
  worldSeed: WorldSeed;
  learnerModel: LearnerModel;
  ageYears: number;
  /**
   * Whether serving this story ADVANCES the learner model (introducing its
   * target grapheme, tricky words and theme). True for the expressive
   * "Learn to Read" track, where the child decodes; false for the receptive
   * "Story Time" mode, where the child only listens + watches, so nothing is
   * credited to what they can read. Default true. The story is generated and
   * persisted either way (the picture-walk needs the row) and every safety
   * gate still runs — teach=false changes only the learner-model fold.
   */
  teach?: boolean;
  /**
   * Vendor generation budget for this child over the trailing 24 hours
   * (NFR-4.4). Reaching it skips the PAID rung only — the child still gets a
   * story from the same vetted ladder used when a vendor is down. Undefined
   * means unlimited, which is what the existing tests and the mock provider
   * want; the routes pass env.DAILY_STORY_BUDGET_PER_CHILD.
   */
  dailyStoryBudget?: number;
  /**
   * Override the adaptive (mastery-sized) page count. Story Time is receptive:
   * its length is about ENGAGEMENT — a narrated cartoon that should run ~2
   * minutes — not about what the child can decode, so it asks for a fixed,
   * longer book than the read-along's level-scaled one. Every gate (shape,
   * decodability, density) still runs against the overridden count, and the
   * generators produce exactly that many pages. Omitted → adaptive length.
   */
  pageCountOverride?: number;
  /**
   * Must the page text be decodable by this child? Default true.
   *
   * False for Story Time, which is receptive: the player narrates
   * `pictureTalk` and no one reads the page text, so constraining it to the
   * child's taught graphemes bought nothing and wrecked the storytelling.
   * Safety gates are unaffected — moderation runs on every surface regardless.
   */
  decodable?: boolean;
}

export interface ServeStoryResult {
  story: Story;
  storyId: string;
  source: StorySource;
  /** The learner model after teaching this story's new units. */
  updatedModel: LearnerModel;
  /** The full reasoning timeline (also persisted as provenance). */
  decisions: PipelineDecision[];
}

interface PipelineDecision {
  check: string;
  ok: boolean;
  detail?: string;
}

/** All child-DECODED text surfaces of a story, for validation passes.
 *  The choice prompt and the offline task are spoken by the companion
 *  (TTS), not decoded by the child, so they go through the content filter
 *  only — the decodability gate protects what the child must read. */
function storySurfaces(story: GeneratedStory): string[] {
  return [
    story.title,
    ...story.pages.map((p) => p.text),
    ...story.choice.options,
    story.choice.consequenceForFirst,
    story.choice.consequenceForSecond
  ];
}

/** Spoken / visual surfaces — heard or seen, never decoded by the child.
 *  The picture-walk lines and the illustration prompts still get moderated
 *  (they reach the child), but they are exempt from the decodable gate for
 *  the same reason the offline task is: they are not what the child reads. */
function spokenSurfaces(story: GeneratedStory): string[] {
  return [
    story.offlineTask,
    ...story.pages.map((p) => p.pictureTalk ?? ''),
    ...story.pages.map((p) => p.illustrationHint)
  ].filter((s) => s.length > 0);
}

/** World-seed names are proper nouns: taught orally, whitelisted at the
 *  gate. Sanitize to lowercase letters so "Ayla-2" can't smuggle tokens. */
function worldNames(worldSeed: WorldSeed): string[] {
  return [worldSeed.heroName, worldSeed.siblingName, worldSeed.petName]
    .filter((n): n is string => Boolean(n))
    .flatMap((n) => tokenize(n.replace(/[^a-z']/gi, ' ')))
    .filter((t) => t.length > 0);
}

/** Count a grapheme's occurrences across surfaces (target-count rule).
 *
 * Occurrences, not distinct words. Distinct words are the better pedagogy —
 * six different words carrying "s" generalise it, six repeats of "sat" do not
 * — but the curriculum's own level-1 bank offers only five decodable carriers
 * for "s", and the deterministic fallback (which guarantees a child always
 * gets a story) cannot spread across them. Changing this needs the mock
 * generator to select distinct carriers first; until then the PROMPT asks for
 * variety and the gate measures what it can actually enforce, which is at
 * least the same quantity both sides now name. */
function countOccurrences(surfaces: string[], grapheme: string): number {
  let count = 0;
  for (const surface of surfaces) {
    for (const word of tokenize(surface)) {
      let idx = word.indexOf(grapheme);
      while (idx !== -1) {
        count += 1;
        idx = word.indexOf(grapheme, idx + grapheme.length);
      }
    }
  }
  return count;
}

/** Build the decodability context for THIS child + THIS story: taught
 *  graphemes plus the target/review units the story introduces, tricky
 *  words taught so far plus the two new ones, plus whitelisted names.
 *
 *  Bootstrap (foundation-group rule): when the child has not been taught
 *  ANY sound from the target's group yet — the very first stories — the
 *  whole group counts as decodable, otherwise no first story could exist.
 *  Generators mirror this context exactly when self-validating. */
function validationContext(model: LearnerModel, constraints: StoryConstraints): DecodabilityContext {
  const group = isBootstrap(constraints.allowedGraphemes, constraints.targetGrapheme)
    ? foundationGroup(constraints.targetGrapheme)
    : [];
  return {
    taughtGraphemes: [...constraints.allowedGraphemes, ...group, constraints.targetGrapheme, ...constraints.reviewGraphemes],
    taughtTrickyWords: [
      ...model.taughtTrickyWords,
      ...constraints.allowedTrickyWords,
      ...worldNames(constraints.worldSeed)
    ]
  };
}

/**
 * The level a story is GENERATED at. A story teaching the first sound of
 * the next cohort ("m" after s,a,t,p,i,n) is generationally a level-2
 * story: the bootstrap rule already decodes that cohort's vocabulary, and
 * the level's word bank is where its carrier words live. Levels never go
 * backwards, so we take the max with the child's current level.
 */
export function generationLevel(model: LearnerModel, targetGrapheme: string): number {
  const cohort = phonicsScope.levels.find((l) => l.graphemes.includes(targetGrapheme))?.level ?? model.currentLevel;
  return Math.max(model.currentLevel, cohort);
}

/**
 * Run every gate over a candidate story. Returns the decision timeline;
 * the caller reads `every(ok)` to accept or reject.
 */
export function checkStory(
  story: GeneratedStory,
  constraints: StoryConstraints,
  ctx: DecodabilityContext,
  opts: { decodable?: boolean } = {}
): PipelineDecision[] {
  // Default true: a caller that forgets the flag gets the STRICTER gate.
  const decodable = opts.decodable !== false;
  const decisions: PipelineDecision[] = [];
  const surfaces = storySurfaces(story);

  // 1. Decodability — the child is never shown an undecodable word.
  //
  // Skipped for narrated stories, where there is no such child: Story Time
  // speaks `pictureTalk` and nobody reads the page text. Safety is NOT
  // skipped — moderation below runs on every surface either way.
  if (decodable) {
    const violations = surfaces.flatMap((s) => validateText(s, ctx).violations);
    decisions.push({
      check: 'decodability',
      ok: violations.length === 0,
      detail: violations.length > 0 ? `violations: ${violations.slice(0, 8).map((v) => v.word).join(', ')}` : undefined
    });
  }

  // 2. Moderation — every surface, including the spoken picture-walk lines,
  //    the illustration prompts, and the parent-facing offline task.
  const filterHits = [...surfaces, ...spokenSurfaces(story)]
    .map((s) => filterText(s))
    .filter((v) => !v.ok)
    .flatMap((v) => v.reasons);
  decisions.push({
    check: 'content-filter',
    ok: filterHits.length === 0,
    detail: filterHits.length > 0 ? `blocked: ${[...new Set(filterHits)].join(', ')}` : undefined
  });

  // 3. Shape — exact page count (adaptive length, FR-B.9).
  decisions.push({
    check: 'page-count',
    ok: story.pages.length === constraints.pageCount,
    detail: `wanted ${constraints.pageCount}, got ${story.pages.length}`
  });

  // 4 & 5. Teaching density — only meaningful when the child reads the text.
  // A narrated story teaches vocabulary and ideas, not grapheme exposure, so
  // holding it to a phonics quota only ever degraded the storytelling.
  if (decodable) {
    // 4. Target grapheme density — the story actually teaches its unit.
    const targetCount = countOccurrences(surfaces, constraints.targetGrapheme);
    decisions.push({
      check: 'target-density',
      ok: targetCount >= TARGET_GRAPHEME_MIN_OCCURRENCES,
      detail: `"${constraints.targetGrapheme}" x${targetCount} (min ${TARGET_GRAPHEME_MIN_OCCURRENCES})`
    });

    // 5. Spaced-repetition density for every review unit.
    const weakReviews = constraints.reviewGraphemes.filter(
      (g) => countOccurrences(surfaces, g) < REVIEW_GRAPHEME_MIN_OCCURRENCES
    );
    decisions.push({
      check: 'review-density',
      ok: weakReviews.length === 0,
      detail: weakReviews.length > 0 ? `under-exposed: ${weakReviews.join(', ')}` : undefined
    });
  }

  return decisions;
}

/** First hand-written cached story that passes every gate for this child. */
function findValidCachedStory(constraints: StoryConstraints, ctx: DecodabilityContext): Story | null {
  for (const candidate of cachedStories) {
    const decisions = checkStory(candidate, constraints, ctx);
    if (decisions.every((d) => d.ok)) return candidate;
  }
  return null;
}

/** Warm prefetch cache — the child opens the door minutes before the tap on
 *  "Let's read!", so the generator runs then, in the background, and the tap
 *  collects the result instead of staring at a waiting screen. A candidate
 *  NEVER teaches by existing: it is only consumed inside serveStory, where
 *  the full gate runs again against the live constraints (a model that moved
 *  in between simply rejects the stale candidate).
 */
const WARM_TTL_MS = 5 * 60_000;
const warmCache = new Map<string, { candidate: GeneratedStory; expiresAt: number }>();
/** In-flight prefetches, awaitable: a tap that lands mid-generation joins
 *  the prefetch instead of starting a second (double-billed) vendor call. */
const warmInflight = new Map<string, Promise<boolean>>();

/** Child-facing ceiling for ONE synchronous serve. A four-year-old will not
 *  wait through a 30s+ generation, so the tap waits only this long for a
 *  background prefetch to land (or for a cold generation) and then falls
 *  through to the vetted ladder. The prefetch itself keeps the provider's
 *  generous default budget and continues warming the cache in the
 *  background — the child never pays for it. */
const SERVE_GRACE_MS = 9_000;

const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

/** Generate and hold one candidate for a child. Opportunistic: every failure
 *  mode returns false and lets the later serveStory redo the work normally. */
export async function prefetchStory(input: ServeStoryInput): Promise<boolean> {
  const { childId } = input;
  const existing = warmCache.get(childId);
  if (existing !== undefined && existing.expiresAt > Date.now()) return false;
  const already = warmInflight.get(childId);
  if (already !== undefined) return already;

  const run = (async (): Promise<boolean> => {
    const { providers, worldSeed, learnerModel, ageYears, decodable = true } = input;
    try {
      const constraints = buildStoryConstraints(learnerModel, worldSeed, ageYears);
      const ctx = validationContext(learnerModel, constraints);
      const { story: raw } = await providers.stories.generate({
        constraints,
        level: generationLevel(learnerModel, constraints.targetGrapheme),
        promptVersion: PROMPT_VERSION,
        taughtTrickyWords: learnerModel.taughtTrickyWords,
        decodable
      });
      if (!checkStory(raw, constraints, ctx, { decodable }).every((d) => d.ok)) return false;
      warmCache.set(childId, { candidate: raw, expiresAt: Date.now() + WARM_TTL_MS });
      return true;
    } catch {
      return false;
    }
  })();
  warmInflight.set(childId, run);
  run.catch(() => false).finally(() => warmInflight.delete(childId));
  return run;
}

/**
 * Serve the next story for a child — the full fail-closed pipeline.
 */
export async function serveStory(input: ServeStoryInput): Promise<ServeStoryResult> {
  const {
    prisma,
    providers,
    childId,
    worldSeed,
    learnerModel,
    ageYears,
    teach = true,
    pageCountOverride,
    dailyStoryBudget,
    decodable = true
  } = input;
  const baseConstraints = buildStoryConstraints(learnerModel, worldSeed, ageYears);
  // Story Time passes a fixed, longer page count so the narrated book runs
  // ~2 minutes; the read-along keeps its adaptive, mastery-scaled length.
  const constraints =
    pageCountOverride !== undefined ? { ...baseConstraints, pageCount: pageCountOverride } : baseConstraints;
  const ctx = validationContext(learnerModel, constraints);
  const decisions: PipelineDecision[] = [];

  let story: Story | null = null;
  let source: StorySource = 'generated';

  // ---- Rung 0: warm candidate prefetched when the child opened the door --
  let warm = warmCache.get(childId);
  // True when a background prefetch was already running for this child: we
  // then wait only a short grace for it and MUST NOT start a second vendor
  // call (double-billed) if it has not landed yet.
  let joinedInflight = false;
  if (warm !== undefined) {
    warmCache.delete(childId); // consumed either way: reused or stale
  } else {
    // A tap that lands mid-prefetch joins it instead of double-calling the
    // vendor, then consumes whatever the prefetch stored — but only for a
    // short grace, so the child is never left staring at a spinner while a
    // 30s+ generation finishes. The prefetch keeps running in the background
    // and may warm the cache for the next story.
    const inflight = warmInflight.get(childId);
    if (inflight !== undefined) {
      joinedInflight = true;
      await Promise.race([inflight.catch(() => false), sleep(SERVE_GRACE_MS)]);
      warm = warmCache.get(childId);
      if (warm !== undefined) warmCache.delete(childId);
    }
  }
  if (warm !== undefined) {
    if (warm.expiresAt > Date.now()) {
      const checks = checkStory(warm.candidate, constraints, ctx, { decodable });
      decisions.push(...checks.map((d) => ({ ...d, check: `warm-cache.${d.check}` })));
      if (checks.every((d) => d.ok)) {
        story = {
          ...warm.candidate,
          level: learnerModel.currentLevel,
          targetGrapheme: constraints.targetGrapheme,
          theme: constraints.theme,
          provenance: { generator: providers.stories.name, model: providers.stories.model, promptVersion: PROMPT_VERSION }
        };
        await audit(prisma, {
          event: 'story.accepted',
          childId,
          detail: { generator: providers.stories.name, warmCache: true, targetGrapheme: constraints.targetGrapheme }
        });
      } else {
        await audit(prisma, {
          event: 'story.rejected',
          childId,
          detail: {
            generator: providers.stories.name,
            warmCache: true,
            failedChecks: checks.filter((d) => !d.ok).map((d) => `${d.check}${d.detail ? ` (${d.detail})` : ''}`)
          }
        });
      }
    }
  }

  // ---- Budget gate: has this child already spent its day's generation? ---
  // Counting rows is deliberate over a running counter: the stories table IS
  // the ledger, so the budget cannot drift from what was actually produced,
  // and a restart cannot reset it. Trailing 24 hours rather than calendar days
  // so a child cannot get a second full budget at midnight.
  let withinBudget = true;
  if (story === null && dailyStoryBudget !== undefined) {
    const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const spent = await prisma.story.count({
      where: { childId, createdAt: { gte: since }, source: 'generated' }
    });
    withinBudget = spent < dailyStoryBudget;
    if (!withinBudget) {
      decisions.push({
        check: 'budget.daily',
        ok: false,
        detail: `${spent}/${dailyStoryBudget} generated in the last 24h`
      });
      await audit(prisma, {
        event: 'story.budget-exhausted',
        childId,
        detail: { spent, budget: dailyStoryBudget }
      });
    }
  }

  // ---- Rung 1: the configured generator (Qwen in real mode, mock else) --
  // Skipped when a background prefetch is already running for this child:
  // starting a second generation would double-bill the vendor and still not
  // finish inside the child's grace, so we fall straight to the vetted ladder
  // and let the prefetch warm the cache for next time.
  if (story === null && !joinedInflight && withinBudget) {
    try {
      const { story: raw, costMicroUsd } = await providers.stories.generate({
        constraints,
        level: generationLevel(learnerModel, constraints.targetGrapheme),
        promptVersion: PROMPT_VERSION,
        taughtTrickyWords: learnerModel.taughtTrickyWords,
        decodable,
        // Child-facing: fail fast to the ladder rather than spin for 30s+.
        budgetMs: SERVE_GRACE_MS
      });
      const checks = checkStory(raw, constraints, ctx, { decodable });
      decisions.push(...checks.map((d) => ({ ...d, check: `generator.${d.check}` })));

      if (checks.every((d) => d.ok)) {
        story = {
          ...raw,
          level: learnerModel.currentLevel,
          targetGrapheme: constraints.targetGrapheme,
          theme: constraints.theme,
          provenance: { generator: providers.stories.name, model: providers.stories.model, promptVersion: PROMPT_VERSION }
        };
        await audit(prisma, {
          event: 'story.accepted',
          childId,
          detail: { generator: providers.stories.name, costMicroUsd, targetGrapheme: constraints.targetGrapheme }
        });
      } else {
        await audit(prisma, {
          event: 'story.rejected',
          childId,
          detail: {
            generator: providers.stories.name,
            failedChecks: checks.filter((d) => !d.ok).map((d) => `${d.check}${d.detail ? ` (${d.detail})` : ''}`)
          }
        });
      }
    } catch (err) {
      // Vendor failure is a rejection, not a crash (fail-closed, NFR-5.1).
      decisions.push({ check: 'generator.available', ok: false, detail: String(err) });
      await audit(prisma, {
        event: 'story.rejected.generator-error',
        childId,
        detail: { generator: providers.stories.name, error: String(err) }
      });
    }
  }

  // ---- Rung 2: hand-written cached story that passes every gate --------
  if (story === null) {
    const cached = findValidCachedStory(constraints, ctx);
    if (cached !== null) {
      story = cached;
      source = 'cache';
      decisions.push({ check: 'fallback.cache', ok: true, detail: cached.title });
      await audit(prisma, { event: 'story.fallback.cache', childId, detail: { title: cached.title } });
    }
  }

  // ---- Rung 3: deterministic template generator (always available) ------
  if (story === null) {
    try {
      const fallback = new MockStoryGenerator();
      const { story: raw } = await fallback.generate({
        constraints,
        // Same generation-level rule as rung 1: a level-3 child's story
        // teaching "ch" draws carrier words from the level-4 bank, where
        // they live. The child's own level has none (503 in the wild).
        level: generationLevel(learnerModel, constraints.targetGrapheme),
        promptVersion: PROMPT_VERSION,
        taughtTrickyWords: learnerModel.taughtTrickyWords,
        decodable
      });
      const checks = checkStory(raw, constraints, ctx, { decodable }); // paranoia: re-check
      if (!checks.every((d) => d.ok)) throw new Error('deterministic fallback failed its own checks');
      story = {
        ...raw,
        level: learnerModel.currentLevel,
        targetGrapheme: constraints.targetGrapheme,
        theme: constraints.theme,
        provenance: { generator: fallback.name, model: fallback.model, promptVersion: PROMPT_VERSION }
      };
      source = 'deterministic-fallback';
      decisions.push({ check: 'fallback.deterministic', ok: true });
      await audit(prisma, { event: 'story.fallback.deterministic', childId });
    } catch (err) {
      decisions.push({ check: 'fallback.deterministic', ok: false, detail: String(err) });
      await audit(prisma, { event: 'story.pipeline-exhausted', childId, detail: { error: String(err) } });
      throw new Error('Story pipeline exhausted — no safe story available.');
    }
  }

  // ---- Persist story + teach the new units into the learner model -------
  const row = await prisma.story.create({
    data: {
      childId,
      level: story.level,
      title: story.title,
      theme: story.theme,
      targetGrapheme: story.targetGrapheme,
      source,
      content: story as unknown as Prisma.InputJsonValue,
      provenance: {
        generator: story.provenance.generator,
        decisions,
        constraints: {
          targetGrapheme: constraints.targetGrapheme,
          reviewGraphemes: constraints.reviewGraphemes,
          theme: constraints.theme
        }
      } as unknown as Prisma.InputJsonValue
    }
  });

  let updated = learnerModel;
  // Story Time (teach=false) is receptive: the child listened and watched,
  // they did not decode, so we must NOT credit new graphemes, tricky words or
  // themes to the learner model — doing so would silently advance a reader
  // who never read. The read-along track teaches exactly as before.
  if (teach) {
    // The story introduces its target grapheme (it was woven in >= 6 times).
    if (!updated.taughtGraphemes.includes(constraints.targetGrapheme)) {
      updated = introduceNextGrapheme(updated).model;
    }
    // The story's two new tricky words become taught wholes.
    for (const word of constraints.allowedTrickyWords) {
      updated = teachTrickyWord(updated, word);
    }
    updated = markThemeSeen(updated, constraints.theme);

    await prisma.learnerModel.upsert({
      where: { childId },
      create: { childId, schemaVersion: updated.schemaVersion, state: updated as unknown as Prisma.InputJsonValue },
      update: { schemaVersion: updated.schemaVersion, state: updated as unknown as Prisma.InputJsonValue }
    });
  }

  return { story, storyId: row.id, source, updatedModel: updated, decisions };
}
