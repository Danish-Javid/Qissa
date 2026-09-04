/**
 * Voice output — how the companion speaks.
 *
 * Primary path: POST /api/tts and play the returned audio (exercises the
 * full CosyVoice/mock pipeline incl. the phrase cache and the server-side
 * content filter). Fallback: the browser's SpeechSynthesis — used when the
 * TTS call fails, and ALWAYS in mock mode, because the mock synthesizer
 * emits silence by design (the pipeline shape matters, not the waveform).
 */
import { api } from '../api/client.js';

let current: { audio: HTMLAudioElement; url: string } | null = null;

/** Decode base64 into raw bytes for a Blob URL. */
function base64ToBytes(base64: string): Uint8Array<ArrayBuffer> {
  const binary = window.atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

/** Play raw audio from base64. Returns a promise that resolves on end. */
export function playBase64Audio(base64: string, format: 'wav' | 'mp3'): Promise<void> {
  return new Promise((resolve) => {
    stopSpeaking();
    // The CSP allows media-src 'self' blob: but not data:, so the waveform is
    // materialized as an object URL and released again once playback ends.
    let url: string;
    try {
      url = URL.createObjectURL(new Blob([base64ToBytes(base64)], { type: `audio/${format}` }));
    } catch {
      resolve();
      return;
    }
    const audio = new Audio(url);
    const handle = { audio, url };
    current = handle;
    const done = (): void => {
      if (current === handle) current = null;
      URL.revokeObjectURL(url);
      resolve();
    };
    audio.addEventListener('ended', done);
    audio.addEventListener('error', done);
    audio.play().catch(done);
  });
}

export function stopSpeaking(): void {
  if (current !== null) {
    current.audio.pause();
    URL.revokeObjectURL(current.url);
    current = null;
  }
  if ('speechSynthesis' in window) window.speechSynthesis.cancel();
}

/** Browser-voice fallback: warm, slow, and always available offline.
 *  `rate` lets a caller slow the voice further (Story Time's "slow" pace);
 *  the safety timeout scales with it so a slow line is never cut off. */
function browserSpeak(text: string, rate = 0.9): Promise<void> {
  return new Promise((resolve) => {
    if (!('speechSynthesis' in window)) return resolve();
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.rate = rate; // unhurried — the child is the pace-setter
    utterance.onend = () => resolve();
    utterance.onerror = () => resolve();
    window.speechSynthesis.speak(utterance);
    // Some browsers never fire onend for cancelled utterances. Slower speech
    // needs a proportionally longer ceiling (chars * per-char ms / rate).
    setTimeout(resolve, Math.max(2000, (text.length * 90) / Math.max(rate, 0.1)));
  });
}

/**
 * Speak one companion phrase. `mockMode` skips the silent-WAV playback and
 * goes straight to browser voice; real mode plays the vendor waveform.
 *
 * `rate` is the optional browser-voice speed (Story Time pacing). The vendor
 * synthesizer has no speed control, so in real mode "slow" pacing is carried
 * by the caller's inter-line dwell instead; the rate still applies whenever
 * the browser voice is the one speaking (mock mode, or TTS down).
 *
 * Circuit breaker: when the vendor TTS is down (e.g. the deployment was
 * never created), every phrase would pay a failed round-trip before the
 * browser voice — a one-second silence on EVERY caption. One failure opens
 * the circuit for five minutes so the companion speaks instantly.
 */
let ttsDownUntil = 0;

export async function speak(text: string, mockMode: boolean, rate?: number): Promise<void> {
  if (!mockMode && Date.now() > ttsDownUntil) {
    try {
      const result = await api.post<{ audioBase64: string; format: 'wav' | 'mp3' }>('/tts', { text });
      return await playBase64Audio(result.audioBase64, result.format);
    } catch {
      // Vendor synthesis down — the companion still speaks (browser voice),
      // and the next phrases skip the doomed round-trip.
      ttsDownUntil = Date.now() + 5 * 60_000;
    }
  }
  return browserSpeak(text, rate);
}
