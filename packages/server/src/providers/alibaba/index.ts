/**
 * Alibaba Cloud provider implementations — code-complete, env-gated.
 *
 * All four vendors are reached over DashScope REST with global `fetch`
 * (Node 24 ships it; no vendor SDK pins us to a release train):
 *
 *   Qwen        story generation    OpenAI-compatible chat completions
 *   Paraformer  speech recognition  OpenAI-compatible audio transcription
 *   CosyVoice   speech synthesis    OpenAI-compatible audio speech
 *   Wanx        illustration        native DashScope async task API
 *
 * Security and privacy notes that apply to every implementation here:
 *  - The API key is read from boot config only; it never touches a route,
 *    a response body, or an audit entry.
 *  - DashScope API traffic is not used for vendor model training by
 *    default; we additionally never send raw child audio anywhere except
 *    the recognizer endpoint (NFR-3).
 *  - Every method THROWS on any vendor error. The story engine converts
 *    throws into "reject, serve cache" (fail-closed); ASR/TTS routes
 *    convert them into 502s the client degrades around.
 *
 * Costs are rough per-call estimates in micro-USD (NFR-4.4) — exact enough
 *  for the pitch's cost card, clearly labelled as estimates.
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

/** Ceiling for ONE background story generation. The child-facing path passes
 *  its own, much shorter budget (see StoryGenerationRequest.budgetMs). */
const QWEN_DEFAULT_TIMEOUT_MS = 45_000;

/** Rough vendor prices, micro-USD per call (pitch-card estimates). */
const COSTS = {
  storyGeneration: 20_000, // ~2k tokens through qwen-max
  recognition: 600, // ~6s audio clip
  synthesis: 250, // one short phrase
  image: 3_000 // one wanx turbo image
} as const;

/** Shared fetch wrapper: JSON in, timeout, uniform error message. */
async function dashScopeFetch(
  env: Env,
  path: string,
  init: RequestInit & { timeoutMs?: number } = {}
): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), init.timeoutMs ?? 30_000);
  try {
    const response = await fetch(`${env.DASHSCOPE_BASE_URL}${path}`, {
      ...init,
      headers: { Authorization: `Bearer ${env.DASHSCOPE_API_KEY}`, ...(init.headers ?? {}) },
      signal: controller.signal
    });
    if (!response.ok) {
      // Body may contain request ids — never the key.
      throw new Error(`DashScope ${path} failed: HTTP ${response.status}`);
    }
    return response;
  } finally {
    clearTimeout(timer);
  }
}

// ---------------------------------------------------------------------------
// Qwen — story generation
// ---------------------------------------------------------------------------

export class QwenStoryGenerator implements IStoryGenerator {
  readonly name = 'alibaba-qwen';

  constructor(
    private readonly env: Env,
    readonly model: string
  ) {}

  async generate(request: StoryGenerationRequest): Promise<{ story: GeneratedStory; costMicroUsd: number }> {
    const response = await dashScopeFetch(this.env, '/compatible-mode/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: this.model,
        response_format: { type: 'json_object' },
        temperature: 0.4,
        messages: [
          { role: 'system', content: 'You are a children\'s decodable-story writer. You always answer with valid JSON only.' },
          { role: 'user', content: buildStoryPrompt(request) }
        ]
      }),
      // Honour the engine's per-call ceiling. The child-facing serve passes a
      // SHORT budget (fail fast to the vetted ladder, never a spinner); the
      // background prefetch passes none and keeps the generous default below.
      // Ignoring it here meant a tap in alibaba mode could sit for 45s on the
      // exact path the 9s grace exists to protect.
      timeoutMs: request.budgetMs ?? QWEN_DEFAULT_TIMEOUT_MS
    });

    const body = (await response.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
    };
    const content = body.choices?.[0]?.message?.content;
    if (!content) throw new Error('Qwen returned no content');

    // Parse strictly; any deviation is a rejection (the engine catches).
    const parsed: unknown = JSON.parse(content);
    assertStoryShape(parsed);
    return { story: parsed, costMicroUsd: COSTS.storyGeneration };
  }
}

// ---------------------------------------------------------------------------
// Paraformer — speech recognition (server-side only; never trusts the client)
// ---------------------------------------------------------------------------

export class ParaformerRecognizer implements ISpeechRecognizer {
  readonly name = 'alibaba-paraformer';
  readonly model = 'paraformer-v2';

  constructor(private readonly env: Env) {}

  async recognize(audio: Uint8Array, _options?: RecognizeOptions): Promise<RecognitionResult> {
    // Multipart upload per the OpenAI-compatible transcription contract.
    const form = new FormData();
    const wav = new Blob([audio]);
    form.append('file', wav, 'clip.wav');
    form.append('model', this.model);

    const response = await dashScopeFetch(this.env, '/compatible-mode/v1/audio/transcriptions', {
      method: 'POST',
      body: form,
      timeoutMs: 20_000
    });
    const body = (await response.json()) as { text?: string };
    if (typeof body.text !== 'string') throw new Error('Paraformer returned no transcript');

    const text = body.text.toLowerCase().trim();
    return { words: text.split(/\s+/).filter(Boolean), text, costMicroUsd: COSTS.recognition };
  }
}

// ---------------------------------------------------------------------------
// CosyVoice — speech synthesis
// ---------------------------------------------------------------------------

export class CosyVoiceSynthesizer implements ISpeechSynthesizer {
  readonly name = 'alibaba-cosyvoice';

  constructor(
    private readonly env: Env,
    readonly model: string
  ) {}

  async synthesize(text: string, options?: { voice?: string }): Promise<SynthesisResult> {
    const response = await dashScopeFetch(this.env, '/compatible-mode/v1/audio/speech', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: this.model,
        input: text,
        voice: options?.voice ?? 'longwan',
        response_format: 'mp3'
      }),
      timeoutMs: 20_000
    });
    const audio = new Uint8Array(await response.arrayBuffer());
    if (audio.length === 0) throw new Error('CosyVoice returned empty audio');
    return { audio, format: 'mp3', costMicroUsd: COSTS.synthesis };
  }
}

// ---------------------------------------------------------------------------
// Wanx — illustration (async task: submit, poll, fetch)
// ---------------------------------------------------------------------------

const POLL_INTERVAL_MS = 1500;
const MAX_POLLS = 40; // ~60s ceiling

export class WanxImageGenerator implements IImageGenerator {
  readonly name = 'alibaba-wanx';

  constructor(
    private readonly env: Env,
    readonly model: string
  ) {}

  // `subject` is for the offline pictogram renderer only; a real model gets
  // the full styled prompt and needs nothing else.
  /** Wanx is called here as text-to-image; the configured endpoint takes no
   *  reference image, so identity conditioning is unavailable in this mode.
   *  Declared rather than assumed — see IImageGenerator.supportsReferences. */
  readonly supportsReferences = false;

  async generateImage(hint: string): Promise<ImageResult> {
    const submitted = await dashScopeFetch(this.env, '/api/v1/services/aigc/text2image/image-synthesis', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-DashScope-Async': 'enable' },
      body: JSON.stringify({
        model: this.model,
        input: {
          // Style-locked prompt: flat, child-friendly, consistent art bank.
          prompt: `flat three-ink children's book illustration, warm palette: ${hint}`
        },
        parameters: { size: '1024*1024', n: 1 }
      }),
      timeoutMs: 20_000
    });
    const submitBody = (await submitted.json()) as { output?: { task_id?: string } };
    const taskId = submitBody.output?.task_id;
    if (!taskId) throw new Error('Wanx did not return a task id');

    for (let i = 0; i < MAX_POLLS; i++) {
      await sleep(POLL_INTERVAL_MS);
      const polled = await dashScopeFetch(this.env, `/api/v1/tasks/${taskId}`, { timeoutMs: 15_000 });
      const status = (await polled.json()) as {
        output?: { task_status?: string; results?: Array<{ url?: string }> };
      };
      const state = status.output?.task_status;
      if (state === 'SUCCEEDED') {
        const url = status.output?.results?.[0]?.url;
        if (!url) throw new Error('Wanx succeeded without an image URL');
        const imageResponse = await fetch(url, { signal: AbortSignal.timeout(20_000) });
        if (!imageResponse.ok) throw new Error(`Wanx image download failed: HTTP ${imageResponse.status}`);
        return {
          image: new Uint8Array(await imageResponse.arrayBuffer()),
          mimeType: 'image/png',
          costMicroUsd: COSTS.image
        };
      }
      if (state === 'FAILED' || state === 'UNKNOWN') throw new Error(`Wanx task ended: ${state}`);
      // PENDING / RUNNING -> keep polling
    }
    throw new Error('Wanx task timed out');
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
