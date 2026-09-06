/**
 * The legal lexicon — the words a child can actually be shown, compiled.
 *
 * WHY THIS EXISTS. The read-along prompt used to hand the generator a list of
 * GRAPHEMES and leave it to derive which words those spell. Models are bad at
 * that: asked for a story from `s a t p i n`, a frontier model returned pages
 * reading "Ayla s." and "Meethi s." — degenerate output that passed the shape
 * check because its structure was valid. It was not being lazy; it was solving
 * the wrong problem, because the problem it was given required doing phonics
 * in its head before it could write a sentence.
 *
 * We already own the answer. The curriculum ships a per-level word bank, and
 * the decodability gate can say yes or no to any word. So compile the actual
 * vocabulary, grouped by the role a sentence needs, and give the generator
 * words instead of rules.
 *
 * The second job is honesty about what is possible. If only three legal words
 * carry the target sound, asking for six is asking for something that does not
 * exist — and an impossible brief is answered with nonsense, not an error.
 * assessFeasibility says what the vocabulary can support so the caller can ask
 * for that instead.
 */
import { wordBanks } from '../data/index.js';
import { isWordDecodable, type DecodabilityContext } from './decodability.js';

/** Legal words for one child, grouped by the role they play in a sentence. */
export interface LegalLexicon {
  nouns: string[];
  verbs: string[];
  adjectives: string[];
  settings: string[];
  /** Function words and fragments: in, it, is, an, at… */
  connectives: string[];
  /** Whole words taught by sight, plus the child's own world-seed names. */
  wholeWords: string[];
  /** Every legal word, deduplicated — the size of the child's world. */
  all: string[];
}

/** Deduplicate, drop empties, keep a stable order for reproducible prompts. */
function clean(words: string[], keep: (w: string) => boolean): string[] {
  return [...new Set(words.map((w) => w.toLowerCase().trim()))].filter((w) => w.length > 0 && keep(w)).sort();
}

/**
 * Compile every word this child could legally be shown, up to `level`.
 *
 * Each bank entry is re-checked against the decodability gate rather than
 * trusted, so a word the bank offers but this particular child cannot yet
 * decode (a level is cumulative, a child's taught set is not) never reaches a
 * prompt as if it were legal.
 */
export function buildLexicon(level: number, ctx: DecodabilityContext): LegalLexicon {
  const decodable = (w: string): boolean => isWordDecodable(w, ctx);
  const banks = [];
  for (let l = 1; l <= level; l++) {
    const bank = wordBanks[String(l)];
    if (bank !== undefined) banks.push(bank);
  }

  const nouns = clean(banks.flatMap((b) => b.nouns), decodable);
  const verbs = clean(banks.flatMap((b) => b.verbs), decodable);
  const adjectives = clean(banks.flatMap((b) => b.adjectives), decodable);
  const settings = clean(banks.flatMap((b) => b.settings), decodable);
  const connectives = clean(banks.flatMap((b) => b.sentenceBits), decodable);
  // Tricky words and names bypass the grapheme parser by definition — they are
  // exactly the words taught as wholes — so they are legal without re-checking.
  const wholeWords = clean(ctx.taughtTrickyWords, () => true);

  return {
    nouns,
    verbs,
    adjectives,
    settings,
    connectives,
    wholeWords,
    all: [...new Set([...nouns, ...verbs, ...adjectives, ...settings, ...connectives, ...wholeWords])].sort()
  };
}

/** Legal words that contain a grapheme — the carriers that can teach it. */
export function carriersFor(grapheme: string, lexicon: LegalLexicon): string[] {
  return lexicon.all.filter((w) => w.includes(grapheme));
}

export interface FeasibilityReport {
  /** Distinct legal words containing the target grapheme. */
  targetCarriers: number;
  /** Review graphemes with at least one legal carrier — the ones worth asking for. */
  achievableReviews: string[];
  /** Review graphemes with NO legal carrier: impossible, and must be dropped. */
  impossibleReviews: string[];
  /** Total size of the child's legal vocabulary. */
  vocabularySize: number;
  /** True when the brief can be met as written. */
  ok: boolean;
  /** One human-readable line for the audit trail and the parent's pipeline view. */
  summary: string;
}

/**
 * Can this brief be satisfied at all?
 *
 * Deliberately narrow: it reports only what is *provably* impossible from the
 * compiled vocabulary — a review sound with no legal carrier, or a target with
 * none. It does not try to predict whether a good story exists, which is not
 * something a word count can answer.
 */
export function assessFeasibility(
  targetGrapheme: string,
  reviewGraphemes: string[],
  lexicon: LegalLexicon
): FeasibilityReport {
  const targetCarriers = carriersFor(targetGrapheme, lexicon).length;
  const achievableReviews: string[] = [];
  const impossibleReviews: string[] = [];
  for (const grapheme of reviewGraphemes) {
    if (carriersFor(grapheme, lexicon).length > 0) achievableReviews.push(grapheme);
    else impossibleReviews.push(grapheme);
  }

  const ok = impossibleReviews.length === 0;
  const summary = ok
    ? `${lexicon.all.length} legal words, ${targetCarriers} carrying "${targetGrapheme}"`
    : `${lexicon.all.length} legal words; dropped unreachable review units: ${impossibleReviews.join(', ')}`;

  return {
    targetCarriers,
    achievableReviews,
    impossibleReviews,
    vocabularySize: lexicon.all.length,
    ok,
    summary
  };
}
