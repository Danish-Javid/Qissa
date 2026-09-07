/**
 * "A song of her own" — the parent's way to make and watch a phonics video.
 *
 * Shaped like the Story Time readiness gate rather than a spinner: rendering
 * takes a minute or two, so the card shows real progress, says plainly how
 * long it takes, and says that leaving the page is fine — because the job runs
 * on the server and polling picks it back up.
 *
 * The whole card is absent unless the server exposes the routes. A 404 from
 * the listing is treated as "this deployment has no video", not as an error to
 * show a parent: rendering is opt-in (Remotion needs a company licence beyond
 * three people), so a deployment without it is a normal deployment.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from '../api/client.js';
import { ApiError } from '../api/client.js';
import { useLocale } from '../i18n/LocaleProvider.js';

interface VideoJobView {
  id: string;
  title: string;
  state: 'queued' | 'rendering' | 'ready' | 'failed';
  progress: number;
  error?: string;
}

/** Poll while a render is in flight. Matches the story-art readiness poll. */
const POLL_INTERVAL_MS = 2_000;

export function SongCard({ childId, childName }: { childId: string; childName: string }) {
  const { tr, num } = useLocale();
  const [available, setAvailable] = useState(true);
  const [job, setJob] = useState<VideoJobView | null>(null);
  const [busy, setBusy] = useState(false);
  const [songs, setSongs] = useState<VideoJobView[]>([]);
  // Guards a poll that resolves after the parent has navigated away, which
  // would otherwise set state on an unmounted card.
  const liveRef = useRef(true);

  useEffect(() => {
    liveRef.current = true;
    return () => {
      liveRef.current = false;
    };
  }, []);

  const loadList = useCallback(async () => {
    try {
      const res = await api.get<{ videos: VideoJobView[] }>(`/videos/child/${childId}`);
      if (!liveRef.current) return;
      setSongs(res.videos);
      // Adopt an in-flight render started before this page was opened, so a
      // reload during a render shows progress instead of an idle button.
      const active = res.videos.find((v) => v.state === 'queued' || v.state === 'rendering');
      if (active !== undefined) setJob(active);
    } catch (error) {
      if (error instanceof ApiError && error.status === 404) setAvailable(false);
    }
  }, [childId]);

  useEffect(() => {
    void loadList();
  }, [loadList]);

  // Poll only while there is something to poll for.
  useEffect(() => {
    if (job === null || (job.state !== 'queued' && job.state !== 'rendering')) return;
    const timer = setInterval(async () => {
      try {
        const res = await api.get<{ video: VideoJobView }>(`/videos/${job.id}/status`);
        if (!liveRef.current) return;
        setJob(res.video);
        if (res.video.state === 'ready' || res.video.state === 'failed') void loadList();
      } catch {
        // A dropped poll is not a failed render; the next tick retries.
      }
    }, POLL_INTERVAL_MS);
    return () => clearInterval(timer);
  }, [job, loadList]);

  async function make(): Promise<void> {
    setBusy(true);
    try {
      const res = await api.post<{ video: VideoJobView }>('/videos', { childId });
      setJob(res.video);
      void loadList();
    } catch (error) {
      if (error instanceof ApiError && error.status === 404) setAvailable(false);
    } finally {
      setBusy(false);
    }
  }

  if (!available) return null;

  const working = job !== null && (job.state === 'queued' || job.state === 'rendering');
  const ready = job !== null && job.state === 'ready';

  return (
    <section className="rounded-3xl bg-white/70 p-6 shadow-sm">
      <h2 className="text-lg font-semibold text-ink">{tr('song.title')}</h2>
      <p className="mt-1 max-w-prose text-sm text-ink/70">{tr('song.blurb', { name: childName })}</p>

      {working ? (
        <div className="mt-4">
          <p className="text-sm text-ink/80">
            {job.state === 'queued'
              ? tr('song.queued')
              : tr('song.rendering', { percent: `${num(Math.round(job.progress * 100))}%` })}
          </p>
          {/* A real bar, driven by the encoder's own progress — not an
              indeterminate spinner, because a minute of spinner reads as a
              hang and this is a minute long. */}
          <div className="mt-2 h-2 w-full max-w-sm overflow-hidden rounded-full bg-ink/10">
            <div
              className="h-full rounded-full bg-clay transition-[width] duration-500"
              style={{ width: `${Math.max(2, Math.round(job.progress * 100))}%` }}
            />
          </div>
          <p className="mt-2 text-xs text-ink/50">{tr('song.slow')}</p>
        </div>
      ) : null}

      {ready ? (
        <div className="mt-4">
          <p className="text-sm font-medium text-ink">{job.title}</p>
          <video
            className="mt-2 w-full max-w-xl rounded-2xl bg-black shadow"
            controls
            playsInline
            preload="metadata"
            src={`/api/videos/${job.id}/file`}
          />
          <a
            className="mt-2 inline-block text-sm font-medium text-clay underline"
            href={`/api/videos/${job.id}/file`}
            download={`qissa-${job.id}.mp4`}
          >
            {tr('song.save')}
          </a>
        </div>
      ) : null}

      {job !== null && job.state === 'failed' ? <p className="mt-4 text-sm text-clay">{tr('song.failed')}</p> : null}

      <button
        type="button"
        className="mt-4 rounded-full bg-clay px-5 py-2 text-sm font-semibold text-paper disabled:opacity-50"
        onClick={() => void make()}
        disabled={busy || working}
      >
        {ready || songs.length > 0 ? tr('song.remake') : tr('song.make')}
      </button>
    </section>
  );
}
