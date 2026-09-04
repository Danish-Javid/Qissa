/**
 * Accent tolerance — the engine no cloud provider ships for Pakistani
 * children (FR-C.7).
 *
 * Urdu/Punjabi-accented English variants are NOT errors. A child saying
 * "wery" for "very" (the /v/~/w/ merger) or "tree" for "three" (/θ/→/t/)
 * has read the word. Flagging her would destroy confidence and would
 * disproportionately hit exactly the bilingual children we most want to
 * serve (NFR-2.2).
 *
 * The variant table lives in data (accent-variants.json) and is matched
 * BEFORE anything is flagged. Growing it from real sessions is a data edit,
 * not a code change.
 */
import { accentVariants } from '../data/index.js';

// Pre-indexed at module load: expected word -> accepted spoken forms.
const variantIndex: Map<string, string[]> = new Map(
  accentVariants.map((v) => [v.expected.toLowerCase(), v.accepted.map((a) => a.toLowerCase())])
);

/**
 * Does the spoken word count as a correct reading of the expected word?
 * True on exact match, or when the spoken form is an accepted accent
 * variant of the expected word.
 */
export function matchesWithAccent(expected: string, spoken: string): boolean {
  const e = expected.toLowerCase();
  const s = spoken.toLowerCase();
  if (e === s) return true;
  const accepted = variantIndex.get(e);
  return accepted !== undefined && accepted.includes(s);
}

/**
 * Why a spoken form was accepted, for the audit log and for pitch evidence
 * ("the accent table caught it"). Undefined on exact matches.
 */
export function accentRationale(expected: string): string | undefined {
  const entry = accentVariants.find((v) => v.expected.toLowerCase() === expected.toLowerCase());
  return entry?.note;
}

/** All expected words that currently have accent tolerance defined. */
export function wordsWithAccentTolerance(): string[] {
  return accentVariants.map((v) => v.expected);
}
