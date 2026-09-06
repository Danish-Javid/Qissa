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
import type { IImageGenerator, ImageResult } from '../providers/interfaces.js';
import { ensurePageArt, illustrationDir, storyArtStatus, warmStoryArt } from './art.js';

/** A generator that records every call and can be held open on demand. */
function fakeImages(delayMs = 0): IImageGenerator & { calls: string[] } {
  const calls: string[] = [];
  return {
    name: 'fake',
    model: 'fake',
    calls,
    generateImage: vi.fn(async (hint: string): Promise<ImageResult> => {
      calls.push(hint);
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
