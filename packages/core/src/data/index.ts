/**
 * Typed loaders for the data spine.
 *
 * NFR-8.1: phonics scope, accent variants, themes and word banks are DATA,
 * not code. Keeping them in JSON means the curriculum can be edited (and the
 * accent table grown from real sessions) without touching engine code.
 * The test suite validates these files against the engines on every change.
 */
import phonicsScopeJson from './phonics-scope.json' with { type: 'json' };
import accentVariantsJson from './accent-variants.json' with { type: 'json' };
import themesJson from './themes.json' with { type: 'json' };
import wordBankJson from './word-bank.json' with { type: 'json' };
import cachedStoriesJson from './cached-stories.json' with { type: 'json' };
import type { Story, ThemeId } from '../types.js';

export interface PhonicsLevel {
  level: number;
  name: string;
  graphemes: string[];
  trickyWords: string[];
  examples: string[];
}

export interface PhonicsScope {
  levels: PhonicsLevel[];
}

export interface AccentVariant {
  expected: string;
  accepted: string[];
  note: string;
}

export interface ThemeWeek {
  week: number;
  theme: ThemeId;
  headline: string;
  challengeKeywords: string[];
}

export interface WordBank {
  nouns: string[];
  verbs: string[];
  names: string[];
  settings: string[];
  adjectives: string[];
  sentenceBits: string[];
}

// The JSON shapes are structurally compatible with these interfaces; the
// casts keep call-sites typed while the test suite guards the runtime data.
export const phonicsScope = phonicsScopeJson as unknown as PhonicsScope;
export const accentVariants = (accentVariantsJson as { variants: AccentVariant[] }).variants;
export const themeCurriculum = (themesJson as { weeks: ThemeWeek[] }).weeks;
export const wordBanks = (wordBankJson as { banks: Record<string, WordBank> }).banks;

// Cached stories arrive from JSON as plain string[]; Story requires an exact
// two-option tuple (FR-E.2). Validate that contract at load time — fail loud,
// fail early, rather than serving a malformed choice to a child.
const rawCachedStories = cachedStoriesJson as unknown as {
  stories: Array<Omit<Story, 'choice'> & { choice: Omit<Story['choice'], 'options'> & { options: string[] } }>;
};
export const cachedStories: Story[] = rawCachedStories.stories.map((s) => {
  const [first, second] = s.choice.options;
  if (first === undefined || second === undefined || s.choice.options.length !== 2) {
    throw new Error(`Cached story "${s.title}" must carry exactly two choice options (FR-E.2).`);
  }
  return { ...s, choice: { ...s.choice, options: [first, second] } };
});

/** All graphemes taught up to and including a level, in teaching order. */
export function graphemesUpTo(level: number): string[] {
  const out: string[] = [];
  for (const l of phonicsScope.levels) {
    if (l.level > level) break;
    out.push(...l.graphemes);
  }
  return out;
}

/** All tricky words taught up to and including a level. */
export function trickyWordsUpTo(level: number): string[] {
  const out: string[] = [];
  for (const l of phonicsScope.levels) {
    if (l.level > level) break;
    out.push(...l.trickyWords.map((w) => w.toLowerCase()));
  }
  return out;
}

/**
 * The sound group a grapheme belongs to — its level cohort.
 *
 * Foundation-group rule (the bootstrap): graphemes are introduced in sound
 * groups (level 1: s a t p i n), exactly like a systematic synthetic
 * phonics programme — the first decodable readers use the WHOLE group
 * while its sounds are taught one story at a time. Until every member of
 * the target's group has been taught, stories decode with the whole group;
 * once the group is complete the child's taught set alone drives the gate,
 * so the rule can never smuggle later, untaught sounds past the validator.
 */
export function foundationGroup(grapheme: string): string[] {
  const level = phonicsScope.levels.find((l) => l.graphemes.includes(grapheme));
  return level !== undefined ? [...level.graphemes] : [];
}

/** True while the target's sound group is still being introduced. */
export function isBootstrap(taughtGraphemes: string[], grapheme: string): boolean {
  const group = foundationGroup(grapheme);
  return group.length > 0 && !group.every((g) => taughtGraphemes.includes(g));
}

/** Map the world-seed "current challenge" to the first character theme.
 *  Falls back to week 1 (courage) when nothing matches. */
export function themeForChallenge(challenge: string | undefined): ThemeId {
  if (challenge) {
    const text = challenge.toLowerCase();
    for (const week of themeCurriculum) {
      if (week.challengeKeywords.some((kw) => text.includes(kw))) return week.theme;
    }
  }
  return 'courage';
}

// Re-export the gate itself so data-integrity tests validate the JSON spine
// against the exact engine that guards generated stories.
export { tokenize, validateText } from '../pedagogy/decodability.js';
