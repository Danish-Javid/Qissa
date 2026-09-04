/**
 * Shared domain types for Qissa.
 *
 * These types are the contract between the server, the browser, and the
 * generated content. They live in the core package so that the pedagogy
 * engines run identically on both sides (offline mode depends on it).
 */

/** The five miscue behaviours we classify (FR-C.2). Hesitation is a fluency
 *  signal, not an accuracy error; self-correction is logged as POSITIVE. */
export type MiscueType =
  | 'correct'
  | 'substitution'
  | 'omission'
  | 'insertion'
  | 'self-correction'
  | 'hesitation';

/** One expected word in a line, with what the child actually did. */
export interface WordOutcome {
  /** The word as written on the page (lowercase). */
  expected: string;
  /** Position of the word in the line, 0-based. Drives the underline. */
  index: number;
  outcome: MiscueType;
  /** What the child said instead, when applicable. */
  spoken?: string;
  /** Graphemes in the expected word — miscues are logged against these,
   *  never against the whole word (FR-C.5). */
  graphemes: string[];
  /** Which rung of the correction ladder was reached (0 = none needed). */
  ladderStep: number;
}

/** The constraint object handed to the story generator (Doc 6 §8).
 *  Every field is enforced by deterministic code AFTER generation too. */
export interface StoryConstraints {
  childName: string;
  ageYears: number;
  /** World seed: the child's real life, as canon (FR-B.4). */
  worldSeed: WorldSeed;
  /** Every word must parse using only these graphemes. */
  allowedGraphemes: string[];
  /** The new grapheme this story teaches; must appear >= 6 times. */
  targetGrapheme: string;
  /** Weak graphemes due for spaced repetition; each must appear >= 3 times. */
  reviewGraphemes: string[];
  /** At most 2 untaught high-frequency words may appear. */
  allowedTrickyWords: string[];
  /** Character theme from the rotating 12-week curriculum (FR-E.4). */
  theme: ThemeId;
  /** Number of pages appropriate for the level (FR-B.9). */
  pageCount: number;
}

/** What the parent typed at setup becomes permanent story canon. */
export interface WorldSeed {
  heroName: string;
  siblingName?: string;
  petName?: string;
  petKind?: string;
  city: string;
  /** The "something she's working on" field — decides the first theme. */
  currentChallenge?: string;
}

export type ThemeId =
  | 'courage'
  | 'sharing'
  | 'patience'
  | 'honesty'
  | 'kindness'
  | 'gratitude'
  | 'perseverance'
  | 'apologising'
  | 'curiosity'
  | 'teamwork'
  | 'empathy'
  | 'self-control';

/** A generated (or cached) story after passing the safety pipeline. */
export interface Story {
  title: string;
  level: number;
  targetGrapheme: string;
  theme: ThemeId;
  pages: StoryPage[];
  /** Exactly one choice point per story (FR-E.1). Never marked correct. */
  choice: StoryChoice;
  /** Session close hands the child an offline task (FR-H.2). */
  offlineTask: string;
  /** Provenance for the audit log (FR-I.9): which model, which prompt. */
  provenance: { generator: string; model: string; promptVersion: string };
}

export interface StoryPage {
  text: string;
  /** Scene description for the illustration model — WHO is WHERE doing WHAT,
   *  in the flat storybook style. It is never echoed text; it paints the
   *  moment so the picture carries the meaning (dual coding, Kintsch). */
  illustrationHint: string;
  /** Spoken "picture walk" line — rich oral language the companion says while
   *  the illustration is shown, BEFORE the child decodes `text`. It builds the
   *  coherent representation (comprehension) and is deliberately NOT held to
   *  the decodable gate: it is heard, not read (same exemption as offlineTask). */
  pictureTalk?: string;
}

export interface StoryChoice {
  prompt: string;
  /** Exactly two options. Neither is ever flagged correct (FR-E.2). */
  options: [string, string];
  /** Consequences resolve within the same story (FR-E.5). */
  consequenceForFirst: string;
  consequenceForSecond: string;
}

/** Per-grapheme statistics. The moat lives in these numbers. */
export interface GraphemeStat {
  grapheme: string;
  exposures: number;
  correct: number;
  /** Distinct words this grapheme has been seen in — progression requires 3+. */
  distinctWords: string[];
  status: GraphemeStatus;
  /** ISO timestamps; the decay curve is computed from lastSeen. */
  lastSeen: string | null;
  nextReviewDue: string | null;
}

export type GraphemeStatus = 'new' | 'learning' | 'mastered' | 'reteach';

/** The persistent learner model (FR-F). Versioned and forward-compatible:
 *  readers MUST ignore unknown fields, writers MUST keep schemaVersion. */
export interface LearnerModel {
  schemaVersion: 1;
  currentLevel: number;
  /** Graphemes taught so far — the decodability boundary. */
  taughtGraphemes: string[];
  /** High-frequency tricky words taught as wholes. */
  taughtTrickyWords: string[];
  graphemeStats: Record<string, GraphemeStat>;
  /** Words the child has read successfully at least once. */
  vocabulary: string[];
  fluency: Array<{ at: string; wordsPerMinute: number }>;
  themesSeen: ThemeId[];
  updatedAt: string;
}

/** The PEER prompt taxonomy (CROWD) — prompts rotate through these. */
export type PromptType = 'completion' | 'recall' | 'open' | 'wh' | 'distancing';
