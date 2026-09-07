/**
 * "{name}'s own song" — the parent's way to make and watch a phonics video.
 *
 * The child's NAME carries the card, never a pronoun. Qissa never asks a
 * child's gender, and a dashboard with two children rendered two identical
 * "A song of her own" headings — indistinguishable from each other, and wrong
 * on the card belonging to a boy.
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

  // The song to offer: the one just rendered, or the newest one that already
  // exists. Without the fallback the card fetched the list, used it only to
  // pick a button label, and never showed it -- so on any page load after the
  // render, a parent's finished song had no player and no way to be watched.
  // The list is ordered newest-first by the server.
  const latest = job !== null && job.state === 'ready' ? job : (songs.find((s) => s.state === 'ready') ?? null);
  const ready = !working && latest !== null;

  // Surface treatment matches every other dashboard section. This card was
  // bg-white/70 + rounded-3xl + shadow-sm, which read as a washed-out, flatter
  // panel sitting between two crisp ones.
  return (
    <section className="rounded-2xl bg-white p-6 shadow">
      <h2 className="text-lg font-bold">{tr('song.title', { name: childName })}</h2>
      <p className="mb-4 mt-1 max-w-prose text-sm text-ink/60">{tr('song.blurb', { name: childName })}</p>

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

      {ready && latest !== null ? (
        <div className="mt-4">
          <p className="text-sm font-medium text-ink">{latest.title}</p>
          {/* keyed on the id so switching to a newer song reloads the source
              instead of leaving the previous one in the element */}
          <video
            key={latest.id}
            className="mt-2 w-full max-w-xl rounded-2xl bg-black shadow"
            controls
            playsInline
            preload="metadata"
            src={`/api/videos/${latest.id}/file`}
          />
          <a
            className="mt-2 inline-block text-sm font-medium text-clay underline"
            href={`/api/videos/${latest.id}/file`}
            download={`qissa-${latest.id}.mp4`}
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
        {/* "Make a new one" only once one actually EXISTS. Counting every job
            meant the very first render — which is itself queued and therefore
            in the list — relabelled the button "make a new one" before a
            single song had ever finished. */}
        {songs.some((s) => s.state === 'ready') || ready ? tr('song.remake') : tr('song.make')}
      </button>
    </section>
  );
}
