/**
 * Azure AI Foundry provider implementations — code-complete, env-gated.
 *
 * All four capabilities ride on one Azure multi-service resource:
 *
 *   GPT-5.5            story generation    Azure OpenAI v1 chat completions
 *   MAI-Transcribe-1.5 speech recognition  Azure Speech fast transcription
 *   MAI-Voice-2        speech synthesis    Azure Speech TTS (SSML)
 *   FLUX.2 [pro]       illustration        Foundry Models (BFL provider API)
 *
 * The MAI speech pair is Microsoft's own best-in-class family (region-locked
 * to East US / West US in preview) and rides the Azure Speech REST surface —
 * NOT the OpenAI-style /deployments paths, which is why whisper-style
 * deployments never resolved on this resource.
 *
 * The same seam rules as the Alibaba bundle apply (see ../interfaces.ts):
 * keys live in boot config only, every method THROWS on vendor error so the
 * engine can fail closed, and raw child audio goes nowhere except the
 * recognizer endpoint (NFR-3).
 */
import type { Env } from '../../config.js';
import { assertStoryShape, buildStoryPrompt } from '../story-prompt.js';
import type {
  GeneratedStory,
  IImageGenerator,
  ISpeechRecognizer,
  ISpeechSynthesizer,
  IStoryGenerator,
  ImageResult,
  RecognitionResult,
  RecognizeOptions,
  StoryGenerationRequest,
  SynthesisResult
} from '../interfaces.js';

/** Rough vendor prices, micro-USD per call (pitch-card estimates). */
const COSTS = {
  storyGeneration: 25_000, // ~2k tokens through gpt-5.5
  recognition: 600, // ~6s audio clip (whisper / gpt-4o-transcribe)
  synthesis: 200, // one short phrase
  image: 16_000 // one FLUX.2 [pro] image at ~1 MP
} as const;

/** Shared fetch wrapper: timeout + uniform error message; keys never logged. */
async function azureFetch(
  url: string,
  init: RequestInit & { timeoutMs?: number } = {}
): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), init.timeoutMs ?? 30_000);
  try {
    const response = await fetch(url, { ...init, signal: controller.signal });
    if (!response.ok) {
      // Body may contain request ids — never the key.
      throw new Error(`Azure ${new URL(url).pathname} failed: HTTP ${response.status}`);
    }
    return response;
  } finally {
    clearTimeout(timer);
  }
}

// ---------------------------------------------------------------------------
// GPT-5.5 — story generation (Azure OpenAI v1 chat completions, JSON mode)
// ---------------------------------------------------------------------------

export class AzureGptStoryGenerator implements IStoryGenerator {
  readonly name = 'azure-gpt';

  constructor(
    private readonly env: Env,
    readonly model: string
  ) {}

  async generate(request: StoryGenerationRequest): Promise<{ story: GeneratedStory; costMicroUsd: number }> {
    // Reasoning effort is opt-in: the gpt-5 family accepts it and it is the
    // single biggest latency lever; non-reasoning deployments 400 on it, so
    // an empty config value omits the field entirely.
    const effort = this.env.AZURE_STORY_REASONING_EFFORT;
    const payload: Record<string, unknown> = {
      model: this.model,
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: 'You are a children\'s decodable-story writer. You always answer with valid JSON only.' },
        { role: 'user', content: buildStoryPrompt(request) }
      ]
    };
    if (effort !== '') payload.reasoning_effort = effort;
    const response = await azureFetch(`${this.env.AZURE_OPENAI_ENDPOINT}/openai/v1/chat/completions`, {
      method: 'POST',
      headers: { 'api-key': this.env.AZURE_OPENAI_API_KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      // Per-call ceiling: the engine passes a SHORT budget on the child-facing
      // synchronous path (fail fast to the honest ladder, never a spinner) and
      // leaves the background prefetch on the generous env default, so a slow
      // generation warms the cache instead of blocking a tap.
      timeoutMs: request.budgetMs ?? this.env.AZURE_STORY_TIMEOUT_MS
    });

    const body = (await response.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
    };
    const content = body.choices?.[0]?.message?.content;
    if (!content) throw new Error('Azure GPT returned no content');

    // Parse strictly; any deviation is a rejection (the engine catches).
    const parsed: unknown = JSON.parse(content);
    assertStoryShape(parsed);
    return { story: parsed, costMicroUsd: COSTS.storyGeneration };
  }
}

// ---------------------------------------------------------------------------
// MAI-Transcribe-1.5 — speech recognition (server-side; never trusts client)
// ---------------------------------------------------------------------------

/** The speech key: a dedicated one if configured, else the shared resource
 *  key (multi-service Foundry resources serve both surfaces with one pair). */
function speechKey(env: Env): string {
  return env.AZURE_SPEECH_KEY !== '' ? env.AZURE_SPEECH_KEY : env.AZURE_OPENAI_API_KEY;
}

export class AzureMaiTranscribeRecognizer implements ISpeechRecognizer {
  readonly name = 'azure-mai-transcribe';

  constructor(
    private readonly env: Env,
    readonly model: string
  ) {}

  async recognize(audio: Uint8Array, _options?: RecognizeOptions): Promise<RecognitionResult> {
    // Azure Speech "fast transcription" contract: multipart audio plus a JSON
    // `definition` selecting the enhanced (MAI) model. The filename extension
    // must match the payload — browsers record webm/opus, so sniff it.
    const form = new FormData();
    form.append('audio', new Blob([audio]), `clip.${audioExt(audio)}`);
    form.append('definition', JSON.stringify({ enhancedMode: { enabled: true, model: this.model } }));

    const url =
      `https://${this.env.AZURE_SPEECH_REGION}.api.cognitive.microsoft.com` +
      '/speechtotext/transcriptions:transcribe?api-version=2025-10-15';
    const response = await azureFetch(url, {
      method: 'POST',
      headers: { 'Ocp-Apim-Subscription-Key': speechKey(this.env) },
      body: form,
      timeoutMs: 30_000
    });
    const body = (await response.json()) as { combinedPhrases?: Array<{ text?: string }> };
    const text = (body.combinedPhrases?.[0]?.text ?? '').toLowerCase().trim();
    // Empty text = nothing heard (silence) — a VALID result, not an error:
    // the child flow retries once, then degrades to tap mode honestly.
    return { words: text === '' ? [] : text.split(/\s+/).filter(Boolean), text, costMicroUsd: COSTS.recognition };
  }
}

/** Sniff the audio container from magic bytes so the upload filename always
 *  matches the payload (wav / webm / ogg / flac / mp3). */
function audioExt(audio: Uint8Array): string {
  const tag = (n: number): string => String.fromCharCode(...audio.slice(0, n));
  if (audio.length >= 4 && tag(4) === 'RIFF') return 'wav';
  if (audio.length >= 4 && audio[0] === 0x1a && audio[1] === 0x45 && audio[2] === 0xdf && audio[3] === 0xa3) return 'webm';
  if (audio.length >= 4 && tag(4) === 'OggS') return 'ogg';
  if (audio.length >= 4 && tag(4) === 'fLaC') return 'flac';
  if (audio.length >= 3 && tag(3) === 'ID3') return 'mp3';
  if (audio.length >= 2 && audio[0] === 0xff && (audio[1] ?? 0) >= 0xe0) return 'mp3';
  return 'webm'; // MediaRecorder's default container
}

// ---------------------------------------------------------------------------
// MAI-Voice-2 — speech synthesis (SSML; the voice name carries the model)
// ---------------------------------------------------------------------------

/** Escape text for safe embedding in SSML — vendor input injection is a
 *  content channel like any other, even though our filter ran upstream. */
function escapeXml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

export class AzureMaiVoiceSynthesizer implements ISpeechSynthesizer {
  readonly name = 'azure-mai-voice';

  constructor(
    private readonly env: Env,
    readonly model: string
  ) {}

  async synthesize(text: string, options?: { voice?: string }): Promise<SynthesisResult> {
    const voice = options?.voice ?? this.env.AZURE_TTS_VOICE;
    const ssml =
      `<speak version="1.0" xmlns="http://www.w3.org/2001/10/synthesis" ` +
      `xmlns:mstts="https://www.w3.org/2001/mstts" xml:lang="en-US">` +
      `<voice name="${escapeXml(voice)}">${escapeXml(text)}</voice></speak>`;

    const url = `https://${this.env.AZURE_SPEECH_REGION}.tts.speech.microsoft.com/cognitiveservices/v1`;
    const response = await azureFetch(url, {
      method: 'POST',
      headers: {
        'Ocp-Apim-Subscription-Key': speechKey(this.env),
        'Content-Type': 'application/ssml+xml',
        // Buddy's phrases are short; 24 kHz mp3 is warm and small.
        'X-Microsoft-OutputFormat': 'audio-24khz-160kbitrate-mono-mp3'
      },
      body: ssml,
      timeoutMs: 30_000
    });
    const audio = new Uint8Array(await response.arrayBuffer());
    if (audio.length === 0) throw new Error('MAI-Voice returned empty audio');
    return { audio, format: 'mp3', costMicroUsd: COSTS.synthesis };
  }
}

// ---------------------------------------------------------------------------
// FLUX.2 [pro] — illustration (Foundry Models, BFL provider API)
// ---------------------------------------------------------------------------

/** The BFL API path differs from the model id — map the catalog names. */
const FLUX_PATHS: Record<string, string> = {
  'FLUX.2-pro': 'flux-2-pro',
  'FLUX.2-flex': 'flux-2-flex',
  'FLUX.1-Kontext-pro': 'flux-kontext-pro',
  'FLUX-1.1-pro': 'flux-pro-1.1'
};

export class AzureFluxImageGenerator implements IImageGenerator {
  readonly name = 'azure-flux';

  constructor(
    private readonly env: Env,
    readonly model: string
  ) {}

  async generateImage(hint: string): Promise<ImageResult> {
    const path = FLUX_PATHS[this.model];
    if (!path) throw new Error(`Unknown FLUX model "${this.model}" (see FLUX_PATHS)`);
    // Foundry resources usually share one key pair across services; fall back
    // to the Azure OpenAI key when no dedicated image key is configured.
    const key = this.env.AZURE_AI_API_KEY !== '' ? this.env.AZURE_AI_API_KEY : this.env.AZURE_OPENAI_API_KEY;
    // The BFL path lives on the resource BASE host; a configured project
    // endpoint (…/api/projects/<name>) must be trimmed back to it.
    const base = this.env.AZURE_AI_ENDPOINT.replace(/\/api\/projects\/[^/]+\/?$/, '');

    const response = await azureFetch(`${base}/providers/blackforestlabs/v1/${path}?api-version=preview`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
        body: JSON.stringify({
          model: this.model,
          // The hint arrives already merged with the house art direction
          // (researched kid-loved style, providers/art-style.ts) — do not
          // layer a second style over it.
          prompt: hint,
          width: 1024,
          height: 1024,
          output_format: 'png',
          num_images: 1
        }),
        // FLUX.2 [pro] runs slower than the turbo models it replaces.
        timeoutMs: 90_000
      }
    );

    // Foundry answers with data[0].b64_json; the BFL-native shape is
    // result.sample (URL or base64). Handle all of them.
    const body = (await response.json()) as {
      data?: Array<{ b64_json?: string; url?: string }>;
      result?: { sample?: string; url?: string };
    };
    const b64 = body.data?.[0]?.b64_json;
    const url = body.data?.[0]?.url ?? body.result?.sample ?? body.result?.url;
    if (typeof b64 === 'string' && b64.length > 0) {
      return { image: new Uint8Array(Buffer.from(b64, 'base64')), mimeType: 'image/png', costMicroUsd: COSTS.image };
    }
    if (typeof url === 'string' && url.length > 0) {
      if (url.startsWith('http')) {
        const imageResponse = await fetch(url, { signal: AbortSignal.timeout(30_000) });
        if (!imageResponse.ok) throw new Error(`FLUX image download failed: HTTP ${imageResponse.status}`);
        return { image: new Uint8Array(await imageResponse.arrayBuffer()), mimeType: 'image/png', costMicroUsd: COSTS.image };
      }
      return { image: new Uint8Array(Buffer.from(url, 'base64')), mimeType: 'image/png', costMicroUsd: COSTS.image };
    }
    throw new Error('FLUX returned no image');
  }
}
