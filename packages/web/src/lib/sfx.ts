/**
 * sfx — tiny synthesized feedback sounds for the child world.
 *
 * Research (Joan Ganz Cooney Center; IJCCI): young children need immediate
 * visual AND auditory confirmation to stay engaged. Everything here is
 * generated with the Web Audio API — no audio files ship, so the CSP stays
 * 'self', the PWA stays tiny, and offline mode loses nothing.
 *
 * Every call is best-effort: a sound failure must never break reading.
 * The AudioContext is created lazily on the first tap (autoplay policy).
 */

let ctx: AudioContext | null = null;

function audio(): AudioContext | null {
  try {
    ctx ??= new AudioContext();
    if (ctx.state === 'suspended') void ctx.resume();
    return ctx;
  } catch {
    return null;
  }
}

/** One soft note: sine voice, quick attack, gentle release. */
function tone(freq: number, at: number, dur: number, peak: number): void {
  const ac = audio();
  if (ac === null) return;
  try {
    const osc = ac.createOscillator();
    const gain = ac.createGain();
    const start = ac.currentTime + at;
    osc.type = 'sine';
    osc.frequency.setValueAtTime(freq, start);
    gain.gain.setValueAtTime(0.0001, start);
    gain.gain.exponentialRampToValueAtTime(peak, start + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + dur);
    osc.connect(gain).connect(ac.destination);
    osc.start(start);
    osc.stop(start + dur + 0.05);
  } catch {
    /* sound is garnish — never throw into the reading loop */
  }
}

export const sfx = {
  /** Fingertip acknowledgement: the tap was seen. */
  tap(): void {
    tone(520, 0, 0.09, 0.05);
  },
  /** A word or line was read: two warm rising notes. */
  chime(): void {
    tone(660, 0, 0.16, 0.07);
    tone(880, 0.11, 0.22, 0.07);
  },
  /** Something is stuck — soft and kind, never punitive. */
  oops(): void {
    tone(330, 0, 0.18, 0.045);
    tone(294, 0.14, 0.22, 0.04);
  },
  /** Page complete: a small ascending arpeggio. */
  page(): void {
    tone(523, 0, 0.12, 0.06);
    tone(659, 0.1, 0.12, 0.06);
    tone(784, 0.2, 0.2, 0.06);
  },
  /** Story finished: the celebration fanfare. */
  fanfare(): void {
    tone(523, 0, 0.16, 0.08);
    tone(659, 0.14, 0.16, 0.08);
    tone(784, 0.28, 0.16, 0.08);
    tone(1047, 0.42, 0.4, 0.09);
    tone(784, 0.42, 0.4, 0.05);
  }
};
