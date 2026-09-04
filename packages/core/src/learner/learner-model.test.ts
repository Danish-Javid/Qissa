/**
 * Learner-model tests — the persistent record and the story-constraint
 * contract it produces (FR-F, Doc 6 §8).
 */
import { describe, expect, it } from 'vitest';
import {
  applyWordOutcomes,
  buildStoryConstraints,
  createLearnerModel,
  introduceNextGrapheme,
  pageCountForLevel,
  recordFluency,
  teachTrickyWord
} from './learner-model.js';
import type { WordOutcome, WorldSeed } from '../types.js';
import { graphemesUpTo } from '../data/index.js';

const seed: WorldSeed = {
  heroName: 'Ayla',
  siblingName: 'Rami',
  petName: 'Meethi',
  petKind: 'cat',
  city: 'Lahore',
  currentChallenge: 'scared of the dark'
};

function outcome(word: string, type: WordOutcome['outcome'], graphemes: string[]): WordOutcome {
  return { expected: word, index: 0, outcome: type, graphemes, ladderStep: 0 };
}

describe('createLearnerModel', () => {
  it('starts with nothing taught at level 1', () => {
    const m = createLearnerModel(1);
    expect(m.schemaVersion).toBe(1);
    expect(m.taughtGraphemes).toEqual([]);
    expect(m.currentLevel).toBe(1);
  });
});

describe('applyWordOutcomes', () => {
  it('credits graphemes for correct reads and grows vocabulary', () => {
    let m = createLearnerModel(1);
    m = applyWordOutcomes(m, [outcome('sat', 'correct', ['s', 'a', 't'])]);
    expect(m.graphemeStats['s']?.exposures).toBe(1);
    expect(m.graphemeStats['s']?.correct).toBe(1);
    expect(m.vocabulary).toContain('sat');
  });

  it('counts self-corrections as positive signal', () => {
    let m = createLearnerModel(1);
    m = applyWordOutcomes(m, [outcome('pin', 'self-correction', ['p', 'i', 'n'])]);
    expect(m.graphemeStats['p']?.correct).toBe(1);
    expect(m.vocabulary).toContain('pin');
  });

  it('debits graphemes for substitutions, never for hesitation', () => {
    let m = createLearnerModel(1);
    m = applyWordOutcomes(m, [
      outcome('tip', 'substitution', ['t', 'i', 'p']),
      outcome('nap', 'hesitation', ['n', 'a', 'p'])
    ]);
    expect(m.graphemeStats['t']?.correct).toBe(0);
    expect(m.graphemeStats['t']?.exposures).toBe(1);
    // Hesitation must not touch accuracy at all.
    expect(m.graphemeStats['n']?.exposures).toBe(0);
  });
});

describe('introduceNextGrapheme', () => {
  it('teaches the sequence in order and levels up with the data', () => {
    let m = createLearnerModel(1);
    const first = introduceNextGrapheme(m);
    expect(first.introduced).toBe('s');
    const second = introduceNextGrapheme(first.model);
    expect(second.introduced).toBe('a');
  });
});

describe('buildStoryConstraints (Doc 6 §8)', () => {
  it('anchors the first theme to the world-seed challenge', () => {
    const m = createLearnerModel(1);
    const c = buildStoryConstraints(m, seed, 5);
    // "scared of the dark" maps to courage per the theme curriculum.
    expect(c.theme).toBe('courage');
  });

  it('carries the world seed and allowed graphemes', () => {
    let m = createLearnerModel(1);
    m = { ...m, taughtGraphemes: graphemesUpTo(1) };
    const c = buildStoryConstraints(m, seed, 5);
    expect(c.worldSeed.heroName).toBe('Ayla');
    expect(c.allowedGraphemes).toEqual(graphemesUpTo(1));
  });

  it('targets the next untaught grapheme', () => {
    let m = createLearnerModel(1);
    m = { ...m, taughtGraphemes: ['s', 'a', 't'] };
    const c = buildStoryConstraints(m, seed, 5);
    expect(c.targetGrapheme).toBe('p');
  });

  it('never allows more than two new tricky words per story', () => {
    let m = createLearnerModel(4);
    m = { ...m, taughtGraphemes: graphemesUpTo(4), taughtTrickyWords: [] };
    const c = buildStoryConstraints(m, seed, 6);
    expect(c.allowedTrickyWords.length).toBeLessThanOrEqual(2);
  });
});

describe('fluency and tricky words', () => {
  it('records fluency samples as a timeline', () => {
    let m = createLearnerModel(1);
    m = recordFluency(m, 22);
    m = recordFluency(m, 31);
    expect(m.fluency.map((f) => f.wordsPerMinute)).toEqual([22, 31]);
  });

  it('teaches a tricky word exactly once', () => {
    let m = createLearnerModel(1);
    m = teachTrickyWord(m, 'the');
    m = teachTrickyWord(m, 'THE');
    expect(m.taughtTrickyWords).toEqual(['the']);
  });
});

describe('adaptive length (FR-B.9)', () => {
  it('is 4 pages at level 1 and grows toward 20 by level 8', () => {
    expect(pageCountForLevel(1)).toBe(4);
    expect(pageCountForLevel(8)).toBe(20);
    expect(pageCountForLevel(4)).toBeGreaterThan(4);
    expect(pageCountForLevel(4)).toBeLessThan(20);
  });
});
