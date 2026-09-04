/**
 * Progression rules (Doc 6 §2.4) — when a grapheme advances, holds, or is
 * reteached. Per-GRAPHEME, not per-level: a child can be master of `sh`
 * while `ch` is still learning.
 *
 * Thresholds, exactly as specified:
 *   advance   >= 8 correct out of >= 10 exposures, across >= 3 distinct words
 *   hold      accuracy in the 50–80% band
 *   reteach   accuracy below 50% (needs >= 4 exposures before we decide —
 *             two early misses must not condemn a grapheme)
 *
 * Pure functions over GraphemeStat. The learner model persists; these rules
 * only decide.
 */
import type { GraphemeStat, GraphemeStatus } from '../types.js';

export const ADVANCE_MIN_CORRECT = 8;
export const ADVANCE_MIN_EXPOSURES = 10;
export const ADVANCE_MIN_DISTINCT_WORDS = 3;
export const HOLD_LOWER_BOUND = 0.5;
export const ADVANCE_ACCURACY = 0.8;
export const MIN_EXPOSURES_BEFORE_RETEACH = 4;

/** Accuracy for a stat; 1.0 when there is no data yet (nothing is "wrong"). */
export function accuracyOf(stat: GraphemeStat): number {
  if (stat.exposures === 0) return 1;
  return stat.correct / stat.exposures;
}

/** Apply the advance/hold/reteach decision to a stat and return the status. */
export function decideProgression(stat: GraphemeStat): GraphemeStatus {
  const accuracy = accuracyOf(stat);

  if (
    stat.correct >= ADVANCE_MIN_CORRECT &&
    stat.exposures >= ADVANCE_MIN_EXPOSURES &&
    stat.distinctWords.length >= ADVANCE_MIN_DISTINCT_WORDS &&
    accuracy >= ADVANCE_ACCURACY
  ) {
    return 'mastered';
  }

  if (accuracy < HOLD_LOWER_BOUND && stat.exposures >= MIN_EXPOSURES_BEFORE_RETEACH) {
    return 'reteach';
  }

  return 'learning';
}

/**
 * Record one reading outcome against a grapheme stat (immutable update).
 * `wasCorrect` is true for correct reads AND self-corrections — fixing
 * yourself is evidence the grapheme is landing, and it is logged as a
 * positive signal everywhere in this product.
 */
export function recordOutcome(stat: GraphemeStat, word: string, wasCorrect: boolean, at: string): GraphemeStat {
  const distinctWords = stat.distinctWords.includes(word) ? stat.distinctWords : [...stat.distinctWords, word];
  const updated: GraphemeStat = {
    ...stat,
    exposures: stat.exposures + 1,
    correct: stat.correct + (wasCorrect ? 1 : 0),
    distinctWords,
    lastSeen: at
  };
  return { ...updated, status: decideProgression(updated) };
}
