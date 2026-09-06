/**
 * Lesson-plan tests — the contract for WHAT a standalone "Learn to Read"
 * lesson teaches. These encode the "Toddlers Can Read" pedagogy the player
 * relies on: the next NEW sounds, real words to blend with them, and the next
 * sight words — adaptive to mastery, fail-closed on decodability, never empty.
 *
 * The assertions favour INVARIANTS (every blend word decodes; nothing already
 * taught is re-taught) over exact word picks, so they stay true no matter how
 * the curriculum word banks grow — exactly like the decodability suite.
 */
import { describe, expect, it } from 'vitest';
import { graphemesUpTo, phonicsScope, trickyWordsUpTo } from '../data/index.js';
import { createLearnerModel } from '../learner/learner-model.js';
import type { LearnerModel, WorldSeed } from '../types.js';
import { isWordDecodable } from './decodability.js';
import { segmentationOf } from './graphemes.js';
import { buildLessonPlan, applyLessonOutcomes, isPicturableWord, LESSON_BLEND_WORDS, LESSON_NEW_SOUNDS, LESSON_SIGHT_WORDS } from './lesson.js';

const SEED: WorldSeed = { heroName: 'Ayla', city: 'Lahore', petName: 'Simi', petKind: 'cat' };

const ALL = graphemesUpTo(phonicsScope.levels.length);

/** A model with an explicit taught set; everything else defaults to fresh. */
function modelWith(taughtGraphemes: string[], currentLevel = 1, taughtTrickyWords: string[] = []): LearnerModel {
  return { ...createLearnerModel(1), taughtGraphemes, currentLevel, taughtTrickyWords };
}

describe('buildLessonPlan', () => {
  it('teaches a brand-new child the first three sounds, each anchored to a decodable word', () => {
    const plan = buildLessonPlan(createLearnerModel(1), SEED);
    expect(plan.isReview).toBe(false);
    expect(plan.newSounds.map((s) => s.grapheme)).toEqual(['s', 'a', 't']);
    expect(plan.taughtGraphemes).toEqual(['s', 'a', 't']);
    for (const sound of plan.newSounds) {
      expect(sound.soundCue).toBe(`/${sound.grapheme}/`); // the sound, not the letter name
      expect(sound.exampleSegments).toEqual(segmentationOf(sound.exampleWord, plan.taughtGraphemes));
    }
  });

  it('anchors each new sound to a distinct carrier word where the vocabulary allows', () => {
    // The opening set s-a-t unlocks exactly three decodable words (sat, as, at),
    // so each sound should get its own carrier — never "sat … sat … sat".
    const plan = buildLessonPlan(createLearnerModel(1), SEED);
    const examples = plan.newSounds.map((s) => s.exampleWord);
    expect(examples.length).toBeGreaterThan(1);
    expect(new Set(examples).size).toBe(examples.length);
  });

  it('is adaptive: never re-teaches a sound the child already knows', () => {
    const taught = graphemesUpTo(2); // levels 1–2 sounds are done
    const plan = buildLessonPlan(modelWith(taught, 2), SEED);
    expect(plan.isReview).toBe(false);
    expect(plan.newSounds.length).toBeGreaterThan(0);
    for (const sound of plan.newSounds) {
      expect(taught).not.toContain(sound.grapheme); // nothing already taught
      expect(ALL.filter((g) => !taught.includes(g))).toContain(sound.grapheme); // only genuinely new
    }
  });

  it('is fail-closed: every blend word decodes with the post-lesson sound set', () => {
    const plan = buildLessonPlan(createLearnerModel(1), SEED);
    expect(plan.blendWords.length).toBeGreaterThan(0);
    for (const blend of plan.blendWords) {
      expect(isWordDecodable(blend.word, { taughtGraphemes: plan.taughtGraphemes, taughtTrickyWords: [] })).toBe(true);
      expect(blend.segments).toEqual(segmentationOf(blend.word, plan.taughtGraphemes));
    }
  });

  it('only blends words that actually use a sound from this lesson', () => {
    const plan = buildLessonPlan(createLearnerModel(1), SEED);
    const focus = new Set(plan.newSounds.map((s) => s.grapheme));
    for (const blend of plan.blendWords) {
      expect(blend.graphemes.some((g) => focus.has(g))).toBe(true);
    }
  });

  it('never repeats a blend word', () => {
    const plan = buildLessonPlan(modelWith(graphemesUpTo(1), 1), SEED);
    const words = plan.blendWords.map((b) => b.word);
    expect(new Set(words).size).toBe(words.length);
  });

  it('keeps tricky words out of the blend pool — sight words are never sounded out', () => {
    const tricky = new Set(trickyWordsUpTo(phonicsScope.levels.length));
    const plan = buildLessonPlan(modelWith(graphemesUpTo(2), 2, trickyWordsUpTo(2)), SEED);
    expect(plan.blendWords.length).toBeGreaterThan(0);
    for (const blend of plan.blendWords) {
      expect(tricky.has(blend.word.toLowerCase())).toBe(false);
    }
  });

  it('adds the next sight words, in scope order, preserving case', () => {
    const plan = buildLessonPlan(createLearnerModel(1), SEED);
    // Level 1 has no tricky words; level 2's first two are "the" and "I".
    expect(plan.sightWords.map((s) => s.word)).toEqual(['the', 'I']);
  });

  it('skips sight words the child already knows', () => {
    const plan = buildLessonPlan(modelWith(graphemesUpTo(1), 2, ['the', 'i']), SEED);
    const words = plan.sightWords.map((s) => s.word.toLowerCase());
    expect(words).not.toContain('the');
    expect(words).not.toContain('i');
  });

  it('keeps a lesson small: the default caps hold', () => {
    const plan = buildLessonPlan(modelWith(graphemesUpTo(3), 3), SEED);
    expect(plan.newSounds.length).toBeLessThanOrEqual(LESSON_NEW_SOUNDS);
    expect(plan.blendWords.length).toBeLessThanOrEqual(LESSON_BLEND_WORDS);
    expect(plan.sightWords.length).toBeLessThanOrEqual(LESSON_SIGHT_WORDS);
  });

  it('honours custom counts as caps', () => {
    const plan = buildLessonPlan(modelWith(graphemesUpTo(1), 2), SEED, { newSounds: 2, blendWords: 3, sightWords: 1 });
    expect(plan.newSounds.length).toBeLessThanOrEqual(2);
    expect(plan.blendWords.length).toBeLessThanOrEqual(3);
    expect(plan.sightWords).toHaveLength(1);
  });

  it('falls back to a review lesson (never empty) once every sound is mastered', () => {
    const plan = buildLessonPlan(
      modelWith(ALL, phonicsScope.levels.length, trickyWordsUpTo(phonicsScope.levels.length)),
      SEED
    );
    expect(plan.isReview).toBe(true);
    for (const sound of plan.newSounds) expect(ALL).toContain(sound.grapheme); // reuses known sounds
    expect(plan.blendWords.length).toBeGreaterThan(0); // still has fluency work
    expect(plan.sightWords).toEqual([]); // nothing new left to teach
  });

  it('carries the child name and level for the player', () => {
    const plan = buildLessonPlan(modelWith(graphemesUpTo(1), 1), SEED);
    expect(plan.childName).toBe('Ayla');
    expect(plan.level).toBe(1);
  });
});

describe('applyLessonOutcomes', () => {
  /** Every word this lesson asks the child to produce, read correctly. */
  function allCorrect(plan: ReturnType<typeof buildLessonPlan>) {
    return [
      ...plan.newSounds.map((sound) => ({ word: sound.exampleWord, correct: true })),
      ...plan.blendWords.map((blend) => ({ word: blend.word, correct: true })),
      ...plan.sightWords.map((sight) => ({ word: sight.word, correct: true }))
    ];
  }

  it('teaches NOTHING when the child did nothing', () => {
    // The regression this whole change exists for: a lesson could be opened,
    // skipped, and credited, because serving it advanced the boundary.
    const model = createLearnerModel(1);
    const plan = buildLessonPlan(model, SEED);
    const updated = applyLessonOutcomes(model, plan, []);

    expect(updated.taughtGraphemes).toEqual(model.taughtGraphemes);
    expect(updated.taughtTrickyWords).toEqual(model.taughtTrickyWords);
    expect(updated.currentLevel).toBe(model.currentLevel);
  });

  it('teaches the sounds the child actually demonstrated', () => {
    const model = createLearnerModel(1);
    const plan = buildLessonPlan(model, SEED);
    const updated = applyLessonOutcomes(model, plan, allCorrect(plan));

    for (const g of plan.taughtGraphemes) expect(updated.taughtGraphemes).toContain(g);
    expect(updated.taughtGraphemes.length).toBe(plan.taughtGraphemes.length);
  });

  it('does not credit a sound the child only repeated after a model', () => {
    // Repeating a word seconds after hearing it is not decoding it.
    const model = createLearnerModel(1);
    const plan = buildLessonPlan(model, SEED);
    const assisted = allCorrect(plan).map((o) => ({ ...o, assisted: true }));
    const updated = applyLessonOutcomes(model, plan, assisted);

    expect(updated.taughtGraphemes).toEqual(model.taughtGraphemes);
  });

  it('credits a sight word only when the child said it', () => {
    const model = createLearnerModel(1);
    const plan = buildLessonPlan(model, SEED);
    expect(plan.sightWords.length).toBeGreaterThan(0);

    const missed = applyLessonOutcomes(
      model,
      plan,
      plan.sightWords.map((sight) => ({ word: sight.word, correct: false }))
    );
    for (const sight of plan.sightWords) {
      expect(missed.taughtTrickyWords).not.toContain(sight.word.toLowerCase());
    }

    const said = applyLessonOutcomes(model, plan, allCorrect(plan));
    for (const sight of plan.sightWords) {
      expect(said.taughtTrickyWords).toContain(sight.word.toLowerCase());
    }
  });

  it('records misses as evidence rather than discarding them', () => {
    const model = createLearnerModel(1);
    const plan = buildLessonPlan(model, SEED);
    const word = plan.blendWords[0]!.word;
    const updated = applyLessonOutcomes(model, plan, [{ word, correct: false }]);

    // The grapheme now has evidence against it, which is what drives reteach
    // and spaced repetition — a wrong answer must not simply vanish.
    const grapheme = plan.blendWords[0]!.graphemes[0]!;
    const stat = updated.graphemeStats[grapheme];
    expect(stat?.exposures ?? 0).toBeGreaterThan(0);
    expect(stat?.correct ?? 0).toBe(0);
  });

  it('stops at the first sound with no evidence rather than skipping past it', () => {
    const model = createLearnerModel(1);
    const plan = buildLessonPlan(model, SEED);
    expect(plan.newSounds.length).toBeGreaterThan(1);

    // Only the LAST sound demonstrated: the curriculum is ordered, so nothing
    // may be introduced over the top of a sound with no evidence.
    const last = plan.newSounds.at(-1)!;
    const updated = applyLessonOutcomes(model, plan, [{ word: last.exampleWord, correct: true }]);
    expect(updated.taughtGraphemes.length).toBe(model.taughtGraphemes.length);
  });

  it('credits nothing new on a review lesson — fluency never promotes a reader', () => {
    const model = modelWith(ALL, phonicsScope.levels.length, trickyWordsUpTo(phonicsScope.levels.length));
    const plan = buildLessonPlan(model, SEED);
    expect(plan.isReview).toBe(true);
    const updated = applyLessonOutcomes(model, plan, allCorrect(plan));
    expect(updated.taughtGraphemes).toEqual(model.taughtGraphemes);
  });

  it('never drops what the child already knew', () => {
    const model = modelWith(graphemesUpTo(2), 2);
    const plan = buildLessonPlan(model, SEED);
    const updated = applyLessonOutcomes(model, plan, allCorrect(plan));
    for (const g of model.taughtGraphemes) expect(updated.taughtGraphemes).toContain(g);
    for (const w of model.taughtTrickyWords) expect(updated.taughtTrickyWords).toContain(w);
  });
});

describe('isPicturableWord', () => {
  it('treats concrete curriculum words as drawable', () => {
    for (const w of ['sat', 'fern', 'pin', 'tap', 'cat']) expect(isPicturableWord(w)).toBe(true);
  });

  it('keeps glue and sight words text-only — there is no picture for "at" or "the"', () => {
    for (const w of ['at', 'as', 'in', 'on', 'the', 'I', 'see']) expect(isPicturableWord(w)).toBe(false);
  });
});
