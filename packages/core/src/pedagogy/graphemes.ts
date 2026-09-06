/**
 * Grapheme parsing — turning a written word into its taught sound units.
 *
 * This is the foundation under the decodability validator and the miscue
 * logger: a miscue on "ship" must be logged against the grapheme `sh`,
 * never against the whole word (FR-C.5).
 *
 * Algorithm: depth-first search with backtracking, preferring the LONGEST
 * matching grapheme first. Longest-first matters because "sh-i-p" is the
 * correct parse of "ship" once `sh` is taught, while "s-h-i-p" would be
 * wrong. Backtracking keeps it exact where greedy would fail (e.g. "duck"
 * must parse "ck" as one unit even though "c" alone is also taught).
 *
 * Curriculum gate (fail-closed): a singleton letter is never accepted where
 * it would START an unsplittable multi-letter grapheme from the full scope —
 * taught or not. Digraphs like `sh` are ONE sound; a child who has not been
 * taught `sh` cannot blend "s-h" into it, so "ship" must fail the gate at
 * level 3 even though s, h, i and p are all individually known. Level-7
 * blends (bl, st, nd…) are the exception: they are adjacent SEPARATE sounds,
 * so "ant" stays readable at level 1 despite `nt` being a level-7 unit.
 *
 * Split digraphs / magic-e ("make", "like", "hope") are NOT in the scope at
 * any level, so they are never taught and such words can never be decodable.
 * The parser enforces that rather than trusting content to avoid them: a
 * trailing standalone `e` is rejected outright (see isSilentFinalE).
 *
 * That used to be a documented limitation mitigated by "word banks avoid such
 * spellings" — which protects hand-authored content but NOT the generator,
 * and the generator is the entire reason the gate exists. "make" passed as
 * m-a-k-e at level 3, so a child taught only single letters could be asked to
 * sound out a word whose vowel she has never met.
 */
import phonicsScopeJson from '../data/phonics-scope.json' with { type: 'json' };

/** Maximum grapheme length in any curriculum we ship ("igh" = 3). */
const MAX_GRAPHEME_LENGTH = 3;

interface ScopeShape {
  levels: Array<{ level: number; graphemes: string[] }>;
}

/**
 * Adjacent-consonant blends (level 7) are multiple sounds, so they never
 * block a letter-by-letter parse ("ant" stays readable at level 1 despite
 * `nt` being a level-7 unit), and the ladder splits them into single letters
 * when segmenting ("hand" -> h-a-n-d).
 *
 * Built lazily at first use: this module must never evaluate the data barrel
 * at import time (import cycles between pedagogy and data leave module-level
 * bindings undefined).
 */
let blendCache: Set<string> | null = null;
function blendUnits(): Set<string> {
  if (!blendCache) {
    const scope = phonicsScopeJson as ScopeShape;
    blendCache = new Set(scope.levels.find((l) => l.level === 7)?.graphemes ?? []);
  }
  return blendCache;
}

/**
 * Units the ladder may split into single letters when segmenting: the blends,
 * plus `nk` — it is sounded as two phonemes (/n/ then /k/), so "bank" is
 * blended b-a-n-k and "sink" is s-i-n-k.
 */
let segmentSplitCache: Set<string> | null = null;
function segmentationSplittable(): Set<string> {
  if (!segmentSplitCache) {
    segmentSplitCache = new Set([...blendUnits(), 'nk']);
  }
  return segmentSplitCache;
}

/**
 * Every multi-letter grapheme in the full scope that represents ONE sound
 * (or a silent-letter pattern), PLUS `nk`: a parse may never split any of
 * these into letters. `nk` is two phonemes, but it is taught as one spelling
 * pattern at level 4, so "sink" and "sank" are held by the gate until then.
 */
let gateCache: Set<string> | null = null;
function gateUnsplittable(): Set<string> {
  if (!gateCache) {
    const scope = phonicsScopeJson as ScopeShape;
    gateCache = new Set(
      scope.levels.flatMap((l) => l.graphemes).filter((g) => g.length > 1 && !blendUnits().has(g))
    );
  }
  return gateCache;
}

/**
 * Would accepting a bare `e` here be the silent e of a split digraph?
 *
 * True when the `e` is the LAST letter of a word of three letters or more.
 * English has essentially no such word where a final lone `e` says short /e/;
 * it is the magic-e of a split digraph ("make", "like", "hope", "cute"),
 * which this curriculum never teaches — so the word is not decodable.
 *
 * Deliberately checked per-candidate rather than after a full parse, so
 * backtracking can still find a legitimate reading: "see" parses as s + `ee`,
 * "toe" as t + `oe`, "cue" as c + `ue`, "cure" as c + `ure`, because those
 * longer graphemes are tried first and consume the `e`. Only a word with no
 * such alternative — where the `e` can only stand alone — is rejected.
 *
 * Two-letter words ("me", "be", "he") are left alone: the `e` is the vowel,
 * not a magic-e, and they are taught as tricky words anyway.
 */
function isSilentFinalE(w: string, pos: number, len: number): boolean {
  return len === 1 && w[pos] === 'e' && pos === w.length - 1 && w.length >= 3;
}

/** Does the letter at `pos` start an unsplittable multi-letter grapheme? */
function startsUnsplittableUnit(w: string, pos: number): boolean {
  const units = gateUnsplittable();
  for (let len = 2; len <= MAX_GRAPHEME_LENGTH; len++) {
    if (units.has(w.slice(pos, pos + len))) return true;
  }
  return false;
}

/**
 * Parse a word into graphemes using only the taught set.
 * Returns the ordered grapheme list, or null when the word is not decodable
 * with what this child has been taught.
 */
export function parseGraphemes(word: string, taughtGraphemes: string[]): string[] | null {
  const w = word.toLowerCase().trim();
  if (w.length === 0) return null;

  const taught = new Set(taughtGraphemes.map((g) => g.toLowerCase()));
  const result: string[] = [];

  const search = (pos: number): boolean => {
    if (pos === w.length) return true;

    // Longest match first: try 3-letter graphemes, then 2, then singletons.
    const maxLen = Math.min(MAX_GRAPHEME_LENGTH, w.length - pos);
    for (let len = maxLen; len >= 1; len--) {
      const candidate = w.slice(pos, pos + len);
      // Curriculum gate: a single letter may not stand in for a digraph the
      // child has not been taught ("ship" must not sneak through as s-h-i-p).
      if (len === 1 && startsUnsplittableUnit(w, pos)) continue;
      // Nor may a trailing lone `e` stand in for a split digraph nobody has
      // been taught ("make" must not sneak through as m-a-k-e).
      if (isSilentFinalE(w, pos, len)) continue;
      if (taught.has(candidate)) {
        result.push(candidate);
        if (search(pos + len)) return true;
        result.pop(); // dead end — backtrack and try a shorter grapheme
      }
    }
    return false;
  };

  return search(0) ? [...result] : null;
}

/**
 * First sound of a word — used by the correction ladder's first hint rung
 * ("It starts with /b/…"). Returns the parsed first grapheme, falling back
 * to the first letter so the hint is never empty.
 */
export function firstGraphemeOf(word: string, taughtGraphemes: string[]): string {
  const parsed = parseGraphemes(word, taughtGraphemes);
  if (parsed && parsed.length > 0) return parsed[0] ?? word[0] ?? '';
  return word[0] ?? '';
}

/**
 * Segmentation of a word for the ladder's "put it together" rung, split into
 * the sounds a child actually blends. Blends and `nk` break into single
 * letters because they are multiple phonemes (bank -> b-a-n-k, sink ->
 * s-i-n-k); true digraphs stay whole (ship -> sh-i-p):
 * e.g. bank -> ["/b/", "/a/", "/n/", "/k/"], sink -> ["/s/", "/i/", "/n/", "/k/"].
 */
export function segmentationOf(word: string, taughtGraphemes: string[]): string[] {
  const parsed = parseGraphemes(word, taughtGraphemes);
  const units = parsed ?? Array.from(word.toLowerCase());
  const splittable = segmentationSplittable();
  return units.flatMap((u) => (splittable.has(u) ? Array.from(u) : [u])).map((u) => `/${u}/`);
}
