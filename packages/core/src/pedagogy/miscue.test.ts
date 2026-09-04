/**
 * Miscue-classifier tests — alignment, accent tolerance, and the
 * gentler-by-default bias (NFR-2.2).
 */
import { describe, expect, it } from 'vitest';
import { accuracyMisses, classifyReading } from './miscue.js';
import { matchesWithAccent } from './accent.js';
import { graphemesUpTo } from '../data/index.js';

const ctx = { taughtGraphemes: graphemesUpTo(4), taughtTrickyWords: ['the', 'she', 'was'] };

describe('accent tolerance (FR-C.7)', () => {
  it('"wery" for "very" is a correct read, not an error', () => {
    expect(matchesWithAccent('very', 'wery')).toBe(true);
  });

  it('th-stopping is accepted: tree/three, tink/think, dat/that', () => {
    expect(matchesWithAccent('three', 'tree')).toBe(true);
    expect(matchesWithAccent('think', 'tink')).toBe(true);
    expect(matchesWithAccent('that', 'dat')).toBe(true);
  });

  it('unrelated words are not accepted', () => {
    expect(matchesWithAccent('very', 'cat')).toBe(false);
  });

  it('a full accented line classifies as all-correct', () => {
    const r = classifyReading(
      { expectedLine: 'the ship ran on the water', spoken: ['the', 'ship', 'ran', 'on', 'the', 'watar'] },
      ctx
    );
    expect(r.outcomes.every((o) => o.outcome === 'correct')).toBe(true);
    expect(accuracyMisses(r)).toBe(0);
  });
});

describe('classification', () => {
  it('a clean read is all correct', () => {
    const r = classifyReading({ expectedLine: 'the cat sat', spoken: ['the', 'cat', 'sat'] }, ctx);
    expect(r.outcomes.map((o) => o.outcome)).toEqual(['correct', 'correct', 'correct']);
  });

  it('substitution is flagged with the spoken form', () => {
    const r = classifyReading({ expectedLine: 'the cat sat', spoken: ['the', 'dog', 'sat'] }, ctx);
    const cat = r.outcomes[1];
    expect(cat?.outcome).toBe('substitution');
    expect(cat?.spoken).toBe('dog');
  });

  it('a stumble then fix is a self-correction — a POSITIVE signal', () => {
    // She said "dg" then corrected to "dog".
    const r = classifyReading({ expectedLine: 'the dog ran', spoken: ['the', 'dg', 'dog', 'ran'] }, ctx);
    const dog = r.outcomes[1];
    expect(dog?.outcome).toBe('self-correction');
    expect(dog?.spoken).toBe('dog');
    expect(accuracyMisses(r)).toBe(0); // never counted against her
  });

  it('a skipped word is an omission, alignment keeps walking', () => {
    const r = classifyReading({ expectedLine: 'the big ship', spoken: ['the', 'ship'] }, ctx);
    expect(r.outcomes.map((o) => o.outcome)).toEqual(['correct', 'omission', 'correct']);
  });

  it('extra chatter at the end is insertion — recorded, never corrected', () => {
    const r = classifyReading({ expectedLine: 'the cat', spoken: ['the', 'cat', 'meow', 'meow'] }, ctx);
    expect(r.insertions).toEqual(['meow', 'meow']);
    expect(r.outcomes.every((o) => o.outcome === 'correct')).toBe(true);
  });

  it('stopping early marks the remaining words omitted', () => {
    const r = classifyReading({ expectedLine: 'the cat sat down', spoken: ['the', 'cat'] }, ctx);
    expect(r.outcomes.map((o) => o.outcome)).toEqual(['correct', 'correct', 'omission', 'omission']);
  });

  it('hesitation marks fluency without harming accuracy', () => {
    const r = classifyReading(
      { expectedLine: 'the cat sat', spoken: ['the', 'cat', 'sat'], hesitations: [1] },
      ctx
    );
    expect(r.outcomes[1]?.outcome).toBe('hesitation');
    expect(accuracyMisses(r)).toBe(0);
  });

  it('miscues are attributed to graphemes, not whole words (FR-C.5)', () => {
    const r = classifyReading({ expectedLine: 'the ship', spoken: ['the', 'sip'] }, ctx);
    const ship = r.outcomes[1];
    expect(ship?.graphemes).toEqual(['sh', 'i', 'p']);
  });

  it('tricky words log against the word itself', () => {
    const r = classifyReading({ expectedLine: 'the wasp', spoken: ['a', 'wasp'] }, ctx);
    expect(r.outcomes[0]?.graphemes).toEqual(['the']);
  });
});
