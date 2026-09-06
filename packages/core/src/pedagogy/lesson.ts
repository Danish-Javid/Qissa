/**
 * The standalone "Learn to Read" lesson plan — the "Toddlers Can Read" method
 * as pure, testable pedagogy.
 *
 * TCR teaches reading in three warm, confidence-first 1-on-1 steps:
 *   1. letter SOUNDS (the sound, never the letter name),
 *   2. BLENDING those sounds into a word ("s-a-t … sat!"),
 *   3. a small set of SIGHT words (high-frequency "tricky" words taught whole).
 *
 * This module decides WHAT one lesson teaches for one child, adaptively, from
 * the mastery model: the next sounds they have not met, real decodable words to
 * blend using those sounds, and the next sight words. It is the lesson analogue
 * of teachWordsForPage — deterministic, no I/O — so the server route and the
 * browser render the SAME lesson and the test suite can pin it.
 *
 * Fail-closed like the rest of the pedagogy: a blend word is offered only if it
 * parses with EXACTLY the sounds the child will have AFTER this lesson (taught
 * plus the new ones), so the child never meets a word she cannot sound out. If
 * the whole sequence is already mastered, it returns a review lesson (fluency
 * on the most recent sounds) rather than an empty plan.
 */
import { graphemesUpTo, phonicsScope, trickyWordsUpTo, wordBanks, type WordBank } from '../data/index.js';
import { applyWordOutcomes, introduceNextGrapheme, teachTrickyWord } from '../learner/learner-model.js';
import type { LearnerModel, WordOutcome, WorldSeed } from '../types.js';
import { isWordDecodable, type DecodabilityContext } from './decodability.js';
import { parseGraphemes, segmentationOf } from './graphemes.js';

/** One new letter sound, with a decodable carrier word to anchor it. */
export interface LessonSound {
  /** The grapheme being taught, e.g. "s" or "sh". */
  grapheme: string;
  /** How Buddy voices it — the SOUND, not the letter name, e.g. "/s/". */
  soundCue: string;
  /** A decodable word carrying the sound, e.g. "sat". */
  exampleWord: string;
  /** The example word segmented, e.g. ["/s/", "/a/", "/t/"]. */
  exampleSegments: string[];
}

/** A word the child blends from sounds they now know. */
export interface LessonBlendWord {
  word: string;
  /** Segmented for the "put it together" step, e.g. ["/s/", "/a/", "/t/"]. */
  segments: string[];
  /** The parsed graphemes, e.g. ["s", "a", "t"]. */
  graphemes: string[];
}

/** A high-frequency "tricky" word taught as a whole (a sight word). */
export interface LessonSightWord {
  /** Original case preserved for display ("I", "the"). */
  word: string;
}

export interface LessonPlan {
  childName: string;
  level: number;
  /** True when no new sounds remained, so this is a fluency/review lesson. */
  isReview: boolean;
  newSounds: LessonSound[];
  blendWords: LessonBlendWord[];
  sightWords: LessonSightWord[];
  /** The sound set this lesson's words decode with (taught + new). The client
   *  segments with exactly this so a digraph stays one sound. */
  taughtGraphemes: string[];
}

export interface LessonOptions {
  newSounds?: number;
  blendWords?: number;
  sightWords?: number;
}

/** TCR keeps a lesson small and warm: a few new sounds, a handful of blends,
 *  a couple of sight words — short enough to finish, deep enough to progress. */
export const LESSON_NEW_SOUNDS = 3;
export const LESSON_BLEND_WORDS = 5;
export const LESSON_SIGHT_WORDS = 2;

/** Every common candidate word in the curriculum, shortest-first: the scope's
 *  own example words plus the level word banks (nouns, verbs, settings,
 *  adjectives, and the short decodable "sentence bits" — at, it, in, on, and…
 *  the high-frequency glue words a new reader blends first). Two kinds are
 *  deliberately left out: proper names (a blend word should be a common word a
 *  child can generalise from, not a name) and tricky words (those are taught
 *  whole as sight words, never blended — and isWordDecodable would otherwise
 *  wave "the" through as t-h-e once the child reaches level 2). Memoised: the
 *  curriculum is static data, so this is built once. */
let candidateCache: string[] | null = null;
function candidateWords(): string[] {
  if (candidateCache !== null) return candidateCache;
  const tricky = new Set(trickyWordsUpTo(phonicsScope.levels.length));
  const words = new Set<string>();
  for (const level of phonicsScope.levels) {
    for (const w of level.examples) words.add(w.toLowerCase());
    const bank = wordBanks[String(level.level)] as WordBank | undefined;
    if (bank !== undefined) {
      for (const w of [...bank.nouns, ...bank.verbs, ...bank.settings, ...bank.adjectives, ...bank.sentenceBits]) {
        words.add(w.toLowerCase());
      }
    }
  }
  candidateCache = [...words]
    .filter((w) => !tricky.has(w))
    .sort((a, b) => a.length - b.length || a.localeCompare(b));
  return candidateCache;
}

/** Concrete, drawable curriculum words — the ones worth a picture. Glue words
 *  (the sentence bits: at, in, on…) and tricky sight words have no single image
 *  a child can point at, so the lesson only pairs FLUX art with words drawn from
 *  the scope examples and the noun/verb/setting/adjective banks. Memoised like
 *  the candidate pool; the server also uses it as the allow-list for word art,
 *  which both bounds vendor cost and keeps arbitrary strings out of prompts. */
let picturableCache: Set<string> | null = null;
export function picturableWords(): Set<string> {
  if (picturableCache !== null) return picturableCache;
  const set = new Set<string>();
  for (const level of phonicsScope.levels) {
    for (const w of level.examples) set.add(w.toLowerCase());
    const bank = wordBanks[String(level.level)] as WordBank | undefined;
    if (bank !== undefined) {
      for (const w of [...bank.nouns, ...bank.verbs, ...bank.settings, ...bank.adjectives]) {
        set.add(w.toLowerCase());
      }
    }
  }
  picturableCache = set;
  return set;
}

/** True when a word has a concrete referent a picture can show ("fern", "sat"),
 *  as opposed to glue/sight words ("at", "the") that are only ever text. */
export function isPicturableWord(word: string): boolean {
  return picturableWords().has(word.toLowerCase());
}

/**
 * Build the TCR lesson for one child: the next new sounds, real words to blend
 * with them, and the next sight words — all gated so nothing undecodable is
 * ever offered. Pure and deterministic (no clock, no I/O).
 */
export function buildLessonPlan(
  model: LearnerModel,
  worldSeed: WorldSeed,
  options: LessonOptions = {}
): LessonPlan {
  const newSoundCount = Math.max(0, options.newSounds ?? LESSON_NEW_SOUNDS);
  const blendCount = Math.max(0, options.blendWords ?? LESSON_BLEND_WORDS);
  const sightCount = Math.max(0, options.sightWords ?? LESSON_SIGHT_WORDS);

  const fullSequence = graphemesUpTo(phonicsScope.levels.length);
  const untaught = fullSequence.filter((g) => !model.taughtGraphemes.includes(g));

  // The sounds this lesson teaches: the next untaught ones in sequence. When
  // the whole sequence is mastered there is nothing new, so review the most
  // recent sounds instead (fluency practice) — the lesson is never empty.
  const isReview = untaught.length === 0;
  const focusGraphemes = isReview
    ? model.taughtGraphemes.slice(-newSoundCount)
    : untaught.slice(0, newSoundCount);

  // After the lesson the child decodes with everything taught so far PLUS the
  // new sounds. Every blend word is gated against exactly this set, so the
  // "your turn" check never asks for a word the child cannot sound out.
  const taughtAfter = isReview ? [...model.taughtGraphemes] : [...model.taughtGraphemes, ...focusGraphemes];
  const ctx: DecodabilityContext = { taughtGraphemes: taughtAfter, taughtTrickyWords: model.taughtTrickyWords };

  // Parse every decodable candidate once (shortest-first). Tricky words drop
  // out here on purpose: a blend word must be genuinely sound-out-able, while
  // sight words are taught separately as wholes.
  const parsed = candidateWords()
    .filter((w) => isWordDecodable(w, ctx))
    .map((word) => ({ word, graphemes: parseGraphemes(word, taughtAfter) }))
    .filter((x): x is { word: string; graphemes: string[] } => x.graphemes !== null);
  const graphemesOf = new Map(parsed.map((p) => [p.word, p.graphemes]));

  // --- Step 1: anchor each new sound to a decodable carrier word ---------
  const newSounds: LessonSound[] = [];
  const usedExamples = new Set<string>();
  for (const g of focusGraphemes) {
    // Prefer a word that STARTS with the sound (clearest for "s says /s/"),
    // else any decodable word containing it — and, where the vocabulary
    // allows, one not already anchoring another sound, so the sound step does
    // not repeat the same carrier ("sat … sat … sat") three times over.
    const startsWith = parsed.filter((p) => p.graphemes[0] === g);
    const contains = parsed.filter((p) => p.graphemes.includes(g));
    const example =
      startsWith.find((p) => !usedExamples.has(p.word)) ??
      contains.find((p) => !usedExamples.has(p.word)) ??
      startsWith[0] ??
      contains[0];
    if (example === undefined) continue; // no safe carrier for this sound yet
    usedExamples.add(example.word);
    newSounds.push({
      grapheme: g,
      soundCue: `/${g}/`,
      exampleWord: example.word,
      exampleSegments: segmentationOf(example.word, taughtAfter)
    });
  }

  // --- Step 2: words to blend, each using at least one new sound ---------
  // Lead with the carrier words already chosen (the clearest), then top up
  // with other decodable words that use a new sound.
  const focusSet = new Set(focusGraphemes);
  const ordered = [
    ...newSounds.map((s) => s.exampleWord),
    ...parsed.filter((p) => p.graphemes.some((g) => focusSet.has(g))).map((p) => p.word)
  ];
  const blendWords: LessonBlendWord[] = [];
  const seen = new Set<string>();
  for (const word of ordered) {
    if (seen.has(word)) continue;
    const graphemes = graphemesOf.get(word);
    if (graphemes === undefined) continue;
    seen.add(word);
    blendWords.push({ word, segments: segmentationOf(word, taughtAfter), graphemes });
    if (blendWords.length >= blendCount) break;
  }

  // --- Step 3: the next sight (tricky) words, taught as wholes -----------
  // Gated to the child's level +1 (same horizon the story engine uses) and
  // original case is preserved so "I" reads as "I", not "i".
  const sightWords: LessonSightWord[] = phonicsScope.levels
    .filter((l) => l.level <= model.currentLevel + 1)
    .flatMap((l) => l.trickyWords)
    .filter((w) => !model.taughtTrickyWords.includes(w.toLowerCase()))
    .slice(0, sightCount)
    .map((word) => ({ word }));

  return {
    childName: worldSeed.heroName,
    level: model.currentLevel,
    isReview,
    newSounds,
    blendWords,
    sightWords,
    taughtGraphemes: taughtAfter
  };
}

/**
 * Credit a served lesson into the mastery model — the lesson analogue of the
 * story engine's teach-on-serve. It advances the taught boundary by EXACTLY
 * the sounds the plan added, using the same introduceNextGrapheme primitive
 * the read-along credits on serve (which also pulls in the level's tricky
 * words and bumps currentLevel), then credits the sight words the lesson
 * showed. A review lesson adds no new sounds, so it credits nothing new —
 * fluency practice never silently promotes a reader. Pure: the caller
 * persists the result, exactly like every other learner-model update.
 */
/**
 * One word the child was actually asked to produce, and what happened.
 *
 * `assisted` marks a word the companion modelled first — repeating a word
 * seconds after hearing it is not the same evidence as decoding it cold, and
 * conflating the two is how a record starts claiming more than it knows.
 */
export interface LessonOutcome {
  word: string;
  correct: boolean;
  assisted?: boolean;
}

/**
 * Fold a finished lesson's REAL outcomes into the learner model.
 *
 * This replaced applyLessonToModel, which advanced the taught boundary the
 * moment a lesson was SERVED. That made mastery a function of tapping "start":
 * a child could open a lesson, skip every step, and be handed harder material
 * next time, because nothing downstream could tell a lesson that was presented
 * from one that was practised.
 *
 * The rule now: serving a lesson teaches nothing. A sound is introduced only
 * once the child has produced a word carrying it at least once unaided, and a
 * sight word only once she has said it. Everything she was asked is recorded
 * either way — a wrong answer is evidence too, and it feeds the same
 * spaced-repetition and reteach machinery a wrong read does.
 */
export function applyLessonOutcomes(
  model: LearnerModel,
  plan: LessonPlan,
  outcomes: LessonOutcome[],
  at = new Date()
): LearnerModel {
  // Only unassisted successes count as evidence a sound has landed.
  const demonstrated = new Set(
    outcomes.filter((o) => o.correct && o.assisted !== true).map((o) => o.word.toLowerCase())
  );

  // A new sound is introduced when ANY word carrying it was read unaided.
  // In-sequence, because introduceNextGrapheme walks the curriculum order:
  // stop at the first sound with no evidence rather than skipping past it.
  let updated = model;
  for (const sound of plan.newSounds) {
    const carriers = [sound.exampleWord, ...plan.blendWords.filter((b) => b.graphemes.includes(sound.grapheme)).map((b) => b.word)];
    const shown = carriers.some((w) => demonstrated.has(w.toLowerCase()));
    if (!shown) break;
    updated = introduceNextGrapheme(updated, at).model;
  }

  // Sight words are taught as wholes, so saying one IS the demonstration.
  for (const sight of plan.sightWords) {
    if (demonstrated.has(sight.word.toLowerCase())) updated = teachTrickyWord(updated, sight.word, at);
  }

  // Every attempt becomes grapheme-level evidence, right and wrong alike.
  const wordOutcomes: WordOutcome[] = outcomes.map((o, index) => ({
    expected: o.word.toLowerCase(),
    index,
    outcome: o.correct ? 'correct' : 'substitution',
    graphemes: parseGraphemes(o.word.toLowerCase(), plan.taughtGraphemes) ?? [o.word.toLowerCase()],
    ladderStep: o.assisted === true ? 1 : 0
  }));

  return applyWordOutcomes(updated, wordOutcomes, at);
}

/**
 * How many of this lesson's new sounds the child has no evidence for yet.
 *
 * The planner uses this to stop stacking un-evidenced material: a child who
 * has been shown three sounds and demonstrated none does not need a fourth.
 */
export function unevidencedSounds(model: LearnerModel): string[] {
  return model.taughtGraphemes.filter((g) => (model.graphemeStats[g]?.exposures ?? 0) === 0);
}
