/**
 * Environment configuration — validated once at boot with Zod (fail fast).
 *
 * Security posture:
 *  - This is the ONLY place process.env is read. Everything else receives a
 *    typed, validated config object, so no code path can invent its own
 *    secret lookup.
 *  - Nothing from this object is ever serialized to a client response;
 *    routes only expose derived, non-secret values (e.g. provider MODE).
 */
import { z } from 'zod';

const EnvSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().max(65535).default(3000),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'silent']).default('info'),

  DATABASE_URL: z.string().min(1, 'DATABASE_URL is required — see .env.example'),

  // Secure cookies only over HTTPS; the browser silently drops Secure
  // cookies on plain HTTP, so local dev must keep this false.
  COOKIE_SECURE: z
    .enum(['true', 'false'])
    .default('false')
    .transform((v) => v === 'true'),
  // Comma-separated allowlist. Empty = same-origin only.
  CORS_ORIGINS: z
    .string()
    .default('')
    .transform((v) => v.split(',').map((s) => s.trim()).filter(Boolean)),

  PROVIDER_MODE: z.enum(['mock', 'alibaba', 'azure']).default('mock'),
  DASHSCOPE_API_KEY: z.string().default(''),
  DASHSCOPE_BASE_URL: z.url().default('https://dashscope-intl.aliyuncs.com'),
  QWEN_STORY_MODEL: z.string().default('qwen-max'),
  QWEN_HOTPATH_MODEL: z.string().default('qwen-flash'),
  COSYVOICE_MODEL: z.string().default('cosyvoice-v2'),
  WANX_MODEL: z.string().default('wanx2.1-t2i-turbo'),

  // --- Azure AI Foundry (PROVIDER_MODE=azure) --------------------------------
  // One multi-service resource serves all four capabilities. Strings (not
  // z.url) because they must stay empty in non-azure modes; getProviders()
  // validates them when azure mode is selected.
  AZURE_OPENAI_ENDPOINT: z.string().default(''), // https://<resource>.openai.azure.com
  AZURE_OPENAI_API_KEY: z.string().default(''),
  // Deployment names as chosen in the Foundry portal (may differ from the
  // model names). The resource currently deploys "gpt-5.5"; the story gate
  // re-validates every output, so pairing it with a low reasoning effort
  // keeps quality while cutting generation from minutes to seconds —
  // latency a four-year-old will actually wait through.
  AZURE_STORY_DEPLOYMENT: z.string().default('gpt-5.5'),
  // Reasoning effort for the story call. gpt-5.5 accepts none|low|medium|
  // high|xhigh ('minimal' is a different family's value and is rejected);
  // 'low' is the latency/quality sweet spot for constrained JSON story
  // writing. Empty omits the parameter entirely.
  AZURE_STORY_REASONING_EFFORT: z.enum(['none', 'low', 'medium', 'high', 'xhigh']).or(z.literal('')).default('low'),
  // Ceiling (ms) for ONE story-generation call. Past this the engine treats
  // the vendor as unavailable and serves the fail-closed ladder. The warm
  // prefetch runs in the background while the child is on the door screen,
  // so a larger budget here buys a ready story without a visible spinner.
  AZURE_STORY_TIMEOUT_MS: z.coerce.number().int().min(5_000).max(180_000).default(45_000),
  // MAI speech models ride the Azure Speech REST API (not OpenAI-style
  // deployments): ASR = fast transcription with enhancedMode.model, TTS =
  // SSML whose voice name carries the model (en-US-<Name>:MAI-Voice-2).
  // Both are region-locked to East US / West US in preview.
  AZURE_ASR_DEPLOYMENT: z.string().default('mai-transcribe-1.5'),
  AZURE_TTS_VOICE: z.string().default('en-US-Iris:MAI-Voice-2'),
  AZURE_SPEECH_REGION: z.string().default('eastus'),
  AZURE_SPEECH_KEY: z.string().default(''), // empty = reuse AZURE_OPENAI_API_KEY
  // FLUX.2 [pro] lives on the cognitive-services host of the same resource.
  AZURE_AI_ENDPOINT: z.string().default(''), // https://<resource>.api.cognitive.microsoft.com
  AZURE_AI_API_KEY: z.string().default(''), // empty = reuse AZURE_OPENAI_API_KEY
  AZURE_IMAGE_MODEL: z.string().default('FLUX.2-pro'),

  // Child-voice privacy (NFR-3): raw audio is deleted after this many days.
  AUDIO_RETENTION_DAYS: z.coerce.number().int().min(0).max(365).default(30),
  // Hard session cap (FR-H.1). Server-enforced; the client cannot extend it.
  SESSION_CAP_MINUTES: z.coerce.number().int().min(1).max(60).default(15),

  SEED_PARENT_EMAIL: z.string().default('demo@qissa.app'),
  SEED_PARENT_PASSWORD: z.string().default('change-me-before-demo')
});

export type Env = z.infer<typeof EnvSchema>;

/** Parse and validate the environment, or crash at boot with a clear reason. */
export function loadEnv(source: NodeJS.ProcessEnv = process.env): Env {
  const parsed = EnvSchema.safeParse(source);
  if (!parsed.success) {
    // One readable line per problem — a boot failure must be diagnosable
    // without reading Zod internals.
    const issues = parsed.error.issues
      .map((i) => `  - ${i.path.join('.')}: ${i.message}`)
      .join('\n');
    throw new Error(`Invalid environment configuration:\n${issues}`);
  }
  return parsed.data;
}

/** True when Secure cookies + strict CORS defaults apply. */
export function isProduction(env: Env): boolean {
  return env.NODE_ENV === 'production';
}
