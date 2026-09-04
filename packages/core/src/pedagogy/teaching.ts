/**
 * Teach-pass word selection — the "Toddlers Can Read" word-by-word step.
 *
 * Before a child reads a line fluently, the Learn to Read track warms up the
 * words that carry the story's NEW target sound: sound them out, blend them,
 * then let the child say each one. This module answers the only question that
 * is pure pedagogy — WHICH words on a page deserve that explicit teach pass.
 *
 * The rule (fail-closed, matching the decodability gate):
 *   * a word is taught only if it DECODES with what the child has been taught
 *     (parseGraphemes !== null) — never a word the gate would reject;
 *   * and only if it carries the story's target grapheme — that is the new
 *     sound this story exists to teach, so explicit teaching lands where it
 *     matters instead of on every already-known word;
 *   * each unique word is taught once, and the pass is capped so a page stays
 *     snappy (the fluent line read + correction ladder cover the rest).
 *
 * Kept separate from the player so the selection is deterministic and unit
 * tested: the browser sequences and speaks, core decides.
 */
import { tokenize } from './decodability.js';
import { parseGraphemes } from './graphemes.js';

/** Hard ceiling on teach-pass words per page — bounded so a dense page never
 *  turns the warm-up into a chore; the fluent read handles the overflow. */
export const MAX_TEACH_WORDS_PER_PAGE = 4;

/**
 * The words on a page worth an explicit teach→blend→check pass.
 *
 * Returns tokens in reading order, de-duplicated, capped at `cap`. Empty when
 * the page carries no decodable word with the target sound (the caller then
 * skips straight to the fluent read — the teach pass is an enhancement, never
 * a gate). `tokenize` lowercases, so the returned words match exactly what the
 * reader displays and what the miscue classifier compares against.
 */
export function teachWordsForPage(
  pageText: string,
  targetGrapheme: string,
  taughtGraphemes: string[],
  cap: number = MAX_TEACH_WORDS_PER_PAGE
): string[] {
  const target = targetGrapheme.toLowerCase().trim();
  if (target.length === 0 || cap <= 0) return [];

  const seen = new Set<string>();
  const selected: string[] = [];
  for (const word of tokenize(pageText)) {
    if (seen.has(word)) continue;
    const graphemes = parseGraphemes(word, taughtGraphemes);
    // Decodable AND carries the new sound → teach it. A word that fails to
    // parse (a tricky/sight word, or one above the child's level) is left to
    // the fluent read, exactly as the decodability gate would treat it.
    if (graphemes !== null && graphemes.includes(target)) {
      seen.add(word);
      selected.push(word);
      if (selected.length >= cap) break;
    }
  }
  return selected;
}
