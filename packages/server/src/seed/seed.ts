/**
 * Demo seed — five to six weeks of plausible history for one demo family.
 *
 * This is NOT fake rows pasted into tables: the seed REPLAYS the real
 * pedagogy. It runs the actual core engines (learner model, progression,
 * spaced repetition) and the real MockStoryGenerator for every simulated
 * session, so every number the digest shows is internally consistent with
 * the engine that produced it — the same guarantee production has.
 *
 * Idempotent: re-running deletes the demo parent (cascade removes the
 * child's whole world) and rebuilds from scratch. Deterministic: a seeded
 * PRNG drives every choice, so two runs produce identical history.
 *
 * Run after migrations:  npm run seed
 */
import { randomBytes } from 'node:crypto';
import { hash } from '@node-rs/argon2';
import { Prisma, type PrismaClient } from '@prisma/client';
import {
  applyWordOutcomes,
  buildStoryConstraints,
  createLearnerModel,
  foundationGroup,
  introduceNextGrapheme,
  isBootstrap,
  markThemeSeen,
  parseGraphemes,
  recordFluency,
  tokenize,
  type LearnerModel,
  type Story,
  type WordOutcome,
  type WorldSeed
} from '@qissa/core';
import { loadEnv } from '../config.js';
import { db, disconnectDb } from '../db.js';
import { MockStoryGenerator } from '../providers/mock/index.js';
import { generationLevel } from '../story/story-engine.js';

// ---------------------------------------------------------------------------
// Deterministic PRNG (mulberry32) — the demo must be reproducible.
// ---------------------------------------------------------------------------
function makeRng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ---------------------------------------------------------------------------
// Demo family — the credentials come from env (SEED_PARENT_EMAIL/PASSWORD).
// ---------------------------------------------------------------------------
const WORLD_SEED: WorldSeed = {
  heroName: 'Ayla',
  siblingName: 'Rami',
  petName: 'Meethi',
  petKind: 'cat',
  city: 'Lahore',
  currentChallenge: 'starting a new school'
};

const SESSION_COUNT = 24; // ~4 sessions a week for 6 weeks
const HISTORY_DAYS = 41; // the first session was about six weeks ago
const RETEACH_EVERY = 6; // every 6th session is a review, no new sound
const CAPPED_SESSIONS = new Set([7, 19]); // two sessions hit the 15-min cap
const DISTRESS_SESSION = 13; // one pain escalation mid-history (FR-I.2)

/** Simulated reading accuracy: errors start ~30% and shrink to ~6%. */
function errorRateFor(sessionIndex: number): number {
  return Math.max(0.06, 0.3 - sessionIndex * 0.011);
}

/** Fluency grows ~1.2 WPM per session, from a 9 WPM start. */
function wpmFor(sessionIndex: number, rng: () => number): number {
  return Math.round(9 + sessionIndex * 1.2 + rng() * 3);
}

/** Session timestamps: spread across the history, late-afternoon reads. */
function sessionDate(sessionIndex: number, anchor: Date): Date {
  const dayOffset = Math.floor((sessionIndex * HISTORY_DAYS) / SESSION_COUNT);
  const date = new Date(anchor);
  date.setDate(date.getDate() - HISTORY_DAYS + dayOffset);
  date.setUTCHours(11, 30, 0, 0); // 16:30 PKT
  return date;
}

/** The graphemes the engine would accept while this story is being read. */
function readingContext(model: LearnerModel, target: string): string[] {
  const group = isBootstrap(model.taughtGraphemes, target) ? foundationGroup(target) : [];
  return [...model.taughtGraphemes, ...group, target];
}

/** Graphemes a miscue is logged against (FR-C.5); tricky/proper nouns log
 *  against the whole word. */
function graphemesOf(word: string, context: string[]): string[] {
  return parseGraphemes(word, context) ?? [word];
}

/** Plausible substitution: swap the first grapheme for another taught one. */
function misread(word: string, context: string[], rng: () => number): string {
  const parts = parseGraphemes(word, context);
  if (parts === null || parts.length === 0) return word;
  const alternatives = context.filter((g) => g !== parts[0] && g.length === 1);
  if (alternatives.length === 0) return word;
  const swap = alternatives[Math.floor(rng() * alternatives.length)] as string;
  return [swap, ...parts.slice(1)].join('');
}

/** The credential this repository published in its history. Rejected outright,
 *  so a .env copied from an older README cannot silently reintroduce a password
 *  that is now public on the internet. */
const RETIRED_SEED_PASSWORD = 'change-me-before-demo';

/**
 * Resolve the demo parent's password.
 *
 * This repository is public, so a password defaulting in config.ts is a
 * PUBLISHED credential for every deployment that follows the README's
 * `cp .env.example .env` + `npm run seed` -- and the seeded parent also carries
 * consentGivenAt, which is the flag that lets voice clips be retained. Empty
 * (the shipped default) therefore generates a strong random password and prints
 * it exactly once. An explicit value is honoured, but must clear the same
 * 10-character floor the registration route enforces.
 */
function resolveSeedPassword(configured: string): { password: string; generated: boolean } {
  if (configured === '') {
    return { password: randomBytes(18).toString('base64url'), generated: true };
  }
  if (configured === RETIRED_SEED_PASSWORD) {
    throw new Error(
      'SEED_PARENT_PASSWORD is the value published in this repository\'s history. Choose a different\n' +
        'password, or leave SEED_PARENT_PASSWORD empty to have a strong one generated.'
    );
  }
  if (configured.length < 10) {
    throw new Error('SEED_PARENT_PASSWORD must be at least 10 characters (the registration floor).');
  }
  return { password: configured, generated: false };
}

export async function seed(prisma: PrismaClient): Promise<void> {
  const env = loadEnv();
  const rng = makeRng(20260904); // hackathon date — the demo is a fixed point in time
  const generator = new MockStoryGenerator();
  const now = new Date();

  // ---- Idempotent reset: cascade removes the child's whole world. --------
  const existing = await prisma.parent.findUnique({ where: { email: env.SEED_PARENT_EMAIL } });
  if (existing !== null) {
    await prisma.parent.delete({ where: { id: existing.id } });
  }

  // ---- Parent + consent (given the day before the first story). ----------
  const consentAt = sessionDate(0, now);
  consentAt.setDate(consentAt.getDate() - 1);
  const seedCredential = resolveSeedPassword(env.SEED_PARENT_PASSWORD);
  const parent = await prisma.parent.create({
    data: {
      email: env.SEED_PARENT_EMAIL,
      passwordHash: await hash(seedCredential.password),
      consentGivenAt: consentAt
    }
  });

  // ---- Child: 5.5 years old at the start of the history. -----------------
  const birthDate = sessionDate(0, now);
  birthDate.setFullYear(birthDate.getFullYear() - 5);
  birthDate.setMonth(birthDate.getMonth() - 6);
  const child = await prisma.child.create({
    data: {
      parentId: parent.id,
      name: 'Ayla',
      birthDate,
      worldSeed: WORLD_SEED as unknown as Prisma.InputJsonValue,
      createdAt: sessionDate(0, now)
    }
  });

  await prisma.auditLog.create({
    data: {
      event: 'child.created',
      childId: child.id,
      detail: { worldSeedHero: WORLD_SEED.heroName },
      createdAt: child.createdAt
    }
  });

  // ---- Second child: toddler Zayn — demos the research-backed 0–4 track --
  // (First Words + Kindness Corner). No reading history: at this age the
  // session is curated exposure, and progress lands in the audit log.
  const toddlerBirth = new Date(now);
  toddlerBirth.setFullYear(toddlerBirth.getFullYear() - 2);
  toddlerBirth.setMonth(toddlerBirth.getMonth() - 6);
  const toddler = await prisma.child.create({
    data: {
      parentId: parent.id,
      name: 'Zayn',
      birthDate: toddlerBirth,
      worldSeed: WORLD_SEED as unknown as Prisma.InputJsonValue
    }
  });
  const toddlerModel = createLearnerModel();
  await prisma.learnerModel.create({
    data: {
      childId: toddler.id,
      schemaVersion: toddlerModel.schemaVersion,
      state: toddlerModel as unknown as Prisma.InputJsonValue
    }
  });
  await prisma.auditLog.create({
    data: {
      event: 'child.created',
      childId: toddler.id,
      detail: { worldSeedHero: WORLD_SEED.heroName }
    }
  });

  // ---- Replay six weeks of reading. --------------------------------------
  let model = createLearnerModel(1, sessionDate(0, now));
  let lastTheme = 'courage' as Story['theme'];

  for (let i = 0; i < SESSION_COUNT; i++) {
    const at = sessionDate(i, now);
    const isReteach = i > 0 && i % RETEACH_EVERY === RETEACH_EVERY - 1;
    const capped = CAPPED_SESSIONS.has(i);

    // The engine decides what this story teaches — exactly like production.
    const constraints = buildStoryConstraints(model, WORLD_SEED, 5, at);
    const context = readingContext(model, constraints.targetGrapheme);

    // Generate with the REAL mock generator (self-validating, decodable).
    let story: Story | null = null;
    try {
      const { story: generated } = await generator.generate({
        constraints,
        level: generationLevel(model, constraints.targetGrapheme),
        promptVersion: 'seed-1',
        taughtTrickyWords: model.taughtTrickyWords, decodable: true
      });
      story = {
        ...generated,
        level: model.currentLevel,
        targetGrapheme: constraints.targetGrapheme,
        theme: constraints.theme,
        provenance: { generator: generator.name, model: generator.model, promptVersion: 'seed-1' }
      };
    } catch {
      // Bounded generator exhaustion: production would serve the cache; the
      // seed simply records a story-less session (storyId is nullable).
    }

    let storyId: string | null = null;
    if (story !== null) {
      const storyRow = await prisma.story.create({
        data: {
          childId: child.id,
          level: story.level,
          title: story.title,
          theme: story.theme,
          targetGrapheme: story.targetGrapheme,
          source: 'generated',
          content: story as unknown as Prisma.InputJsonValue,
          provenance: {
            generator: generator.name,
            model: generator.model,
            promptVersion: 'seed-1',
            decisions: [
              { check: 'generator.decodability', ok: true },
              { check: 'generator.targetOccurrences', ok: true },
              { check: 'filter.content', ok: true }
            ]
          },
          createdAt: at
        }
      });
      storyId = storyRow.id;
      await prisma.auditLog.create({
        data: {
          event: 'story.accepted',
          childId: child.id,
          sessionId: undefined,
          detail: { title: story.title, targetGrapheme: story.targetGrapheme, level: story.level, reteach: isReteach },
          createdAt: at
        }
      });
    }

    // ---- Simulate the read: outcomes from the story's own words. ---------
    const outcomes: WordOutcome[] = [];
    if (story !== null) {
      const words = [...new Set(story.pages.flatMap((p) => tokenize(p.text)))];
      const rate = errorRateFor(i);
      for (const [index, word] of words.entries()) {
        const graphemes = graphemesOf(word, context);
        if (rng() < rate && graphemes[0] !== undefined && graphemes[0].length === 1) {
          // An error: mostly self-corrections (ladder 1), some needing the
          // segment/model rung (ladder 2). A third attempt never exists.
          const selfCorrect = rng() < 0.6;
          outcomes.push({
            expected: word,
            index,
            outcome: selfCorrect ? 'self-correction' : 'substitution',
            spoken: selfCorrect ? word : misread(word, context, rng),
            graphemes,
            ladderStep: selfCorrect ? 1 : 2
          });
        } else {
          outcomes.push({ expected: word, index, outcome: 'correct', graphemes, ladderStep: 0 });
        }
      }
    }

    const wordsRead = outcomes.length + (capped ? 6 : 0); // cap = a few extra lines
    const wordsCorrect = outcomes.filter((o) => o.outcome === 'correct' || o.outcome === 'self-correction').length;
    const wpm = wpmFor(i, rng);
    const durationMinutes = capped ? 15 : Math.min(14, Math.max(5, Math.round((wordsRead / wpm) * 60 / 60) + 5));
    const endedAt = new Date(at.getTime() + durationMinutes * 60_000);

    const session = await prisma.readingSession.create({
      data: {
        childId: child.id,
        storyId,
        startedAt: at,
        endedAt,
        cappedByServer: capped,
        planRitualDone: true,
        narrativeCloseDone: !capped || rng() < 0.5,
        wordsRead,
        wordsCorrect,
        wordsPerMinute: wpm,
        costMicroUsd: 0, // mock providers cost nothing — honesty on the card
        providerMode: 'mock'
      }
    });

    // Miscue rows — the word-level evidence the digest renders.
    for (const o of outcomes) {
      if (o.outcome === 'correct') continue;
      await prisma.miscue.create({
        data: {
          sessionId: session.id,
          expected: o.expected,
          spoken: o.spoken ?? null,
          miscueType: o.outcome,
          grapheme: o.graphemes[0] ?? o.expected,
          ladderStep: o.ladderStep,
          accentApplied: false,
          createdAt: at
        }
      });
    }

    // Planted accent catch (FR-G): 'one' heard as 'wan' is ACCEPTED, not
    // flagged — counted as a correct read with the variant note on show.
    if (i % 11 === 10) {
      await prisma.miscue.create({
        data: {
          sessionId: session.id,
          expected: 'one',
          spoken: 'wan',
          miscueType: 'substitution',
          grapheme: 'one',
          ladderStep: 0,
          accentApplied: true,
          accentNote: 'common L2 realisation',
          createdAt: at
        }
      });
    }

    // The choice point — the child's "why" is recorded when she gives one.
    if (story !== null) {
      await prisma.choiceEvent.create({
        data: {
          sessionId: session.id,
          storyId,
          prompt: story.choice.prompt,
          chosenIndex: rng() < 0.5 ? 0 : 1,
          rationale: rng() < 0.4 ? 'because that is kind' : null,
          createdAt: endedAt
        }
      });
    }

    // One distress escalation mid-history — category only, never raw words.
    if (i === DISTRESS_SESSION) {
      const alertAt = new Date(at.getTime() + 4 * 60_000);
      await prisma.distressAlert.create({
        data: {
          childId: child.id,
          sessionId: session.id,
          category: 'pain',
          severity: 'escalate',
          acknowledgedAt: new Date(alertAt.getTime() + 30_000),
          createdAt: alertAt
        }
      });
      await prisma.auditLog.create({
        data: {
          event: 'distress.escalated',
          childId: child.id,
          sessionId: session.id,
          detail: { category: 'pain' },
          createdAt: alertAt
        }
      });
    }

    await prisma.auditLog.create({
      data: {
        event: capped ? 'session.capped' : 'session.closed',
        childId: child.id,
        sessionId: session.id,
        detail: { wordsRead, wordsCorrect, wordsPerMinute: wpm },
        createdAt: endedAt
      }
    });

    // ---- Fold the session into the learner model with the real engines. --
    model = applyWordOutcomes(model, outcomes, at);
    model = recordFluency(model, wpm, at);
    model = markThemeSeen(model, constraints.theme, at);
    lastTheme = constraints.theme;

    if (!isReteach) {
      const { model: advanced, introduced } = introduceNextGrapheme(model, at);
      model = advanced;
      await prisma.auditLog.create({
        data: {
          event: 'progression.advance',
          childId: child.id,
          detail: introduced === null ? { level: model.currentLevel } : { introduced },
          createdAt: at
        }
      });
    } else {
      await prisma.auditLog.create({
        data: {
          event: 'progression.reteach',
          childId: child.id,
          detail: { theme: lastTheme },
          createdAt: at
        }
      });
    }
  }

  // ---- Persist the final learner model. -----------------------------------
  await prisma.learnerModel.create({
    data: {
      childId: child.id,
      schemaVersion: model.schemaVersion,
      state: model as unknown as Prisma.InputJsonValue
    }
  });

   
  console.log(
    `Seeded demo family: ${env.SEED_PARENT_EMAIL} · child "${child.name}" · ` +
      `${SESSION_COUNT} sessions · level ${model.currentLevel} · ` +
      `${model.taughtGraphemes.length} graphemes taught · ${model.vocabulary.length} words read`
  );
  // Printed once, stored nowhere else: the alternative was a password committed
  // to a public repository, which is what this replaces.
  if (seedCredential.generated) {
    console.log(
      `\nDemo password (generated, shown once):\n  ${seedCredential.password}\n` +
        'Set SEED_PARENT_PASSWORD to pin your own instead.\n'
    );
  }
}

// ---------------------------------------------------------------------------
// Direct execution: npm run seed
// ---------------------------------------------------------------------------
async function main(): Promise<void> {
  // Local dev convenience: pick up app/.env the way Docker compose does not
  // need to. Silently skip when env already comes from the environment.
  try {
    process.loadEnvFile();
  } catch {
    // No .env file — environment variables must carry the config.
  }
  const env = loadEnv();
  const prisma = db(env.DATABASE_URL);
  try {
    await seed(prisma);
  } finally {
    await disconnectDb();
  }
}

main().catch((err) => {
   
  console.error('Seed failed:', err);
  process.exitCode = 1;
});
