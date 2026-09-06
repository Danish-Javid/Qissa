/**
 * The legal lexicon and the feasibility report.
 *
 * These exist because of a measured failure: handed only GRAPHEMES, a frontier
 * model returned read-along pages saying "Ayla s." and "Meethi s." — it had to
 * derive the vocabulary before it could write, and did neither well. The
 * lexicon gives it words; the feasibility report stops us asking for words
 * that do not exist.
 */
import { describe, expect, it } from 'vitest';
import { assessFeasibility, buildLexicon, carriersFor } from './lexicon.js';
import { isWordDecodable } from './decodability.js';
import { graphemesUpTo, trickyWordsUpTo } from '../data/index.js';

function ctx(level: number, extraNames: string[] = []) {
  return {
    taughtGraphemes: graphemesUpTo(level),
    taughtTrickyWords: [...trickyWordsUpTo(level), ...extraNames]
  };
}

describe('buildLexicon', () => {
  it('offers real words a beginner can actually read', () => {
    const lexicon = buildLexicon(1, ctx(1));
    expect(lexicon.all.length).toBeGreaterThan(5);
    // Level 1 is s a t p i n — these are spellable, and nothing else should be.
    expect(lexicon.all).toContain('sit');
    expect(lexicon.all).toContain('pin');
  });

  it('never offers a word the gate would reject', () => {
    for (const level of [1, 3, 5, 8]) {
      const c = ctx(level);
      const lexicon = buildLexicon(level, c);
      for (const word of lexicon.all) {
        expect(isWordDecodable(word, c), `level ${level} offered "${word}"`).toBe(true);
      }
    }
  });

  it('grows with the level', () => {
    expect(buildLexicon(4, ctx(4)).all.length).toBeGreaterThan(buildLexicon(1, ctx(1)).all.length);
  });

  it('includes words taught as wholes, which bypass the parser by definition', () => {
    const lexicon = buildLexicon(2, ctx(2));
    expect(lexicon.wholeWords).toContain('the');
  });

  it('groups by sentence role so a prompt can build a sentence', () => {
    const lexicon = buildLexicon(3, ctx(3));
    expect(lexicon.nouns.length).toBeGreaterThan(0);
    expect(lexicon.verbs.length).toBeGreaterThan(0);
  });
});

describe('assessFeasibility', () => {
  it('reports the brief as achievable when carriers exist', () => {
    const lexicon = buildLexicon(2, ctx(2));
    const report = assessFeasibility('s', ['t'], lexicon);
    expect(report.ok).toBe(true);
    expect(report.impossibleReviews).toEqual([]);
    expect(report.targetCarriers).toBeGreaterThan(0);
  });

  it('drops a review unit with no legal carrier instead of demanding it', () => {
    // "sh" is a level-4 digraph: at level 1 no legal word contains it, so a
    // story satisfying it cannot exist and asking guarantees a wasted call.
    const lexicon = buildLexicon(1, ctx(1));
    const report = assessFeasibility('s', ['sh'], lexicon);
    expect(report.ok).toBe(false);
    expect(report.impossibleReviews).toContain('sh');
    expect(report.achievableReviews).not.toContain('sh');
    expect(report.summary).toContain('sh');
  });

  it('keeps the achievable half of a mixed brief', () => {
    const lexicon = buildLexicon(1, ctx(1));
    const report = assessFeasibility('s', ['t', 'sh'], lexicon);
    expect(report.achievableReviews).toEqual(['t']);
    expect(report.impossibleReviews).toEqual(['sh']);
  });
});

describe('carriersFor', () => {
  it('finds only words containing the grapheme', () => {
    const lexicon = buildLexicon(2, ctx(2));
    for (const word of carriersFor('s', lexicon)) expect(word).toContain('s');
  });
});
