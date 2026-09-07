/**
 * The render queue.
 *
 * Rendering takes tens of seconds — bundling, then several headless Chrome
 * processes drawing 1080p frames, then encoding. No HTTP request waits on
 * that, so a job is started and its progress polled, the same shape the story
 * art readiness gate already uses.
 *
 * ONE job runs at a time, process-wide. Remotion already saturates the
 * available cores with its own render workers, so a second concurrent job does
 * not finish two videos in the time of one — it makes both slower and doubles
 * peak memory. The queue is the honest way to say that.
 */
import { mkdir, stat } from 'node:fs/promises';
import path from 'node:path';
import type { FastifyBaseLogger } from 'fastify';
import { renderSong } from '@qissa/video';
import type { PhonicsSongProps } from '@qissa/video';
import { videoDir } from './song.js';

export type JobState = 'queued' | 'rendering' | 'ready' | 'failed';

export interface VideoJob {
  id: string;
  childId: string;
  title: string;
  state: JobState;
  /** 0..1 while rendering. */
  progress: number;
  /** Present once ready. */
  filePath?: string;
  /** Present when failed — a short reason, never vendor internals. */
  error?: string;
  startedAt: number;
  finishedAt?: number;
  renderMs?: number;
}

/**
 * Jobs live in memory, and that is a deliberate limit rather than an
 * oversight: a restart loses the QUEUE, not the videos, because a finished
 * render is a file on disk that `existingVideo` finds again. Persisting the
 * queue would mean reconciling jobs whose render process died with the
 * container, which is more machinery than a demo needs.
 */
const jobs = new Map<string, VideoJob>();
let running: Promise<void> = Promise.resolve();

export function getJob(id: string): VideoJob | undefined {
  return jobs.get(id);
}

/**
 * Drop a remembered job, so the next request renders it again.
 *
 * Needed because `enqueueRender` is idempotent on the id and trusts THIS map
 * over the disk. A job left in the map as 'ready' after its file went away —
 * a pruned volume, a cleanup, a hand-deleted cache — was returned as ready
 * forever: the file route 404ed and pressing "make" again just handed back the
 * same phantom, with no way to regenerate short of restarting the process.
 *
 * The caller checks the disk (it has to anyway) and calls this when the file
 * it was promised is not there.
 */
export function forgetJob(id: string): void {
  jobs.delete(id);
}

export function jobsForChild(childId: string): VideoJob[] {
  return [...jobs.values()].filter((j) => j.childId === childId).sort((a, b) => b.startedAt - a.startedAt);
}

/** The finished file for a job id, if the render already happened. */
export function videoPath(jobId: string): string {
  return path.join(videoDir, `${jobId}.mp4`);
}

/**
 * Has this exact video already been rendered?
 *
 * The job id is a hash of the props, so an unchanged child asking again gets
 * the existing file rather than an identical 40-second render. This is what
 * makes the "watch it again" case instant.
 */
export async function existingVideo(jobId: string): Promise<boolean> {
  try {
    const info = await stat(videoPath(jobId));
    return info.isFile() && info.size > 0;
  } catch {
    return false;
  }
}

export interface EnqueueInput {
  id: string;
  childId: string;
  title: string;
  props: PhonicsSongProps;
  log: FastifyBaseLogger;
  /** Render workers; pass a number in a CPU-limited container. */
  concurrency?: number | null;
}

/**
 * Queue a render, or return the job already doing it.
 *
 * Idempotent on the id, so a parent double-tapping "make a video" gets one
 * render and two references to it rather than two renders of the same thing
 * competing for the same cores and the same output path.
 */
export function enqueueRender(input: EnqueueInput): VideoJob {
  const existing = jobs.get(input.id);
  if (existing !== undefined && existing.state !== 'failed') return existing;

  const job: VideoJob = {
    id: input.id,
    childId: input.childId,
    title: input.title,
    state: 'queued',
    progress: 0,
    startedAt: Date.now()
  };
  jobs.set(job.id, job);

  // Chained onto the previous job rather than started immediately: this is the
  // one-at-a-time rule. `.then` on the tail, so a failed job does not break
  // the chain for every job after it.
  running = running.then(async () => {
    job.state = 'rendering';
    try {
      await mkdir(videoDir, { recursive: true });
      const result = await renderSong({
        props: input.props,
        outputLocation: videoPath(job.id),
        concurrency: input.concurrency ?? null,
        onProgress: (ratio) => {
          job.progress = ratio;
        }
      });
      job.state = 'ready';
      job.progress = 1;
      job.filePath = result.outputLocation;
      job.renderMs = result.renderMs;
      input.log.info(
        { videoId: job.id, renderMs: result.renderMs, frames: result.durationInFrames },
        'video render complete'
      );
    } catch (error) {
      job.state = 'failed';
      // The reason is logged in full and reported to the parent only as a
      // short message — a vendor stack trace is not something to surface in a
      // parent-facing UI.
      job.error = 'render failed';
      input.log.error({ videoId: job.id, error: String(error) }, 'video render failed');
    } finally {
      job.finishedAt = Date.now();
    }
  });

  return job;
}

/** Mark an already-rendered file as a ready job, so status polling works. */
export function adoptExisting(id: string, childId: string, title: string): VideoJob {
  const job: VideoJob = {
    id,
    childId,
    title,
    state: 'ready',
    progress: 1,
    filePath: videoPath(id),
    startedAt: Date.now(),
    finishedAt: Date.now()
  };
  jobs.set(id, job);
  return job;
}
