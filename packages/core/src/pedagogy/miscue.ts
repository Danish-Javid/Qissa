/**
 * Miscue classification — forced alignment of what the child SAID against
 * what the page EXPECTS (Doc 6 §4, FR-C.2).
 *
 * We always know the exact expected text — that is the entire point of
 * decodable stories — so we do NOT need open-vocabulary phoneme scoring.
 * The transcript is aligned word-by-word against the line, and each
 * expected word is classified:
 *
 *   correct          read it (possibly with an accepted accent variant)
 *   substitution     said a different word
 *   omission         skipped it
 *   insertion        said an extra word (logged, never surfaced to the child)
 *   self-correction  stumbled, then fixed it herself — a POSITIVE signal
 *   hesitation       paused >3s (fluency, not accuracy — never an "error")
 *
 * Bias hard toward missing errors (NFR-2.2): accent variants are matched
 * BEFORE anything is flagged, and low-confidence alignment defaults to the
 * gentler classification.
 *
 * The scanner is a deterministic two-pointer walk with one-token lookahead.
 * It is auditable by eye: every classification follows from the three rules
 * below, which is what makes protocol fidelity claimable.
 */
import type { MiscueType, WordOutcome } from '../types.js';
import { matchesWithAccent } from './accent.js';
import { parseGraphemes } from './graphemes.js';

export interface ReadingSample {
  /** The line on the page, as written. */
  expectedLine: string;
  /** What the ASR heard, in order. */
  spoken: string[];
  /** Indices (in the expected line) where the child paused >3s. */
  hesitations?: number[];
}

export interface ClassificationContext {
  /** Taught graphemes, used to attribute miscues to graphemes (FR-C.5). */
  taughtGraphemes: string[];
  /** Taught tricky words — miscues on these are logged against the word. */
  taughtTrickyWords?: string[];
}

export interface ClassificationResult {
  outcomes: WordOutcome[];
  /** Extra words the child said that align to nothing on the page. */
  insertions: string[];
}

/** Lowercase a line into expected word tokens, preserving order. */
function expectedTokens(line: string): string[] {
  return line
    .toLowerCase()
    .split(/[^a-z]+/)
    .filter((t) => t.length > 0);
}

/** Graphemes a miscue should be logged against — never the whole word,
 *  except for tricky words taught as wholes. */
function graphemesFor(word: string, ctx: ClassificationContext): string[] {
  if (ctx.taughtTrickyWords?.includes(word)) return [word];
  return parseGraphemes(word, ctx.taughtGraphemes) ?? [word];
}

/**
 * Classify one line of reading.
 *
 * Alignment rules, applied left to right with a one-token lookahead:
 *  1. spoken[j] matches expected[i] (accent-aware)          -> correct
 *  2. spoken[j] does NOT match, but spoken[j+1] matches      -> self-correction
 *     expected[i] (she stumbled, then fixed it herself)
 *  3. spoken[j] matches expected[i+1]                        -> expected[i]
 *     was omitted (the spoken word belongs to the next slot)
 *  4. otherwise                                              -> substitution
 * Leftover spoken tokens are insertions; leftover expected words, omissions.
 */
export function classifyReading(sample: ReadingSample, ctx: ClassificationContext): ClassificationResult {
  const expected = expectedTokens(sample.expectedLine);
  const spoken = sample.spoken.map((s) => s.toLowerCase());
  const hesitations = new Set(sample.hesitations ?? []);
  const outcomes: WordOutcome[] = [];
  const insertions: string[] = [];

  let j = 0; // pointer into spoken
  for (let i = 0; i < expected.length; i++) {
    const exp = expected[i] as string;
    const currentSpoken = spoken[j];
    let outcome: MiscueType;
    let spokenForm: string | undefined;

    if (currentSpoken === undefined) {
      // The child stopped before finishing the line: remaining words omitted.
      outcome = 'omission';
    } else if (matchesWithAccent(exp, currentSpoken)) {
      outcome = 'correct';
      spokenForm = currentSpoken;
      j++;
    } else if (j + 1 < spoken.length && matchesWithAccent(exp, spoken[j + 1] as string)) {
      // Rule 2: stumbled on currentSpoken, then produced the right word.
      outcome = 'self-correction';
      spokenForm = spoken[j + 1];
      j += 2;
    } else if (i + 1 < expected.length && matchesWithAccent(expected[i + 1] as string, currentSpoken)) {
      // Rule 3: she skipped this word and is already on the next one.
      // Do not consume the spoken token — it belongs to the next iteration.
      outcome = 'omission';
    } else {
      // Rule 4: a different word in this slot.
      outcome = 'substitution';
      spokenForm = currentSpoken;
      j++;
    }

    outcomes.push({
      expected: exp,
      index: i,
      outcome,
      spoken: spokenForm,
      graphemes: graphemesFor(exp, ctx),
      ladderStep: 0
    });
  }

  // Any spoken words after the last expected word are insertions.
  // We record them for completeness but NEVER correct a child for them.
  while (j < spoken.length) {
    insertions.push(spoken[j] as string);
    j++;
  }

  // Merge hesitation events (a fluency signal, supplied by the client's
  // silence detector) into the per-word outcomes.
  for (const idx of hesitations) {
    const target = outcomes[idx];
    if (target && target.outcome === 'correct') {
      // Hesitation + eventual correct read: fluency note only. Accuracy
      // stays correct — the child got there on her own.
      target.outcome = 'hesitation';
    }
  }

  return { outcomes, insertions };
}

/** Convenience: count genuine accuracy miscues (excludes hesitation,
 *  self-correction and insertions). Used for progression and metrics. */
export function accuracyMisses(result: ClassificationResult): number {
  return result.outcomes.filter((o) => o.outcome === 'substitution' || o.outcome === 'omission').length;
}
