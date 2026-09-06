/**
 * The learner model (FR-F) — the durable developmental record. This is the
 * moat: per-child phoneme mastery, vocabulary, fluency and decay timestamps,
 * persisting across years. Schema is versioned (FR-F.4); readers ignore
 * unknown fields, writers never drop schemaVersion.
 *
 * Every function here is a pure update — call sites persist the result.
 * The server re-runs these updates on the canonical copy after each line;
 * the browser runs the same code offline and reconciles later.
 */
import type { GraphemeStat, LearnerModel, StoryConstraints, ThemeId, WordOutcome, WorldSeed } from '../types.js';
import { graphemesUpTo, themeCurriculum, themeForChallenge, trickyWordsUpTo, phonicsScope } from '../data/index.js';
import { recordOutcome } from '../pedagogy/progression.js';
import { dueForReview, scheduleNextReview } from './spaced-repetition.js';

export const LEARNER_SCHEMA_VERSION = 1;

/** Maximum untaught tricky words allowed in one generated story (Doc 6 §8). */
const MAX_NEW_TRICKY_PER_STORY = 2;
/** Minimum appearances the target grapheme must get in a story. */
export const TARGET_GRAPHEME_MIN_OCCURRENCES = 6;
/** Minimum appearances each review grapheme must get. */
export const REVIEW_GRAPHEME_MIN_OCCURRENCES = 3;
/** Maximum review items carried into one story. */
const MAX_REVIEW_ITEMS = 3;

export function createLearnerModel(startLevel = 1, at = new Date()): LearnerModel {
  const taught = graphemesUpTo(startLevel - 1); // nothing taught before day one
  const stats: Record<string, GraphemeStat> = {};
  for (const g of graphemesUpTo(phonicsScope.levels.length)) {
    stats[g] = {
      grapheme: g,
      exposures: 0,
      correct: 0,
      distinctWords: [],
      status: 'new',
      lastSeen: null,
      nextReviewDue: null
    };
  }
  return {
    schemaVersion: LEARNER_SCHEMA_VERSION,
    currentLevel: startLevel,
    taughtGraphemes: [...taught],
    taughtTrickyWords: trickyWordsUpTo(startLevel - 1),
    graphemeStats: stats,
    vocabulary: [],
    fluency: [],
    themesSeen: [],
    updatedAt: at.toISOString()
  };
}

/** Ensure a stat row exists (forward-compat: unknown graphemes get rows). */
/**
 * The current stat for a grapheme, or a fresh one.
 *
 * Takes the STATS RECORD, not the model, and that is the whole point: callers
 * accumulate into a working record across many observations, and reading from
 * the original model instead would make every write start from the same
 * pre-batch value — silently discarding all but the last. See the note on
 * applyWordOutcomes.
 */
function statFor(stats: Record<string, GraphemeStat>, grapheme: string): GraphemeStat {
  return (
    stats[grapheme] ?? {
      grapheme,
      exposures: 0,
      correct: 0,
      distinctWords: [],
      status: 'new',
      lastSeen: null,
      nextReviewDue: null
    }
  );
}

/**
 * Fold one classified line into the model.
 * Correct reads and self-corrections count as correct for the graphemes in
 * that word; substitutions and omissions count against them. Hesitations are
 * fluency-only and never touch accuracy.
 */
export function applyWordOutcomes(model: LearnerModel, outcomes: WordOutcome[], at = new Date()): LearnerModel {
  const stats = { ...model.graphemeStats };
  const vocabulary = [...model.vocabulary];

  for (const o of outcomes) {
    if (o.outcome === 'hesitation') continue; // fluency signal, not accuracy

    const wasCorrect = o.outcome === 'correct' || o.outcome === 'self-correction';

    for (const g of o.graphemes) {
      // Read from the ACCUMULATOR, not from `model`. Reading the original
      // model here meant a line like "sat sit" recorded `s` and `t` once
      // each — the second observation started from the pre-batch stat and
      // overwrote the first, losing both the exposure and the distinct word.
      // Since progression needs 8/10 across 3+ DISTINCT words, that made
      // mastery unreachable for exactly the graphemes a child practised most.
      let stat = statFor(stats, g);
      stat = recordOutcome(stat, o.expected, wasCorrect, at.toISOString());
      stat = { ...stat, nextReviewDue: scheduleNextReview(stat, at) };
      stats[g] = stat;
    }

    if (wasCorrect && !vocabulary.includes(o.expected)) {
      vocabulary.push(o.expected);
    }
  }

  return { ...model, graphemeStats: stats, vocabulary, updatedAt: at.toISOString() };
}

/** Record a fluency sample (words correct per minute). */
export function recordFluency(model: LearnerModel, wordsPerMinute: number, at = new Date()): LearnerModel {
  return {
    ...model,
    fluency: [...model.fluency, { at: at.toISOString(), wordsPerMinute }],
    updatedAt: at.toISOString()
  };
}

/** Teach a tricky word as a whole (it joins the decodable vocabulary). */
export function teachTrickyWord(model: LearnerModel, word: string, at = new Date()): LearnerModel {
  const w = word.toLowerCase();
  if (model.taughtTrickyWords.includes(w)) return model;
  return {
    ...model,
    taughtTrickyWords: [...model.taughtTrickyWords, w],
    updatedAt: at.toISOString()
  };
}

/**
 * Advance the taught boundary: add the next grapheme(s) in sequence when the
 * current batch is ready. Called by the orchestrator between stories.
 * Returns the grapheme newly introduced to the child, if any.
 */
export function introduceNextGrapheme(model: LearnerModel, at = new Date()): { model: LearnerModel; introduced: string | null } {
  // Find the first grapheme in the full sequence not yet taught.
  const fullSequence = graphemesUpTo(phonicsScope.levels.length);
  const next = fullSequence.find((g) => !model.taughtGraphemes.includes(g));
  if (next === undefined) {
    // Whole sequence taught — level up if there is a level left.
    const nextLevel = Math.min(model.currentLevel + 1, phonicsScope.levels.length);
    return {
      model: { ...model, currentLevel: nextLevel, updatedAt: at.toISOString() },
      introduced: null
    };
  }

  const levelOfNext = phonicsScope.levels.find((l) => l.graphemes.includes(next))?.level ?? model.currentLevel;
  const trickyAtLevel = phonicsScope.levels
    .filter((l) => l.level <= levelOfNext)
    .flatMap((l) => l.trickyWords.map((w) => w.toLowerCase()))
    .filter((w) => !model.taughtTrickyWords.includes(w));

  return {
    model: {
      ...model,
      currentLevel: Math.max(model.currentLevel, levelOfNext),
      taughtGraphemes: [...model.taughtGraphemes, next],
      taughtTrickyWords: [...model.taughtTrickyWords, ...trickyAtLevel],
      updatedAt: at.toISOString()
    },
    introduced: next
  };
}

/**
 * Choose the character theme for the next story (FR-E.4).
 * The world seed's "current challenge" anchors the FIRST theme; afterwards
 * the 12-week curriculum rotates, skipping nothing.
 */
export function nextTheme(model: LearnerModel, worldSeed: WorldSeed): ThemeId {
  if (model.themesSeen.length === 0) {
    return themeForChallenge(worldSeed.currentChallenge);
  }
  const week = themeCurriculum[model.themesSeen.length % themeCurriculum.length];
  return week ? week.theme : 'courage';
}

/** Mark a theme as seen after its story is served. */
export function markThemeSeen(model: LearnerModel, theme: ThemeId, at = new Date()): LearnerModel {
  return { ...model, themesSeen: [...model.themesSeen, theme], updatedAt: at.toISOString() };
}

/**
 * Build the constraint object for the next story (Doc 6 §8).
 * This is the contract the story engine must satisfy — and the validator
 * re-checks every field after generation. Trust nothing, verify everything.
 */
export function buildStoryConstraints(
  model: LearnerModel,
  worldSeed: WorldSeed,
  ageYears: number,
  at = new Date()
): StoryConstraints {
  // Target: the next untaught grapheme (what this story teaches). When the
  // whole sequence is taught, fall back to the weakest learning grapheme.
  const fullSequence = graphemesUpTo(phonicsScope.levels.length);
  const untaught = fullSequence.find((g) => !model.taughtGraphemes.includes(g));
  const weakest = Object.values(model.graphemeStats)
    .filter((s) => s.status === 'learning' || s.status === 'reteach')
    .sort((a, b) => a.correct / Math.max(a.exposures, 1) - b.correct / Math.max(b.exposures, 1))[0];
  const targetGrapheme = untaught ?? weakest?.grapheme ?? model.taughtGraphemes[model.taughtGraphemes.length - 1] ?? 'a';

  // Review: graphemes whose spaced-repetition date has passed, capped.
  const reviewGraphemes = dueForReview(Object.values(model.graphemeStats), at)
    .slice(0, MAX_REVIEW_ITEMS)
    .map((s) => s.grapheme);

  // New tricky words: at most two per story, so unfamiliar high-frequency
  // words never swamp a decodable text.
  const nextTricky: string[] = phonicsScope.levels
    .filter((l) => l.level <= model.currentLevel + 1)
    .flatMap((l) => l.trickyWords.map((w) => w.toLowerCase()))
    .filter((w) => !model.taughtTrickyWords.includes(w))
    .slice(0, MAX_NEW_TRICKY_PER_STORY);

  return {
    childName: worldSeed.heroName,
    ageYears,
    worldSeed,
    allowedGraphemes: [...model.taughtGraphemes],
    targetGrapheme,
    reviewGraphemes,
    allowedTrickyWords: nextTricky,
    theme: nextTheme(model, worldSeed),
    pageCount: pageCountForLevel(model.currentLevel)
  };
}

/** Adaptive length (FR-B.9): 4 pages at level 1, growing toward 20 by 8. */
export function pageCountForLevel(level: number): number {
  const clamped = Math.min(Math.max(level, 1), 8);
  return 4 + Math.round(((clamped - 1) / 7) * 16);
}
