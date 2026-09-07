/**
 * Provider interfaces — the seam between Qissa and every external vendor.
 *
 * Four capabilities, four interfaces (Doc 6 §7):
 *   IStoryGenerator     Qwen | GPT-5.5 (Azure)  | deterministic mock
 *   ISpeechRecognizer   Paraformer | Whisper (Azure) | client-transcript passthrough mock
 *   ISpeechSynthesizer  CosyVoice | gpt-4o-mini-tts (Azure) | silent-WAV mock
 *   IImageGenerator     Wanx | FLUX.2 [pro] (Azure) | inline-SVG mock
 *
 * Rules of the seam:
 *  - The rest of the server only ever sees THESE types. No route, engine or
 *    test may import a vendor SDK type — swapping vendors is a wiring change.
 *  - Implementations THROW on any failure. The story engine treats every
 *    throw as "reject and serve the cache" (fail-closed, NFR-5.1); TTS/ASR
 *    routes translate throws into graceful degradation, never raw errors.
 *  - Every call reports its estimated cost in micro-USD (1e-6 USD) so the
 *    session can instrument vendor spend (NFR-4.4).
 *  - Audio privacy: recognizer implementations MUST be configured to opt out
 *    of vendor training data (asserted in the Alibaba provider config).
 */
import type { LegalLexicon, StoryChoice, StoryConstraints, StoryPage } from '@qissa/core';

/**
 * A vendor said "not now" — throttling, with a hint of how long to wait.
 *
 * Distinct from a generic failure because the correct response is different:
 * a 429 must be retried, and the vendor's own Retry-After is a far better
 * delay than any backoff curve we invent. Measured on the configured FLUX.2
 * endpoint, a fixed ~10s backoff was not enough and lost a page per story.
 */
export class RateLimitError extends Error {
  constructor(
    message: string,
    /** From the Retry-After header, when the vendor sent one. */
    readonly retryAfterMs?: number
  ) {
    super(message);
    this.name = 'RateLimitError';
  }
}

/** The raw story a generator owes us, before the safety pipeline touches it.
 *  Provenance, level and theme are stamped by the engine, not the vendor. */
export interface GeneratedStory {
  title: string;
  pages: StoryPage[];
  choice: StoryChoice;
  offlineTask: string;
}

export interface StoryGenerationRequest {
  constraints: StoryConstraints;
  /** Current phonics level — used by the mock's word banks. */
  level: number;
  /** Prompt contract version, echoed into provenance (FR-I.9). */
  promptVersion: string;
  /** Tricky words the child already knows as wholes. Generators must
   *  self-validate against the SAME vocabulary the engine's gate uses;
   *  constraints.allowedTrickyWords alone lists only the NEW ones. */
  taughtTrickyWords: string[];
  /**
   * Must the page text be decodable by this child?
   *
   * True for the read-along, where the child sounds out every word. FALSE for
   * Story Time, which is receptive: the companion narrates `pictureTalk` and
   * the child never reads a line. Constraining that text bought nothing and
   * cost everything — at level 1 the legal vocabulary is `s a t p i n` plus
   * names, and asking for a coherent eight-page arc inside it produced titles
   * like "Mina s". A story nobody reads should be a good story.
   */
  decodable: boolean;
  /**
   * The words this child may actually be shown, grouped by sentence role.
   *
   * Only meaningful when `decodable` is true. Handing a generator the taught
   * GRAPHEMES and expecting it to derive the vocabulary is what produced pages
   * reading "Ayla s." — the model had to do phonics before it could write, and
   * did neither well. Given the words, it writes sentences.
   *
   * Advisory, not authoritative: the gate still re-validates every word, so a
   * generator that coins another legal word is welcome to.
   */
  lexicon?: LegalLexicon;
  /** Optional per-call ceiling in milliseconds. The engine passes a SHORT
   *  budget on the child-facing synchronous path (fail fast to the ladder,
   *  never a spinner) and leaves the BACKGROUND prefetch on the provider's
   *  generous default, so a slow vendor call warms the cache instead of
   *  blocking a tap. Providers that are already fast may ignore it. */
  budgetMs?: number;
}

export interface IStoryGenerator {
  readonly name: string;
  readonly model: string;
  generate(request: StoryGenerationRequest): Promise<{ story: GeneratedStory; costMicroUsd: number }>;
}

/** One recognized transcript. Words arrive in spoken order — the miscue
 *  classifier aligns them against the expected line. */
export interface RecognitionResult {
  words: string[];
  text: string;
  costMicroUsd: number;
}

export interface RecognizeOptions {
  /** 16-bit PCM sample rate of the uploaded audio. */
  sampleRate?: number;
  /** Client-side Web Speech transcript; the mock provider trusts it,
   *  real providers ignore it (server-side recognition only). */
  fallbackText?: string;
}

export interface ISpeechRecognizer {
  readonly name: string;
  readonly model: string;
  recognize(audio: Uint8Array, options?: RecognizeOptions): Promise<RecognitionResult>;
}

export interface SynthesisResult {
  /** Raw audio bytes; the route sets the content type from `format`. */
  audio: Uint8Array;
  format: 'wav' | 'mp3';
  costMicroUsd: number;
}

export interface ISpeechSynthesizer {
  readonly name: string;
  readonly model: string;
  /** Pre-synthesizable phrase — the phrase cache keys on this exact text. */
  synthesize(text: string, options?: { voice?: string }): Promise<SynthesisResult>;
}

export interface ImageResult {
  image: Uint8Array;
  mimeType: 'image/svg+xml' | 'image/png';
  costMicroUsd: number;
}

export interface ImageOptions {
  /**
   * Reference images the model should keep faithful to — the hero's face and
   * clothes, so page four's child is page one's child.
   *
   * Providers that cannot condition on references MUST ignore this rather
   * than fail; check `supportsReferences` before paying to produce one.
   */
  references?: Uint8Array[];
}

export interface IImageGenerator {
  readonly name: string;
  readonly model: string;
  /**
   * Can this provider hold a character's identity across images?
   *
   * Interchangeable providers do NOT mean interchangeable conditioning
   * features. FLUX.2 accepts reference images; the offline renderer draws
   * deterministic shapes and needs none. Callers use this to decide whether
   * producing a reference is worth a vendor call at all.
   */
  readonly supportsReferences: boolean;
  /**
   * `hint` is the full styled prompt sent to a vendor. `subject` is the plain
   * thing being drawn ("apple", or a story page's raw scene line), which the
   * offline pictogram renderer needs: the styled prompt appends the house art
   * direction, and that block contains its own concrete words ("warm",
   * "small", "picture-book"), so matching against it would resolve every
   * image to the same glyph. Vendors ignore `subject`.
   */
  generateImage(hint: string, subject?: string, options?: ImageOptions): Promise<ImageResult>;
}

/** Everything the app needs from the vendor layer, wired at boot. */
export interface ProviderBundle {
  mode: 'mock' | 'alibaba' | 'azure';
  stories: IStoryGenerator;
  recognizer: ISpeechRecognizer;
  synthesizer: ISpeechSynthesizer;
  images: IImageGenerator;
}
