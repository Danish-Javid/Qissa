/**
 * Mock providers — the complete zero-key implementation.
 *
 * `docker compose up` with no secrets runs entirely on these. Each mock is
 * honest about what it is:
 *
 *  - MockStoryGenerator builds template stories from the decodable word
 *    banks in @qissa/core, then SELF-VALIDATES them against the exact
 *    constraints it was given before returning — the same gate the engine
 *    will re-run. If it cannot build a valid story after bounded attempts,
 *    it THROWS, and the engine serves the hand-written cache instead.
 *  - MockSpeechRecognizer cannot hear: it returns the client's Web Speech
 *    transcript (server-trusted in mock mode only). Real mode runs
 *    Paraformer server-side and ignores the client text entirely.
 *  - MockSpeechSynthesizer emits a silent WAV of plausible duration so the
 *    whole TTS pipeline (caching, playback, controls) is exercised.
 *  - MockImageGenerator renders a flat three-ink SVG placeholder.
 */
import {
  wordBanks,
  foundationGroup,
  pictogramFor,
  isBootstrap,
  isWordDecodable,
  tokenize,
  validateText,
  type DecodabilityContext,
  type StoryChoice,
  type StoryPage,
  type WordBank
} from '@qissa/core';
import type {
  GeneratedStory,
  IImageGenerator,
  ISpeechRecognizer,
  ISpeechSynthesizer,
  IStoryGenerator,
  ImageResult,
  RecognitionResult,
  StoryGenerationRequest,
  SynthesisResult
} from '../interfaces.js';

// ---------------------------------------------------------------------------
// Story generation
// ---------------------------------------------------------------------------

/** Banks exist for levels 1–8; out-of-range levels clamp to the nearest. */
function bankFor(level: number): WordBank {
  const key = String(Math.min(Math.max(level, 1), 8));
  return wordBanks[key] as WordBank;
}

/** Deterministic PRNG (mulberry32): the mock must be reproducible in tests. */
function makeRng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function pick<T>(rng: () => number, pool: readonly T[]): T {
  return pool[Math.floor(rng() * pool.length)] as T;
}

/** Words from `pool` containing any of the target graphemes as substrings. */
function preferring(pool: string[], graphemes: string[]): string[] {
  const hits = pool.filter((w) => graphemes.some((g) => w.includes(g)));
  return hits.length > 0 ? hits : pool;
}

/** Occurrences of a grapheme across a set of surfaces (target-count check). */
function countOccurrences(surfaces: string[], grapheme: string): number {
  let count = 0;
  for (const surface of surfaces) {
    for (const word of tokenize(surface)) {
      let idx = word.indexOf(grapheme);
      while (idx !== -1) {
        count += 1;
        idx = word.indexOf(grapheme, idx + grapheme.length);
      }
    }
  }
  return count;
}

/** Indefinite article for a noun — both forms decode at every level. */
function article(noun: string): string {
  return /^[aeiou]/.test(noun) ? 'an' : 'a';
}

/** Third-person -s after a sibilant ending (s, z, x, ch, sh) is ungrammatical
 *  ("buzzs"); those verbs must use "will + base", which is only an option when
 *  "will" decodes for the child. */
function needsWill(verb: string): boolean {
  return /(?:s|x|z|ch|sh)$/.test(verb);
}

const MAX_ATTEMPTS = 36;
/** Target grapheme must appear at least this often (Doc 6 §8). */
const TARGET_MIN = 6;
/** Each review grapheme must appear at least this often. */
const REVIEW_MIN = 3;

export class MockStoryGenerator implements IStoryGenerator {
  readonly name = 'mock-template';
  readonly model = 'word-bank-templates-v1';

  async generate(request: StoryGenerationRequest): Promise<{ story: GeneratedStory; costMicroUsd: number }> {
    const { constraints, level, taughtTrickyWords } = request;
    const rng = makeRng(constraints.targetGrapheme.length * 7919 + level * 131 + constraints.pageCount);
    const baseBank = bankFor(level);
    const hero = constraints.worldSeed.heroName;

    // Validation context mirrors the engine's EXACTLY: taught graphemes
    // plus target/review (with the foundation-group bootstrap for a child
    // who has met none of the target's sounds yet), tricky words already
    // taught as wholes plus the two new ones this story introduces, and
    // the world-seed names (proper nouns are taught orally, never decoded).
    const names = [hero, constraints.worldSeed.siblingName, constraints.worldSeed.petName]
      .filter((n): n is string => Boolean(n))
      .map((n) => n.toLowerCase().replace(/[^a-z]/g, ''));
    const group = isBootstrap(constraints.allowedGraphemes, constraints.targetGrapheme)
      ? foundationGroup(constraints.targetGrapheme)
      : [];
    const ctx: DecodabilityContext = {
      taughtGraphemes: [...constraints.allowedGraphemes, ...group, constraints.targetGrapheme, ...constraints.reviewGraphemes],
      taughtTrickyWords: [...taughtTrickyWords, ...constraints.allowedTrickyWords, ...names]
    };

    // Filter EVERY bank word through the child's actual context — the same
    // decodability gate that guards the child. The raw banks are level-wide;
    // this child may not know every sound in her own level yet (a level-2
    // story teaching "m" must not contain "duck"). The filter can never
    // admit an undecodable word, only ever remove candidates.
    const decodableIn = (word: string): boolean => isWordDecodable(word, ctx);
    const keepOrFallback = (pool: string[]): string[] => {
      const kept = pool.filter(decodableIn);
      return kept.length > 0 ? kept : pool; // the gate below re-checks all
    };
    const bank: WordBank = {
      nouns: keepOrFallback(baseBank.nouns),
      verbs: keepOrFallback(baseBank.verbs),
      names: baseBank.names,
      settings: keepOrFallback(baseBank.settings),
      adjectives: keepOrFallback(baseBank.adjectives),
      sentenceBits: baseBank.sentenceBits
    };

    // Guaranteed target-sound carriers: without at least one word containing
    // the new grapheme on every page, the occurrence gate (>= 6) can never
    // pass for a sound the banks barely cover ("m", "b", "ff").
    const targetNouns = bank.nouns.filter((w) => w.includes(constraints.targetGrapheme));
    const targetVerbs = bank.verbs.filter((w) => w.includes(constraints.targetGrapheme));

    // Anchor grammar depends on the child's context: "will + base" is only
    // an option when "will" decodes for THIS child (w/ll arrive mid-level-3;
    // a story teaching "ss" has not met "w" yet). Computed here because the
    // context lives in generate(); compose() only receives the verdict.
    const willOk = isWordDecodable('will', ctx);

    const preferredNouns = preferring(bank.nouns, [constraints.targetGrapheme, ...constraints.reviewGraphemes]);
    const preferredVerbs = preferring(bank.verbs, [constraints.targetGrapheme, ...constraints.reviewGraphemes]);

    // Cumulative carriers: a review sound may live in an EARLIER bank (a
    // level-4 story reviewing "zz" needs bank-3's "buzz"), so scan every
    // bank up to the generation level and keep what THIS child decodes.
    const cumNouns: string[] = [];
    const cumVerbs: string[] = [];
    for (let l = 1; l <= Math.min(level, 8); l++) {
      const b = wordBanks[String(l)] as WordBank;
      cumNouns.push(...b.nouns);
      cumVerbs.push(...b.verbs);
    }
    const surfacesOf = (s: GeneratedStory): string[] => [
      s.title,
      ...s.pages.map((p) => p.text),
      ...s.choice.options,
      s.choice.consequenceForFirst,
      s.choice.consequenceForSecond
    ];

    // The random beats only *prefer* review words — that is not a guarantee
    // (a level-4 bank has no "qu"/"zz" carriers at all). Top-up appends short
    // decodable carrier sentences until every review sound has its minimum
    // exposure, so spaced repetition is actually delivered, not hoped for.
    const topUpReviews = (story: GeneratedStory): void => {
      const objectNouns = bank.nouns.filter(decodableIn);
      for (const g of constraints.reviewGraphemes) {
        const nounCarriers = cumNouns.filter((w) => w.includes(g) && decodableIn(w));
        const verbCarriers = cumVerbs.filter((w) => w.includes(g) && decodableIn(w) && (!needsWill(w) || willOk));
        let appends = 0;
        while (countOccurrences(surfacesOf(story), g) < REVIEW_MIN && appends < REVIEW_MIN + 2) {
          const page = story.pages[appends % story.pages.length];
          if (page === undefined) break;
          if (nounCarriers.length > 0) {
            const c = pick(rng, nounCarriers);
            page.text = `${page.text} ${hero} is at ${article(c)} ${c}.`;
          } else if (verbCarriers.length > 0 && objectNouns.length > 0) {
            const v = pick(rng, verbCarriers);
            const o = pick(rng, objectNouns);
            page.text = `${page.text} ${hero} ${needsWill(v) ? `will ${v}` : `${v}s`} ${article(o)} ${o}.`;
          } else {
            break; // no decodable carrier anywhere — the gate decides below
          }
          appends += 1;
        }
      }
    };

    for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
      const story = this.compose(rng, bank, hero, preferredNouns, preferredVerbs, constraints.pageCount, level, targetNouns, targetVerbs, willOk);
      topUpReviews(story);
      const surfaces = surfacesOf(story);

      const decodable = surfaces.every((s) => validateText(s, ctx).valid);
      const targetOk = countOccurrences(surfaces, constraints.targetGrapheme) >= TARGET_MIN;
      const reviewOk = constraints.reviewGraphemes.every((g) => countOccurrences(surfaces, g) >= REVIEW_MIN);

      if (decodable && targetOk && reviewOk) {
        return { story, costMicroUsd: 0 };
      }
      // else: re-roll — the loop is bounded and the PRNG advances.
    }

    // Bounded attempts spent: THROW. The engine treats this as a rejected
    // story and serves the hand-written cache (fail-closed, NFR-5.1).
    throw new Error(
      `Mock generator could not build a valid story for level ${level}, target "${constraints.targetGrapheme}"`
    );
  }

  /** Compose one candidate story from bank words and safe templates.
   *  Templates are level-gated: function words like "the" and "can" only
   *  appear once they are decodable/tricky at that level, so a fresh
   *  level-1 learner never gets an undecodable sentence. Every page also
   *  carries one anchor line built from words containing the target
   *  grapheme, so the occurrence gate can pass even for sounds the banks
   *  cover thinly ("m", "b", "ff"). */
  private compose(
    rng: () => number,
    bank: WordBank,
    hero: string,
    nouns: string[],
    verbs: string[],
    pageCount: number,
    level: number,
    targetNouns: string[],
    targetVerbs: string[],
    willOk: boolean
  ): GeneratedStory {
    const noun = () => pick(rng, nouns);
    const verb = () => pick(rng, verbs);
    const setting = () => pick(rng, bank.settings);
    const adj = () => pick(rng, bank.adjectives);
    // Anchor line: both slots carry the target sound when the banks offer
    // carriers — two guaranteed occurrences per page. Verbs ending in "s"
    // (hiss, fuss) cannot take an inflected -s; "will + base" keeps the
    // sentence grammatical AND decodable ("will" is in every bank's bits).
    const anchor = (): string | null => {
      if (targetNouns.length === 0) return null;
      const tn = pick(rng, targetNouns);
      // Sibilant-ending verbs (hiss, buzz, fix) cannot take -s; they need
      // "will + base", which is only decodable when willOk (see generate()).
      // Without it the anchor falls back to the "See …" form, whose one
      // tricky word the story may introduce.
      const usableVerbs = targetVerbs.filter((v) => !needsWill(v) || willOk);
      if (usableVerbs.length === 0) return `See ${article(tn)} ${tn}.`; // "see" is a level-2 tricky word
      const tv = pick(rng, usableVerbs);
      const verbPhrase = needsWill(tv) ? `will ${tv}` : `${tv}s`;
      return `${hero} ${verbPhrase} ${article(tn)} ${tn}.`;
    };

    // ---- Coherent arc (v2): fix ONE hero + object + place and let every page
    //      continue that SAME tiny situation, instead of listing unrelated
    //      decodable sentences. Reading-science basis: young readers build
    //      meaning from a coherent situation model (Kintsch), and the spoken
    //      picture-walk + the illustration carry that meaning BEFORE they
    //      decode (Shanahan; dual coding, Paivio). The decodable `text` stays
    //      a pure function of the validated word banks, so the gate below
    //      still proves every word.
    const usableTargetVerbs = targetVerbs.filter((v) => !needsWill(v) || willOk);
    const starNoun = targetNouns.length > 0 ? pick(rng, targetNouns) : noun();
    // Avoid sibilant-ending fallback verbs when "will" is not yet decodable,
    // so the inflection below is always legal.
    const safeVerbs = willOk ? verbs : verbs.filter((v) => !needsWill(v));
    const starVerb =
      usableTargetVerbs.length > 0 ? pick(rng, usableTargetVerbs) : safeVerbs.length > 0 ? pick(rng, safeVerbs) : verb();
    const starAdj = adj();
    const starSetting = setting();
    const aAn = article(starNoun);
    const starVerbPhrase = needsWill(starVerb) ? `will ${starVerb}` : `${starVerb}s`;
    const nounIsCarrier = targetNouns.includes(starNoun);
    const verbIsCarrier = targetVerbs.includes(starVerb);

    // One recurring action line on the SAME hero + starNoun. It carries the
    // target sound through whichever slot has a carrier: the noun (most
    // graphemes) or the verb (a few, e.g. "ff" lives only in "puff/huff/buff").
    // If neither slot carries it, fall back to the generic anchor.
    const starAction = (): string | null => {
      if (!nounIsCarrier && !verbIsCarrier) return anchor();
      return `${hero} ${starVerbPhrase} ${aAn} ${starNoun}.`;
    };

    // Arc beats, all decodable-safe (is/in/at + bank nouns, settings,
    // adjectives). They cycle so the same situation repeats and deepens —
    // exactly the repetition early readers need.
    const beats: Array<() => string> = [
      () => `${hero} is at ${article(starSetting)} ${starSetting}.`,
      () => `${aAn} ${starNoun} is in ${article(starSetting)} ${starSetting}.`,
      () => `${aAn} ${starNoun} is ${starAdj}.`,
      () => `${hero} is at ${aAn} ${starNoun}.`
    ];

    // Spoken picture-walk lines — rich oral language that gives each page its
    // meaning before the child reads. Heard, not read: exempt from the
    // decodable gate (same exemption as offlineTask), still content-filtered.
    // Eight beats form ONE deepening arc (setup → notice → describe → a small
    // wish → an attempt → kindness → joy → a warm resolution that names a
    // feeling), so the longer receptive Story Time book never repeats itself
    // and its values live in the plot, not a bolted-on moral. The read-along
    // (4 pages at level 1) uses just the first four, exactly as before.
    const talkBeats: string[] = [
      `Look, ${hero} is at the ${starSetting}. Something fun is about to happen!`,
      `Do you see it? There is ${aAn} ${starNoun}. ${hero} sees it too.`,
      `The ${starNoun} is ${starAdj}. ${hero} smiles and looks a little closer.`,
      `${hero} wants to be near the ${starNoun}. It is just a little way off.`,
      `So ${hero} takes a big step, and then another, all the way over to it.`,
      `${hero} is gentle and kind with the ${starNoun}, taking turns and waiting.`,
      `Now they are together at the ${starSetting}, and both of them are happy.`,
      `${hero} feels warm and proud inside. A kind day is a wonderful day.`
    ];
    // Vivid SCENE descriptions for the illustrator — never an echo of the text.
    // Eight distinct scenes, one per beat, so every page of the longer book
    // gets its own picture (no repeated FLUX prompt half-way through).
    const artBeats: string[] = [
      `warm flat storybook scene: ${hero} the child standing at a ${starSetting}, curious and smiling, soft colors`,
      `warm flat storybook scene: ${hero} the child noticing ${aAn} ${starNoun} near a ${starSetting}, eyes wide with delight`,
      `warm flat storybook scene: a close view of ${aAn} ${starAdj} ${starNoun} while ${hero} the child smiles at it`,
      `warm flat storybook scene: ${hero} the child looking toward ${aAn} ${starNoun} a little way off, hopeful and calm`,
      `warm flat storybook scene: ${hero} the child stepping closer to ${aAn} ${starAdj} ${starNoun}, gentle and determined`,
      `warm flat storybook scene: ${hero} the child beside ${aAn} ${starNoun}, being kind, cozy warm light`,
      `warm flat storybook scene: ${hero} the child playing happily together with ${aAn} ${starNoun} at a ${starSetting}, joyful`,
      `warm flat storybook scene: ${hero} the child smiling warmly with ${aAn} ${starNoun}, golden proud feeling, heartwarming`
    ];

    const pages: StoryPage[] = [];
    for (let i = 0; i < pageCount; i++) {
      // The decodable text cycles its four safe patterns (these are what the
      // child READS in the read-along, so they stay strictly level-gated),
      // while the spoken narration and the illustration cycle their own
      // eight-beat arc — a long Story Time book stays varied without ever
      // putting an undecodable word in the text the child must sound out.
      const arcLine = beats[i % beats.length]!();
      const actionLine = starAction();
      const parts = [arcLine];
      if (actionLine !== null && !parts.includes(actionLine)) parts.push(actionLine);
      pages.push({
        text: parts.join(' '),
        pictureTalk: talkBeats[i % talkBeats.length],
        illustrationHint: artBeats[i % artBeats.length]!
      });
    }

    const choiceNounA = noun();
    const choiceNounB = noun();
    const choice: StoryChoice = {
      prompt: `What should ${hero} do?`,
      // Options and consequences are child-decoded, so they stay within
      // the same bank words as the pages (real generators get validated
      // against the same gate after generation).
      options: [`${article(choiceNounA)} ${choiceNounA}`, `${article(choiceNounB)} ${choiceNounB}`],
      consequenceForFirst: `${hero} ${starVerbPhrase} ${article(choiceNounA)} ${choiceNounA}.`,
      consequenceForSecond: `${hero} ${starVerbPhrase} ${article(choiceNounB)} ${choiceNounB}.`
    };

    const titleNoun = starNoun;
    return {
      title: level >= 2 ? `${hero} and the ${titleNoun}` : `${hero} ${starVerbPhrase} ${aAn} ${titleNoun}`,
      pages,
      choice,
      // The offline task is spoken to the family at close, not decoded by
      // the child — it is content-filtered but exempt from the decodable
      // gate (documented exemption, same as parent-facing text).
      offlineTask: `Find something at home that reminds you of the story and tell your grown-up its name.`
    };
  }
}

// ---------------------------------------------------------------------------
// Speech recognition (client-transcript passthrough)
// ---------------------------------------------------------------------------

export class MockSpeechRecognizer implements ISpeechRecognizer {
  readonly name = 'mock-passthrough';
  readonly model = 'client-web-speech';

  async recognize(_audio: Uint8Array, options?: { fallbackText?: string }): Promise<RecognitionResult> {
    // In mock mode the browser's Web Speech API is the recognizer; the
    // server simply trusts and normalizes it. Real mode never does this.
    const text = (options?.fallbackText ?? '').toLowerCase().trim();
    return { words: tokenize(text), text, costMicroUsd: 0 };
  }
}

// ---------------------------------------------------------------------------
// Speech synthesis (silent WAV)
// ---------------------------------------------------------------------------

/** Build a valid 16-bit PCM mono WAV of `seconds` silence. */
export function silentWav(seconds: number, sampleRate = 16000): Uint8Array {
  const frames = Math.floor(seconds * sampleRate);
  const dataSize = frames * 2; // 16-bit samples
  const buffer = new Uint8Array(44 + dataSize);
  const view = new DataView(buffer.buffer);
  const writeStr = (offset: number, str: string): void => {
    for (let i = 0; i < str.length; i++) view.setUint8(offset + i, str.charCodeAt(i));
  };
  writeStr(0, 'RIFF');
  view.setUint32(4, 36 + dataSize, true);
  writeStr(8, 'WAVE');
  writeStr(12, 'fmt ');
  view.setUint32(16, 16, true); // fmt chunk size
  view.setUint16(20, 1, true); // PCM
  view.setUint16(22, 1, true); // mono
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true); // byte rate
  view.setUint16(32, 2, true); // block align
  view.setUint16(34, 16, true); // bits per sample
  writeStr(36, 'data');
  view.setUint32(40, dataSize, true);
  return buffer; // sample bytes stay zero — silence
}

export class MockSpeechSynthesizer implements ISpeechSynthesizer {
  readonly name = 'mock-silent';
  readonly model = 'silent-wav';

  async synthesize(text: string): Promise<SynthesisResult> {
    // ~60ms per character, clamped — enough to exercise playback pacing.
    const seconds = Math.min(Math.max(text.length * 0.06, 0.3), 3);
    return { audio: silentWav(seconds), format: 'wav', costMicroUsd: 0 };
  }
}

// ---------------------------------------------------------------------------
// Image generation (inline SVG)
// ---------------------------------------------------------------------------

export class MockImageGenerator implements IImageGenerator {
  readonly name = 'mock-svg';
  readonly model = 'pictogram-svg';

  /**
   * Draw the SUBJECT of the hint, not a generic arrangement of shapes.
   *
   * The previous version emitted the same circle-and-rectangle for every
   * prompt, so an apple, a cat and a bus were pixel-identical. That reads as a
   * broken image, and it quietly defeated the pedagogy: pairing a picture with
   * a decodable word only teaches anything if the picture shows the referent.
   *
   * The glyph comes from core's pictogram table (the same allow-list that
   * bounds word art), and the palette is derived from the subject, so two
   * different words never render the same picture even when neither has a
   * pictogram. Deterministic throughout — the on-disk art cache and the
   * offline path both require that the same hint always yields the same bytes.
   */
  async generateImage(hint: string, subject?: string): Promise<ImageResult> {
    // Prefer the caller's explicit subject; fall back to the hint only when
    // there isn't one (nothing in the tree currently omits it).
    const { glyph, word, palette } = pictogramFor(subject ?? hint);
    // The caption is the WORD, never the raw prompt: a hint is engine text
    // (and, for story pages, model output) and has no business on a child's
    // screen. Escaped anyway — XSS-in-SVG is still XSS.
    const caption = escapeXml((word ?? '').slice(0, 24));

    const svg = [
      `<svg xmlns="http://www.w3.org/2000/svg" width="480" height="360" viewBox="0 0 480 360" role="img" aria-label="${caption}">`,
      `<rect width="480" height="360" fill="${palette.sky}"/>`,
      `<circle cx="404" cy="64" r="34" fill="${palette.accent}" opacity="0.85"/>`,
      `<ellipse cx="240" cy="330" rx="200" ry="46" fill="${palette.ground}" opacity="0.35"/>`,
      `<rect y="296" width="480" height="64" fill="${palette.ground}"/>`,
      // Emoji render from the system font; the stack lists the three that ship
      // with Windows, Apple and Android, then degrades to whatever is present.
      `<text x="240" y="212" font-size="168" text-anchor="middle"`,
      ` font-family="Segoe UI Emoji, Apple Color Emoji, Noto Color Emoji, sans-serif">${glyph}</text>`,
      caption === ''
        ? ''
        : `<text x="240" y="340" font-size="30" text-anchor="middle" font-family="Andika, Verdana, sans-serif" font-weight="700" fill="#fdf6e3">${caption}</text>`,
      `</svg>`
    ].join('');
    return { image: new TextEncoder().encode(svg), mimeType: 'image/svg+xml', costMicroUsd: 0 };
  }
}

function escapeXml(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
