/**
 * StoryTimePlayer — the common RECEPTIVE mode (ages 1–6).
 *
 * Buddy narrates the child's OWN story (world seed = canon) over the FLUX
 * picture for each page, paced like a cartoon: the child just listens and
 * watches, so no reading is required and even a one-year-old learns through
 * it (receptive language leads expressive). It is the SAME safe, personalized
 * pipeline as the read-along, but the server served it with teach=false, so
 * nothing is credited to what the child can decode.
 *
 * Two deliberate design rules from the product owner:
 *  1. Morals, ethics and values live INSIDE the narrative — the last page
 *     resolves warmly and names a feeling (the story prompt guarantees it).
 *     This player therefore NEVER shows a bolted-on "moral of the story"
 *     card. The close is a gentle "The end", nothing more.
 *  2. Pacing is a parental control (fluent | slow). The vendor synthesizer has
 *     no speed dial, so pacing is carried by the two levers we own: how long
 *     we DWELL on each picture after the narration ends, and the browser-voice
 *     rate (mock mode / TTS-down). Slow lingers so a toddler can absorb the
 *     scene; fluent keeps a cartoon's clip.
 *
 * Security: every spoken line is generated picture-talk that already passed
 * the server content filter; there is no free-text input here, so there is
 * nothing for a child to inject. The illustration is a same-origin <img> that
 * authenticates itself with the session cookie (ownership re-proven server-side).
 */
import { useEffect, useRef, useState } from 'react';
import type { Story, StoryPacing } from '@qissa/core';
import { api } from '../api/client.js';
import type { StoryTimeResponse } from '../api/types.js';
import { speak, stopSpeaking } from '../lib/speech.js';
import { sfx } from '../lib/sfx.js';
import { Buddy, type BuddyMood } from './Buddy.js';
import { Celebration } from './Celebration.js';
import { Scene } from './Scene.js';

interface Props {
  childId: string;
  mockMode: boolean;
  /** Pacing from the child list; the serve response is authoritative and
   *  overrides this once it lands (parent may have changed it meanwhile). */
  pacing: StoryPacing;
  onDone: () => void;
}

type Phase = 'loading' | 'playing' | 'done' | 'grownup';

const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

/** The TTS route caps a phrase at 200 chars. Long picture-talk is split on
 *  sentence boundaries and spoken chunk by chunk, so narration keeps the warm
 *  vendor voice instead of dropping to browser speech for a whole long line. */
const TTS_MAX = 180;
function splitForSpeech(text: string, max = TTS_MAX): string[] {
  const sentences = text.match(/[^.!?]+[.!?]*/g) ?? [text];
  const chunks: string[] = [];
  let buffer = '';
  const flush = (): void => {
    if (buffer.trim().length > 0) chunks.push(buffer.trim());
    buffer = '';
  };
  for (const sentence of sentences) {
    const piece = sentence.trim();
    if (piece.length === 0) continue;
    if ((buffer + ' ' + piece).trim().length <= max) {
      buffer = (buffer + ' ' + piece).trim();
      continue;
    }
    flush();
    if (piece.length > max) {
      // One sentence longer than the cap: hard-split on the nearest space.
      let rest = piece;
      while (rest.length > max) {
        let cut = rest.lastIndexOf(' ', max);
        if (cut <= 0) cut = max;
        chunks.push(rest.slice(0, cut).trim());
        rest = rest.slice(cut).trim();
      }
      buffer = rest;
    } else {
      buffer = piece;
    }
  }
  flush();
  return chunks.length > 0 ? chunks : [text];
}

/** Pacing → the MINIMUM time a page stays up. Story Time is a receptive
 *  cartoon the child watches, and it must last at least ~2 minutes; with the
 *  longer Story Time book (8 pages) this floor guarantees that even when the
 *  illustrations are already cached and the narration is short. Slow lingers
 *  a little longer than fluent, but both clear two minutes. */
function minPageMs(pacing: StoryPacing): number {
  return pacing === 'slow' ? 18_000 : 15_000;
}
/** Pacing → browser-voice rate (the vendor waveform has no speed control). */
function rateFor(pacing: StoryPacing): number {
  return pacing === 'slow' ? 0.72 : 0.95;
}
/** Longest we hold a page waiting for its FLUX illustration before turning
 *  anyway, so a slow or failed image can never freeze the story. The picture
 *  appears the instant it lands; this only caps the wait. */
const ART_WAIT_CAP_MS = 18_000;

/** Longest we hold the curtain waiting for the server to finish drawing the
 *  book. Past this we start anyway: a vendor outage should delay a story, not
 *  cancel it, and each page still falls back to its placeholder. */
const PREPARE_CAP_MS = 75_000;
/** How often we ask whether the book is ready. Cheap: a disk stat per page. */
const POLL_INTERVAL_MS = 1_500;

export function StoryTimePlayer({ childId, mockMode, pacing, onDone }: Props) {
  const [story, setStory] = useState<Story | null>(null);
  const [storyId, setStoryId] = useState<string | null>(null);
  const [effectivePacing, setEffectivePacing] = useState<StoryPacing>(pacing);
  const [phase, setPhase] = useState<Phase>('loading');
  const [pageIndex, setPageIndex] = useState(0);
  // Caption = the line Buddy is saying, for the co-viewing grown-up (joint
  // media engagement). Never load-bearing: the child only listens + watches.
  const [caption, setCaption] = useState('');
  const [artOk, setArtOk] = useState(true);
  const [artLoaded, setArtLoaded] = useState(false);
  // How much of the book is drawn, so the wait shows honest progress.
  const [artProgress, setArtProgress] = useState<{ ready: number; total: number } | null>(null);

  const mounted = useRef(true);
  // Set the moment this page's illustration resolves (loaded OR failed) so the
  // narration loop can hold the page until the picture is actually on screen.
  // A ref, not state: the async loop reads it across awaits without re-running.
  const artResolvedRef = useRef(false);
  // mockMode arrives async from /metrics-demo; read it through a ref so the
  // flip never restarts (and interrupts) a line already being spoken.
  const mockModeRef = useRef(mockMode);
  useEffect(() => {
    mockModeRef.current = mockMode;
  }, [mockMode]);

  // ------------------------------------------------------------ story load
  // Served with teach=false: listening is not reading, so the learner model is
  // never advanced. The response pacing is the parent's live choice.
  useEffect(() => {
    mounted.current = true;
    api
      .post<StoryTimeResponse>('/stories/story-time', { childId })
      .then((response) => {
        if (!mounted.current) return;
        setStoryId(response.storyId);
        setStory(response.story);
        setEffectivePacing(response.pacing);
        // Stay in 'loading': the readiness effect starts playback once the
        // server has drawn the book (or the cap expires).
      })
      .catch(() => {
        // 401 session expired, 403 Story Time disabled, 503 no safe story —
        // every one hands back to a grown-up gently, never an error screen.
        if (mounted.current) setPhase('grownup');
      });
    return () => {
      mounted.current = false;
      stopSpeaking();
    };
  }, [childId]);

  // ------------------------------------------- hold the curtain until ready
  // The server starts drawing EVERY page the moment the story is created, so
  // here we only wait for the book to be playable and then start.
  //
  // This replaced client-side warming, which could not win: an illustration
  // takes ~13s on the configured endpoint, so warming three-wide from the
  // moment the player mounted still put the last picture ~40s into a
  // two-minute story. The child heard page six over page two's placeholder.
  // Waiting a few seconds up front for a complete book is a better experience
  // than a story that visibly outruns its own pictures.
  //
  // Capped, because a vendor outage must delay the story, never cancel it:
  // at the cap we play anyway and each page falls back to its placeholder.
  useEffect(() => {
    if (story === null || storyId === null) return;
    let cancelled = false;
    const startedAt = Date.now();

    const poll = async (): Promise<void> => {
      for (;;) {
        if (cancelled) return;
        try {
          const status = await api.get<{ ready: number; total: number }>(`/stories/${storyId}/art-status`);
          if (cancelled) return;
          setArtProgress(status);
          if (status.ready >= status.total) break;
        } catch {
          break; // Status unavailable — start rather than stall.
        }
        if (Date.now() - startedAt > PREPARE_CAP_MS) break;
        await sleep(POLL_INTERVAL_MS);
      }
      if (!cancelled) setPhase('playing');
    };

    void poll();
    return () => {
      cancelled = true;
    };
  }, [story, storyId]);

  // --------------------------------------------- narrate + auto-advance
  // Speak this page's picture-talk (falling back to the page line), dwell for
  // the pacing, then turn the page on its own — a cartoon never waits to be
  // pushed. A tap skips ahead immediately; the cleanup cancels this loop so
  // the voice and the picture can never drift apart.
  useEffect(() => {
    if (phase !== 'playing' || story === null) return;
    const page = story.pages[pageIndex];
    if (page === undefined) {
      setPhase('done');
      return;
    }
    let cancelled = false;
    const pageStart = Date.now();
    setArtOk(true);
    setArtLoaded(false);
    artResolvedRef.current = false;
    const line = (page.pictureTalk ?? page.text).trim();
    setCaption(line);
    const rate = rateFor(effectivePacing);
    void (async () => {
      // 1. Narrate the whole line (chunked under the TTS cap).
      for (const chunk of splitForSpeech(line)) {
        if (cancelled) return;
        await speak(chunk, mockModeRef.current, rate);
      }
      if (cancelled) return;
      // 2. HOLD FOR THE PICTURE. This is the fix for "only the text shows":
      //    the page never turns until its FLUX art has landed (or failed, or
      //    the cap elapses), so the child actually SEES every illustration
      //    instead of racing past a book that is still being painted.
      const artWaitStart = Date.now();
      while (!artResolvedRef.current && Date.now() - artWaitStart < ART_WAIT_CAP_MS) {
        await sleep(150);
        if (cancelled) return;
      }
      if (cancelled) return;
      // 3. Guarantee the page — and so the whole story — is long enough to
      //    watch and absorb, even when the art was cached and narration short.
      const elapsed = Date.now() - pageStart;
      const floor = minPageMs(effectivePacing);
      if (elapsed < floor) {
        await sleep(floor - elapsed);
        if (cancelled) return;
      }
      // 4. Turn the page on its own — a cartoon never waits to be pushed.
      if (pageIndex + 1 < story.pages.length) {
        sfx.page();
        setPageIndex(pageIndex + 1);
      } else {
        setPhase('done');
      }
    })();
    return () => {
      cancelled = true;
      stopSpeaking();
    };
  }, [phase, pageIndex, story, effectivePacing]);

  // --------------------------------------------------------- warm close
  // The story already resolved warmly and named a feeling on its last page, so
  // the close is just a soft landing — NO moral, NO lesson, NO quiz.
  useEffect(() => {
    if (phase !== 'done') return;
    void speak('The end. What a lovely story.', mockModeRef.current, rateFor(effectivePacing));
  }, [phase, effectivePacing]);

  function advance(): void {
    if (story === null) return;
    sfx.tap();
    if (pageIndex + 1 < story.pages.length) setPageIndex(pageIndex + 1);
    else setPhase('done');
  }

  const mood: BuddyMood = phase === 'loading' ? 'think' : phase === 'done' ? 'cheer' : 'happy';
  const pageCount = story !== null ? story.pages.length : 0;
  const illustrationUrl = storyId !== null ? `/api/stories/${storyId}/pages/${pageIndex}/illustration` : '';

  if (phase === 'grownup') {
    return (
      <div className="relative h-full overflow-hidden">
        <Scene theme="kindness" seed={childId} />
        <div className="relative z-10 flex h-full flex-col items-center justify-center gap-6 p-8 text-center">
          <Buddy mood="kind" size={190} />
          <div className="bubble pop-in max-w-md text-2xl font-bold">
            Please hand the device to a grown-up for a moment.
          </div>
        </div>
      </div>
    );
  }

  if (phase === 'loading' || story === null) {
    return (
      <div className="relative h-full overflow-hidden">
        <Scene theme="kindness" seed={childId} />
        <div className="relative z-10 flex h-full flex-col items-center justify-center gap-6 p-8 text-center">
          <Buddy mood="think" size={210} />
          <div className="bubble pop-in text-2xl font-bold">Buddy is drawing your storybook… 📚</div>
          {/* Honest progress, and a reason the wait is worth it. A child of
              this age cannot read it — it is for the grown-up sitting there,
              who otherwise sees a spinner and assumes the app has hung. */}
          {artProgress !== null && artProgress.total > 0 ? (
            <div
              className="flex flex-col items-center gap-2"
              role="status"
              aria-live="polite"
              aria-label={`Drawing picture ${Math.min(artProgress.ready + 1, artProgress.total)} of ${artProgress.total}`}
            >
              <div className="flex gap-2" aria-hidden="true">
                {Array.from({ length: artProgress.total }, (_, i) => (
                  <span
                    key={i}
                    className={`h-3 w-3 rounded-full ${i < artProgress.ready ? 'bg-emerald-500' : 'bg-slate-300'}`}
                  />
                ))}
              </div>
              <p className="text-sm text-slate-600">
                {artProgress.ready} of {artProgress.total} pictures ready
              </p>
            </div>
          ) : null}
        </div>
      </div>
    );
  }

  if (phase === 'done') {
    return (
      <div className="relative h-full overflow-hidden">
        <Scene theme={story.theme} seed={storyId ?? childId} />
        <Celebration stars={pageCount} />
        <div className="relative z-10 flex h-full flex-col items-center justify-center gap-6 p-8 text-center">
          <Buddy mood="cheer" size={230} />
          <div className="bubble pop-in text-3xl font-bold">The end 🌟</div>
          <button type="button" className="btn-big btn-face-leaf btn-glow mt-2" onClick={onDone}>
            <span aria-hidden>📚</span> Again soon!
          </button>
        </div>
      </div>
    );
  }

  // ------------------------------------------------------------ playing
  return (
    <div className="relative h-full overflow-hidden">
      <Scene theme={story.theme} seed={storyId ?? childId} />
      <div className="relative z-10 flex h-full flex-col items-center justify-between gap-3 p-4 sm:p-6">
        {/* Progress you can feel: one soft dot per page, the current one lit. */}
        <div className="mt-1 flex items-center gap-2" aria-hidden>
          {story.pages.map((_, i) => (
            <span
              key={i}
              className={`h-3 w-3 rounded-full transition ${i === pageIndex ? 'scale-125 bg-leaf' : i < pageIndex ? 'bg-leaf/50' : 'bg-ink/20'}`}
            />
          ))}
        </div>

        {/* The picture IS the story — huge, and a tap skips ahead. A failed
            illustration degrades to a warm placeholder; the voice carries on. */}
        <div className="flex w-full flex-1 items-center justify-center">
          <button
            type="button"
            onClick={advance}
            className="pop-in w-full max-w-2xl overflow-hidden rounded-3xl bg-white/75 shadow-xl transition active:scale-[0.99]"
            aria-label="Next page"
          >
            <div className="relative">
              {!artLoaded && artOk && (
                <div className="absolute inset-0 flex items-center justify-center text-5xl" aria-hidden>
                  🎨
                </div>
              )}
              {artOk ? (
                <img
                  key={pageIndex}
                  src={illustrationUrl}
                  alt=""
                  className="h-64 w-full object-cover sm:h-80"
                  onLoad={() => {
                    artResolvedRef.current = true;
                    setArtLoaded(true);
                  }}
                  onError={() => {
                    artResolvedRef.current = true;
                    setArtOk(false);
                  }}
                />
              ) : (
                <div className="flex h-64 items-center justify-center text-6xl sm:h-80" aria-hidden>
                  🖼️
                </div>
              )}
            </div>
          </button>
        </div>

        <div className="flex w-full flex-col items-center gap-3 pb-2">
          <Buddy mood={mood} size={150} />
          <div className="bubble max-w-lg text-xl font-semibold" role="status" aria-live="polite">
            {caption}
          </div>
        </div>
      </div>
    </div>
  );
}
