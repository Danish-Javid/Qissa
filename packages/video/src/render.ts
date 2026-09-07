/**
 * Rendering a song to an MP4 — the Node side of this package.
 *
 * Two facts shape everything here:
 *
 *  1. Bundling is expensive (webpack over the composition and its imports) and
 *     the result depends only on the SOURCE, never on which child is being
 *     rendered. So it is built once per process and reused, which turns the
 *     second render of a session from ~30s of bundling plus encoding into just
 *     encoding.
 *  2. Rendering is CPU-bound and takes tens of seconds. No request waits on
 *     it; callers start a job and poll, exactly as story art does.
 */
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { bundle } from '@remotion/bundler';
import { renderMedia, selectComposition } from '@remotion/renderer';
import { PHONICS_SONG_ID, type PhonicsSongProps } from './props.js';
import { webpackOverride } from './webpack-override.js';

/**
 * The composition source, resolved relative to THIS module rather than the
 * process working directory.
 *
 * cwd-relative paths were what broke the review script: the server is started
 * from the repo root in development and from /srv/qissa in the container, so
 * anything cwd-relative works in exactly one of them. fileURLToPath (not
 * `new URL().pathname`, which percent-encodes the space in "AI Hackathon" and
 * yields a path that does not exist) makes it correct in both.
 */
function entryPoint(): string {
  const here = path.dirname(fileURLToPath(import.meta.url));
  // dist/render.js -> ../src/entry.ts. Remotion's bundler compiles TypeScript
  // itself, so it wants the SOURCE entry, not this package's build output.
  return path.resolve(here, '..', 'src', 'entry.ts');
}

let bundlePromise: Promise<string> | null = null;

/**
 * The webpack bundle for the compositions, built at most once per process.
 *
 * Memoized on the PROMISE, not the result: two videos requested at the same
 * moment would otherwise both see "not built yet" and bundle in parallel,
 * doing the expensive work twice and racing over the same output directory.
 */
export function serveUrl(): Promise<string> {
  bundlePromise ??= bundle({
    entryPoint: entryPoint(),
    webpackOverride,
    onProgress: () => undefined
  });
  return bundlePromise;
}

export interface RenderSongInput {
  props: PhonicsSongProps;
  /** Absolute path for the .mp4. */
  outputLocation: string;
  /** 0..1, called as encoding proceeds — surfaced to the parent as a bar. */
  onProgress?: (ratio: number) => void;
  /**
   * Render processes to run in parallel. Left to Remotion by default, which
   * picks from the available cores; a container with a CPU limit should pass a
   * number, because Remotion counts the HOST's cores and would otherwise
   * oversubscribe the cgroup and thrash.
   */
  concurrency?: number | null;
}

export interface RenderSongResult {
  outputLocation: string;
  /** Wall-clock render time, logged so the demo can quote a real number. */
  renderMs: number;
  durationInFrames: number;
}

export async function renderSong(input: RenderSongInput): Promise<RenderSongResult> {
  const startedAt = Date.now();
  const url = await serveUrl();

  // inputProps must be passed to BOTH calls: selectComposition runs
  // calculateMetadata to resolve the duration, and renderMedia trusts the
  // composition it is handed. Passing them to only one produces a video whose
  // length was computed from different props than its frames.
  const composition = await selectComposition({
    serveUrl: url,
    id: PHONICS_SONG_ID,
    inputProps: input.props
  });

  await renderMedia({
    serveUrl: url,
    composition,
    codec: 'h264',
    // Widely playable on a mid-range Android phone, which is the device a
    // parent in Lahore will actually open this on, and what WhatsApp will
    // accept without re-encoding it into mush.
    audioCodec: 'aac',
    outputLocation: input.outputLocation,
    inputProps: input.props,
    concurrency: input.concurrency ?? null,
    onProgress: ({ progress }) => input.onProgress?.(progress)
  });

  return {
    outputLocation: input.outputLocation,
    renderMs: Date.now() - startedAt,
    durationInFrames: composition.durationInFrames
  };
}
