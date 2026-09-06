/**
 * Pictogram tests.
 *
 * The regression these guard is severe and was shipped: the offline renderer
 * drew one fixed arrangement of shapes for every prompt, so an apple, a cat and
 * a bus were pixel-identical. A picture that shows nothing does not just look
 * broken, it defeats the reason the picture is there — the child is meant to
 * map the decodable word onto its referent.
 */
import { describe, expect, it } from 'vitest';
import { PICTOGRAMS, hasPictogram, paletteFor, pictogramFor } from './pictogram.js';
import { picturableWords } from './lesson.js';

/** The real house style the server appends to every image prompt. */
const ART_DIRECTION =
  "children's picture-book illustration for ages 4 to 7, bright saturated colors with soft warm lighting, " +
  'rounded friendly shapes, cartoon style, characters with big expressive eyes and warm smiles, ' +
  'playful whimsical details, cozy safe happy mood, clean uncluttered composition showing one clear moment, ' +
  'flat vector storybook art, no words, no letters, no numbers, no text of any kind in the image';

describe('pictogramFor', () => {
  it('resolves an exact curriculum word', () => {
    expect(pictogramFor('apple').glyph).toBe('🍎');
    expect(pictogramFor('bus').word).toBe('bus');
    expect(pictogramFor('  Frog  ').glyph).toBe('🐸');
  });

  it('takes the subject from the caller’s sentence, not the appended style block', () => {
    // This is the exact shape of a real request. Matching from the END would
    // land on "warm" (or "small"/"picture") inside ART_DIRECTION and give every
    // image in the app the same glyph.
    const hint = `one clear idea a small child can point at: apple — a warm, friendly picture-book scene. ${ART_DIRECTION}`;
    expect(pictogramFor(hint).word).not.toBe('warm');
    expect(pictogramFor(hint).word).not.toBe('picture');
  });

  it('gives visibly different pictures to different subjects', () => {
    const subjects = ['apple', 'cat', 'bus', 'milk', 'star', 'house', 'duck', 'frog'];
    const glyphs = new Set(subjects.map((s) => pictogramFor(s).glyph));
    expect(glyphs.size, 'every subject must draw its own thing').toBe(subjects.length);
  });

  it('still differentiates words it has no pictogram for', () => {
    // The fallback must not collapse to one default, or unmapped words are back
    // to being indistinguishable from each other.
    const unmapped = ['brisk', 'mend', 'quiz', 'fuss', 'trim', 'buff'];
    for (const word of unmapped) expect(hasPictogram(word)).toBe(false);
    const rendered = new Set(unmapped.map((w) => pictogramFor(w).glyph + paletteFor(w).sky));
    expect(rendered.size).toBeGreaterThan(1);
  });

  it('is deterministic — the art cache and the offline path depend on it', () => {
    for (const input of ['apple', 'a frog by the pond', 'brisk']) {
      expect(pictogramFor(input)).toEqual(pictogramFor(input));
    }
  });

  it('never returns an empty glyph', () => {
    for (const input of ['', '   ', '12345', 'zzzz', 'apple']) {
      expect(pictogramFor(input).glyph.length).toBeGreaterThan(0);
    }
  });
});

describe('pictogram coverage', () => {
  it('only maps words some route can actually request', () => {
    // Two vocabularies reach the art routes: the phonics scope, and the First
    // Words catalog's twelve picture cards (server/src/early/catalog.ts —
    // mirrored here because core cannot import the server). A key in neither is
    // dead weight nothing can request, and is usually a typo.
    const firstWords = [
      'apple', 'ball', 'banana', 'bird', 'bread', 'bus',
      'car', 'cat', 'cow', 'dog', 'milk', 'sun'
    ];
    const reachable = new Set([...picturableWords(), ...firstWords]);
    const strays = Object.keys(PICTOGRAMS).filter((w) => !reachable.has(w));
    expect(strays, `unreachable pictogram keys: ${strays.join(', ')}`).toEqual([]);
  });

  it('covers every First Words picture card', () => {
    // These twelve are the entire 1–2 track. A missing one is a card with no
    // picture, which is the whole lesson for that age.
    for (const word of ['apple', 'ball', 'banana', 'bird', 'bread', 'bus', 'car', 'cat', 'cow', 'dog', 'milk', 'sun']) {
      expect(hasPictogram(word), `First Words card "${word}" has no pictogram`).toBe(true);
    }
  });

  it('covers most of the curriculum', () => {
    const curriculum = [...picturableWords()];
    const covered = curriculum.filter(hasPictogram);
    // Not 100%: adjectives and glue verbs genuinely have no single picture.
    expect(covered.length / curriculum.length).toBeGreaterThan(0.5);
  });
});
