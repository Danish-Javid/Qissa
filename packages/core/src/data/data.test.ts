/**
 * Data-spine integrity tests.
 *
 * The phonics scope, word banks and cached stories are hand-edited JSON.
 * These tests re-validate that data against the engines on every run, so a
 * curriculum edit that smuggles in an undecodable word fails the build
 * instead of failing a five-year-old.
 */
import { describe, expect, it } from 'vitest';
import {
  cachedStories,
  graphemesUpTo,
  phonicsScope,
  themeCurriculum,
  tokenize,
  trickyWordsUpTo,
  validateText,
  wordBanks
} from './index.js';
import { parseGraphemes } from '../pedagogy/graphemes.js';

/** Substitute world-seed tokens the way the server does at serve time.
 *  The stand-in names are themselves decodable at level 2+. */
function substituteWorldSeed(text: string): string {
  return text
    .replaceAll('{{hero}}', 'Tam')
    .replaceAll('{{sibling}}', 'Rami')
    .replaceAll('{{pet}}', 'Mitu')
    .replaceAll('{{city}}', 'Lahore');
}

describe('phonics scope-and-sequence', () => {
  it('has eight levels in ascending order', () => {
    expect(phonicsScope.levels).toHaveLength(8);
    phonicsScope.levels.forEach((l, i) => expect(l.level).toBe(i + 1));
  });

  it('every example word decodes with graphemes taught up to its level', () => {
    for (const level of phonicsScope.levels) {
      const taught = graphemesUpTo(level.level);
      for (const example of level.examples) {
        expect(parseGraphemes(example, taught), `level ${level.level} example "${example}"`).not.toBeNull();
      }
    }
  });

  it('graphemes are unique across the whole sequence', () => {
    const all = graphemesUpTo(8);
    expect(new Set(all).size).toBe(all.length);
  });
});

describe('word banks', () => {
  it('every bank word decodes at its level', () => {
    for (const [levelKey, bank] of Object.entries(wordBanks)) {
      const taught = graphemesUpTo(Number(levelKey));
      const tricky = trickyWordsUpTo(Number(levelKey));
      const words = [
        ...bank.nouns,
        ...bank.verbs,
        ...bank.names,
        ...bank.settings,
        ...bank.adjectives,
        ...bank.sentenceBits
      ];
      for (const word of words) {
        const ok = tricky.includes(word.toLowerCase()) || parseGraphemes(word, taught) !== null;
        expect(ok, `level ${levelKey} bank word "${word}"`).toBe(true);
      }
    }
  });
});

describe('theme curriculum', () => {
  it('has twelve weeks with unique themes', () => {
    expect(themeCurriculum).toHaveLength(12);
    const themes = themeCurriculum.map((w) => w.theme);
    expect(new Set(themes).size).toBe(12);
  });
});

describe('cached stories (offline fallback corpus)', () => {
  it('every page and every choice surface is decodable at the story level', () => {
    for (const story of cachedStories) {
      const taught = graphemesUpTo(story.level);
      const tricky = trickyWordsUpTo(story.level);
      const ctx = { taughtGraphemes: taught, taughtTrickyWords: tricky };

      const surfaces = [
        ...story.pages.map((p) => p.text),
        story.choice.prompt,
        ...story.choice.options,
        story.choice.consequenceForFirst,
        story.choice.consequenceForSecond
      ];

      for (const surface of surfaces) {
        const result = validateText(substituteWorldSeed(surface), ctx);
        expect(
          result.violations,
          `"${story.title}" level ${story.level}: "${surface}" -> violations: ${result.violations.map((v) => v.word).join(', ')}`
        ).toEqual([]);
      }
    }
  });

  it('every cached story has exactly one two-option choice', () => {
    for (const story of cachedStories) {
      expect(story.choice.options).toHaveLength(2);
    }
  });

  it('tokenize treats world-seed braces and punctuation as separators', () => {
    expect(tokenize("{{hero}} ran to the hut.")).toEqual(['hero', 'ran', 'to', 'the', 'hut']);
  });
});
