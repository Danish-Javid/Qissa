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
import { RateLimitError } from '../providers/interfaces.js';
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

/**
 * A GLOBAL ceiling on concurrent image generations, not a per-story one.
 *
 * Found by running the app: two stories warming at once put eight calls plus
 * two hero references against the endpoint, which answered with twenty HTTP
 * 429s. Per-story concurrency multiplies by the number of children reading —
 * exactly the wrong direction — so the limit belongs to the process.
 */
// Two, not four. Measured: at four the endpoint returned twenty 429s, and
// even at four with retries one page of eight still died throttled. FLUX.2
// [pro] on a shared Foundry resource simply does not take four at once.
// Eight pages two-wide is ~52s of background drawing, which the readiness
// gate absorbs — a slower warm that always finishes beats a fast one that
// loses a page.
const ART_GLOBAL_LIMIT = 2;
let inFlightGenerations = 0;
const waiting: (() => void)[] = [];

async function acquireSlot(): Promise<void> {
  if (inFlightGenerations < ART_GLOBAL_LIMIT) {
    inFlightGenerations += 1;
    return;
  }
  await new Promise<void>((resolve) => waiting.push(resolve));
  inFlightGenerations += 1;
}

function releaseSlot(): void {
  inFlightGenerations -= 1;
  waiting.shift()?.();
}

/** How many times a transient vendor failure is retried before we give up.
 *  Six, because throttling here is per-minute: a budget that expires in ten
 *  seconds cannot outlast it, which is exactly how a page was lost. */
const ART_RETRIES = 6;

/** Is this worth trying again? Throttling and vendor 5xx are transient by
 *  definition; a malformed prompt or a bad deployment name is not, and
 *  retrying those just burns time a child is waiting through. */
function isTransient(error: unknown): boolean {
  if (error instanceof RateLimitError) return true;
  const message = error instanceof Error ? error.message : String(error);
  return /\b(429|500|502|503|504)\b/.test(message) || /timed out|aborted|ECONNRESET|fetch failed/i.test(message);
}

/** Cap on a single wait, so a hostile Retry-After cannot park a page forever. */
const MAX_BACKOFF_MS = 30_000;

/**
 * How long to wait before trying again.
 *
 * The vendor's own Retry-After wins when it sends one — it knows when its
 * window resets and we are guessing. Otherwise exponential with jitter, so a
 * whole wave of throttled pages does not retry in lockstep and throttle
 * itself again.
 */
const backoff = (attempt: number, error: unknown): Promise<void> => {
  const advised = error instanceof RateLimitError ? error.retryAfterMs : undefined;
  const guessed = 2000 * 2 ** attempt * (0.75 + Math.random() * 0.5);
  return new Promise((resolve) => setTimeout(resolve, Math.min(advised ?? guessed, MAX_BACKOFF_MS)));
};

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
  /** Identity anchors — normally the child's hero reference. */
  references?: Uint8Array[];
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
    // draws in the same warm world. Retried on transient failure: the endpoint
    // answers 429 under load, and a swallowed 429 used to lose that page
    // permanently — readiness could then never reach total, so the player
    // waited out its whole cap and played with placeholders.
    pending = (async (): Promise<ImageResult> => {
      let lastError: unknown;
      for (let attempt = 0; attempt <= ART_RETRIES; attempt++) {
        await acquireSlot();
        try {
          return await input.images.generateImage(stylePrompt(input.hint), input.subject, {
            references: input.references
          });
        } catch (error) {
          lastError = error;
          if (!isTransient(error) || attempt === ART_RETRIES) throw error;
        } finally {
          releaseSlot();
        }
        // Backoff OUTSIDE the slot, so a waiting page can use it meanwhile.
        await backoff(attempt, lastError);
      }
      throw lastError instanceof Error ? lastError : new Error('image generation failed');
    })();
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
 * What the warmer managed to draw, and why anything failed.
 *
 * Returned rather than swallowed. The first version caught every page error
 * with `.catch(() => undefined)`, so when a page came back missing there was
 * nothing in the logs to say whether it was throttling, a content filter or a
 * bad deployment — the pipeline failed silently and the only symptom was a
 * readiness count that never reached total. A caller logs this.
 */
export interface WarmResult {
  drawn: number;
  total: number;
  failures: { pageIndex: number; error: string }[];
}

/**
 * The hero reference — one drawing of this child's character, kept forever.
 *
 * Every page used to be an independent text-to-image call, so the hero's face,
 * hair and clothes changed between page one and page two of the SAME story.
 * FLUX.2 accepts reference images, so we draw the character once and condition
 * every later page on it.
 *
 * Always on the ORIGINAL reference, never the previous page: chaining
 * page-to-page edits accumulates drift, so by page eight the child is looking
 * at someone else. One fixed anchor keeps every page equidistant from canon.
 *
 * Keyed by child, not by story — the point is that she is the same girl
 * tomorrow night, which is the whole premise of a persistent story world.
 */
export function heroReferencePath(childId: string): string {
  return path.join(illustrationDir, `${ART_CACHE_VERSION}-hero-${childId}.png`);
}

/** A character sheet prompt: the person alone, plainly lit, no scene. */
function heroPrompt(hero: { name: string; petName?: string; petKind?: string }): string {
  return stylePrompt(
    `a full-body character reference of ${hero.name}, a young child, standing facing forward with a warm friendly smile, ` +
      'plain soft background, clear simple clothing, the whole figure visible, no other characters, no scenery'
  );
}

export interface HeroReferenceInput {
  childId: string;
  heroName: string;
  images: IImageGenerator;
}

/**
 * The hero reference bytes, drawing them once if needed.
 *
 * Returns null rather than throwing when the provider cannot condition on
 * references, or when the drawing fails: a missing reference costs
 * consistency, and a story without pictures costs the session. Never trade
 * the second for the first.
 */
export async function ensureHeroReference(input: HeroReferenceInput): Promise<Uint8Array | null> {
  if (!input.images.supportsReferences) return null;
  const filePath = heroReferencePath(input.childId);

  try {
    return new Uint8Array(await readFile(filePath));
  } catch {
    // Not drawn yet.
  }

  let pending = pendingImages.get(filePath);
  if (pending === undefined) {
    pending = input.images.generateImage(heroPrompt({ name: input.heroName }), input.heroName);
    pendingImages.set(filePath, pending);
    pending.catch(() => undefined).finally(() => pendingImages.delete(filePath));
  }

  try {
    const result = await pending;
    await mkdir(illustrationDir, { recursive: true }).catch(() => undefined);
    await writeFile(filePath, result.image).catch(() => undefined);
    return result.image;
  } catch {
    return null;
  }
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
 * Draw every page of a story. Workers fan out per story, but the GLOBAL
 * semaphore is what actually bounds vendor concurrency, so two children
 * reading at once cannot double the load the endpoint sees.
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
  /** Identity anchor for every page. Omit for art with no recurring character. */
  hero?: { childId: string; heroName: string };
}): Promise<WarmResult> {
  await mkdir(illustrationDir, { recursive: true });

  // Draw the hero BEFORE the pages, and serially: the pages all condition on
  // it, so starting them first would race the anchor they need. It is drawn
  // once per child and cached forever, so this costs one image on the first
  // story and nothing after.
  const references =
    input.hero === undefined
      ? undefined
      : ((ref) => (ref === null ? undefined : [ref]))(
          await ensureHeroReference({ ...input.hero, images: input.images })
        );

  const queue = input.pages.map((page, pageIndex) => ({ ...page, pageIndex }));
  const failures: { pageIndex: number; error: string }[] = [];
  const worker = async (): Promise<void> => {
    for (;;) {
      const next = queue.shift();
      if (next === undefined) return;
      try {
        await ensurePageArt({
          storyId: input.storyId,
          pageIndex: next.pageIndex,
          lowBandwidth: input.lowBandwidth,
          mock: input.mock,
          images: input.images,
          hint: next.hint,
          subject: next.subject,
          references
        });
      } catch (error) {
        // A missing picture degrades that page to text-only and must never
        // fail the story — but it must not vanish either.
        failures.push({ pageIndex: next.pageIndex, error: error instanceof Error ? error.message : String(error) });
      }
    }
  };

  await Promise.all(Array.from({ length: Math.min(ART_CONCURRENCY, queue.length) }, () => worker()));
  return { drawn: input.pages.length - failures.length, total: input.pages.length, failures };
}
