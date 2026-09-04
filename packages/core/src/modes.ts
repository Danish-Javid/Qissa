/**
 * The Qissa mode model — three doors, one developmental ladder.
 *
 * Qissa serves ages 1–6 through THREE modes. Two are age-matched *learning*
 * tracks (the child acts); one is a *common* receptive mode every child gets
 * (the child listens + watches):
 *
 *   1 · First Words   (1–2y)  receptive/expressive-pre — picture naming,
 *                              kindness, tap-quiz. The curated early track.
 *   2 · Learn to Read (3–6y)  expressive — the decodable primer: word-by-word
 *                              teach → blend → check, then read the line. The
 *                              child speaks; we listen (ASR + ladder).
 *   3 · Story Time    (1–6y)  receptive — Buddy narrates the child's OWN
 *                              story over FLUX art, paced like a cartoon. No
 *                              reading required, so even a 1-year-old learns
 *                              through it: receptive language leads expressive.
 *
 * Design rules:
 *  - Age is DERIVED from birthDate, never trusted from input (the server
 *    computes it; these functions are pure so both sides agree).
 *  - Story Time is the common mode: available to every child, and the parent
 *    can only turn it DOWN (disable), never needed to turn it on.
 *  - The parent may OVERRIDE the auto learning track (a bright 2-year-old can
 *    be moved up, a struggling 6-year-old kept in First Words) — override wins
 *    over age, because placement is a judgement, not a birthday (FR-F.3 keeps
 *    the reading LEVEL mastery-driven; this only picks the door).
 *  - Morals live INSIDE the Story Time narrative (show, don't tell) — never a
 *    bolted-on end-of-story lesson. That is a property of the story prompt and
 *    the player's warm close, not of this module; this module only routes.
 */

/** The two age-matched learning tracks (the child acts). */
export type LearningTrack = 'first-words' | 'learn-to-read';

/** Every door a child can open: a learning track, or the common Story Time. */
export type QissaMode = LearningTrack | 'story-time';

/** Upper age (inclusive) for the First Words track. 1–2 years. */
export const FIRST_WORDS_MAX_AGE = 2;
/** Lower age (inclusive) for Story Time. It is the common mode from age 1. */
export const STORY_TIME_MIN_AGE = 1;

/** Narration pace for Story Time — a parental control and a child-facing toggle. */
export type StoryPacing = 'fluent' | 'slow';

/**
 * Per-child parental controls over the three modes. Persisted as JSON on the
 * Child row. Every field is optional: absent means "use the age default", so
 * an empty/legacy settings object behaves exactly like a fresh child.
 */
export interface ChildSettings {
  /** Parent override of the auto learning track. null/absent = age default. */
  learningTrack?: LearningTrack | null;
  /** Story Time narration pace. Absent = 'fluent'. */
  storyPacing?: StoryPacing;
  /** Parent can hide the common Story Time door. Absent = enabled. */
  storyTimeEnabled?: boolean;
  /** Parent-set daily session cap in minutes for this child. Absent = server default. */
  sessionCapMinutes?: number;
}

/**
 * Safely narrow unknown persisted JSON to ChildSettings.
 *
 * The settings column is free-form JSONB, so a reader must never trust its
 * shape: a newer writer may have added keys, an older row may be null, and a
 * corrupt value must degrade to the age defaults rather than throw. Unknown
 * fields are dropped, wrong-typed fields are ignored — this is what makes the
 * column forward-compatible without another migration.
 */
export function parseChildSettings(raw: unknown): ChildSettings {
  if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) return {};
  const obj = raw as Record<string, unknown>;
  const out: ChildSettings = {};
  if (obj.learningTrack === 'first-words' || obj.learningTrack === 'learn-to-read') {
    out.learningTrack = obj.learningTrack;
  }
  if (obj.storyPacing === 'fluent' || obj.storyPacing === 'slow') {
    out.storyPacing = obj.storyPacing;
  }
  if (typeof obj.storyTimeEnabled === 'boolean') {
    out.storyTimeEnabled = obj.storyTimeEnabled;
  }
  if (typeof obj.sessionCapMinutes === 'number' && Number.isFinite(obj.sessionCapMinutes)) {
    out.sessionCapMinutes = obj.sessionCapMinutes;
  }
  return out;
}

/** The age-matched learning track for a raw age in years. */
export function learningTrackForAge(ageYears: number): LearningTrack {
  return ageYears <= FIRST_WORDS_MAX_AGE ? 'first-words' : 'learn-to-read';
}

/** Story Time is the common receptive mode — available from age 1 upward. */
export function storyTimeAvailable(ageYears: number): boolean {
  return ageYears >= STORY_TIME_MIN_AGE;
}

/** Sensible defaults for a child with no stored settings. */
export function defaultChildSettings(): Required<Pick<ChildSettings, 'storyPacing' | 'storyTimeEnabled'>> & {
  learningTrack: null;
} {
  return { learningTrack: null, storyPacing: 'fluent', storyTimeEnabled: true };
}

/** Effective learning track: the parent's override wins, else the age default. */
export function resolveLearningTrack(ageYears: number, settings?: ChildSettings | null): LearningTrack {
  const override = settings?.learningTrack;
  return override === 'first-words' || override === 'learn-to-read' ? override : learningTrackForAge(ageYears);
}

/** Effective Story Time pace: the parent's choice, else fluent. */
export function resolveStoryPacing(settings?: ChildSettings | null): StoryPacing {
  return settings?.storyPacing === 'slow' ? 'slow' : 'fluent';
}

/** Whether the common Story Time door is shown (parent may disable it). */
export function resolveStoryTimeEnabled(ageYears: number, settings?: ChildSettings | null): boolean {
  return storyTimeAvailable(ageYears) && settings?.storyTimeEnabled !== false;
}

/**
 * The doors a child's home shows, in display order: their learning track
 * first (the bright primary action), then the common Story Time door. Honors
 * the parent's override and enable/disable toggles.
 */
export function resolveModes(ageYears: number, settings?: ChildSettings | null): QissaMode[] {
  const modes: QissaMode[] = [resolveLearningTrack(ageYears, settings)];
  if (resolveStoryTimeEnabled(ageYears, settings)) modes.push('story-time');
  return modes;
}

/** Human-facing label for a mode (parent dashboard + child home bubbles). */
export function modeLabel(mode: QissaMode): string {
  switch (mode) {
    case 'first-words':
      return 'First Words';
    case 'learn-to-read':
      return 'Learn to Read';
    case 'story-time':
      return 'Story Time';
  }
}

/** One-line, honest description of what a mode does (parent dashboard). */
export function modeDescription(mode: QissaMode): string {
  switch (mode) {
    case 'first-words':
      return 'Picture naming, sounds and kindness — tap and explore together.';
    case 'learn-to-read':
      return 'Word-by-word teaching, then your child reads the line aloud.';
    case 'story-time':
      return "Your child's own story, narrated with pictures — listening and watching.";
  }
}
