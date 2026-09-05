/**
 * Pictograms — a real picture for a curriculum word, with no vendor call.
 *
 * Why this exists: the offline/mock illustration path drew the SAME abstract
 * arrangement of shapes for every prompt. An apple, a cat and a bus all came
 * out as the identical circle-and-rectangle, which to a child (and to anyone
 * watching a demo) is indistinguishable from a broken image. Worse, it quietly
 * broke the pedagogy: the whole point of pairing a picture with a decodable
 * word is that the picture SHOWS the referent. A picture that shows nothing
 * teaches nothing.
 *
 * So the zero-key path now draws the actual thing. Emoji are used as the
 * glyph source because they are the only pictorial asset guaranteed to be
 * present on every device without shipping (or fetching) an image library —
 * which keeps the CSP at 'self' and the offline promise intact.
 *
 * Words with no sensible pictogram (adjectives like "big", glue verbs like
 * "get") fall back to a deterministic scene whose palette and composition are
 * derived from the word itself, so different words still look different.
 */

/**
 * Curriculum word -> pictogram.
 *
 * Keys cover the two vocabularies that can actually reach the art routes: the
 * phonics scope's `picturableWords()` (which bounds story and lesson art) and
 * the First Words catalog's twelve picture cards. A key outside both is dead
 * weight nothing can ever request, and usually a typo — `pictogram.test.ts`
 * fails on one. Only concrete referents appear here; everything else falls
 * through to a deterministic scene.
 */
export const PICTOGRAMS: Record<string, string> = {
  // animals
  ant: '🐜', bird: '🐦', cat: '🐱', cow: '🐄', crab: '🦀', dog: '🐶', duck: '🦆',
  fox: '🦊', frog: '🐸', gnat: '🦟', goat: '🐐', hen: '🐔', lamb: '🐑',
  moth: '🦋', mouse: '🐭', wasp: '🐝', web: '🕸️',
  // food and drink
  apple: '🍎', banana: '🍌', bread: '🍞', corn: '🌽', flour: '🌾', gum: '🍬',
  jam: '🍓', milk: '🥛', nut: '🥜', plum: '🫐', soup: '🍲',
  // things around the house
  bag: '👜', ball: '⚽', bath: '🛁', bed: '🛏️', bell: '🔔', bench: '🪑',
  box: '📦', brick: '🧱', comb: '🪮', cot: '🛏️', cup: '☕',
  dish: '🍽️', drum: '🥁', fan: '🪭', flag: '🚩', fork: '🍴', gift: '🎁',
  glue: '🧴', lamp: '💡', lid: '🥫', map: '🗺️', mat: '🧶',
  mop: '🧽', mug: '☕', pan: '🍳', pin: '📌', quilt: '🛏️', rug: '🧶',
  sign: '🪧', soap: '🧼', sock: '🧦', stamp: '📮', tent: '⛺', tray: '🍽️',
  wig: '💇', zip: '🤐',
  // people and body
  ear: '👂', feet: '🦶', hair: '💇', hand: '✋', knee: '🦵', leg: '🦵',
  lip: '👄', man: '🧑', mouth: '👄', paw: '🐾', tail: '🐕', toe: '🦶',
  wrist: '⌚',
  // places and buildings
  den: '🏕️', dock: '⚓', farm: '🚜', house: '🏠', hut: '🛖', pond: '🏞️',
  road: '🛣️', shop: '🏪', street: '🏘️', town: '🏙️',
  // nature and weather
  day: '☀️', fern: '🌿', flower: '🌸', frost: '❄️', grass: '🌱', hay: '🌾',
  moon: '🌙', moss: '🍀', mud: '🟤', night: '🌙', rain: '🌧️', sand: '🏖️',
  snow: '🌨️', star: '⭐', storm: '⛈️', sun: '🌞', wind: '💨',
  // vehicles
  boat: '⛵', bus: '🚌', car: '🚗', ship: '🚢', sled: '🛷', train: '🚂',
  van: '🚐',
  // small objects and misc
  coin: '🪙', dam: '🏞️', fin: '🐟', fur: '🧸', knot: '🪢', lap: '🧑',
  picture: '🖼️', pit: '🕳️', ring: '💍', spot: '🔴', tin: '🥫', wax: '🕯️',
  // actions a picture can actually show
  chew: '😋', clap: '👏', float: '🎈', glow: '✨', grab: '🤲', grow: '🌱',
  growl: '😾', hear: '👂', hiss: '🐍', hug: '🤗', jog: '🏃', jump: '🤸',
  kneel: '🧎', knit: '🧶', play: '🧸', pour: '🫗', run: '🏃', sing: '🎤',
  sit: '🪑', skip: '🤸', slow: '🐢', spin: '🌀', stand: '🧍',
  stop: '🛑', swim: '🏊', swing: '🎠', think: '💭', wag: '🐕', wear: '👕',
  wish: '🌟',
  // feelings and qualities with a clear face
  glad: '😊', sad: '😢', fun: '🎉', dark: '🌑', hot: '🔥', warm: '☀️',
  wet: '💧', big: '🐘', small: '🐭', old: '🧓', new: '✨'
};

/** True when this word has a real pictogram rather than a generic scene. */
export function hasPictogram(word: string): boolean {
  return Object.hasOwn(PICTOGRAMS, word.toLowerCase());
}

export interface Pictogram {
  /** The glyph to draw large and centred. */
  glyph: string;
  /** The curriculum word it depicts, when one was found. */
  word: string | null;
  /** Background / ground / accent, derived from the subject so two different
   *  words never render as the same picture even without a pictogram. */
  palette: { sky: string; ground: string; accent: string };
}

/**
 * Resolve the subject of an illustration request.
 *
 * Two paths, in order:
 *
 *  1. An exact word ("apple"). Callers that know the subject — the lesson word
 *    art, the early cards — pass it directly, and this is the only fully
 *    reliable case.
 *  2. A scene line ("Ayesha taps a mat in the sun"), where the subject has to
 *    be recovered from the prose. The FIRST concrete word wins, not the last:
 *    a hint is followed by boilerplate the caller appended (the house art
 *    direction says "warm", "small", "picture-book"), and matching from the
 *    end would resolve every single image to whichever concrete word happens
 *    to close that block — which is exactly the all-pictures-identical bug
 *    this module exists to fix. Taking the first match keeps the subject
 *    inside the caller's own sentence.
 */
export function pictogramFor(text: string): Pictogram {
  const exact = text.trim().toLowerCase();
  if (Object.hasOwn(PICTOGRAMS, exact)) {
    return { glyph: PICTOGRAMS[exact]!, word: exact, palette: paletteFor(exact) };
  }

  const tokens = exact.match(/[a-z']+/g) ?? [];
  const word = tokens.find((token) => Object.hasOwn(PICTOGRAMS, token)) ?? null;
  const glyph = word === null ? sceneGlyph(text) : PICTOGRAMS[word]!;
  return { glyph, word, palette: paletteFor(word ?? text) };
}

/**
 * A deterministic fallback glyph for a hint with no known subject.
 *
 * Never a fixed default: an unmapped word must still look different from every
 * other unmapped word, or we are back to "every picture is the same picture".
 */
const SCENE_GLYPHS = ['🌈', '🏞️', '🌻', '🪁', '🧺', '🕯️', '🌳', '🍃', '🎈', '🪺'];

function sceneGlyph(seed: string): string {
  return SCENE_GLYPHS[hash(seed) % SCENE_GLYPHS.length]!;
}

/**
 * The house palette, rotated deterministically by subject.
 *
 * Same input always gives the same picture (the on-disk art cache and the
 * offline path both depend on that), but different subjects get visibly
 * different colour.
 */
const PALETTES = [
  { sky: '#fdf6e3', ground: '#8ab17d', accent: '#e76f51' },
  { sky: '#eef6f6', ground: '#2a9d8f', accent: '#f4a259' },
  { sky: '#fff4e6', ground: '#f4a259', accent: '#264653' },
  { sky: '#f3f0ff', ground: '#9b8bd4', accent: '#e9c46a' },
  { sky: '#fdeef2', ground: '#e07a8b', accent: '#2a9d8f' }
];

export function paletteFor(seed: string): Pictogram['palette'] {
  return PALETTES[hash(seed) % PALETTES.length]!;
}

/** FNV-1a. Small, stable across runs and platforms — a Math.random() here
 *  would break the on-disk art cache and the offline promise. */
function hash(text: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i += 1) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return Math.abs(h);
}
