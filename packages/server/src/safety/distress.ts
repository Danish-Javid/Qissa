/**
 * Distress classifier — runs on EVERY child utterance (FR-I.2).
 *
 * Three outcomes:
 *  - none:       the story continues as normal.
 *  - acknowledge: the companion names the feeling warmly, then gently
 *                 returns to the story. Logged to the digest.
 *  - escalate:   a DistressAlert row is written and the parent digest shows
 *                 a flag. The raw utterance is NEVER stored — only the
 *                 category — because a child's words are hers (NFR-3).
 *
 * Deliberately keyword-based: deterministic, auditable, and a child's
 * sentence can never be "interpreted" by an LLM into something it was not.
 */

export type DistressLevel = 'none' | 'acknowledge' | 'escalate';

export interface DistressVerdict {
  level: DistressLevel;
  category: string; // stored on the alert; never the utterance itself
  response: string | null; // what the companion says, if anything
}

interface Pattern {
  category: string;
  level: DistressLevel;
  keywords: string[];
  response: string;
}

// Ordered: the first matching pattern wins, so the most serious classes
// come first.
const PATTERNS: Pattern[] = [
  {
    category: 'safety',
    level: 'escalate',
    keywords: ['help me', 'scared of him', 'scared of her', 'hits me', 'hurt me', 'locks me', 'no food'],
    response: 'Thank you for telling me. I will let your grown-up know. You are safe right now.'
  },
  {
    category: 'pain',
    level: 'escalate',
    keywords: ['i am hurt', 'it hurts', 'i am bleeding', 'my tummy hurts', 'i fell'],
    response: 'Oh. Please call your grown-up now so they can help you.'
  },
  {
    category: 'fear',
    level: 'acknowledge',
    keywords: ['i am scared', 'scared of the dark', 'afraid', 'there is a monster', 'i heard a noise'],
    response: 'Being scared is a real feeling. We are together, and the story is a safe place.'
  },
  {
    category: 'sadness',
    level: 'acknowledge',
    keywords: ['i am sad', 'i miss', 'nobody plays with me', 'i cried', 'i am lonely'],
    response: 'Thank you for telling me. Feelings like that are heavy. The story is here with you.'
  },
  {
    category: 'anger',
    level: 'acknowledge',
    keywords: ['i am angry', 'i hate', 'i want to break', 'not fair'],
    response: 'Big feelings are okay. Let us breathe one slow breath, then back to our story.'
  }
];

/** Classify one utterance. Empty input is always 'none'. */
export function classifyDistress(utterance: string): DistressVerdict {
  const t = utterance.toLowerCase();
  if (t.trim().length === 0) return { level: 'none', category: 'none', response: null };

  for (const pattern of PATTERNS) {
    if (pattern.keywords.some((k) => t.includes(k))) {
      return { level: pattern.level, category: pattern.category, response: pattern.response };
    }
  }
  return { level: 'none', category: 'none', response: null };
}
