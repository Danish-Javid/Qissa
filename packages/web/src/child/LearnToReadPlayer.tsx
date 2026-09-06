/**
 * LearnToReadPlayer — the standalone "Learn to Read" lesson (ages 3–6).
 *
 * This is the "Toddlers Can Read" method (Spencer Russell) as a warm 1-on-1
 * lesson, NOT a story. It teaches reading in TCR's three confidence-first
 * steps, exactly as the video does:
 *   1. letter SOUNDS — the sound, never the letter name ("/s/ … /s/"), each
 *      anchored to a decodable word the child can already sound out;
 *   2. BLENDING — put the sounds together into a word ("/s/ … /a/ … /t/ …
 *      sat!"), then the child says it and Buddy hears them (mic check);
 *   3. a few SIGHT words — the high-frequency "tricky" words taught whole.
 * It closes with a fluency "word wall" and a personalized FLUX gift.
 *
 * What one lesson teaches is pure, adaptive pedagogy computed server-side
 * (buildLessonPlan in @qissa/core) from the child's mastery model: the next
 * sounds they have NOT met, real decodable words to blend with them, and the
 * next tricky words. So the lesson always moves THIS child forward and never
 * offers a word she cannot yet sound out (fail-closed, like the whole engine).
 *
 * Engagement follows the house pattern (EarlyPlayer/StoryTimePlayer): Buddy is
 * always visible and mirrors the moment; every success has visual + auditory
 * feedback; a miss is warmed over with a model and ONE gentle retry, then
 * Buddy says the word and moves on — never punitive, never a dead end. The mic
 * opens on a tap; if the browser cannot hear, the modeling still happens and
 * the child simply taps through (honest degradation, no pretending).
 */
import { useEffect, useMemo, useRef, useState, type ReactElement, type ReactNode } from 'react';
import {
  matchesWithAccent,
  type LessonBlendWord,
  type LessonPlan,
  type LessonSightWord,
  type LessonSound
} from '@qissa/core';
import { api } from '../api/client.js';
import type { LessonResponse } from '../api/types.js';
import { speak, stopSpeaking } from '../lib/speech.js';
import { sfx } from '../lib/sfx.js';
import { captureReadingLine, isSpeechRecognitionAvailable, warmMicrophonePermission } from '../voice/capture.js';
import { Buddy, type BuddyMood } from './Buddy.js';
import { Celebration } from './Celebration.js';
import { Scene } from './Scene.js';

interface Props {
  childId: string;
  mockMode: boolean;
  onDone: () => void;
}

type Phase = 'loading' | 'intro' | 'step' | 'gift' | 'grownup';
type BlendPhase = 'sounds' | 'blend' | 'check';

/** One flat beat of the lesson, walked in order. */
type Step =
  | { kind: 'sound'; sound: LessonSound }
  | { kind: 'blend'; word: LessonBlendWord }
  | { kind: 'sight'; word: LessonSightWord }
  | { kind: 'fluency' };

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/** One FLUX picture-book illustration for a concrete word, so the child SEEES
 *  the thing Buddy is naming and the sound sticks to an image. The player warms
 *  these ahead, so this usually resolves from the on-disk cache instantly; while
 *  it paints (or if it never arrives) a soft placeholder keeps the layout calm
 *  and the voice carries on — a missing picture never stalls the lesson. */
function WordPicture({ url, label }: { url: string; label: string }): ReactElement {
  const [loaded, setLoaded] = useState(false);
  const [ok, setOk] = useState(true);
  return (
    <div className="pop-in relative h-32 w-40 overflow-hidden rounded-3xl bg-white/80 shadow-xl sm:h-40 sm:w-52">
      {!loaded && ok && (
        <div className="absolute inset-0 flex items-center justify-center text-4xl" aria-hidden>
          🎨
        </div>
      )}
      {ok ? (
        <img
          src={url}
          alt={label}
          className="h-full w-full object-cover"
          onLoad={() => setLoaded(true)}
          onError={() => setOk(false)}
        />
      ) : (
        <div className="flex h-full items-center justify-center text-5xl" aria-hidden>
          🖼️
        </div>
      )}
    </div>
  );
}

export function LearnToReadPlayer({ childId, mockMode, onDone }: Props) {
  const [plan, setPlan] = useState<LessonPlan | null>(null);
  const [giftUrl, setGiftUrl] = useState<string | null>(null);
  // word -> FLUX picture URL, for the concrete words this lesson names.
  const [art, setArt] = useState<Record<string, string>>({});
  const [phase, setPhase] = useState<Phase>('loading');
  const [stepIndex, setStepIndex] = useState(0);
  const [blendPhase, setBlendPhase] = useState<BlendPhase>('sounds');
  const [caption, setCaption] = useState('');
  const [listening, setListening] = useState(false);
  // null = not checked yet; true = the child said it; false = a warm miss.
  const [saidIt, setSaidIt] = useState<boolean | null>(null);
  const [attempts, setAttempts] = useState(0);
  const [stars, setStars] = useState(0);
  const [sparkle, setSparkle] = useState(false);
  // Bumping this re-runs the current step's modeling ("Hear it again").
  const [replayKey, setReplayKey] = useState(0);
  // Fluency: what Buddy heard on the "read them all" turn (null = not yet).
  const [fluencyHeard, setFluencyHeard] = useState<string[] | null>(null);
  // Every word the child was ASKED to produce, and what actually happened.
  // A ref, not state: the async mic handlers append across awaits, and a
  // re-render must never lose an observation. This is the only thing that
  // moves the learner model — serving the lesson moves nothing.
  const outcomesRef = useRef<{ word: string; correct: boolean; assisted?: boolean }[]>([]);
  const [giftOk, setGiftOk] = useState(true);
  const [giftLoaded, setGiftLoaded] = useState(false);

  const mounted = useRef(true);
  const loadedRef = useRef(false); // one POST /lessons per mount (no double-credit)
  const micBusyRef = useRef(false); // never open the mic twice at once
  const genRef = useRef(0); // cancels a stale step's speak/timers on advance
  // mockMode arrives async from /metrics-demo; narration reads it through a
  // ref so the flip never restarts (and cuts off) a line already being spoken.
  const mockModeRef = useRef(mockMode);
  useEffect(() => {
    mockModeRef.current = mockMode;
  }, [mockMode]);

  const canHear = isSpeechRecognitionAvailable();

  // The lesson as a flat script of beats: sounds, then blends, then sight
  // words, then one fluency "word wall". Memoised on the plan.
  const steps = useMemo<Step[]>(() => {
    if (plan === null) return [];
    return [
      ...plan.newSounds.map((sound) => ({ kind: 'sound', sound }) as Step),
      ...plan.blendWords.map((word) => ({ kind: 'blend', word }) as Step),
      ...plan.sightWords.map((word) => ({ kind: 'sight', word }) as Step),
      { kind: 'fluency' } as Step
    ];
  }, [plan]);

  const step = steps[stepIndex];

  // The concrete word this beat names (a sound's anchor or a blend word) and
  // its FLUX picture, when the curriculum has a drawable referent for it.
  const stepWord = step?.kind === 'sound' ? step.sound.exampleWord : step?.kind === 'blend' ? step.word.word : null;
  const stepPicture = stepWord === null ? undefined : art[stepWord];

  // ------------------------------------------------------------------- load
  // POST /lessons builds the plan (pure) and advances the mastery model on
  // serve — exactly like the read-along credits on serve. Warm the closing
  // gift immediately so it is ready by the time the lesson ends.
  useEffect(() => {
    mounted.current = true;
    if (!loadedRef.current) {
      loadedRef.current = true;
      api
        .post<LessonResponse>('/lessons', { childId })
        .then((response) => {
          if (!mounted.current) return;
          setPlan(response.plan);
          setArt(response.art ?? {});
          setGiftUrl(response.giftUrl);
          setPhase('intro');
          void fetch(response.giftUrl, { credentials: 'same-origin' }).catch(() => undefined);
        })
        .catch(() => {
          if (mounted.current) setPhase('grownup');
        });
    }
    return () => {
      mounted.current = false;
      stopSpeaking();
    };
  }, [childId]);

  // --------------------------------------------------- warm the word pictures
  // Fetch this lesson's illustrations THREE-WIDE while the intro is up, so each
  // step's picture is already on disk (the server dedups against the visible
  // <img>) by the time Buddy names the word. Same pattern as Story Time's art.
  useEffect(() => {
    const urls = Object.values(art);
    if (urls.length === 0) return;
    const controller = new AbortController();
    const queue = [...urls];
    const worker = async (): Promise<void> => {
      for (;;) {
        if (controller.signal.aborted) return;
        const next = queue.shift();
        if (next === undefined) return;
        await fetch(next, { credentials: 'same-origin', signal: controller.signal }).catch(() => undefined);
      }
    };
    void Promise.all([worker(), worker(), worker()]);
    return () => controller.abort();
  }, [art]);

  // Walking past the last beat lands the celebration — and reports what the
  // child actually did. This submission is the ONLY thing that moves the
  // learner model: serving the lesson deliberately teaches nothing, so a
  // lesson skipped in silence sends an empty list and advances nothing.
  //
  // Fire-and-forget on purpose. A failed submission costs one lesson's
  // evidence; blocking the celebration on a network round trip would cost the
  // child her ending, and she is five.
  const submittedRef = useRef(false);
  useEffect(() => {
    if (phase !== 'step' || steps.length === 0 || stepIndex < steps.length) return;
    setPhase('gift');
    if (submittedRef.current) return;
    submittedRef.current = true;
    void api
      .post('/lessons/outcomes', { childId, outcomes: outcomesRef.current })
      .catch(() => undefined);
  }, [phase, stepIndex, steps.length, childId]);

  // ------------------------------------------------------- model each beat
  // Buddy speaks the current beat. Passive modeling auto-sequences (a blend
  // step runs sounds → blend → check); interaction beats (check, sight repeat,
  // fluency) stop and wait for the child. A generation counter + `cancelled`
  // flag make an advance or a "hear it again" cleanly supersede the last run.
  useEffect(() => {
    if (phase !== 'step' || step === undefined) return;
    const gen = ++genRef.current;
    const alive = (): boolean => mounted.current && genRef.current === gen;
    let cancelled = false;
    setSparkle(false);

    void (async () => {
      if (step.kind === 'sound') {
        setSaidIt(null);
        setCaption(`${step.sound.soundCue} … ${step.sound.soundCue}`);
        await speak(`${step.sound.soundCue} … ${step.sound.soundCue}`, mockModeRef.current);
        if (cancelled || !alive()) return;
        await sleep(320);
        if (cancelled || !alive()) return;
        const line = `${step.sound.grapheme} says ${step.sound.soundCue}. ${step.sound.exampleSegments.join(' ')} … ${step.sound.exampleWord}!`;
        setCaption(line);
        await speak(line, mockModeRef.current);
      } else if (step.kind === 'blend') {
        if (blendPhase === 'sounds') {
          const line = step.word.segments.join(' … ');
          setCaption(line);
          await speak(line, mockModeRef.current);
          if (cancelled || !alive()) return;
          await sleep(420);
          if (cancelled || !alive()) return;
          setBlendPhase('blend');
        } else if (blendPhase === 'blend') {
          const line = `Put it together… ${step.word.word}!`;
          setCaption(line);
          await speak(line, mockModeRef.current);
          if (cancelled || !alive()) return;
          await sleep(420);
          if (cancelled || !alive()) return;
          setBlendPhase('check');
        } else {
          setSaidIt(null);
          const line = canHear ? `Now you say “${step.word.word}”!` : `That word is “${step.word.word}”!`;
          setCaption(line);
          await speak(canHear ? `Now you say ${step.word.word}!` : `That word is ${step.word.word}!`, mockModeRef.current);
        }
      } else if (step.kind === 'sight') {
        setSaidIt(null);
        const line = `This tricky word is “${step.word.word}”. You just remember it!`;
        setCaption(line);
        await speak(line, mockModeRef.current);
        if (cancelled || !alive()) return;
        await sleep(360);
        if (cancelled || !alive()) return;
        if (canHear) {
          setCaption(`Say “${step.word.word}”!`);
          await speak(`Say ${step.word.word}!`, mockModeRef.current);
        } else {
          setCaption(`“${step.word.word}” — got it!`);
        }
      } else {
        const line = `Look at all the words you can read! Let’s read them together.`;
        setCaption(line);
        await speak(line, mockModeRef.current);
      }
    })();

    return () => {
      cancelled = true;
      stopSpeaking();
    };
  }, [phase, stepIndex, blendPhase, replayKey, canHear, step]);

  // ------------------------------------------------------------- navigation
  /** Move to the next beat, cancelling anything in flight for this one. */
  function advance(): void {
    genRef.current += 1;
    stopSpeaking();
    setBlendPhase('sounds');
    setSaidIt(null);
    setAttempts(0);
    setSparkle(false);
    setFluencyHeard(null);
    setStepIndex((i) => i + 1);
  }

  function next(): void {
    sfx.tap();
    advance();
  }

  function hearAgain(): void {
    sfx.tap();
    setReplayKey((k) => k + 1);
  }

  function begin(): void {
    sfx.tap();
    // The one intentional tap doubles as the mic-permission moment: the
    // browser prompts here (a calm beat), so later listens are silent.
    warmMicrophonePermission();
    setStepIndex(0);
    setBlendPhase('sounds');
    setPhase('step');
  }

  /** The "your turn" mic check for one word — accent-tolerant, never hangs
   *  (captureReadingLine always resolves). A hit celebrates; a miss re-models
   *  once, then Buddy says the word and moves on with a participation star. */
  async function hearWord(word: string): Promise<void> {
    if (micBusyRef.current || listening) return;
    micBusyRef.current = true;
    try {
      setListening(true);
      const capture = await captureReadingLine();
      if (!mounted.current) return;
      setListening(false);
      const said = capture.words.some((w) => matchesWithAccent(word, w));
      if (said) {
        // Unaided on the first ask is the only evidence that counts toward
        // introducing a sound; after a model it is repetition, not decoding.
        outcomesRef.current.push({ word, correct: true, assisted: attempts > 0 });
        sfx.chime();
        setSparkle(true);
        setSaidIt(true);
        setStars((s) => s + 1);
        setCaption(`You said “${word}”! 🌟`);
        await speak(`You said ${word}! Great reading!`, mockModeRef.current);
        if (!mounted.current) return;
        await sleep(700);
        if (!mounted.current) return;
        advance();
      } else if (attempts < 1) {
        setAttempts(1);
        setSaidIt(false);
        sfx.oops();
        const line = `That word is “${word}”. Let’s say it together — ${word}!`;
        setCaption(line);
        await speak(line, mockModeRef.current);
      } else {
        // Never punitive: model it, award the participation star, move on.
        // Recorded as a miss — a wrong answer is evidence too, and it feeds
        // the same reteach and spaced-repetition machinery a misread does.
        outcomesRef.current.push({ word, correct: false });
        setSaidIt(false);
        setStars((s) => s + 1);
        setCaption(`Nice try! That word is “${word}”. Here comes the next one!`);
        await speak(`Nice try. That word is ${word}.`, mockModeRef.current);
        if (!mounted.current) return;
        await sleep(700);
        if (!mounted.current) return;
        advance();
      }
    } finally {
      micBusyRef.current = false;
    }
  }

  /** Fluency: the child reads the whole word wall; chips light up as heard. */
  async function readAll(): Promise<void> {
    if (micBusyRef.current || listening || plan === null) return;
    micBusyRef.current = true;
    try {
      setListening(true);
      const capture = await captureReadingLine();
      if (!mounted.current) return;
      setListening(false);
      setFluencyHeard(capture.words);
      const heard = plan.blendWords.filter((w) => capture.words.some((h) => matchesWithAccent(w.word, h)));
      for (const w of plan.blendWords) {
        outcomesRef.current.push({ word: w.word, correct: heard.includes(w) });
      }

      // Say what actually happened. This used to congratulate the child for
      // reading them ALL even when the transcript contained none of the words
      // — warm, and a lie a five-year-old cannot check. Warmth does not
      // require pretending.
      const total = plan.blendWords.length;
      const line =
        heard.length === 0
          ? 'Buddy could not hear that one. Let us try again together!'
          : heard.length === total
            ? 'You read them all! What a reader!'
            : `You read ${heard.length} of them! Let us keep going.`;
      if (heard.length > 0) {
        sfx.chime();
        setSparkle(true);
        setStars((s) => s + heard.length);
      }
      setCaption(heard.length === 0 ? `${line} 🎤` : `${line} 🌟`);
      await speak(line, mockModeRef.current);
    } finally {
      micBusyRef.current = false;
    }
  }

  const mood: BuddyMood =
    phase === 'loading'
      ? 'think'
      : listening
        ? 'listen'
        : sparkle || phase === 'gift'
          ? 'cheer'
          : saidIt === false
            ? 'kind'
            : 'happy';

  // ------------------------------------------------------------- the shells
  const shell = (children: ReactNode): ReactElement => (
    <div className="relative h-full overflow-hidden">
      <Scene theme="curiosity" seed={childId} />
      <div className="relative z-10 flex h-full flex-col items-center justify-center gap-5 p-6 text-center">
        {children}
      </div>
    </div>
  );

  if (phase === 'grownup') {
    return shell(
      <>
        <Buddy mood="kind" size={190} />
        <div className="bubble pop-in max-w-md text-2xl font-bold">
          Please hand the device to a grown-up for a moment.
        </div>
      </>
    );
  }

  if (phase === 'loading' || plan === null) {
    return shell(
      <>
        <Buddy mood="think" size={210} />
        <div className="bubble pop-in text-2xl font-bold">Buddy is getting your lesson ready… 🔤</div>
      </>
    );
  }

  if (phase === 'intro') {
    return shell(
      <>
        <Buddy mood="happy" size={220} />
        <div className="bubble pop-in max-w-lg text-3xl font-bold">
          Hi {plan.childName}! Ready to {plan.isReview ? 'practice reading' : 'learn to read'}?
        </div>
        {/* The three TCR steps, so the co-viewing grown-up sees the shape. */}
        <div className="flex flex-wrap justify-center gap-2 text-base font-semibold text-ink/70">
          <span className="word-chip">🔤 {plan.newSounds.length} new sounds</span>
          <span className="word-chip">🧩 {plan.blendWords.length} words to blend</span>
          <span className="word-chip">⭐ {plan.sightWords.length} tricky words</span>
        </div>
        <button type="button" className="btn-big btn-face-leaf btn-glow" onClick={begin}>
          <span aria-hidden>🔊</span> Let’s go!
        </button>
      </>
    );
  }

  if (phase === 'gift') {
    return (
      <div className="relative h-full overflow-hidden">
        <Scene theme="curiosity" seed={childId} />
        <Celebration stars={Math.max(1, stars)} />
        <div className="relative z-10 flex h-full flex-col items-center justify-center gap-4 overflow-y-auto p-6 text-center">
          <Buddy mood="cheer" size={150} />
          <h2 className="font-story text-4xl font-bold sm:text-5xl">
            {plan !== null && plan.isReview ? 'What great practice!' : 'You can read!'}
          </h2>
          {giftOk && giftUrl !== null && (
            <div className="pop-in relative w-full max-w-xs overflow-hidden rounded-3xl bg-white/80 shadow-xl">
              {!giftLoaded && (
                <div className="absolute inset-0 flex items-center justify-center text-4xl" aria-hidden>
                  🎁
                </div>
              )}
              <img
                src={giftUrl}
                alt="Your reading keepsake"
                className="h-40 w-full object-cover sm:h-48"
                onLoad={() => setGiftLoaded(true)}
                onError={() => setGiftOk(false)}
              />
            </div>
          )}
          <div className="bubble pop-in max-w-md text-xl sm:text-2xl">
            You earned {Math.max(1, stars)} {stars === 1 ? 'star' : 'stars'}! Tell your grown-up what you read.
          </div>
          <button type="button" className="btn-big btn-face-sun" onClick={onDone}>
            <span aria-hidden>🌈</span> Again soon!
          </button>
        </div>
      </div>
    );
  }

  // ---------------------------------------------------------- phase === 'step'
  return shell(
    <>
      {/* Star trail — progress made concrete. */}
      <div className="absolute right-4 top-4 rounded-full bg-white/70 px-3 py-1 text-lg font-bold text-ink shadow">
        ⭐ {stars}
      </div>

      {step?.kind === 'sound' && (
        <div className="flex flex-col items-center gap-4">
          {/* The letter, huge — and the SOUND, which is the whole point. */}
          <div className="pop-in flex h-40 w-40 items-center justify-center rounded-3xl bg-white/85 shadow-xl sm:h-48 sm:w-48">
            <span className="font-story text-8xl font-bold text-clay sm:text-9xl">{step.sound.grapheme}</span>
          </div>
          <div className="word-chip text-3xl font-bold text-leaf">{step.sound.soundCue}</div>
          {stepWord !== null && stepPicture !== undefined && (
            <WordPicture key={stepWord} url={stepPicture} label={stepWord} />
          )}
          <div className="flex flex-wrap items-center justify-center gap-2">
            {step.sound.exampleSegments.map((seg, i) => (
              <span key={`${seg}-${i}`} className="word-chip text-2xl font-semibold">
                {seg}
              </span>
            ))}
            <span aria-hidden className="text-2xl text-ink/60">
              →
            </span>
            <span className="font-story text-4xl font-bold text-ink">{step.sound.exampleWord}</span>
          </div>
        </div>
      )}

      {step?.kind === 'blend' && (
        <div className="relative flex flex-col items-center gap-4">
          {sparkle && saidIt === true && (
            <span className="pop-in absolute -top-6 text-6xl" aria-hidden>
              ✨
            </span>
          )}
          {stepWord !== null && stepPicture !== undefined && (
            <WordPicture key={stepWord} url={stepPicture} label={stepWord} />
          )}
          {/* Segments light the blend; the whole word is the payoff. */}
          <div className="flex flex-wrap items-center justify-center gap-2">
            {step.word.segments.map((seg, i) => (
              <span
                key={`${seg}-${i}`}
                className={`word-chip text-2xl font-semibold ${blendPhase === 'sounds' ? 'bg-leaf/20' : ''}`}
              >
                {seg}
              </span>
            ))}
          </div>
          <div
            className={`pop-in flex min-h-28 items-center justify-center rounded-3xl bg-white/85 px-8 shadow-xl ${
              saidIt === true ? 'ring-8 ring-amber-300' : ''
            }`}
          >
            <span className="font-story text-6xl font-bold text-ink sm:text-7xl">{step.word.word}</span>
          </div>
        </div>
      )}

      {step?.kind === 'sight' && (
        <div className="relative flex flex-col items-center gap-3">
          {sparkle && saidIt === true && (
            <span className="pop-in absolute -top-6 text-6xl" aria-hidden>
              ✨
            </span>
          )}
          <div className="text-lg font-bold uppercase tracking-wide text-ink/60">Tricky word</div>
          <div
            className={`pop-in flex min-h-28 items-center justify-center rounded-3xl bg-gold/40 px-10 shadow-xl ${
              saidIt === true ? 'ring-8 ring-amber-300' : ''
            }`}
          >
            <span className="font-story text-6xl font-bold text-ink sm:text-7xl">{step.word.word}</span>
          </div>
        </div>
      )}

      {step?.kind === 'fluency' && (
        <div className="flex flex-col items-center gap-4">
          <div className="text-lg font-bold uppercase tracking-wide text-ink/60">Your word wall</div>
          <div className="flex max-w-2xl flex-wrap items-center justify-center gap-3">
            {plan.blendWords.map((w) => {
              const heard = fluencyHeard !== null && fluencyHeard.some((h) => matchesWithAccent(w.word, h));
              return (
                <span
                  key={w.word}
                  className={`word-chip text-3xl font-bold ${heard ? 'bg-leaf/20 text-leaf' : 'text-ink'}`}
                >
                  {heard ? '✓ ' : ''}
                  {w.word}
                </span>
              );
            })}
            {plan.sightWords.map((w) => (
              <span key={w.word} className="word-chip bg-gold/40 text-3xl font-bold text-ink">
                {w.word}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Buddy + caption — always visible, always the voice of the lesson. */}
      {listening ? (
        <div className="relative flex items-center justify-center" aria-label="Listening">
          <span className="mic-ring absolute h-16 w-16 rounded-full bg-clay/30" />
          <span className="mic-ring absolute h-16 w-16 rounded-full bg-clay/20" style={{ animationDelay: '0.5s' }} />
          <span className="relative text-5xl" aria-hidden>
            🎙️
          </span>
        </div>
      ) : (
        <Buddy mood={mood} size={150} />
      )}
      <div className="bubble max-w-lg text-xl font-semibold sm:text-2xl" role="status" aria-live="polite">
        {caption}
      </div>

      {/* One clear primary action per beat; a Next escape hatch is always
          present so nobody is ever stuck waiting on the mic. */}
      <div className="flex flex-wrap items-center justify-center gap-4">
        {step?.kind === 'blend' && blendPhase === 'check' && canHear && (
          <button
            type="button"
            className="btn-big btn-face-leaf btn-glow"
            disabled={listening}
            onClick={() => void hearWord(step.word.word)}
          >
            <span aria-hidden>🎙️</span> Say “{step.word.word}”
          </button>
        )}
        {step?.kind === 'sight' && canHear && saidIt !== true && (
          <button
            type="button"
            className="btn-big btn-face-leaf btn-glow"
            disabled={listening}
            onClick={() => void hearWord(step.word.word)}
          >
            <span aria-hidden>🎙️</span> Say “{step.word.word}”
          </button>
        )}
        {step?.kind === 'fluency' && canHear && fluencyHeard === null && (
          <button type="button" className="btn-big btn-face-leaf btn-glow" disabled={listening} onClick={() => void readAll()}>
            <span aria-hidden>🎙️</span> Read them all!
          </button>
        )}
        <button type="button" className="btn-big btn-face-sun" disabled={listening} onClick={hearAgain}>
          <span aria-hidden>🔊</span> Hear it again
        </button>
        <button type="button" className="btn-big btn-face-mist" disabled={listening} onClick={next}>
          {step?.kind === 'fluency' ? 'My gift' : 'Next'} <span aria-hidden>➡️</span>
        </button>
      </div>
      {!canHear && <p className="text-sm text-ink/70">No microphone hearing in this browser — tap Next to keep going.</p>}
    </>
  );
}
