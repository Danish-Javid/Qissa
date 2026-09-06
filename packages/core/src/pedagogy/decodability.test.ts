/**
 * Decodability validator tests — hand-built pass/fail word lists per level.
 * Doc 6 §2.3 calls the validator "one of the most important pieces of code
 * in the system"; it gates every generated story, so it is tested hard.
 */
import { describe, expect, it } from 'vitest';
import { isWordDecodable, tokenize, validateText } from './decodability.js';
import { parseGraphemes, firstGraphemeOf, segmentationOf } from './graphemes.js';
import { graphemesUpTo, trickyWordsUpTo } from '../data/index.js';

function ctx(level: number) {
  return { taughtGraphemes: graphemesUpTo(level), taughtTrickyWords: trickyWordsUpTo(level) };
}

describe('parseGraphemes', () => {
  const l4 = graphemesUpTo(4);

  it('parses singletons', () => {
    expect(parseGraphemes('cat', graphemesUpTo(2))).toEqual(['c', 'a', 't']);
  });

  it('prefers the longest grapheme (ship -> sh,i,p not s,h,i,p)', () => {
    expect(parseGraphemes('ship', l4)).toEqual(['sh', 'i', 'p']);
  });

  it('backtracks to resolve ck (duck -> d,u,ck)', () => {
    expect(parseGraphemes('duck', graphemesUpTo(2))).toEqual(['d', 'u', 'ck']);
  });

  it('parses trigraphs (night -> n,igh,t at level 5)', () => {
    expect(parseGraphemes('night', graphemesUpTo(5))).toEqual(['n', 'igh', 't']);
  });

  it('parses silent-letter digraphs (knot -> kn,o,t at level 8)', () => {
    expect(parseGraphemes('knot', graphemesUpTo(8))).toEqual(['kn', 'o', 't']);
  });

  it('returns null for an undecodable word', () => {
    // "flag" needs f+l: f arrives at level 3, so level 2 cannot read it.
    expect(parseGraphemes('flag', graphemesUpTo(2))).toBeNull();
  });
});

describe('isWordDecodable', () => {
  it('accepts taught tricky words that cannot be parsed', () => {
    // "the" needs `th` (level 4) but is taught as a whole word at level 2.
    expect(isWordDecodable('the', ctx(2))).toBe(true);
  });

  it('rejects words whose graphemes are not taught yet', () => {
    expect(isWordDecodable('ship', ctx(3))).toBe(false);
    expect(isWordDecodable('ship', ctx(4))).toBe(true);
  });

  it('is case-insensitive', () => {
    expect(isWordDecodable('THE', ctx(2))).toBe(true);
  });
});

describe('validateText', () => {
  it('passes a fully decodable line', () => {
    const result = validateText('The cat sat on the mat.', {
      taughtGraphemes: [...graphemesUpTo(2), 'm'],
      taughtTrickyWords: trickyWordsUpTo(2)
    });
    expect(result.valid).toBe(true);
    expect(result.violations).toEqual([]);
  });

  it('reports every violating word with its position', () => {
    const result = validateText('The ship sank.', ctx(3));
    expect(result.valid).toBe(false);
    // "ship" and "sank" both need digraphs not taught until level 4.
    expect(result.violations.map((v) => v.word)).toEqual(['ship', 'sank']);
  });

  it('never lets punctuation hide a violation', () => {
    // An apostrophe must split, not merge: "dont" is not decodable at 3.
    expect(validateText("don't", ctx(3)).violations.map((v) => v.word)).toContain('dont');
  });
});

describe('tokenize', () => {
  it('lowercases and strips punctuation', () => {
    expect(tokenize('Run, Ayla! Run.')).toEqual(['run', 'ayla', 'run']);
  });

  it('drops empty tokens', () => {
    expect(tokenize('  ...!  ')).toEqual([]);
  });
});

describe('ladder helpers', () => {
  it('firstGraphemeOf returns the taught first unit', () => {
    expect(firstGraphemeOf('bank', graphemesUpTo(4))).toBe('b');
    expect(firstGraphemeOf('ship', graphemesUpTo(4))).toBe('sh');
  });

  it('segmentationOf produces phoneme-style units', () => {
    // `nk` is two phonemes (/n/ then /k/), so it splits like a blend.
    expect(segmentationOf('bank', graphemesUpTo(4))).toEqual(['/b/', '/a/', '/n/', '/k/']);
    expect(segmentationOf('sink', graphemesUpTo(4))).toEqual(['/s/', '/i/', '/n/', '/k/']);
    // True digraphs are one sound and stay whole.
    expect(segmentationOf('ship', graphemesUpTo(4))).toEqual(['/sh/', '/i/', '/p/']);
  });
});

describe('split digraphs (magic e) are never decodable', () => {
  // Regression: the parser matched letter SEQUENCES, not sound-spelling
  // correspondences, so "make" passed at level 3 as m-a-k-e. Split digraphs
  // (a_e, i_e, o_e, u_e) appear at NO level of the scope, so these words can
  // never be legitimately decodable -- at any level, for any child.
  const splitDigraphWords = ['make', 'like', 'hope', 'cute', 'time', 'bone', 'cake', 'ride'];

  for (const level of [3, 6, 8]) {
    it(`rejects them at level ${level}`, () => {
      for (const word of splitDigraphWords) {
        expect(isWordDecodable(word, ctx(level)), `"${word}" must not be decodable at level ${level}`).toBe(false);
      }
    });
  }

  it('still accepts words where a final e belongs to a taught vowel grapheme', () => {
    // The guard is per-candidate, so backtracking finds the longer grapheme:
    // see -> s + ee, toe -> t + oe, cue -> c + ue, cure -> c + ure.
    expect(parseGraphemes('see', graphemesUpTo(5))).toEqual(['s', 'ee']);
    expect(parseGraphemes('toe', graphemesUpTo(6))).toEqual(['t', 'oe']);
    expect(parseGraphemes('cue', graphemesUpTo(6))).toEqual(['c', 'ue']);
    expect(parseGraphemes('cure', graphemesUpTo(6))).toEqual(['c', 'ure']);
  });

  it('leaves two-letter words alone — the e is the vowel, not a magic e', () => {
    // "me"/"be"/"he" are taught as tricky words, but the parser must not
    // reject them on the silent-e rule either.
    expect(parseGraphemes('me', graphemesUpTo(2))).toEqual(['m', 'e']);
  });

  it('keeps tricky words readable regardless of their spelling', () => {
    expect(isWordDecodable('the', ctx(2))).toBe(true);
    expect(isWordDecodable('there', ctx(6))).toBe(true);
  });
});
