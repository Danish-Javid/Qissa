/**
 * Story art warming.
 *
 * Two properties matter and neither is visible from a route test:
 *
 *  1. A page is drawn ONCE. The warmer and the client's <img> request race by
 *     design, so if they did not share one in-flight map every page of every
 *     story would be generated — and paid for — twice.
 *  2. Readiness is honest. StoryTimePlayer holds the curtain on this count,
 *     so an optimistic answer puts a child in front of a story whose pictures
 *     are still being drawn, which is the bug the warmer exists to fix.
 */
import { randomUUID } from 'node:crypto';
import { rm } from 'node:fs/promises';
import { afterAll, describe, expect, it, vi } from 'vitest';
import type { IImageGenerator, ImageOptions, ImageResult } from '../providers/interfaces.js';
import { ensureHeroReference, ensurePageArt, heroReferencePath, illustrationDir, storyArtStatus, warmStoryArt } from './art.js';

/** A generator that records every call and can be held open on demand. */
function fakeImages(
  delayMs = 0,
  supportsReferences = false
): IImageGenerator & { calls: string[]; refCalls: (Uint8Array[] | undefined)[] } {
  const calls: string[] = [];
  const refCalls: (Uint8Array[] | undefined)[] = [];
  return {
    name: 'fake',
    model: 'fake',
    supportsReferences,
    calls,
    refCalls,
    generateImage: vi.fn(async (hint: string, _subject?: string, options?: ImageOptions): Promise<ImageResult> => {
      calls.push(hint);
      refCalls.push(options?.references);
      if (delayMs > 0) await new Promise((resolve) => setTimeout(resolve, delayMs));
      return { image: new Uint8Array([1, 2, 3]), mimeType: 'image/png', costMicroUsd: 1 };
    })
  };
}

const pages = (n: number) =>
  Array.from({ length: n }, (_, i) => ({ hint: `scene ${i}`, subject: `page ${i}` }));

// Every test uses a unique story id, so the on-disk cache cannot leak between
// them; this removes the files afterwards.
const written: string[] = [];
function storyId(): string {
  const id = `test-${randomUUID()}`;
  written.push(id);
  return id;
}

afterAll(async () => {
  await Promise.all(
    written.flatMap((id) =>
      Array.from({ length: 8 }, (_, i) => rm(`${illustrationDir}/v4-${id}-${i}.png`, { force: true }))
    )
  );
});

describe('warmStoryArt', () => {
  it('draws every page exactly once', async () => {
    const id = storyId();
    const images = fakeImages();
    await warmStoryArt({ storyId: id, pages: pages(8), images, lowBandwidth: false, mock: false });

    expect(images.calls).toHaveLength(8);
    expect(new Set(images.calls).size, 'each page must be a distinct prompt').toBe(8);
  });

  it('reports the book as ready only when every page is on disk', async () => {
    const id = storyId();
    const images = fakeImages();
    const flags = { lowBandwidth: false, mock: false };

    expect(await storyArtStatus(id, 8, flags)).toEqual({ ready: 0, total: 8 });
    await warmStoryArt({ storyId: id, pages: pages(8), images, ...flags });
    expect(await storyArtStatus(id, 8, flags)).toEqual({ ready: 8, total: 8 });
  });

  it('does not redraw pages that are already cached', async () => {
    const id = storyId();
    const first = fakeImages();
    const flags = { lowBandwidth: false, mock: false };
    await warmStoryArt({ storyId: id, pages: pages(3), images: first, ...flags });

    const second = fakeImages();
    await warmStoryArt({ storyId: id, pages: pages(3), images: second, ...flags });
    expect(second.calls, 'a warmed book must not be redrawn').toHaveLength(0);
  });
});

describe('ensurePageArt', () => {
  it('joins an in-flight generation instead of paying twice', async () => {
    const id = storyId();
    // Held open, so the second caller genuinely overlaps the first.
    const images = fakeImages(60);
    const shared = { storyId: id, pageIndex: 0, lowBandwidth: false, mock: false, images };

    const [a, b] = await Promise.all([
      ensurePageArt({ ...shared, hint: 'scene 0', subject: 'page 0' }),
      ensurePageArt({ ...shared, hint: 'scene 0', subject: 'page 0' })
    ]);

    expect(images.calls, 'concurrent callers must share ONE vendor call').toHaveLength(1);
    expect(a.image).toEqual(b.image);
  });

  it('serves the cached bytes on a later call', async () => {
    const id = storyId();
    const images = fakeImages();
    const shared = { storyId: id, pageIndex: 1, lowBandwidth: false, mock: false, images };

    await ensurePageArt({ ...shared, hint: 'scene 1', subject: 'page 1' });
    const again = await ensurePageArt({ ...shared, hint: 'scene 1', subject: 'page 1' });

    expect(images.calls).toHaveLength(1);
    expect(again.mimeType).toBe('image/png');
  });
});

describe('hero reference (character consistency)', () => {
  it('is not drawn at all when the provider cannot use one', async () => {
    const images = fakeImages(0, false);
    const ref = await ensureHeroReference({ childId: storyId(), heroName: 'Ayla', images });
    expect(ref).toBeNull();
    expect(images.calls, 'must not pay for a reference nothing can consume').toHaveLength(0);
  });

  it('is drawn once and reused', async () => {
    const id = storyId();
    const images = fakeImages(0, true);
    const first = await ensureHeroReference({ childId: id, heroName: 'Ayla', images });
    const second = await ensureHeroReference({ childId: id, heroName: 'Ayla', images });

    expect(first).not.toBeNull();
    expect(second).toEqual(first);
    expect(images.calls, 'a cached hero must not be redrawn').toHaveLength(1);
    await rm(heroReferencePath(id), { force: true });
  });

  it('anchors every page of a story on the hero', async () => {
    const id = storyId();
    const images = fakeImages(0, true);
    await warmStoryArt({
      storyId: id,
      pages: pages(4),
      images,
      lowBandwidth: false,
      mock: false,
      hero: { childId: id, heroName: 'Ayla' }
    });

    // One hero + four pages.
    expect(images.calls).toHaveLength(5);
    const pageRefs = images.refCalls.slice(1);
    expect(pageRefs).toHaveLength(4);
    for (const refs of pageRefs) {
      expect(refs, 'every page must carry the identity anchor').toHaveLength(1);
    }
    await rm(heroReferencePath(id), { force: true });
  });

  it('still draws the book when the hero cannot be produced', async () => {
    const id = storyId();
    const images: IImageGenerator & { calls: string[] } = {
      name: 'flaky',
      model: 'flaky',
      supportsReferences: true,
      calls: [],
      generateImage: vi.fn(async (hint: string): Promise<ImageResult> => {
        images.calls.push(hint);
        // Only the character sheet fails; pages must carry on unanchored.
        if (hint.includes('character reference')) throw new Error('vendor blip');
        return { image: new Uint8Array([9]), mimeType: 'image/png', costMicroUsd: 1 };
      })
    };

    await warmStoryArt({
      storyId: id,
      pages: pages(3),
      images,
      lowBandwidth: false,
      mock: false,
      hero: { childId: id, heroName: 'Ayla' }
    });

    const status = await storyArtStatus(id, 3, { lowBandwidth: false, mock: false });
    expect(status, 'a missing hero costs consistency, never the story').toEqual({ ready: 3, total: 3 });
  });
});

describe('transient vendor failures', () => {
  it('retries a throttled page instead of losing it forever', async () => {
    // Found by running the app: the endpoint answered 20x HTTP 429 under load,
    // and a swallowed 429 lost that page permanently — readiness could then
    // never reach total, so the player waited out its whole cap and played
    // with placeholders. Two pages of eight were simply missing.
    const id = storyId();
    let attempts = 0;
    const images: IImageGenerator = {
      name: 'throttled',
      model: 'throttled',
      supportsReferences: false,
      generateImage: vi.fn(async (): Promise<ImageResult> => {
        attempts += 1;
        if (attempts === 1) throw new Error('Azure /providers/blackforestlabs failed: HTTP 429');
        return { image: new Uint8Array([7]), mimeType: 'image/png', costMicroUsd: 1 };
      })
    };

    const result = await ensurePageArt({
      storyId: id,
      pageIndex: 0,
      lowBandwidth: false,
      mock: false,
      images,
      hint: 'scene 0',
      subject: 'page 0'
    });

    expect(attempts, 'a 429 must be retried').toBe(2);
    expect(result.image).toEqual(new Uint8Array([7]));
  });

  it('does not retry a permanent failure', async () => {
    // A bad deployment name or malformed prompt will fail identically every
    // time; retrying only burns seconds a child is waiting through.
    const id = storyId();
    let attempts = 0;
    const images: IImageGenerator = {
      name: 'broken',
      model: 'broken',
      supportsReferences: false,
      generateImage: vi.fn(async (): Promise<ImageResult> => {
        attempts += 1;
        throw new Error('Unknown FLUX model "nope" (see FLUX_PATHS)');
      })
    };

    await expect(
      ensurePageArt({
        storyId: id,
        pageIndex: 1,
        lowBandwidth: false,
        mock: false,
        images,
        hint: 'scene 1',
        subject: 'page 1'
      })
    ).rejects.toThrow();
    expect(attempts, 'a permanent error must fail fast').toBe(1);
  });
});
