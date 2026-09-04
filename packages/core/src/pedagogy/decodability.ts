/**
 * The decodability validator — one of the most important pieces of code in
 * the system (Doc 6 §2.3).
 *
 * Guarantee: a child is NEVER shown a word she cannot decode with the
 * phonics she has been taught. Nothing requires a guess. Every generated
 * story passes through `validateText` before rendering; violations reject
 * the story (fail-closed, NFR-2.3, NFR-5.1).
 *
 * Rules:
 *  - A word passes if it parses into taught graphemes (parseGraphemes), OR
 *    it is on the taught tricky-word list (high-frequency words taught as
 *    wholes, e.g. "the").
 *  - Punctuation is stripped, but apostrophes stay GLUED to their word:
 *    "don't" becomes one token, "don't", which no grapheme set can ever
 *    parse ("'" is not a letter). Contractions and possessives therefore
 *    fail the gate instead of splitting into innocent halves — fail-closed
 *    (NFR-2.3). Generated content is prompt-constrained to avoid them.
 */
import { parseGraphemes } from './graphemes.js';

export interface DecodabilityContext {
  taughtGraphemes: string[];
  taughtTrickyWords: string[];
}

export interface DecodabilityViolation {
  word: string;
  /** 0-based position in the token stream — used in pitch metrics. */
  index: number;
}

export interface DecodabilityResult {
  valid: boolean;
  violations: DecodabilityViolation[];
  totalWords: number;
}

/**
 * Split text into lowercase word tokens.
 * Anything that is not A–Z or an apostrophe is a separator. Apostrophes stay
 * glued to their word, so "don't" is ONE token that the parser can never
 * decode — a contraction must never split into two innocent halves and slip
 * through the gate. Possessives are the same: story text carries no
 * apostrophes (a prompt constraint), and anything that does is rejected.
 */
export function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .split(/[^a-z']+/)
    .filter((t) => t.length > 0);
}

/** Is a single word decodable (or an allowed tricky word) for this child? */
export function isWordDecodable(word: string, ctx: DecodabilityContext): boolean {
  const w = word.toLowerCase();
  if (ctx.taughtTrickyWords.includes(w)) return true;
  return parseGraphemes(w, ctx.taughtGraphemes) !== null;
}

/**
 * Validate a full passage. Returns every violating word so the story engine
 * can log rejections with evidence (the rejection rate is a pitch statistic).
 */
export function validateText(text: string, ctx: DecodabilityContext): DecodabilityResult {
  const tokens = tokenize(text);
  const violations: DecodabilityViolation[] = [];

  tokens.forEach((word, index) => {
    if (!isWordDecodable(word, ctx)) {
      // Report the offending letters only — punctuation is stripped from the
      // text token so metrics and logs compare like for like ("don't" -> "dont").
      violations.push({ word: word.replaceAll("'", ''), index });
    }
  });

  return { valid: violations.length === 0, violations, totalWords: tokens.length };
}
