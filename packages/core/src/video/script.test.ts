/**
 * Phonics-song script tests.
 *
 * The properties that matter are the ones a parent would notice in a video
 * they forwarded to family: every word decodable by THIS child, the sound
 * spoken as a sound rather than a letter name, and the same input producing
 * the same video.
 */
import { describe, expect, it } from 'vitest';
import { buildPhonicsScript, hasSoundSpelling, scriptTitle, soundSpelling, VIDEO_SCRIPT_VERSION } from './script.js';
import { createLearnerModel } from '../learner/learner-model.js';
import { buildLexicon } from '../pedagogy/lexicon.js';
import { isWordDecodable } from '../pedagogy/decodability.js';
import { graphemesUpTo } from '../data/index.js';
import type { LearnerModel, WorldSeed } from '../types.js';

const seed: WorldSeed = {
  heroName: 'Ayla',
  siblingName: 'Rami',
  petName: 'Meethi',
  petKind: 'cat',
  city: 'Lahore',
  currentChallenge: 'scared of the dark'
};

/**
 * A child taught everything up to `level` — the normal mid-curriculum case.
 *
 * Note what this OVERRIDES: createLearnerModel(level) deliberately leaves
 * taughtGraphemes empty for a new child ("nothing taught before day one"), and
 * this helper fills it in. That convenience hid a real defect for a while —
 * see the "a child on day one" test below, which uses the unmodified model.
 */
function childAt(level: number): LearnerModel {
  const model = createLearnerModel(level);
  return { ...model, taughtGraphemes: graphemesUpTo(level) };
}

function lexiconFor(model: LearnerModel, level: number) {
  return buildLexicon(level, {
    taughtGraphemes: model.taughtGraphemes,
    taughtTrickyWords: model.taughtTrickyWords
  });
}

describe('buildPhonicsScript', () => {
  it('teaches the sound the child most recently learned', () => {
    const model = childAt(2);
    const script = buildPhonicsScript({ model, worldSeed: seed, lexicon: lexiconFor(model, 2) });
    const taught = model.taughtGraphemes;
    expect(script.targetGrapheme).toBe(taught[taught.length - 1]);
  });

  it('shows only words THIS child can decode', () => {
    for (const level of [1, 2, 3, 4]) {
      const model = childAt(level);
      const script = buildPhonicsScript({ model, worldSeed: seed, lexicon: lexiconFor(model, level) });
      const ctx = { taughtGraphemes: model.taughtGraphemes, taughtTrickyWords: model.taughtTrickyWords };
      for (const word of script.words) {
        expect(isWordDecodable(word, ctx), `level ${level}: ${word}`).toBe(true);
      }
    }
  });

  it('every word on screen is one it also warmed art for', () => {
    // The renderer warms `script.words`; a word scene whose word is missing
    // from that list would render an empty picture frame.
    const model = childAt(3);
    const script = buildPhonicsScript({ model, worldSeed: seed, lexicon: lexiconFor(model, 3) });
    for (const scene of script.scenes) {
      if (scene.word === undefined) continue;
      expect(script.words).toContain(scene.word);
    }
  });

  it('introduces each word once — the blend is the one deliberate repeat', () => {
    const model = childAt(4);
    const script = buildPhonicsScript({
      model,
      worldSeed: seed,
      lexicon: lexiconFor(model, 4),
      reviewGraphemes: graphemesUpTo(2)
    });
    // The blend scene re-shows the first word on purpose (sound it out, then
    // put it together), so it is excluded. Every OTHER word scene must be a
    // new word, or the song repeats itself.
    const introduced = script.scenes
      .filter((s) => s.kind === 'word' || s.kind === 'review')
      .flatMap((s) => (s.word === undefined ? [] : [s.word]));
    expect(new Set(introduced).size).toBe(introduced.length);

    const blends = script.scenes.filter((s) => s.kind === 'blend');
    expect(blends).toHaveLength(1);
    expect(blends[0]?.word).toBe(script.scenes.find((s) => s.kind === 'word')?.word);
  });

  it('puts the child, not a generic character, in the video', () => {
    const model = childAt(2);
    const script = buildPhonicsScript({ model, worldSeed: seed, lexicon: lexiconFor(model, 2) });
    expect(script.childName).toBe('Ayla');
    const spoken = script.scenes.map((s) => s.say).join(' ');
    expect(spoken).toContain('Ayla');
    expect(spoken).toContain('Lahore');
  });

  it('is deterministic — the same child gets the same video', () => {
    const model = childAt(3);
    const args = { model, worldSeed: seed, lexicon: lexiconFor(model, 3), reviewGraphemes: ['s', 'a'] };
    expect(buildPhonicsScript(args)).toEqual(buildPhonicsScript(args));
  });

  it('opens, teaches the sound, and closes', () => {
    const model = childAt(2);
    const script = buildPhonicsScript({ model, worldSeed: seed, lexicon: lexiconFor(model, 2) });
    const kinds = script.scenes.map((s) => s.kind);
    expect(kinds[0]).toBe('intro');
    expect(kinds[1]).toBe('sound');
    expect(kinds[kinds.length - 1]).toBe('outro');
    expect(kinds).toContain('word');
  });

  it('drops a review sound rather than singing about nothing', () => {
    // The invariant is that no review scene is ever wordless — not that any
    // particular sound is dropped. 'igh' has no DECODABLE carrier for a
    // level-1 child but does have a picturable one (night), so the fallback
    // now fills that slot; 'zz' has neither, so it still vanishes. A scene
    // with an empty word must never be built either way.
    const model = childAt(1);
    const script = buildPhonicsScript({
      model,
      worldSeed: seed,
      lexicon: lexiconFor(model, 1),
      reviewGraphemes: ['zz', 'igh']
    });
    expect(script.reviewGraphemes).not.toContain('zz');
    const reviews = script.scenes.filter((s) => s.kind === 'review');
    expect(reviews.length).toBe(script.reviewGraphemes.length);
    for (const scene of reviews) {
      expect(scene.word, scene.id).toBeTruthy();
      expect(scene.emoji, scene.id).toBeTruthy();
    }
  });

  it('never asks the voice to read a slash-wrapped grapheme aloud', () => {
    const model = childAt(3);
    const script = buildPhonicsScript({ model, worldSeed: seed, lexicon: lexiconFor(model, 3) });
    for (const scene of script.scenes) {
      expect(scene.say, scene.id).not.toContain('/');
    }
  });

  it('stamps the script version', () => {
    const model = childAt(1);
    const script = buildPhonicsScript({ model, worldSeed: seed, lexicon: lexiconFor(model, 1) });
    expect(script.version).toBe(VIDEO_SCRIPT_VERSION);
  });

  it('gives a child on day one a real song, not three scenes', () => {
    // THE regression this file exists for. A brand-new learner model has an
    // empty taught set by design, so the decodable lexicon compiles to nothing
    // and the song came out as intro + sound + outro: 13 seconds, no words, no
    // blend, no recap. The youngest child — the one this format is most for —
    // got the emptiest video, and every test above passed because childAt()
    // back-fills taughtGraphemes and never exercised the real state.
    const model = createLearnerModel(1);
    expect(model.taughtGraphemes, 'precondition: day one really is empty').toEqual([]);

    const script = buildPhonicsScript({
      model,
      worldSeed: seed,
      lexicon: lexiconFor(model, model.currentLevel)
    });

    const words = script.scenes.filter((s) => s.kind === 'word');
    expect(words.length).toBeGreaterThanOrEqual(2);
    expect(script.scenes.length).toBeGreaterThanOrEqual(6);
    expect(script.scenes.map((s) => s.kind)).toContain('recap');
    // Every word scene still has something to show and something to draw.
    for (const scene of words) {
      expect(scene.word, scene.id).toBeTruthy();
      expect(scene.emoji, scene.id).toBeTruthy();
      expect(scene.art, scene.id).toBeTruthy();
    }
  });

  it('prefers decodable words, and only tops up when it must', () => {
    // Mid-curriculum the differentiator has to hold: these are words she can
    // actually read, not generic picture words. A level-4 child has plenty.
    const model = childAt(4);
    const lexicon = lexiconFor(model, 4);
    const script = buildPhonicsScript({ model, worldSeed: seed, lexicon });
    const ctx = { taughtGraphemes: model.taughtGraphemes, taughtTrickyWords: model.taughtTrickyWords };
    const targetWords = script.scenes.filter((s) => s.kind === 'word').map((s) => s.word ?? '');
    expect(targetWords.length).toBeGreaterThan(0);
    for (const word of targetWords) {
      expect(isWordDecodable(word, ctx), `${word} should be decodable at level 4`).toBe(true);
    }
  });

  it('titles the video by its sound', () => {
    const model = childAt(1);
    const script = buildPhonicsScript({ model, worldSeed: seed, lexicon: lexiconFor(model, 1) });
    expect(scriptTitle(script)).toContain(script.targetGrapheme);
  });
});

describe('soundSpelling', () => {
  it('stretches continuants so the voice says the sound, not the letter', () => {
    expect(soundSpelling('s')).toBe('sss');
    expect(soundSpelling('m')).toBe('mmm');
    expect(soundSpelling('sh')).toBe('shhh');
  });

  it('repeats stops, which cannot be stretched', () => {
    expect(soundSpelling('t')).toBe('t-t-t');
    expect(soundSpelling('p')).toBe('p-p-p');
  });

  it('covers every grapheme in the whole phonics scope', () => {
    // A missing entry falls back to repeating the letters, which for a digraph
    // like 'igh' would have the voice say "ighighigh" to a child. Checked via
    // hasSoundSpelling rather than by comparing strings: for a single letter
    // the fallback and the real entry are the same text, so a string compare
    // silently passes for exactly the graphemes it should be guarding.
    const missing = graphemesUpTo(8).filter((g) => !hasSoundSpelling(g));
    expect(missing).toEqual([]);
  });
});
