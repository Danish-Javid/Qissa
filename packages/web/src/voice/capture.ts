/**
 * Voice input — mic capture with client-side VAD and live recognition.
 *
 * Design (plan §Phase 3 voice):
 *  - Web Speech API is the recognizer in the browser; its transcript is
 *    ALSO posted to /api/asr. In mock mode the server trusts it; in real
 *    mode the server re-recognizes the audio with Paraformer and ignores
 *    this text entirely (the field exists only for the mock).
 *  - Client VAD = speech-activity window: the child gets a generous grace
 *    window to START (six seconds — thinking time is not silence), then
 *    recording ends after 2.2s of silence once speech has begun, or a hard
 *    15s ceiling — a four-year-old line is never longer.
 *  - If Web Speech is unavailable, captureReadingLine resolves with an
 *    empty transcript and the reading screen falls back to "I read it!"
 *    (the line counts as attempted; miscue detail is simply absent).
 *
 * Privacy (NFR-3): audio bytes go ONLY to our own /api endpoints. The mic
 * stream is opened per line and closed immediately after — the mic is
 * never hot outside a reading turn.
 */

interface SpeechRecognitionLike {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  start(): void;
  stop(): void;
  onresult: ((event: SpeechRecognitionEventLike) => void) | null;
  onend: (() => void) | null;
  onerror: ((event: { error?: string }) => void) | null;
}

interface SpeechRecognitionEventLike {
  results: ArrayLike<ArrayLike<{ transcript: string }>>;
}

function recognitionCtor(): (new () => SpeechRecognitionLike) | null {
  const w = window as unknown as Record<string, unknown>;
  return (w.SpeechRecognition as new () => SpeechRecognitionLike) ?? (w.webkitSpeechRecognition as new () => SpeechRecognitionLike) ?? null;
}

export function isSpeechRecognitionAvailable(): boolean {
  return recognitionCtor() !== null;
}

export interface VoiceLineResult {
  /** Lowercased word tokens in spoken order. */
  words: string[];
  /** Word indices where the child paused noticeably (hesitation signal). */
  hesitations: number[];
  /** Base64 mic audio for server-side ASR + consented retention. */
  audioBase64: string | null;
  /** False when no recognizer exists and the UI should offer tap-mode. */
  usedRecognition: boolean;
}

let busy = false;

const SILENCE_MS = 2200;
/** Grace to START speaking — a child looking at the page is not a child
 *  who has nothing to say. Only speech-beginning ends the grace early. */
const FIRST_SPEECH_MS = 6000;
const CEILING_MS = 15000;

/** Server-ASR circuit breaker: after one 502 (vendor deployment missing),
 *  skip the doomed round-trip on every line for five minutes — the browser
 *  transcript and tap mode carry the session honestly meanwhile. */
let asrDownUntil = 0;

export function asrCircuitOpen(): boolean {
  return Date.now() < asrDownUntil;
}

export function markAsrDown(): void {
  asrDownUntil = Date.now() + 5 * 60_000;
}

/** Warm the mic permission during a calm, intentional tap (the "I'm ready!"
 *  button). Browsers only show the permission prompt inside a user gesture;
 *  once granted, every later AUTO-listen opens silently — which is what makes
 *  the hands-free reading loop possible for a four-year-old. */
export function warmMicrophonePermission(): void {
  const devices = navigator.mediaDevices;
  if (devices === undefined) return;
  devices
    .getUserMedia({ audio: true })
    .then((stream) => stream.getTracks().forEach((t) => t.stop()))
    .catch(() => undefined); // declined or no mic — the loop degrades honestly
}

/**
 * Listen for one reading line. Resolves once; never rejects — every failure
 * mode degrades to an empty transcript so the story can always continue.
 */
export async function captureReadingLine(): Promise<VoiceLineResult> {
  if (busy) return { words: [], hesitations: [], audioBase64: null, usedRecognition: false };
  busy = true;
  try {
    const audioPromise = startMicCapture();
    const Ctor = recognitionCtor();
    if (Ctor === null) {
      const audioBase64 = await audioPromise;
      return { words: [], hesitations: [], audioBase64, usedRecognition: false };
    }

    return await new Promise<VoiceLineResult>((resolve) => {
      const recognition = new Ctor();
      recognition.lang = 'en-US';
      recognition.continuous = true;
      recognition.interimResults = true;

      const chunks: string[] = [];
      let lastResultAt = Date.now();
      let settled = false;

      const finish = (): void => {
        if (settled) return;
        settled = true;
        clearTimeout(silenceTimer);
        clearTimeout(ceilingTimer);
        try {
          recognition.stop();
        } catch {
          // Already stopped — harmless.
        }
        stopMicCapture();
        const words = chunks
          .join(' ')
          .toLowerCase()
          .split(/[^a-z']+/)
          .filter((t) => t.length > 0);
        // A pause longer than the VAD window between result bursts marks a
        // hesitation at the boundary; approximate as the next word index.
        const hesitations = pauseMarks.map((mark) => Math.min(mark, Math.max(words.length - 1, 0)));
        void audioPromise.then((b64) => resolve({ words, hesitations, audioBase64: b64, usedRecognition: true }));
      };

      const pauseMarks: number[] = [];
      let wordCount = 0;

      // Grace first: the silence window only arms once speech has begun,
      // so a child who needs a moment to start is never cut off mid-thought.
      let silenceTimer = setTimeout(finish, FIRST_SPEECH_MS);
      const ceilingTimer = setTimeout(finish, CEILING_MS);

      recognition.onresult = (event) => {
        const now = Date.now();
        if (now - lastResultAt > 900 && wordCount > 0) pauseMarks.push(wordCount);
        lastResultAt = now;
        clearTimeout(silenceTimer);
        silenceTimer = setTimeout(finish, SILENCE_MS);

        let finalText = '';
        for (let i = 0; i < event.results.length; i++) {
          const result = event.results[i];
          if (result !== undefined && result.length > 0) finalText += result[0]?.transcript ?? '';
        }
        chunks.length = 0;
        chunks.push(finalText);
        wordCount = finalText.split(/\s+/).filter((t) => t.length > 0).length;
      };
      recognition.onend = finish;
      recognition.onerror = () => finish();

      try {
        recognition.start();
      } catch {
        finish();
      }
    });
  } finally {
    busy = false;
  }
}

// ---------------------------------------------------------------------------
// Mic capture (best effort — recognition works without it)
// ---------------------------------------------------------------------------

let mediaRecorder: MediaRecorder | null = null;
let micStream: MediaStream | null = null;
let recorded: BlobPart[] = [];

function startMicCapture(): Promise<string | null> {
  return navigator.mediaDevices
    .getUserMedia({ audio: true })
    .then(
      (stream) => {
        micStream = stream;
        recorded = [];
        mediaRecorder = new MediaRecorder(stream);
        mediaRecorder.ondataavailable = (event) => {
          if (event.data.size > 0) recorded.push(event.data);
        };
        mediaRecorder.start();
        return new Promise<string | null>((resolve) => {
          // Resolved by stopMicCapture once the final blob arrives.
          micResolve = resolve;
        });
      }
    )
    .catch(() => {
      // No mic permission: recognition still works (in-browser), and the
      // server simply gets no audio to retain. Consent respected by absence.
      return null;
    });
}

let micResolve: ((value: string | null) => void) | null = null;

function stopMicCapture(): void {
  const resolveFn = micResolve;
  micResolve = null;

  const close = (): void => {
    micStream?.getTracks().forEach((t) => t.stop());
    micStream = null;
    mediaRecorder = null;
  };

  if (mediaRecorder === null || mediaRecorder.state === 'inactive') {
    close();
    resolveFn?.(null);
    return;
  }
  mediaRecorder.onstop = () => {
    const blob = new Blob(recorded, { type: mediaRecorder?.mimeType ?? 'audio/webm' });
    close();
    if (blob.size === 0) {
      resolveFn?.(null);
      return;
    }
    blobToBase64(blob).then(resolveFn ?? (() => undefined));
  };
  mediaRecorder.stop();
}

function blobToBase64(blob: Blob): Promise<string | null> {
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result;
      if (typeof result !== 'string') return resolve(null);
      // Data URL: strip the "data:...;base64," prefix.
      resolve(result.slice(result.indexOf(',') + 1));
    };
    reader.onerror = () => resolve(null);
    reader.readAsDataURL(blob);
  });
}
