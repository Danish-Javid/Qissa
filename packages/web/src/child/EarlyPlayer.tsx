/**
 * EarlyPlayer — the 0–4 track: "First Words" picture cards + Kindness Corner.
 *
 * Built on the same hands-free philosophy as the best toddler apps (Khan
 * Academy Kids, Lingokids): Buddy names a daily-thing picture, asks the
 * child to FIND it, and the child's single TAP is the answer — pointing is
 * the age-correct response for preverbal children (receptive language leads
 * expressive by ~6 months). Success celebrates itself and the next card
 * arrives on its own; nothing ever punishes or waits.
 *
 * Research carried from the server catalog (see early/catalog.ts): labeled
 * picture naming drives vocabulary (Ganea et al.), one clear subject per
 * picture aids transfer (Simcock et al.), and the Kindness Corner scene
 * verbalizes the helper-preference infants already show (Hamlin, Wynn &
 * Bloom 2007, Nature).
 *
 * Security: every line spoken here is curated text from the catalog — there
 * is no generated narration and no free-text input, so there is nothing to
 * inject. Progress posts ride the CSRF-guarded api client like everything.
 */
import { useEffect, useRef, useState } from 'react';
import { ParentCoach, type CoachMode } from '../i18n/ParentCoach.js';
import { api } from '../api/client.js';
import { speak, stopSpeaking } from '../lib/speech.js';
import { sfx } from '../lib/sfx.js';
import { Buddy, type BuddyMood } from './Buddy.js';
import { Celebration } from './Celebration.js';
import { Scene } from './Scene.js';

interface WordCardDto {
  id: string;
  word: string;
  say: string;
  ask: string;
  praise: string;
  artUrl: string;
}

interface VignetteDto {
  id: string;
  title: string;
  sceneLines: string[];
  question: string;
  kindPraise: string;
  gentleFix: string;
  artUrl: string;
}

interface DeckResponse {
  words: WordCardDto[];
  vignette: VignetteDto;
  /** "Can you find the …?" rounds — retrieval practice after the cards. */
  quiz: Array<{
    targetId: string;
    targetWord: string;
    praise: string;
    options: Array<{ id: string; word: string; artUrl: string }>;
  }>;
}

interface Props {
  childId: string;
  mockMode: boolean;
  onDone: () => void;
}

type Phase = 'loading' | 'card' | 'quiz' | 'vignette' | 'done' | 'grownup';

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/** Friendly emoji stand-ins while (or if) a picture is unavailable. */
const EMOJI: Record<string, string> = {
  cow: '🐄', cat: '🐱', dog: '🐶', bird: '🐦', apple: '🍎', banana: '🍌',
  milk: '🥛', bread: '🍞', bus: '🚌', car: '🚗', ball: '⚽', sun: '🌞'
};

export function EarlyPlayer({ childId, mockMode, onDone }: Props) {
  const [deck, setDeck] = useState<DeckResponse | null>(null);
  const [phase, setPhase] = useState<Phase>('loading');
  const [cardIndex, setCardIndex] = useState(0);
  // Small caption = what Buddy is saying, for the co-viewing grown-up
  // (AAP: joint media engagement is what turns screen time into learning).
  const [caption, setCaption] = useState('');
  const [tapReady, setTapReady] = useState(false);
  const [sparkle, setSparkle] = useState(false);
  const [artFailed, setArtFailed] = useState(false);
  // Whether the drawn picture has arrived; until it does the emoji stands in.
  const [artLoaded, setArtLoaded] = useState(false);
  const [vignetteAsk, setVignetteAsk] = useState(false);
  const [quizIndex, setQuizIndex] = useState(0);
  const [quizReady, setQuizReady] = useState(false);
  const [quizResolved, setQuizResolved] = useState(false);
  // The wrongly-tapped tile gets labeled, never punished.
  const [quizWrongId, setQuizWrongId] = useState<string | null>(null);
  const attemptsRef = useRef(0);
  const mounted = useRef(true);
  // mockMode arrives async from /metrics-demo. Narration reads it through a
  // ref so the flip from the default never restarts (and interrupts) a line
  // that is already being spoken.
  const mockModeRef = useRef(mockMode);
  useEffect(() => {
    mockModeRef.current = mockMode;
  }, [mockMode]);

  const card = deck !== null ? deck.words[cardIndex] : undefined;

  // ---------------------------------------------------------------- deck load
  useEffect(() => {
    mounted.current = true;
    api
      .post<DeckResponse>('/early/session', { childId })
      .then((response) => {
        if (!mounted.current) return;
        setDeck(response);
        setPhase('card');
      })
      .catch(() => {
        if (mounted.current) setPhase('grownup');
      });
    return () => {
      mounted.current = false;
      stopSpeaking();
    };
  }, [childId]);

  // Warm the pictures while the child plays.
  //
  // Fired all at once, not one at a time. The old loop awaited each image
  // before starting the next specifically to avoid throttling the vendor —
  // which meant the last card of a deck waited N x ~11s and the child was
  // asked "where is the cow?" over an empty box. The server now bounds
  // concurrency globally (story/art.ts) and retries a 429 with the vendor's
  // own Retry-After, so the right place to queue is there, not here.
  //
  // The server also warms this deck when the session starts; these requests
  // join the SAME in-flight promise rather than duplicating a paid call.
  useEffect(() => {
    if (deck === null) return;
    const controller = new AbortController();
    const urls = [...deck.words.map((w) => w.artUrl), deck.vignette.artUrl];
    void Promise.all(
      urls.map((url) =>
        fetch(url, { credentials: 'same-origin', signal: controller.signal }).catch(() => undefined)
      )
    );
    return () => controller.abort();
  }, [deck]);

  // --------------------------------------------------------- word card ritual
  // Buddy says the word, then speaks the on-screen ask line ("Can you tap the
  // car?"), then waits for the tap. Every caption shown is always spoken.
  useEffect(() => {
    if (phase !== 'card' || card === undefined) return;
    let cancelled = false;
    setTapReady(false);
    setSparkle(false);
    setArtFailed(false);
    setArtLoaded(false);
    setCaption(card.say);
    void (async () => {
      await speak(card.say, mockModeRef.current);
      if (cancelled) return;
      await sleep(450);
      if (cancelled) return;
      setCaption(card.ask);
      await speak(card.ask, mockModeRef.current);
      if (!cancelled) setTapReady(true);
    })();
    return () => {
      cancelled = true;
      stopSpeaking();
    };
  }, [phase, card]);

  function tapPicture(): void {
    if (card === undefined) return;
    if (!tapReady) {
      // An eager tap while Buddy is talking is acknowledged, never punished.
      sfx.tap();
      return;
    }
    setTapReady(false);
    setSparkle(true);
    sfx.chime();
    setCaption(card.praise);
    // Exposure, not mastery, at this age — the audit row is the record.
    api.post('/early/word-met', { childId, cardId: card.id }).catch(() => undefined);
    // Turn the card ONLY once Buddy has finished the praise, then let the
    // celebration breathe. A fixed timer used to advance mid-sentence, so the
    // next picture arrived while the voice was still describing this one — and
    // the new card's own speak() cut the praise off. Awaiting keeps picture and
    // voice in sync no matter how long the praise runs or how fast TTS is.
    const praise = card.praise;
    void (async () => {
      await speak(praise, mockModeRef.current);
      await sleep(700);
      if (!mounted.current || deck === null) return;
      if (cardIndex + 1 < deck.words.length) {
        setCardIndex(cardIndex + 1);
      } else {
        setPhase('quiz');
      }
    })();
  }

  // ------------------------------------------- "Find it!" retrieval-practice
  // Three pictures on screen; Buddy names the target. A right first tap is
  // a clean retrieval; a wrong tap is labeled and the child tries again —
  // the miss still schedules the word into the next run (server-side).
  useEffect(() => {
    if (phase !== 'quiz' || deck === null) return;
    const round = deck.quiz[quizIndex];
    if (round === undefined) return;
    let cancelled = false;
    setQuizReady(false);
    setQuizResolved(false);
    setQuizWrongId(null);
    setSparkle(false);
    setArtFailed(false);
    setArtLoaded(false);
    const line = `Can you find the ${round.targetWord}? Tap the ${round.targetWord}!`;
    setCaption(line);
    void (async () => {
      await speak(line, mockModeRef.current);
      if (!cancelled) setQuizReady(true);
    })();
    return () => {
      cancelled = true;
      stopSpeaking();
    };
  }, [phase, quizIndex, deck]);

  function tapQuiz(option: { id: string; word: string }): void {
    if (deck === null) return;
    const round = deck.quiz[quizIndex];
    if (round === undefined) return;
    if (!quizReady || quizResolved) {
      sfx.tap();
      return;
    }
    if (option.id === round.targetId) {
      const attempts = attemptsRef.current + 1;
      setQuizResolved(true);
      setQuizWrongId(null);
      setSparkle(true);
      sfx.chime();
      setCaption(round.praise);
      api
        .post('/early/quiz', {
          childId,
          cardId: round.targetId,
          correct: attempts === 1,
          attempts
        })
        .catch(() => undefined);
      // Same sync rule as the word cards: advance only after the praise has
      // been fully spoken, so the next round never lands on top of the voice.
      const praise = round.praise;
      void (async () => {
        await speak(praise, mockModeRef.current);
        await sleep(600);
        if (!mounted.current || deck === null) return;
        attemptsRef.current = 0;
        if (quizIndex + 1 < deck.quiz.length) {
          setQuizIndex(quizIndex + 1);
        } else {
          setPhase('vignette');
        }
      })();
    } else {
      // Label the tapped picture AND restate the target: both are vocabulary.
      attemptsRef.current += 1;
      sfx.oops();
      setQuizWrongId(option.id);
      const line = `That's the ${option.word}! Let's find the ${round.targetWord}!`;
      setCaption(line);
      void speak(line, mockModeRef.current);
    }
  }

  // ------------------------------------------------- kindness corner narration
  useEffect(() => {
    if (phase !== 'vignette' || deck === null) return;
    const vig = deck.vignette;
    let cancelled = false;
    setVignetteAsk(false);
    setSparkle(false);
    setArtFailed(false);
    setArtLoaded(false);
    void (async () => {
      for (const line of vig.sceneLines) {
        if (cancelled) return;
        setCaption(line);
        await speak(line, mockModeRef.current);
        await sleep(400);
      }
      if (cancelled) return;
      setCaption(vig.question);
      await speak(vig.question, mockModeRef.current);
      if (!cancelled) setVignetteAsk(true);
    })();
    return () => {
      cancelled = true;
      stopSpeaking();
    };
  }, [phase, deck]);

  function answerKind(kind: boolean): void {
    if (!vignetteAsk || deck === null) return;
    setVignetteAsk(false);
    const vig = deck.vignette;
    void (async () => {
      if (kind) {
        sfx.chime();
        setSparkle(true);
        setCaption(vig.kindPraise);
        await speak(vig.kindPraise, mockModeRef.current);
      } else {
        // Never "wrong" — model the reading, then land on the same warmth.
        setCaption(vig.gentleFix);
        await speak(vig.gentleFix, mockModeRef.current);
        if (!mounted.current) return;
        await sleep(350);
        setCaption(vig.kindPraise);
        await speak(vig.kindPraise, mockModeRef.current);
      }
      api
        .post('/early/vignette-done', { childId, vignetteId: vig.id, answeredKind: kind })
        .catch(() => undefined);
      await sleep(1100);
      if (mounted.current) setPhase('done');
    })();
  }

  // ------------------------------------------------------------------ closing
  useEffect(() => {
    if (phase !== 'done') return;
    void speak('You did it! So many new words, and such a kind heart!', mockModeRef.current);
  }, [phase]);

  const mood: BuddyMood =
    phase === 'loading'
      ? 'think'
      : sparkle || phase === 'done'
        ? 'cheer'
        : vignetteAsk || (phase === 'quiz' && quizReady && !quizResolved)
          ? 'listen'
          : 'happy';

  // Which coaching line the grown-up should say along with Buddy. Mirrors the
  // card's own say -> ask -> praise arc: sparkle marks the celebration, and
  // tapReady marks the moment the child is being asked to find the picture.
  const coachMode: CoachMode = sparkle ? 'praise' : tapReady ? 'find' : 'look';

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

  if (phase === 'loading') {
    return (
      <div className="relative h-full overflow-hidden">
        <Scene theme="kindness" seed={childId} />
        <div className="relative z-10 flex h-full flex-col items-center justify-center gap-6 p-8 text-center">
          <Buddy mood="think" size={210} />
          <div className="bubble pop-in text-2xl font-bold">Buddy is finding your pictures… 🎨</div>
        </div>
      </div>
    );
  }

  if (phase === 'done' && deck !== null) {
    return (
      <div className="relative h-full overflow-hidden">
        <Scene theme="kindness" seed={childId} />
        <Celebration stars={deck.words.length} />
        <div className="relative z-10 flex h-full flex-col items-center justify-center gap-6 p-8 text-center">
          <Buddy mood="cheer" size={230} />
          <div className="bubble pop-in text-3xl font-bold">
            You met {deck.words.length} new words today! 🌟
          </div>
          <button type="button" className="btn-big btn-face-leaf btn-glow mt-2" onClick={onDone}>
            <span aria-hidden>🌈</span> Again soon!
          </button>
        </div>
      </div>
    );
  }

  if (deck === null) return null;

  // "Find it!" — three pictures on screen, tap the one Buddy named.
  if (phase === 'quiz') {
    const round = deck.quiz[quizIndex];
    if (round !== undefined) {
      return (
        <div className="relative h-full overflow-hidden">
          <Scene theme="kindness" seed={childId} />
          <div className="relative z-10 flex h-full flex-col items-center justify-center gap-5 p-6 text-center">
            <div className="flex gap-4 sm:gap-6">
              {round.options.map((opt) => (
                <QuizTile
                  key={`${quizIndex}-${opt.id}`}
                  option={opt}
                  dimmed={quizWrongId === opt.id}
                  glowing={quizReady && !quizResolved}
                  celebrated={quizResolved && opt.id === round.targetId}
                  onTap={() => tapQuiz(opt)}
                />
              ))}
            </div>
            <Buddy mood={mood} size={170} />
            <div className="bubble max-w-lg text-xl font-semibold" role="status" aria-live="polite">
              {caption}
            </div>
            <ParentCoach word={round.targetWord} mode={quizResolved ? 'praise' : 'find'} />
          </div>
        </div>
      );
    }
  }

  const artUrl = phase === 'vignette' ? deck.vignette.artUrl : card?.artUrl;
  const emoji = phase === 'vignette' ? '💚' : (card !== undefined ? (EMOJI[card.id] ?? '🖼️') : '🖼️');

  return (
    <div className="relative h-full overflow-hidden">
      <Scene theme="kindness" seed={childId} />

      <div className="relative z-10 flex h-full flex-col items-center justify-center gap-5 p-6 text-center">
        {/* The picture is the lesson — huge, tappable, and glowing when it
            is the child's turn. A failed picture degrades to a big emoji. */}
        <button
          type="button"
          onClick={tapPicture}
          className={`relative overflow-hidden rounded-3xl bg-white/70 shadow-xl transition ${
            tapReady ? 'ring-8 ring-amber-300 animate-pulse' : ''
          }`}
          aria-label={phase === 'vignette' ? deck.vignette.title : (card?.word ?? 'picture')}
        >
          {/*
           * The emoji shows WHILE the picture loads, not only when it fails.
           *
           * It used to render only on onError — and a slow response is not an
           * error, so a child asked "where is the cow?" stared at an empty
           * white box for the ~11s an illustration takes. The emoji is instant,
           * it is the right referent, and it is replaced the moment the real
           * art lands. Never show a two-year-old nothing.
           */}
          <div className="relative h-64 w-64 sm:h-80 sm:w-80">
            <div className="absolute inset-0 flex items-center justify-center text-9xl">
              <span aria-hidden>{emoji}</span>
            </div>
            {artUrl !== undefined && !artFailed && (
              <img
                src={artUrl}
                alt=""
                className={`absolute inset-0 h-full w-full object-cover transition-opacity duration-300 ${
                  artLoaded ? 'opacity-100' : 'opacity-0'
                }`}
                onLoad={() => setArtLoaded(true)}
                onError={() => setArtFailed(true)}
              />
            )}
          </div>
          {sparkle && (
            <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
              <span className="pop-in text-7xl" aria-hidden>✨🎉✨</span>
            </div>
          )}
        </button>

        {/* Kindness Corner: the question gets two big warm answers, never a
            wrong one — the "not kind" tap is modeled, then celebrated too. */}
        {vignetteAsk ? (
          <div className="flex gap-6">
            <button
              type="button"
              className="btn-big btn-face-leaf"
              onClick={() => answerKind(true)}
            >
              <span aria-hidden>💚</span> Kind!
            </button>
            <button
              type="button"
              className="btn-big"
              onClick={() => answerKind(false)}
            >
              <span aria-hidden>🤔</span> Hmm…
            </button>
          </div>
        ) : (
          <Buddy mood={mood} size={170} />
        )}

        {/* Grown-up caption — co-viewing support, never load-bearing for the
            child (they do not need to read anything to play). */}
        <div className="bubble max-w-lg text-xl font-semibold" role="status" aria-live="polite">
              {caption}
            </div>
        {card !== undefined && phase === 'card' && (
          <ParentCoach word={card.word} mode={coachMode} />
        )}
      </div>
    </div>
  );
}

/** One quiz picture tile. A wrong tap dims it (the caption labels it); the
 *  right one sparkles. Art failure degrades to the friendly emoji. */
function QuizTile({
  option,
  dimmed,
  glowing,
  celebrated,
  onTap
}: {
  option: { id: string; word: string; artUrl: string };
  dimmed: boolean;
  glowing: boolean;
  celebrated: boolean;
  onTap: () => void;
}) {
  const [failed, setFailed] = useState(false);
  const [loaded, setLoaded] = useState(false);
  return (
    <button
      type="button"
      onClick={onTap}
      className={`relative overflow-hidden rounded-3xl bg-white/70 shadow-xl transition ${
        celebrated ? 'ring-8 ring-amber-300' : glowing ? 'ring-4 ring-amber-200' : ''
      } ${dimmed ? 'opacity-50 saturate-50' : ''}`}
      aria-label={option.word}
    >
      {/* Same rule as the main card: the referent is visible immediately, and
          the drawn picture fades in over it when it arrives. */}
      <div className="relative h-36 w-32 sm:h-44 sm:w-40">
        <div className="absolute inset-0 flex items-center justify-center text-7xl">
          <span aria-hidden>{EMOJI[option.id] ?? '🖼️'}</span>
        </div>
        {!failed && (
          <img
            src={option.artUrl}
            alt=""
            className={`absolute inset-0 h-full w-full object-cover transition-opacity duration-300 ${
              loaded ? 'opacity-100' : 'opacity-0'
            }`}
            onLoad={() => setLoaded(true)}
            onError={() => setFailed(true)}
          />
        )}
      </div>
      {celebrated && (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
          <span className="pop-in text-5xl" aria-hidden>✨</span>
        </div>
      )}
    </button>
  );
}
