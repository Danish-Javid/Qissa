/**
 * Content filter — the moderation rung of the fail-closed pipeline
 * (prompt constraints -> decodability -> THIS -> display).
 *
 * Deterministic keyword blocking: generated text for a four-year-old has a
 * very small surface, so a curated blocklist with zero tolerance is the
 * right tool — any hit rejects the whole story and the cache serves instead.
 * A future vendor moderation call can wrap this, but the gate logic stays.
 *
 * Fail-closed rule: callers treat ANY thrown error as a rejection.
 */

/** One blocked category: a label for the audit log + trigger words. */
interface BlockCategory {
  label: string;
  /** Lowercase substrings. Word-boundary matching keeps "classic" safe from "ass". */
  words: string[];
}

const BLOCKED: BlockCategory[] = [
  {
    label: 'violence',
    words: ['kill', 'killed', 'gun', 'knife', 'fight', 'hit him', 'hit her', 'hurt', 'blood', 'war', 'bomb', 'attack']
  },
  {
    label: 'fear-horror',
    words: ['monster', 'ghost', 'demon', 'dead', 'death', 'die', 'died', 'grave', 'dark magic', 'curse', 'evil']
  },
  {
    label: 'adult',
    words: ['beer', 'wine', 'drink', 'smoke', 'drug', 'kiss', 'love story', 'married', 'wedding']
  },
  {
    label: 'self-harm',
    words: ['hurt myself', 'hurt yourself', 'hate myself', 'hate you', 'nobody loves', 'go away forever']
  },
  {
    label: 'commerce-pressure',
    words: ['buy', 'shop now', 'money', 'pay', 'price', 'free gift card', 'subscribe']
  },
  {
    label: 'injection-attempts',
    // Prompt-injection payloads that a compromised generator could emit.
    // Child utterances never reach this filter as instructions (FR-I.7).
    words: ['ignore previous', 'ignore your rules', 'system prompt', 'you are now', 'new instructions', 'jailbreak']
  }
];

export interface FilterVerdict {
  ok: boolean;
  /** Block category labels that fired — written to the audit log. */
  reasons: string[];
  /** The words that fired, for debugging only (never shown to the child). */
  hits: string[];
}

/** Whole-word match: "ass" inside "classic" must never fire. */
function containsWord(text: string, word: string): boolean {
  // Phrases (with spaces) match as substrings; single words need boundaries.
  if (word.includes(' ')) return text.includes(word);
  const pattern = new RegExp(`(^|[^a-z])${escapeRegex(word)}($|[^a-z])`);
  return pattern.test(text);
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** Check one piece of text. Throws nothing — returns a verdict. */
export function filterText(text: string): FilterVerdict {
  const t = text.toLowerCase();
  const reasons: string[] = [];
  const hits: string[] = [];
  for (const category of BLOCKED) {
    for (const word of category.words) {
      if (containsWord(t, word)) {
        reasons.push(category.label);
        hits.push(word);
        break; // one hit per category is enough for the verdict
      }
    }
  }
  return { ok: reasons.length === 0, reasons, hits };
}

/** Check every string surface of a story in one pass. */
export function filterAll(surfaces: string[]): FilterVerdict {
  const reasons: string[] = [];
  const hits: string[] = [];
  for (const surface of surfaces) {
    const v = filterText(surface);
    if (!v.ok) {
      reasons.push(...v.reasons);
      hits.push(...v.hits);
    }
  }
  return { ok: reasons.length === 0, reasons, hits };
}
