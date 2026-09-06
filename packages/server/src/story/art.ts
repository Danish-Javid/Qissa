/**
 * Story art — one place that decides where a page picture lives, how it is
 * produced, and whether a story is ready to play.
 *
 * WHY THIS EXISTS. Art used to be generated lazily, per page, by the client's
 * own <img> request. Measured on the configured Azure FLUX.2 endpoint, one
 * illustration takes ~13s. Story Time is eight pages, so even warmed
 * three-wide the last picture lands ~40s after the child taps in — while the
 * narration is already running. That is the "late pictures" problem: not a
 * slow model, a pipeline that starts drawing after the curtain goes up.
 *
 * So the server warms the WHOLE book concurrently the moment a story exists,
 * and the player waits for a playback-ready package instead of racing it.
 *
 * The in-flight map is shared deliberately: the warmer and the live <img>
 * request must join the SAME promise, or every page would be paid for twice.
 */
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { ART_CACHE_VERSION, stylePrompt } from '../providers/art-style.js';
import type { IImageGenerator, ImageResult } from '../providers/interfaces.js';

/** On-disk illustration cache — images persist across rebuilds and are
 *  regenerated once per story page, never per request (NFR-4.4 cost). */
export const illustrationDir = path.resolve(process.cwd(), 'data', 'illustrations');

/**
 * In-flight generation dedup, keyed by cache path.
 *
 * Shared by the warmer and the illustration route so a picture is generated
 * exactly once no matter how many callers want it at the same moment.
 */
const pendingImages = new Map<string, Promise<ImageResult>>();

/**
 * How many pages we draw at once.
 *
 * Cost is not the constraint here; the vendor's tolerance is. Four keeps a
 * whole eight-page book inside two waves (~26s at the measured ~13s/image)
 * without hammering the endpoint hard enough to invite throttling.
 */
const ART_CONCURRENCY = 4;

export interface PageArtKey {
  storyId: string;
  pageIndex: number;
  /** Low-bandwidth mode draws the deterministic house SVG instead. */
  lowBandwidth: boolean;
  /** Mock provider mode also yields SVG. */
  mock: boolean;
}

/** Where one page's picture is cached. The suffix keeps a low-bandwidth
 *  placeholder out of the real image's slot, so toggling the setting back
 *  does not serve the wrong one. */
export function pageArtPath(key: PageArtKey): string {
  const ext = key.lowBandwidth || key.mock ? 'svg' : 'png';
  const suffix = key.lowBandwidth ? '-lite' : '';
  return path.join(illustrationDir, `${ART_CACHE_VERSION}-${key.storyId}-${key.pageIndex}${suffix}.${ext}`);
}

/** Is this page's picture already on disk? */
export async function pageArtCached(key: PageArtKey): Promise<boolean> {
  try {
    await readFile(pageArtPath(key));
    return true;
  } catch {
    return false;
  }
}

export interface EnsurePageArtInput extends PageArtKey {
  images: IImageGenerator;
  /** The scene description for the illustrator. */
  hint: string;
  /** The plain subject, for the offline pictogram renderer. */
  subject: string;
}

/**
 * The bytes for one page, generating them if needed.
 *
 * Returns the cached file when present, otherwise generates (joining any
 * in-flight generation for the same page) and persists. Throws on vendor
 * failure — every caller treats that as "no picture", never as an error the
 * child sees.
 */
export async function ensurePageArt(
  input: EnsurePageArtInput
): Promise<{ image: Uint8Array; mimeType: 'image/svg+xml' | 'image/png' }> {
  const filePath = pageArtPath(input);

  try {
    const cached = await readFile(filePath);
    const ext = path.extname(filePath);
    return { image: new Uint8Array(cached), mimeType: ext === '.svg' ? 'image/svg+xml' : 'image/png' };
  } catch {
    // Not cached — generate below.
  }

  let pending = pendingImages.get(filePath);
  if (pending === undefined) {
    // The scene hint is merged with the house art direction so every provider
    // draws in the same warm world.
    pending = input.images.generateImage(stylePrompt(input.hint), input.subject);
    pendingImages.set(filePath, pending);
    pending.catch(() => undefined).finally(() => pendingImages.delete(filePath));
  }
  const result = await pending;
  await writeFile(filePath, result.image).catch(() => undefined);
  return { image: result.image, mimeType: result.mimeType };
}

export interface StoryArtPage {
  hint: string;
  subject: string;
}

/**
 * How much of a story's art is on disk. The player polls this so it can hold
 * the curtain until the book is actually playable.
 */
export async function storyArtStatus(
  storyId: string,
  pageCount: number,
  opts: { lowBandwidth: boolean; mock: boolean }
): Promise<{ ready: number; total: number }> {
  const flags = { storyId, lowBandwidth: opts.lowBandwidth, mock: opts.mock };
  const results = await Promise.all(
    Array.from({ length: pageCount }, (_, pageIndex) => pageArtCached({ ...flags, pageIndex }))
  );
  return { ready: results.filter(Boolean).length, total: pageCount };
}

/**
 * Draw every page of a story, ART_CONCURRENCY at a time.
 *
 * Fire-and-forget by design: the caller returns the story immediately and the
 * book fills in behind it. Individual failures are swallowed — a missing
 * picture degrades that page to text-only and must never fail the story.
 * Resolves when every page has been attempted.
 */
export async function warmStoryArt(input: {
  storyId: string;
  pages: StoryArtPage[];
  images: IImageGenerator;
  lowBandwidth: boolean;
  mock: boolean;
}): Promise<void> {
  await mkdir(illustrationDir, { recursive: true });

  const queue = input.pages.map((page, pageIndex) => ({ ...page, pageIndex }));
  const worker = async (): Promise<void> => {
    for (;;) {
      const next = queue.shift();
      if (next === undefined) return;
      await ensurePageArt({
        storyId: input.storyId,
        pageIndex: next.pageIndex,
        lowBandwidth: input.lowBandwidth,
        mock: input.mock,
        images: input.images,
        hint: next.hint,
        subject: next.subject
      }).catch(() => undefined);
    }
  };

  await Promise.all(Array.from({ length: Math.min(ART_CONCURRENCY, queue.length) }, () => worker()));
}
