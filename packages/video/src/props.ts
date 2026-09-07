/**
 * The props contract between the server and the composition.
 *
 * The server owns everything that needs a vendor, a clock or a disk: it
 * compiles the script, has each line spoken, has each word drawn, MEASURES the
 * resulting audio, and hands the composition a fully-resolved timeline. The
 * composition owns only layout and motion.
 *
 * That split is deliberate. Remotion renders frames in parallel across several
 * headless Chrome processes, so anything a component does at frame time may run
 * many times over — measuring an audio file or calling a vendor there would be
 * both slow and non-deterministic, and two workers could disagree about how
 * long a scene is. Resolving durations ONCE, up front, means every worker
 * draws the same timeline, and the video is reproducible from its props alone.
 */
import type { VideoSceneKind } from '@qissa/core';

/** One scene, with its assets resolved and its length already decided. */
export interface RenderScene {
  id: string;
  kind: VideoSceneKind;
  /** Large on-screen text. */
  display: string;
  /** The sound this scene is about, when it is about one. */
  grapheme?: string;
  word?: string;
  /** Graphemes for the blend scene to reveal one at a time. */
  parts?: string[];
  /** Instant stand-in, always present — the picture may never arrive. */
  emoji?: string;
  /**
   * Narration, as a URL the headless browser can load. A data: URI keeps the
   * bundle self-contained and sidesteps the render workers racing a local file
   * server; `null` means synthesis failed and this scene plays silent.
   */
  audioSrc: string | null;
  /** The drawing, same encoding and same reasoning. Falls back to `emoji`. */
  imageSrc: string | null;
  /** Exact length of this scene, measured from its narration. */
  durationInFrames: number;
}

/**
 * A type alias, not an interface, and that is load-bearing.
 *
 * Remotion types a composition's props as `Record<string, unknown>`.
 * TypeScript treats an object type ALIAS as assignable to that (it has an
 * implicit index signature) but an interface as not, so declaring this as an
 * interface fails to compile against `Composition` and `renderMedia`. The
 * alternative is casting at all three call sites, which would throw away the
 * type checking that keeps the server's props and the composition's props in
 * agreement — the one thing here worth checking.
 */
export type PhonicsSongProps = {
  childName: string;
  targetGrapheme: string;
  /** Where the outro waves goodbye from. */
  city: string;
  scenes: RenderScene[];
};

export const VIDEO_FPS = 30;
export const VIDEO_WIDTH = 1920;
export const VIDEO_HEIGHT = 1080;

/** The composition id, shared by the studio, the renderer and the server. */
export const PHONICS_SONG_ID = 'PhonicsSong';

/**
 * Total length of the video.
 *
 * Remotion needs a composition duration before any frame renders, and it must
 * never be zero — a zero-frame composition fails the render rather than
 * producing an empty file, which would turn "synthesis failed" into "the whole
 * job crashed". One frame is the floor.
 */
export function totalDurationInFrames(scenes: RenderScene[]): number {
  return Math.max(
    1,
    scenes.reduce((sum, scene) => sum + scene.durationInFrames, 0)
  );
}
