/**
 * The phonics-song script — deterministic, from data, no model involved.
 *
 * A personalized video is the one artefact a parent will forward to family,
 * so it is also the one artefact that must never be wrong. That rules out
 * asking a language model what to sing: a single non-decodable word, or a
 * mispronounced sound, in something a parent shares is worse than no video.
 *
 * So the script is compiled the way a lesson is — from the phonics scope and
 * this child's own legal lexicon. Given the same learner model and world seed
 * this function returns the same scenes forever, which means it can be
 * unit-tested, diffed and cached. The vendors are asked only to READ the lines
 * aloud and DRAW the words; they are never asked what the lines are.
 */
import type { LearnerModel, WorldSeed } from '../types.js';
import type { LegalLexicon } from '../pedagogy/lexicon.js';
import { carriersFor } from '../pedagogy/lexicon.js';
import { graphemesUpTo, phonicsScope } from '../data/index.js';
import { hasPictogram, pictogramFor } from '../pedagogy/pictogram.js';
import { parseGraphemes } from '../pedagogy/graphemes.js';

/** Script contract version, stamped into provenance like story art. */
export const VIDEO_SCRIPT_VERSION = 'v1';

/**
 * How to SAY a sound so a text-to-speech voice pronounces the phoneme rather
 * than the letter name.
 *
 * "/s/" is read aloud as "slash ess slash" and a bare "s" as "ess" — both
 * teach the wrong thing. Stretching the grapheme ("sss") is what a phonics
 * teacher actually does, and it is what a TTS voice renders correctly.
 *
 * Stops cannot be stretched — there is no long /t/ — so they get a repetition
 * instead. The table is explicit rather than derived on purpose: a wrong
 * pronunciation here teaches a child an error, and a rule with exceptions
 * would hide which sounds are the exceptions.
 */
const SOUND_SPELLING: Record<string, string> = {
  s: 'sss',
  a: 'aaa',
  t: 't-t-t',
  p: 'p-p-p',
  i: 'iii',
  n: 'nnn',
  m: 'mmm',
  d: 'd-d-d',
  g: 'g-g-g',
  o: 'ooo',
  c: 'k-k-k',
  k: 'k-k-k',
  e: 'eh-eh-eh',
  u: 'uh-uh-uh',
  r: 'rrr',
  h: 'h-h-h',
  b: 'b-b-b',
  f: 'fff',
  l: 'lll',
  j: 'j-j-j',
  v: 'vvv',
  w: 'wuh-wuh',
  y: 'yuh-yuh',
  z: 'zzz',
  x: 'ks-ks',
  qu: 'kwuh',
  sh: 'shhh',
  ch: 'ch-ch-ch',
  th: 'thhh',
  ng: 'nnng',
  nk: 'nnk',
  ai: 'ay',
  ay: 'ay',
  ee: 'eee',
  ea: 'eee',
  igh: 'eye',
  ie: 'eye',
  oa: 'oh',
  oe: 'oh',
  oo: 'ooo',
  ue: 'yoo',
  ew: 'yoo',
  ar: 'aar',
  or: 'or',
  ur: 'ur',
  ir: 'ur',
  er: 'uh',
  ow: 'ow',
  ou: 'ow',
  oi: 'oy',
  oy: 'oy',
  air: 'air',
  ear: 'eer',
  ure: 'yure',
  aw: 'aw',
  au: 'aw',

  // Doubled letters spell the SAME sound as the single letter — "ff" is not a
  // longer /f/, it is /f/ with a spelling rule attached. Saying them any
  // differently would teach a distinction that does not exist.
  ck: 'k-k-k',
  ff: 'fff',
  ll: 'lll',
  ss: 'sss',
  zz: 'zzz',

  // Silent-letter graphemes (level 8): two letters, one sound, and the first
  // letter is not pronounced at all. "kn" is simply /n/.
  kn: 'nnn',
  wr: 'rrr',
  mb: 'mmm',
  gn: 'nnn'
};

/**
 * Adjacent consonants (level 7) — the graphemes that are NOT single sounds.
 *
 * These belong in no pronunciation table, because there is no such thing as
 * the sound /st/. "st" is /s/ and /t/ said quickly together, and the whole
 * point of teaching adjacent consonants is that the child blends two sounds
 * she already knows rather than memorising a new one. So the spoken form is
 * composed from the parts, which also means a blend added to the scope later
 * is handled without touching this file.
 *
 * The coverage test is what surfaced these: they were silently falling back
 * to "ststst", which would have taught a child a sound that does not exist.
 */
const BLENDS = new Set([
  'bl', 'cl', 'fl', 'gl', 'pl', 'sl',
  'br', 'cr', 'dr', 'fr', 'gr', 'tr',
  'st', 'sk', 'sp', 'sn', 'sw',
  'mp', 'nd', 'nt', 'ft', 'lk'
]);

/**
 * How a sound should be spoken aloud.
 *
 * A blend is composed from its parts rather than looked up, because that is
 * what it IS. Anything else falls back to a stretched letter, which is only
 * ever right for a single letter — see hasSoundSpelling.
 */
export function soundSpelling(grapheme: string): string {
  const listed = SOUND_SPELLING[grapheme];
  if (listed !== undefined) return listed;
  if (BLENDS.has(grapheme)) {
    return Array.from(grapheme)
      .map((letter) => SOUND_SPELLING[letter] ?? letter)
      .join('. ');
  }
  return grapheme.repeat(3);
}

/**
 * Can this grapheme be pronounced correctly, by table or by composition?
 *
 * The fallback is indistinguishable from a real entry for single letters —
 * soundSpelling('s') returns 'sss' either way — so a test cannot detect a
 * missing entry by comparing strings. It matters for everything longer: an
 * absent 'igh' would have the voice say "ighighigh" to a child. This is the
 * check that catches a grapheme added to the scope but not handled here.
 */
export function hasSoundSpelling(grapheme: string): boolean {
  return Object.hasOwn(SOUND_SPELLING, grapheme) || BLENDS.has(grapheme);
}

export type VideoSceneKind = 'intro' | 'sound' | 'word' | 'blend' | 'review' | 'recap' | 'outro';

export interface VideoScene {
  /** Stable id — also the cache key for this scene's narration audio. */
  id: string;
  kind: VideoSceneKind;
  /** The ONLY text that becomes speech. Everything spoken is in here. */
  say: string;
  /** The large on-screen text: a letter, a word, or a short line. */
  display: string;
  /** The sound this scene is about, when it is about one. */
  grapheme?: string;
  /** The word on screen, when there is one. */
  word?: string;
  /** That word split into graphemes — the blend scene animates these. */
  parts?: string[];
  /** Plain subject for the illustrator ("a cat"), when this scene has art. */
  art?: string;
  /** Instant stand-in while the drawing loads, or if it never arrives. */
  emoji?: string;
}

export interface VideoScript {
  version: string;
  childName: string;
  /** The sound this video teaches. */
  targetGrapheme: string;
  /** Sounds it revisits. */
  reviewGraphemes: string[];
  scenes: VideoScene[];
  /** Every distinct word shown — the art warm list. */
  words: string[];
}

export interface PhonicsScriptInput {
  model: LearnerModel;
  worldSeed: WorldSeed;
  lexicon: LegalLexicon;
  /** Sounds due for review, already ordered by the spaced-repetition table. */
  reviewGraphemes?: string[];
}

/**
 * Words shown for the target sound. Three is the ceiling on purpose: the
 * reference video teaches ONE letter with TWO words, and a song that lists
 * six words is a list, not a song.
 */
const TARGET_WORDS = 3;
/** One word per revisited sound — a reminder, not a re-teach. */
const REVIEW_SOUNDS = 2;

/**
 * How to introduce a word for a sound, given where the sound actually falls.
 *
 * "X is for Y" is only true when the sound STARTS the word — that is what the
 * frame means, and every alphabet song uses it that way. Applied blindly it
 * produced "nnk is for pink", which is wrong: no English word begins with
 * /nk/, it is a final blend. A child told "nk is for pink" learns to listen at
 * the wrong end of the word.
 *
 * So a non-initial sound gets the frame that is true of it instead: you can
 * HEAR it in the word. This was invisible to every test and obvious the moment
 * the script was read aloud.
 */
function introduceLine(sound: string, word: string, grapheme: string): string {
  if (word.startsWith(grapheme)) return `${sound} is for ${word}. ${word}!`;
  return `You can hear ${sound} in ${word}. ${word}!`;
}

/**
 * The words to show for a sound, best first.
 *
 * Three preferences, in order:
 *
 *  1. The sound starts the word. That is the frame a phonics song wants, and
 *     it puts the sound where a child listening for it will find it.
 *  2. The word can be drawn. A word scene is a picture with a caption, so a
 *     function word is a bad choice however legal it is — the review slots
 *     came out as "as" and "an", which are undrawable and made the line read
 *     "sss is for as".
 *  3. Shorter. A two-grapheme word leaves the sound audible in isolation
 *     where a five-grapheme one buries it.
 *
 * These are preferences, not filters: a sound with no initial, drawable
 * carrier still gets its best available word rather than being dropped.
 * Ties break alphabetically, so the choice stays reproducible.
 */
function pickWords(grapheme: string, lexicon: LegalLexicon, taken: Set<string>, count: number): string[] {
  const rank = (w: string): number => (w.startsWith(grapheme) ? 0 : 2) + (hasPictogram(w) ? 0 : 1);
  return carriersFor(grapheme, lexicon)
    .filter((w) => !taken.has(w) && w.length >= 2)
    .sort((a, b) => rank(a) - rank(b) || a.length - b.length || a.localeCompare(b))
    .slice(0, count);
}

/**
 * The sound this video teaches: the most recently taught one, since that is
 * what the child is working on now. Falls back to the start of the scope.
 */
function targetFor(model: LearnerModel): string {
  const taught = model.taughtGraphemes;
  return taught[taught.length - 1] ?? graphemesUpTo(1)[0] ?? 's';
}

function levelName(grapheme: string): string {
  return phonicsScope.levels.find((l) => l.graphemes.includes(grapheme))?.name ?? 'sounds';
}

/**
 * Compile the song for this child, right now.
 *
 * Every word is drawn from `lexicon`, which the caller built from this child's
 * own taught set — so a word she cannot decode can never appear, and no
 * separate validation pass is needed to know that.
 */
export function buildPhonicsScript(input: PhonicsScriptInput): VideoScript {
  const { model, worldSeed, lexicon } = input;
  const name = worldSeed.heroName;
  const target = targetFor(model);
  const sound = soundSpelling(target);

  const taken = new Set<string>();
  const targetWords = pickWords(target, lexicon, taken, TARGET_WORDS);
  for (const w of targetWords) taken.add(w);

  // Only revisit sounds that still have a legal word to show. A review slot
  // with nothing to put in it became an empty scene; there is no graceful way
  // to sing about a sound with no word, so the slot is dropped instead.
  const reviews: { grapheme: string; word: string }[] = [];
  for (const g of input.reviewGraphemes ?? []) {
    if (g === target || reviews.length >= REVIEW_SOUNDS) continue;
    const [word] = pickWords(g, lexicon, taken, 1);
    if (word === undefined) continue;
    taken.add(word);
    reviews.push({ grapheme: g, word });
  }

  const scenes: VideoScene[] = [];

  scenes.push({
    id: 'intro',
    kind: 'intro',
    say: `This is ${name}'s sound song. Today we sing about the sound ${sound}.`,
    display: `${name}'s Sound Song`
  });

  scenes.push({
    id: `sound-${target}`,
    kind: 'sound',
    say: `${sound}. ${sound}. Say it with me, ${name}. ${sound}.`,
    display: target,
    grapheme: target
  });

  for (const word of targetWords) {
    scenes.push({
      id: `word-${word}`,
      kind: 'word',
      say: introduceLine(sound, word, target),
      display: word,
      grapheme: target,
      word,
      art: `a ${word}`,
      emoji: pictogramFor(word).glyph
    });
  }

  // One blend, on the first word only. Segmenting every word turns a song
  // into a drill; doing it once models the move and leaves the rest singable.
  const first = targetWords[0];
  if (first !== undefined) {
    // parseGraphemes, not segmentationOf: that one returns display forms
    // ("/s/", "/a/") for the reading screen, and those would be read aloud by
    // the TTS voice as "slash ess slash". The blend needs the raw graphemes so
    // each one can go through soundSpelling and be SAID.
    const parts = parseGraphemes(first, model.taughtGraphemes);
    if (parts !== null) {
      scenes.push({
        id: `blend-${first}`,
        kind: 'blend',
        say: `${parts.map((p) => soundSpelling(p)).join('. ')}. Put it together. ${first}!`,
        display: first,
        grapheme: target,
        word: first,
        parts
      });
    }
  }

  for (const { grapheme, word } of reviews) {
    scenes.push({
      id: `review-${grapheme}`,
      kind: 'review',
      say: `You know this one too. ${introduceLine(soundSpelling(grapheme), word, grapheme)}`,
      display: word,
      grapheme,
      word,
      art: `a ${word}`,
      emoji: pictogramFor(word).glyph
    });
  }

  if (targetWords.length > 0) {
    scenes.push({
      id: 'recap',
      kind: 'recap',
      say: `${sound} for ${targetWords.join(', ')}. That is the sound ${sound}.`,
      display: targetWords.join(' · '),
      grapheme: target
    });
  }

  scenes.push({
    id: 'outro',
    kind: 'outro',
    say: `You did it, ${name}. You know the sound ${sound}. See you in ${worldSeed.city}.`,
    display: `Well done, ${name}!`
  });

  return {
    version: VIDEO_SCRIPT_VERSION,
    childName: name,
    targetGrapheme: target,
    reviewGraphemes: reviews.map((r) => r.grapheme),
    scenes,
    words: [...taken]
  };
}

/** Human-readable label for the parent's list of videos. */
export function scriptTitle(script: VideoScript): string {
  return `The sound ${script.targetGrapheme} — ${levelName(script.targetGrapheme)}`;
}
