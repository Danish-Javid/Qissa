/**
 * Mode-model test cases — the contract for the three doors.
 *
 * These encode exactly how age → mode routing and the parental controls must
 * behave, so a future change that shifts an age band or drops the common
 * Story Time door fails here first:
 *   · First Words owns 1–2; Learn to Read owns 3–6 (and gracefully beyond).
 *   · Story Time is the COMMON door — present for every age ≥ 1.
 *   · A parent override beats the age default; disabling Story Time hides it.
 */
import { describe, expect, it } from 'vitest';
import {
  defaultChildSettings,
  learningTrackForAge,
  modeDescription,
  modeLabel,
  parseChildSettings,
  resolveLearningTrack,
  resolveModes,
  resolveStoryPacing,
  resolveStoryTimeEnabled,
  storyTimeAvailable
} from './modes.js';

describe('learningTrackForAge', () => {
  it('gives 1–2 year olds First Words', () => {
    expect(learningTrackForAge(1)).toBe('first-words');
    expect(learningTrackForAge(2)).toBe('first-words');
  });

  it('gives 3–6 year olds Learn to Read', () => {
    for (const age of [3, 4, 5, 6]) expect(learningTrackForAge(age)).toBe('learn-to-read');
  });

  it('keeps an out-of-band older child in Learn to Read (never locks anyone out)', () => {
    expect(learningTrackForAge(7)).toBe('learn-to-read');
    expect(learningTrackForAge(9)).toBe('learn-to-read');
  });
});

describe('storyTimeAvailable', () => {
  it('is the common door from age 1 through 6', () => {
    for (const age of [1, 2, 3, 4, 5, 6]) expect(storyTimeAvailable(age)).toBe(true);
  });

  it('is not offered below age 1', () => {
    expect(storyTimeAvailable(0)).toBe(false);
  });
});

describe('resolveLearningTrack', () => {
  it('falls back to the age default with no settings', () => {
    expect(resolveLearningTrack(2, null)).toBe('first-words');
    expect(resolveLearningTrack(4)).toBe('learn-to-read');
  });

  it('lets a parent move a 2-year-old UP to Learn to Read', () => {
    expect(resolveLearningTrack(2, { learningTrack: 'learn-to-read' })).toBe('learn-to-read');
  });

  it('lets a parent keep a 6-year-old in First Words', () => {
    expect(resolveLearningTrack(6, { learningTrack: 'first-words' })).toBe('first-words');
  });

  it('ignores a null override and uses age', () => {
    expect(resolveLearningTrack(5, { learningTrack: null })).toBe('learn-to-read');
  });
});

describe('resolveStoryPacing', () => {
  it('defaults to fluent', () => {
    expect(resolveStoryPacing(null)).toBe('fluent');
    expect(resolveStoryPacing({})).toBe('fluent');
  });

  it('honours an explicit slow pace', () => {
    expect(resolveStoryPacing({ storyPacing: 'slow' })).toBe('slow');
  });
});

describe('resolveStoryTimeEnabled', () => {
  it('is on by default for every age ≥ 1', () => {
    expect(resolveStoryTimeEnabled(1)).toBe(true);
    expect(resolveStoryTimeEnabled(6, {})).toBe(true);
  });

  it('can be turned off by the parent', () => {
    expect(resolveStoryTimeEnabled(4, { storyTimeEnabled: false })).toBe(false);
  });

  it('stays off below age 1 even if enabled', () => {
    expect(resolveStoryTimeEnabled(0, { storyTimeEnabled: true })).toBe(false);
  });
});

describe('resolveModes', () => {
  it('shows First Words + Story Time for a 1–2 year old', () => {
    expect(resolveModes(1)).toEqual(['first-words', 'story-time']);
    expect(resolveModes(2)).toEqual(['first-words', 'story-time']);
  });

  it('shows Learn to Read + Story Time for a 3–6 year old', () => {
    expect(resolveModes(3)).toEqual(['learn-to-read', 'story-time']);
    expect(resolveModes(6)).toEqual(['learn-to-read', 'story-time']);
  });

  it('drops Story Time when the parent disables it', () => {
    expect(resolveModes(4, { storyTimeEnabled: false })).toEqual(['learn-to-read']);
  });

  it('reflects a parent track override in the door list', () => {
    expect(resolveModes(2, { learningTrack: 'learn-to-read' })).toEqual(['learn-to-read', 'story-time']);
  });

  it('always lists the learning door before the common Story Time door', () => {
    const modes = resolveModes(5);
    expect(modes[0]).not.toBe('story-time');
    expect(modes[modes.length - 1]).toBe('story-time');
  });
});

describe('defaultChildSettings', () => {
  it('is the no-override, fluent, story-time-on baseline', () => {
    expect(defaultChildSettings()).toEqual({ learningTrack: null, storyPacing: 'fluent', storyTimeEnabled: true });
  });
});

describe('parseChildSettings', () => {
  it('reads back a fully-populated settings object', () => {
    expect(
      parseChildSettings({ learningTrack: 'learn-to-read', storyPacing: 'slow', storyTimeEnabled: false, sessionCapMinutes: 15 })
    ).toEqual({ learningTrack: 'learn-to-read', storyPacing: 'slow', storyTimeEnabled: false, sessionCapMinutes: 15 });
  });

  it('treats null / non-object / array input as empty settings', () => {
    expect(parseChildSettings(null)).toEqual({});
    expect(parseChildSettings(undefined)).toEqual({});
    expect(parseChildSettings('nope')).toEqual({});
    expect(parseChildSettings(42)).toEqual({});
    expect(parseChildSettings([])).toEqual({});
  });

  it('drops unknown fields so a newer writer stays forward-compatible', () => {
    expect(parseChildSettings({ storyPacing: 'slow', futureFlag: true, nested: { a: 1 } })).toEqual({ storyPacing: 'slow' });
  });

  it('ignores wrong-typed or out-of-domain values instead of trusting them', () => {
    expect(parseChildSettings({ learningTrack: 'nonsense', storyTimeEnabled: 'yes', sessionCapMinutes: 'ten' })).toEqual({});
    expect(parseChildSettings({ storyPacing: 'turbo' })).toEqual({});
  });

  it('round-trips: parsed settings feed the resolvers as the age default when empty', () => {
    expect(resolveLearningTrack(2, parseChildSettings(null))).toBe('first-words');
    expect(resolveStoryTimeEnabled(4, parseChildSettings({ storyTimeEnabled: false }))).toBe(false);
  });
});

describe('mode copy', () => {
  it('labels every mode', () => {
    expect(modeLabel('first-words')).toBe('First Words');
    expect(modeLabel('learn-to-read')).toBe('Learn to Read');
    expect(modeLabel('story-time')).toBe('Story Time');
  });

  it('describes every mode with a non-empty line', () => {
    for (const mode of ['first-words', 'learn-to-read', 'story-time'] as const) {
      expect(modeDescription(mode).length).toBeGreaterThan(10);
    }
  });
});
