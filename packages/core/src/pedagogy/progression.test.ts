/**
 * Progression-rule tests — advance / hold / reteach thresholds, exactly as
 * Doc 6 §2.4 specifies — plus the spaced-repetition decay curve.
 */
import { describe, expect, it } from 'vitest';
import { decideProgression, recordOutcome } from './progression.js';
import { dueForReview, intervalDaysFor, scheduleNextReview } from '../learner/spaced-repetition.js';
import type { GraphemeStat } from '../types.js';

function stat(overrides: Partial<GraphemeStat> = {}): GraphemeStat {
  return {
    grapheme: 'sh',
    exposures: 0,
    correct: 0,
    distinctWords: [],
    status: 'new',
    lastSeen: null,
    nextReviewDue: null,
    ...overrides
  };
}

describe('progression thresholds (Doc 6 §2.4)', () => {
  it('advances at 8/10 across 3+ distinct words', () => {
    const s = stat({ exposures: 10, correct: 8, distinctWords: ['ship', 'shop', 'fish'] });
    expect(decideProgression(s)).toBe('mastered');
  });

  it('does NOT advance at 8/10 across only 2 words', () => {
    const s = stat({ exposures: 10, correct: 8, distinctWords: ['ship', 'shop'] });
    expect(decideProgression(s)).toBe('learning');
  });

  it('holds in the 50–80% band', () => {
    expect(decideProgression(stat({ exposures: 10, correct: 6, distinctWords: ['a', 'b', 'c'] }))).toBe('learning');
    expect(decideProgression(stat({ exposures: 10, correct: 5, distinctWords: ['a', 'b', 'c'] }))).toBe('learning');
  });

  it('reteaches below 50%, but only after 4+ exposures', () => {
    // Two early misses must not condemn a grapheme.
    expect(decideProgression(stat({ exposures: 2, correct: 0, distinctWords: ['ship'] }))).toBe('learning');
    expect(decideProgression(stat({ exposures: 4, correct: 1, distinctWords: ['ship', 'shop'] }))).toBe('reteach');
  });

  it('recordOutcome counts self-corrections as correct at the stat level', () => {
    let s = stat();
    s = recordOutcome(s, 'ship', true, new Date().toISOString());
    s = recordOutcome(s, 'shop', false, new Date().toISOString());
    expect(s.exposures).toBe(2);
    expect(s.correct).toBe(1);
    expect(s.distinctWords).toEqual(['ship', 'shop']);
  });
});

describe('spaced repetition (FR-F.2)', () => {
  it('intervals follow the accuracy bands', () => {
    expect(intervalDaysFor(0.95)).toBe(14);
    expect(intervalDaysFor(0.8)).toBe(7);
    expect(intervalDaysFor(0.6)).toBe(3);
    expect(intervalDaysFor(0.2)).toBe(1);
  });

  it('schedules from the last exposure', () => {
    const at = new Date('2026-08-28T00:00:00Z');
    const s = stat({ exposures: 10, correct: 9, lastSeen: at.toISOString() });
    const due = scheduleNextReview(s, at);
    expect(due).toBe(new Date('2026-09-11T00:00:00Z').toISOString());
  });

  it('never flags unseen graphemes as due', () => {
    expect(dueForReview([stat()], new Date())).toEqual([]);
  });

  it('flags overdue graphemes as due', () => {
    const s = stat({
      exposures: 10,
      correct: 9,
      status: 'mastered',
      lastSeen: '2026-08-01T00:00:00Z',
      nextReviewDue: '2026-08-15T00:00:00Z'
    });
    expect(dueForReview([s], new Date('2026-08-28T00:00:00Z'))).toHaveLength(1);
  });
});
