/**
 * Story engine tests — the fail-closed pipeline, rung by rung.
 *
 * Prisma is stubbed (no DB in the test path); providers are stubbed per
 * scenario to prove each fallback rung fires for the right reason.
 */
import { describe, expect, it, vi } from 'vitest';
import { createLearnerModel, introduceNextGrapheme, phonicsScope, type StoryConstraints, type WorldSeed } from '@qissa/core';
import type { PrismaClient } from '@prisma/client';
import type { GeneratedStory, ProviderBundle } from '../providers/index.js';
import { MockImageGenerator, MockSpeechRecognizer, MockSpeechSynthesizer, MockStoryGenerator } from '../providers/mock/index.js';
import { checkStory, prefetchStory, serveStory } from './story-engine.js';

const WORLD_SEED: WorldSeed = { heroName: 'Mina', city: 'Lahore', petName: 'Simi', petKind: 'cat' };

/** In-memory Prisma stand-in: records writes, returns plausible rows. */
function fakePrisma() {
  const writes: { op: string; args: unknown }[] = [];
  return {
    writes,
    client: {
      auditLog: { create: vi.fn(async ({ data }: { data: unknown }) => (writes.push({ op: 'audit', args: data }), { id: 'a' })) },
      story: { create: vi.fn(async ({ data }: { data: unknown }) => (writes.push({ op: 'story', args: data }), { id: 'story-1' })) },
      learnerModel: { upsert: vi.fn(async ({ update }: { update: unknown }) => (writes.push({ op: 'learner', args: update }), {})) }
    } as unknown as PrismaClient
  };
}

function bundle(stories: ProviderBundle['stories']): ProviderBundle {
  return {
    mode: 'mock',
    stories,
    recognizer: new MockSpeechRecognizer(),
    synthesizer: new MockSpeechSynthesizer(),
    images: new MockImageGenerator()
  };
}

describe('checkStory', () => {
  const constraints = {
    childName: 'Mina',
    ageYears: 5,
    worldSeed: WORLD_SEED,
    allowedGraphemes: ['s', 'a', 't', 'p', 'i', 'n'],
    targetGrapheme: 'm',
    reviewGraphemes: [],
    allowedTrickyWords: [],
    theme: 'courage',
    pageCount: 4
  } satisfies StoryConstraints;

  const goodStory: GeneratedStory = {
    title: 'Mina taps a mat',
    pages: [
      { text: 'Mina maps a mat.', illustrationHint: '' },
      { text: 'a map in a pit.', illustrationHint: '' },
      { text: 'Mina taps a mat.', illustrationHint: '' },
      { text: 'a mat is in a pan.', illustrationHint: '' }
    ],
    choice: {
      prompt: 'What next?',
      options: ['tap a pan.', 'sip it.'],
      consequenceForFirst: 'tap tap tap.',
      consequenceForSecond: 'sip sip sip.'
    },
    offlineTask: 'Draw a map at home.'
  };

  it('accepts a clean decodable story', () => {
    const ctx = {
      taughtGraphemes: [...constraints.allowedGraphemes, 'm'],
      taughtTrickyWords: ['mina', 'lahore', 'simi']
    };
    const decisions = checkStory(goodStory, constraints, ctx);
    expect(decisions.every((d) => d.ok)).toBe(true);
  });

  it('rejects undecodable words with evidence', () => {
    const ctx = { taughtGraphemes: ['s', 'a', 't', 'm', 'm'], taughtTrickyWords: ['mina', 'lahore', 'simi'] };
    const dirty: GeneratedStory = { ...goodStory, pages: [{ text: 'Mina sees an elephant.', illustrationHint: '' }, ...goodStory.pages.slice(1)] };
    const decisions = checkStory(dirty, constraints, ctx);
    const decodability = decisions.find((d) => d.check === 'decodability');
    expect(decodability?.ok).toBe(false);
    expect(decodability?.detail).toContain('elephant');
  });

  it('rejects wrong page counts and thin target density', () => {
    const ctx = { taughtGraphemes: [...constraints.allowedGraphemes, 'm'], taughtTrickyWords: ['mina', 'lahore', 'simi'] };
    const short: GeneratedStory = { ...goodStory, pages: [{ text: 'a mat.', illustrationHint: '' }] };
    const decisions = checkStory(short, constraints, ctx);
    expect(decisions.find((d) => d.check === 'page-count')?.ok).toBe(false);
    expect(decisions.find((d) => d.check === 'target-density')?.ok).toBe(false);
  });
});

describe('serveStory pipeline', () => {
  it('accepts the mock generator for a fresh learner', async () => {
    const { client } = fakePrisma();
    const result = await serveStory({
      prisma: client,
      providers: bundle(new MockStoryGenerator()),
      childId: 'child-1',
      worldSeed: WORLD_SEED,
      learnerModel: createLearnerModel(),
      ageYears: 5
    });
    expect(result.source).toBe('generated');
    expect(result.story.targetGrapheme).toBe('s'); // first untaught grapheme
    // The served story teaches its target: the model boundary moved.
    expect(result.updatedModel.taughtGraphemes).toContain('s');
    expect(result.decisions.some((d) => d.check === 'generator.decodability' && d.ok)).toBe(true);
  });

  it('generates the cohort-boundary story (first sound of the next level)', async () => {
    // Regression: teaching "m" after s,a,t,p,i,n used to exhaust the
    // generator because the level-1 bank has no "m" carriers. The story
    // must be generated at its target cohort's level (generationLevel).
    const { client } = fakePrisma();
    let model = createLearnerModel();
    for (let i = 0; i < 6; i++) {
      model = introduceNextGrapheme(model).model; // teach all of level 1
    }
    const result = await serveStory({
      prisma: client,
      providers: bundle(new MockStoryGenerator()),
      childId: 'child-1',
      worldSeed: WORLD_SEED,
      learnerModel: model,
      ageYears: 5
    });
    expect(result.source).toBe('generated');
    expect(result.story.targetGrapheme).toBe('m');
    expect(result.decisions.some((d) => d.check === 'generator.decodability' && d.ok)).toBe(true);
    expect(result.decisions.some((d) => d.check === 'generator.target-density' && d.ok)).toBe(true);
  });

  it('generates a valid story for EVERY grapheme in the scope (exhaustive)', async () => {
    // Regression for the level-3 "ss" outage: the mock generator threw when a
    // bank had no carrier words for the target, and banks 6–8 did not exist.
    // Walk a fresh learner through all 81 graphemes in scope order; every
    // single story must generate and pass the engine's gate — no fallbacks.
    const { client } = fakePrisma();
    const sequence = phonicsScope.levels.flatMap((l) => l.graphemes);
    let model = createLearnerModel();
    for (let i = 0; i < sequence.length; i++) {
      const expected = sequence[i] as string;
      let result;
      try {
        result = await serveStory({
          prisma: client,
          providers: bundle(new MockStoryGenerator()),
          childId: 'child-1',
          worldSeed: WORLD_SEED,
          learnerModel: model,
          ageYears: 5
        });
      } catch (err) {
        throw new Error(`grapheme ${i + 1}/${sequence.length} "${expected}": ${(err as Error).message}`);
      }
      expect(result.source, `grapheme "${expected}" must generate`).toBe('generated');
      expect(result.story.targetGrapheme, `served target for "${expected}"`).toBe(expected);
      model = result.updatedModel;
    }
  }, 120_000);

  it('deterministic fallback covers cohort targets + due reviews (live 503 regression)', async () => {
    // Replicates a real outage: a level-3 child with "ch" as the next sound
    // and zz/qu due for review. The old fallback drew carriers from the
    // child's OWN level bank (no "ch" words) and left review density to
    // luck (no "qu"/"zz" words in higher banks) -> pipeline exhausted -> 503.
    const { client } = fakePrisma();
    let model = createLearnerModel();
    for (const g of phonicsScope.levels.flatMap((l) => l.graphemes)) {
      if (g === 'ch') break; // "ch" stays untaught: it is the target
      model = introduceNextGrapheme(model).model;
    }
    const past = new Date(Date.now() - 24 * 3600 * 1000).toISOString();
    for (const g of ['zz', 'qu']) {
      const stat = model.graphemeStats[g];
      if (stat !== undefined) {
        stat.status = 'learning';
        stat.exposures = 3;
        stat.correct = 1;
        stat.lastSeen = past;
        stat.nextReviewDue = past;
      }
    }
    const broken: ProviderBundle['stories'] = {
      name: 'broken',
      model: 'broken-1',
      generate: async () => {
        throw new Error('vendor down');
      }
    };
    const result = await serveStory({
      prisma: client,
      providers: bundle(broken),
      childId: 'child-ch',
      worldSeed: WORLD_SEED,
      learnerModel: model,
      ageYears: 6
    });
    expect(result.source).toBe('deterministic-fallback');
    expect(result.story.targetGrapheme).toBe('ch');
  });

  it('falls back when the generator throws', async () => {
    const { client, writes } = fakePrisma();
    const broken: ProviderBundle['stories'] = {
      name: 'broken',
      model: 'broken-1',
      generate: async () => {
        throw new Error('vendor down');
      }
    };
    const result = await serveStory({
      prisma: client,
      providers: bundle(broken),
      childId: 'child-1',
      worldSeed: WORLD_SEED,
      learnerModel: createLearnerModel(),
      ageYears: 5
    });
    // Fresh level-1 learner: cached stories (level 2+) fail the gate, so
    // the deterministic fallback closes the chain.
    expect(result.source).toBe('deterministic-fallback');
    expect(writes.some((w) => w.op === 'audit' && (w.args as { event: string }).event === 'story.rejected.generator-error')).toBe(true);
  });

  it('falls back when the generator returns undecodable text', async () => {
    const { client } = fakePrisma();
    const dirty: ProviderBundle['stories'] = {
      name: 'dirty',
      model: 'dirty-1',
      generate: async () => ({
        costMicroUsd: 0,
        story: {
          title: 'Bad story',
          pages: [
            { text: 'the elephant dances.', illustrationHint: '' },
            { text: 'the elephant dances.', illustrationHint: '' },
            { text: 'the elephant dances.', illustrationHint: '' },
            { text: 'the elephant dances.', illustrationHint: '' }
          ],
          choice: {
            prompt: 'q',
            options: ['a', 'b'],
            consequenceForFirst: 'a',
            consequenceForSecond: 'b'
          },
          offlineTask: 'do nothing'
        }
      })
    };
    const result = await serveStory({
      prisma: client,
      providers: bundle(dirty),
      childId: 'child-1',
      worldSeed: WORLD_SEED,
      learnerModel: createLearnerModel(),
      ageYears: 5
    });
    expect(result.source).not.toBe('generated');
    expect(result.decisions.some((d) => d.check === 'generator.decodability' && !d.ok)).toBe(true);
  });
});

describe('warm prefetch cache', () => {
  it('a prefetched candidate is consumed by serveStory without a second generation', async () => {
    const { client } = fakePrisma();
    let calls = 0;
    const counting: ProviderBundle['stories'] = {
      name: 'counting',
      model: 'counting-1',
      generate: async (req) => {
        calls += 1;
        return new MockStoryGenerator().generate(req);
      }
    };
    const input = {
      prisma: client,
      providers: bundle(counting),
      childId: 'child-warm',
      worldSeed: WORLD_SEED,
      learnerModel: createLearnerModel(),
      ageYears: 5
    };
    expect(await prefetchStory(input)).toBe(true);
    const result = await serveStory(input);
    expect(calls).toBe(1); // prefetch only — the tap reused the candidate
    expect(result.source).toBe('generated');
    expect(result.decisions.some((d) => d.check.startsWith('warm-cache.'))).toBe(true);
    expect(result.updatedModel.taughtGraphemes).toContain('s');
  });

  it('prefetch alone never teaches, persists, or audits', async () => {
    const { client, writes } = fakePrisma();
    const ok = await prefetchStory({
      prisma: client,
      providers: bundle(new MockStoryGenerator()),
      childId: 'child-quiet',
      worldSeed: WORLD_SEED,
      learnerModel: createLearnerModel(),
      ageYears: 5
    });
    expect(ok).toBe(true);
    expect(writes).toHaveLength(0); // no story row, no learner write, no audit
  });

  it('prefetch gates its candidate — a dirty generator stores nothing', async () => {
    const { client } = fakePrisma();
    const dirty: ProviderBundle['stories'] = {
      name: 'dirty',
      model: 'dirty-1',
      generate: async () => ({
        costMicroUsd: 0,
        story: {
          title: 'Bad story',
          pages: [
            { text: 'the elephant dances.', illustrationHint: '' },
            { text: 'the elephant dances.', illustrationHint: '' },
            { text: 'the elephant dances.', illustrationHint: '' },
            { text: 'the elephant dances.', illustrationHint: '' }
          ],
          choice: { prompt: 'q', options: ['a', 'b'], consequenceForFirst: 'a', consequenceForSecond: 'b' },
          offlineTask: 'do nothing'
        }
      })
    };
    expect(
      await prefetchStory({
        prisma: client,
        providers: bundle(dirty),
        childId: 'child-dirty',
        worldSeed: WORLD_SEED,
        learnerModel: createLearnerModel(),
        ageYears: 5
      })
    ).toBe(false);

    // Nothing was stored: a counting generator still runs exactly once.
    let calls = 0;
    const counting: ProviderBundle['stories'] = {
      name: 'counting',
      model: 'counting-1',
      generate: async (req) => {
        calls += 1;
        return new MockStoryGenerator().generate(req);
      }
    };
    await serveStory({
      prisma: client,
      providers: bundle(counting),
      childId: 'child-dirty',
      worldSeed: WORLD_SEED,
      learnerModel: createLearnerModel(),
      ageYears: 5
    });
    expect(calls).toBe(1);
  });
});

describe('Story Time (receptive, teach=false)', () => {
  // Story Time is the COMMON listening+watching mode. It must reuse the exact
  // same safe pipeline (personalized, gated, persisted) but must NEVER fold
  // anything into the learner model: a child who only listened did not decode,
  // so crediting new graphemes/tricky words/themes would inflate a reader who
  // never read. These tests pin that contract.
  it('serves a safe story but never advances the learner model', async () => {
    const { client, writes } = fakePrisma();
    const before = createLearnerModel();
    const result = await serveStory({
      prisma: client,
      providers: bundle(new MockStoryGenerator()),
      childId: 'child-storytime',
      worldSeed: WORLD_SEED,
      learnerModel: before,
      ageYears: 2, // a toddler: raw age, below the read-along 4–7 band
      teach: false
    });
    // Safety is NOT relaxed: the story still generated and passed every gate.
    expect(result.source).toBe('generated');
    expect(result.decisions.some((d) => d.check === 'generator.decodability' && d.ok)).toBe(true);
    // The story row was persisted (the picture-walk / illustration needs it)...
    expect(writes.some((w) => w.op === 'story')).toBe(true);
    // ...but the learner model was never written, and nothing was credited.
    expect(writes.some((w) => w.op === 'learner')).toBe(false);
    expect(result.updatedModel).toEqual(before);
    expect(result.updatedModel.taughtGraphemes).not.toContain('s');
  });

  it('does not mark the theme seen either (no receptive side-effects)', async () => {
    const { client } = fakePrisma();
    const before = createLearnerModel();
    const result = await serveStory({
      prisma: client,
      providers: bundle(new MockStoryGenerator()),
      childId: 'child-theme',
      worldSeed: WORLD_SEED,
      learnerModel: before,
      ageYears: 4,
      teach: false
    });
    expect(result.updatedModel.themesSeen).toEqual(before.themesSeen);
  });

  it('read-along (teach defaults true) still teaches the very same story', async () => {
    const { client, writes } = fakePrisma();
    const result = await serveStory({
      prisma: client,
      providers: bundle(new MockStoryGenerator()),
      childId: 'child-readalong',
      worldSeed: WORLD_SEED,
      learnerModel: createLearnerModel(),
      ageYears: 5
      // teach omitted -> defaults true
    });
    expect(writes.some((w) => w.op === 'learner')).toBe(true);
    expect(result.updatedModel.taughtGraphemes).toContain('s');
  });

  it('Story Time asks for a longer book (page-count override) that still passes every gate', async () => {
    // The receptive mode is sized for ENGAGEMENT (~2 minutes), not mastery, so
    // the route passes a fixed longer page count. This pins that the override
    // is honored AND that safety is never relaxed to get the length: the shape,
    // decodability and density gates all re-run against the bigger book.
    const { client, writes } = fakePrisma();
    const before = createLearnerModel();
    const result = await serveStory({
      prisma: client,
      providers: bundle(new MockStoryGenerator()),
      childId: 'child-storytime-long',
      worldSeed: WORLD_SEED,
      learnerModel: before,
      ageYears: 2,
      teach: false,
      pageCountOverride: 8
    });
    // Longer than the read-along's 4-page level-1 book...
    expect(result.story.pages.length).toBe(8);
    // ...and STILL safe: generated (not fallen back), every gate green.
    expect(result.source).toBe('generated');
    expect(result.decisions.every((d) => d.ok)).toBe(true);
    // Receptive: the longer book still never advances the learner model.
    expect(writes.some((w) => w.op === 'learner')).toBe(false);
    expect(result.updatedModel).toEqual(before);
  });
});
