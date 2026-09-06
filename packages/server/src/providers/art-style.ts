/**
 * Art direction — the single place that decides what Qissa art looks like.
 *
 * Grounded in what research says children aged 4–7 actually prefer and
 * attend to:
 *  - bright, highly saturated colors (color draws attention and carries
 *    emotion — Jiménez-Duarte 2026 systematic review on color in picture books);
 *  - cartoon-style characters with lively, exaggerated features — BIG
 *    EXPRESSIVE EYES especially (Hall 2025, via Shanahan's review of the
 *    picture-role literature; IU early-literacy review);
 *  - rounded, friendly shapes and warm, safe moods;
 *  - clear, uncluttered compositions showing ONE moment (apt pictures boost
 *    literal comprehension and inference — Pike, Barnes & Barron 2010 —
 *    while busy or mismatched art misleads children);
 *  - no letters in the art: preschoolers already think pictures "tell" the
 *    story (Ferreiro & Teberosky 1982); fake text competes with the real
 *    print we are teaching.
 *
 * Every illustration request is merged with this house style, so every
 * vendor output lands in the same kid-loved world.
 */
export const ART_DIRECTION = [
  "children's picture-book illustration for ages 4 to 7",
  'bright saturated colors with soft warm lighting',
  'rounded friendly shapes, cartoon style, characters with big expressive eyes and warm smiles',
  'playful whimsical details, cozy safe happy mood',
  'clean uncluttered composition showing one clear moment',
  'flat vector storybook art',
  'no words, no letters, no numbers, no text of any kind in the image'
].join(', ');

/** Merge a scene hint with the house style into one image-model prompt. */
export function stylePrompt(hint: string): string {
  return `${hint}. ${ART_DIRECTION}`;
}

/**
 * Cache-busting version for generated art.
 *
 * Every illustration is cached on disk and deliberately survives container
 * rebuilds, so changing how art is produced does NOT change what is served —
 * old files keep being returned forever. That is how the first pictogram fix
 * shipped while children were still shown the previous generator's identical
 * coloured blobs: the code was right and the cache was stale.
 *
 * Bump this whenever ART_DIRECTION, the pictogram table, or the placeholder
 * renderer changes in a way that should alter existing pictures. It is part of
 * every cache filename, so a bump retires the old files without anyone having
 * to remember to clear a volume on the server.
 */
export const ART_CACHE_VERSION = 'v3';
