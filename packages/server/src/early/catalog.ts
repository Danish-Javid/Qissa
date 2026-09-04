/**
 * Early track catalog — the curated 0–4 experience: "First Words" picture
 * cards and "Kindness Corner" vignettes.
 *
 * Every line here is written by us, reviewed for age-fit, and served
 * verbatim through the same content-filtered TTS as stories. There is NO
 * free-text input anywhere in this track and NO model-generated narration —
 * prompt injection is structurally impossible because nothing a child (or
 * anyone) sends ever reaches a generator prompt. That IS the hardening:
 * the attack surface is zero.
 *
 * Research grounding:
 *  - Picture naming of daily things: shared picture-book reading with
 *    labeling drives vocabulary growth (Ganea, Pickard & DeLoache 2011,
 *    J. Child Lang.; DeLoache & Simcock's work on picture→real-world
 *    transfer in 15–24-month-olds). Words chosen are the high-frequency
 *    concrete nouns toddlers meet every day (animals, food, vehicles,
 *    the world outside) — the categories that dominate early lexicons
 *    (Caselli et al. 1995 cross-linguistic CDI data).
 *  - Naming aloud WHILE the child looks at the picture facilitates
 *    learning more than pointing alone (Ganea et al. 2011, PMC3933771) —
 *    so Buddy says the word, then asks the child to find it.
 *  - The response is a TAP, not speech: preverbal children demonstrate
 *    comprehension by pointing ( receptive language leads expressive by
 *    ~6 months — classic CDI finding), so tapping the picture is the
 *    age-correct analogue of pointing.
 *  - Morals from the start: Hamlin, Wynn & Bloom (2007, Nature) showed
 *    6–10-month-olds already prefer helpers over hinderers — moral
 *    evaluation is present BEFORE language. Kindness Corner names the
 *    helping act and labels it ("Helping is kind!") — the serve-and-return
 *    pattern (Harvard Center on the Developing Child) of noticing,
 *    naming, and warmly responding.
 *  - One clear subject per picture: toddlers transfer better from
 *    realistic, uncluttered images (Simcock, Garrity & Barr 2011), which
 *    the house art direction already enforces.
 *  - Retrieval practice (the "testing effect"): being asked to FIND a
 *    just-learned picture is guided retrieval, which strengthens memory
 *    far more than re-exposure alone (Roediger & Karpicke 2006, Psych.
 *    Science); young children benefit when retrieval is cued/recognitive —
 *    pointing at the right picture among three (Karpicke, Blunt, Smith &
 *    Karpicke 2014). The quiz is recognition, not recall: age-correct.
 *  - Spacing: a word the child missed in the quiz is scheduled back into
 *    the NEXT deck — distributed practice beats massed practice (Cepeda,
 *    Pashler, Vul, Wixted & Rohrer 2006, Psych. Bulletin meta-analysis).
 *  - Novelty: unseen words are served FIRST and every story world is
 *    re-seeded, because infants' attention is captured by novelty and
 *    habituates to repetition (Fantz 1964, novelty-preference paradigm) —
 *    each run must hold something new.
 *  - A wrong tap is labeled, never punished ("That's the cat! Let's find
 *    the bird!"): corrective feedback that names both pictures is itself
 *    a vocabulary moment.
 */

export interface EarlyWordCard {
  id: string;
  word: string;
  category: 'animal' | 'food' | 'vehicle' | 'world';
  /** Buddy names the thing and gives it life (sound, feel, use). */
  say: string;
  /** Then asks the child to find it — comprehension before production. */
  ask: string;
  /** Warm, specific celebration on the tap. */
  praise: string;
  /** Illustration hint merged with the house art style. */
  art: string;
}

export interface EarlyVignette {
  id: string;
  title: string;
  /** Short narrated scene lines, one moment each. */
  sceneLines: string[];
  /** The helper-prototype question (Hamlin et al. paradigm, verbalized). */
  question: string;
  kindPraise: string;
  /** Gentle modeling when the child picks "not kind" — never "wrong". */
  gentleFix: string;
  art: string;
}

export const WORD_CARDS: EarlyWordCard[] = [
  {
    id: 'cow',
    word: 'cow',
    category: 'animal',
    say: 'Look! A cow. The cow says moo!',
    ask: 'Where is the cow? Tap the cow!',
    praise: 'Yes! Cow! Moo, moo!',
    art: 'one friendly black-and-white cow standing in bright green grass, smiling'
  },
  {
    id: 'cat',
    word: 'cat',
    category: 'animal',
    say: 'A cat! The cat is soft and says meow.',
    ask: 'Can you tap the cat?',
    praise: 'Meow! You found the cat!',
    art: 'one soft orange cat sitting with its tail curled, smiling'
  },
  {
    id: 'dog',
    word: 'dog',
    category: 'animal',
    say: 'A dog! The dog wags its tail. Woof woof!',
    ask: 'Where is the dog? Tap the dog!',
    praise: 'Woof woof! That is the dog!',
    art: 'one happy brown puppy wagging its tail'
  },
  {
    id: 'bird',
    word: 'bird',
    category: 'animal',
    say: 'A little bird! The bird can fly and sing.',
    ask: 'Can you tap the bird?',
    praise: 'Tweet tweet! You found the bird!',
    art: 'one small red bird perched on a green branch, singing'
  },
  {
    id: 'apple',
    word: 'apple',
    category: 'food',
    say: 'An apple! It is red and yummy.',
    ask: 'Where is the apple? Tap the apple!',
    praise: 'Crunch! You found the apple!',
    art: 'one shiny red apple on a small plate'
  },
  {
    id: 'banana',
    word: 'banana',
    category: 'food',
    say: 'A banana! It is yellow and sweet.',
    ask: 'Can you tap the banana?',
    praise: 'Yum yum! That is the banana!',
    art: 'one bright yellow banana on a small plate'
  },
  {
    id: 'milk',
    word: 'milk',
    category: 'food',
    say: 'A glass of milk! Milk helps you grow big.',
    ask: 'Where is the milk? Tap the milk!',
    praise: 'You found the milk!',
    art: 'one glass of white milk on a cozy table'
  },
  {
    id: 'bread',
    word: 'bread',
    category: 'food',
    say: 'Fresh bread! It smells so warm.',
    ask: 'Can you tap the bread?',
    praise: 'You found the bread!',
    art: 'one warm golden loaf of bread on a small plate'
  },
  {
    id: 'bus',
    word: 'bus',
    category: 'vehicle',
    say: 'A big bus! The bus goes beep beep.',
    ask: 'Where is the bus? Tap the bus!',
    praise: 'Beep beep! You found the bus!',
    art: 'one cheerful yellow bus on a sunny street'
  },
  {
    id: 'car',
    word: 'car',
    category: 'vehicle',
    say: 'A little car! The car goes vroom.',
    ask: 'Can you tap the car?',
    praise: 'Vroom! That is the car!',
    art: 'one small red car with a smiling face'
  },
  {
    id: 'ball',
    word: 'ball',
    category: 'world',
    say: 'A ball! You can bounce it and throw it.',
    ask: 'Where is the ball? Tap the ball!',
    praise: 'Boing boing! You found the ball!',
    art: 'one big red-and-yellow striped ball on the grass'
  },
  {
    id: 'sun',
    word: 'sun',
    category: 'world',
    say: 'The sun! It shines bright and keeps us warm.',
    ask: 'Can you tap the sun?',
    praise: 'You found the sun!',
    art: 'one smiling golden sun in a bright blue sky'
  }
];

export const VIGNETTES: EarlyVignette[] = [
  {
    id: 'help-blocks',
    title: 'The block tower',
    sceneLines: [
      'Buddy is building a tall tower of blocks.',
      'Oh no — it is so tall, it is hard!',
      'His friend comes over and helps. Now the tower is SO tall!'
    ],
    question: 'Was that kind?',
    kindPraise: 'Yes! Helping is kind. You have a kind heart!',
    gentleFix: 'Look — his friend is helping with the blocks. Helping is kind!',
    art: 'two cute friends building a tall tower of colorful blocks together, one handing a block to the other'
  },
  {
    id: 'help-apple',
    title: 'The dropped apple',
    sceneLines: [
      'Meethi is carrying a shiny apple.',
      'Oops! The apple falls down. Oh no!',
      'Her friend picks it up and gives it back. Thank you, friend!'
    ],
    question: 'Was that kind?',
    kindPraise: 'Yes! Helping a friend is kind. Well noticed!',
    gentleFix: 'Look — her friend picked the apple up and gave it back. That is kind!',
    art: 'one cute cat friend handing a shiny red apple back to a small kitten on a sunny path'
  },
  {
    id: 'share-umbrella',
    title: 'The big umbrella',
    sceneLines: [
      'It starts to rain — drip, drop, drip!',
      'Rami has a big umbrella.',
      'He shares it with his friend. Now they both stay dry!'
    ],
    question: 'Was that kind?',
    kindPraise: 'Yes! Sharing is kind. You are so thoughtful!',
    gentleFix: 'Look — he is sharing his umbrella so his friend stays dry. Sharing is kind!',
    art: 'two cute friends standing happily under one big red umbrella while soft rain falls'
  }
];

/** Simple stable string hash — deck rotation only, not security. */
function hashId(id: string): number {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0;
  return h;
}

/** Deterministic PRNG (mulberry32) so quiz shuffles are reproducible. */
function mulberry(a: number): () => number {
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = Math.imul(t + (t >>> 7), t | 61) ^ t;
    return ((t ^ (t >>> 1)) >>> 0) / 4294967296;
  };
}

function shuffled<T>(items: T[], rnd: () => number): T[] {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [out[i], out[j]] = [out[j] as T, out[i] as T];
  }
  return out;
}

/** What this child has already met, derived from the append-only audit
 *  log — the audit IS the spaced-repetition memory (no extra table). */
export interface EarlyHistory {
  /** Cards the child has met (word-met tap or quiz round). */
  seen: string[];
  /** Cards whose LAST quiz answer was wrong — they come back next run. */
  missed: string[];
}

export interface EarlyQuizOption {
  id: string;
  word: string;
  artUrl: string;
}

/** One "Can you find the …?" round: three pictures, tap the target. */
export interface EarlyQuizRound {
  targetId: string;
  targetWord: string;
  praise: string;
  options: EarlyQuizOption[];
}

export interface EarlyDeck {
  words: EarlyWordCard[];
  vignette: EarlyVignette;
  quiz: EarlyQuizRound[];
}

/**
 * This run's deck: 5 word cards + 1 kindness vignette + a 3-round picture
 * quiz, shaped by the child's own history:
 *
 *  1. REVIEW first — words missed in the last quiz return (spacing effect);
 *  2. then FRESH words the child has never met (novelty preference keeps
 *     every run new);
 *  3. familiar words fill any leftover slots once the catalog is exhausted.
 *
 * `run` is this child's session count (from the audit log). The base
 * rotation slides by one deck-length per run and the vignette/quiz seeds
 * follow it, so consecutive runs on the SAME day still draw different
 * words, a different vignette and different quiz distractors — repetition
 * within a day is habituation, and habituation kills attention (Fantz).
 */
export function buildDeck(
  childId: string,
  history: EarlyHistory = { seen: [], missed: [] },
  at = new Date(),
  run = 0
): EarlyDeck {
  const day = Math.floor(at.getTime() / 86_400_000);
  const h = hashId(childId);
  const offset = h + day + run * 5;
  const rotation: EarlyWordCard[] = [];
  for (let i = 0; i < WORD_CARDS.length; i++) {
    rotation.push(WORD_CARDS[(offset + i) % WORD_CARDS.length] as EarlyWordCard);
  }

  const seen = new Set(history.seen);
  const missedSet = new Set(history.missed);
  const review = rotation.filter((c) => missedSet.has(c.id)).slice(0, 2);
  const fresh = rotation.filter((c) => !seen.has(c.id) && !missedSet.has(c.id));
  const familiar = rotation.filter((c) => seen.has(c.id) && !missedSet.has(c.id));
  const words = [...review, ...fresh, ...familiar].slice(0, 5);

  const vignette = VIGNETTES[(day + h + run) % VIGNETTES.length] as EarlyVignette;

  // Quiz: three rounds. Review words are asked first — they need the
  // retrieval practice most. Options are the target plus two of this
  // run's other words, shuffled deterministically per child/day/run/round.
  const targets = words.slice(0, 3);
  const quiz: EarlyQuizRound[] = targets.map((target, round) => {
    const rnd = mulberry(h + day * 7 + run * 13 + round * 101);
    const others = shuffled(words.filter((c) => c.id !== target.id), rnd).slice(0, 2);
    const options = shuffled([target, ...others], rnd).map((c) => ({
      id: c.id,
      word: c.word,
      artUrl: `/api/early/art/word-${c.id}`
    }));
    return { targetId: target.id, targetWord: target.word, praise: target.praise, options };
  });

  return { words, vignette, quiz };
}

/** Every art asset id this track can serve (word-* and vig-*). */
export const EARLY_ART_HINTS: Record<string, string> = Object.fromEntries([
  ...WORD_CARDS.map((c) => [`word-${c.id}`, c.art] as const),
  ...VIGNETTES.map((v) => [`vig-${v.id}`, v.art] as const)
]);
