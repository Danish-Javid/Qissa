/**
 * Spaced repetition (FR-F.2) — weak graphemes come back on a decay curve.
 *
 * The interval is a function of measured accuracy, nothing else:
 *   >= 90% accuracy  -> review in 14 days
 *   >= 75%           -> 7 days
 *   >= 50%           -> 3 days
 *   below 50%        -> tomorrow
 *
 * Simple, explainable, and good enough for the hackathon; the decay curve
 * shape is data-friendly (a lookup, not a model) so it can be tuned later
 * without architectural change.
 */
import type { GraphemeStat } from '../types.js';
import { accuracyOf } from '../pedagogy/progression.js';

const DAY_MS = 24 * 60 * 60 * 1000;

/** Days until next review for a given accuracy band. */
export function intervalDaysFor(accuracy: number): number {
  if (accuracy >= 0.9) return 14;
  if (accuracy >= 0.75) return 7;
  if (accuracy >= 0.5) return 3;
  return 1;
}

/** Compute the next review timestamp from the last exposure. */
export function scheduleNextReview(stat: GraphemeStat, at: Date): string | null {
  if (stat.lastSeen === null) return null;
  const days = intervalDaysFor(accuracyOf(stat));
  return new Date(at.getTime() + days * DAY_MS).toISOString();
}

/**
 * Which graphemes are due for review right now? Mastered graphemes decay
 * too — mastery without re-exposure fades, which is the whole point.
 * Graphemes never seen are not "due"; they are new.
 */
export function dueForReview(stats: GraphemeStat[], now: Date): GraphemeStat[] {
  return stats.filter((s) => {
    if (s.status === 'new' || s.nextReviewDue === null) return false;
    return new Date(s.nextReviewDue).getTime() <= now.getTime();
  });
}
