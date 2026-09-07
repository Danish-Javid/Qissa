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
  // Comma-separated IPs/CIDRs permitted to set X-Forwarded-For. Empty = trust
  // nobody, so the client IP is the socket's own address.
  //
  // This is a security control, not a convenience. @fastify/rate-limit keys its
  // buckets on the client IP, and Fastify's blanket `trustProxy: true` takes
  // that IP from the leftmost X-Forwarded-For -- which is caller-controlled.
  // Trusting every hop lets an attacker send a fresh header per request and
  // walk straight through both the global ceiling and the 10/min credential
  // cap. Behind a reverse proxy, list the proxy's address or the compose
  // subnet, and nothing broader.
  TRUSTED_PROXY_NETS: z
    .string()
    .default('')
    .transform((v) => v.split(',').map((s) => s.trim()).filter(Boolean)),
  // Stage/judging surfaces: POST /api/demo/* and GET /api/metrics-demo. Both
  // exist to make a live demo reliable and both are wrong on a public
  // deployment -- seed drives paid vendor generations, and metrics-demo reports
  // platform-wide aggregates to any signed-in parent. Empty derives the safe
  // answer from NODE_ENV; see demoSurfaceEnabled().
  DEMO_SURFACE: z.enum(['true', 'false', '']).default(''),

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
  // Vendor generation budget per child per rolling 24h (NFR-4.4). Reaching it
  // does NOT error: the engine skips the paid rung and serves the same vetted
  // ladder it uses when a vendor is down, so a child still reads. 0 disables
  // the generator entirely (useful for a zero-spend rehearsal).
  DAILY_STORY_BUDGET_PER_CHILD: z.coerce.number().int().min(0).max(500).default(40),

  // --- Personalized video (@qissa/video) -------------------------------------
  // Whether the "make a song" surface exists at all. Off by default: rendering
  // needs Remotion, which is free for individuals and companies of up to three
  // people and requires a paid company licence beyond that, so it must be an
  // explicit choice by whoever deploys rather than something that switches
  // itself on. See research/12-personalized-video.md.
  VIDEO_ENABLED: z
    .enum(['true', 'false'])
    .default('false')
    .transform((v) => v === 'true'),
  // Render workers. Remotion counts the HOST's cores, which in a CPU-limited
  // container oversubscribes the cgroup and thrashes; set this to the limit.
  // Empty leaves the choice to Remotion, which is right on a dev machine.
  VIDEO_RENDER_CONCURRENCY: z
    .string()
    .optional()
    .transform((v) => (v === undefined || v === '' ? null : Number(v)))
    .pipe(z.number().int().min(1).max(32).nullable()),

  SEED_PARENT_EMAIL: z.string().default('demo@qissa.app'),
  // Deliberately NO default. This repository is public, so any password written
  // here is a published credential for every deployment that follows the
  // README's `cp .env.example .env` + `npm run seed`. Empty makes seed.ts
  // generate a strong random password and print it exactly once.
  SEED_PARENT_PASSWORD: z.string().default('')
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
  const env = parsed.data;

  // A production boot with COOKIE_SECURE=false is a silent and total
  // compromise: the session cookie is the ONLY authentication factor, and
  // without the Secure flag a browser sends it over plain HTTP. app.ts also
  // drops HSTS in exactly that state, so nothing would ever upgrade the
  // connection. Refuse to start rather than serve an app that looks healthy
  // and is not -- a crash here is diagnosable, a leaked cookie is not.
  if (env.NODE_ENV === 'production' && !env.COOKIE_SECURE) {
    throw new Error(
      'Invalid environment configuration:\n' +
        '  - COOKIE_SECURE: must be "true" when NODE_ENV=production, or session cookies are sent over plain HTTP'
    );
  }
  return env;
}

/** True when Secure cookies + strict CORS defaults apply. */
export function isProduction(env: Env): boolean {
  return env.NODE_ENV === 'production';
}

/**
 * Whether the stage/judging surface (demo seed + reset, metrics card) exists at
 * all. An explicit DEMO_SURFACE wins; otherwise it is derived, so the default is
 * ON for local development and for the test suite (which never sets NODE_ENV)
 * and OFF for production. When off the routes are never registered, so there is
 * nothing to defend rather than a route that must be defended correctly.
 */
export function demoSurfaceEnabled(env: Env): boolean {
  if (env.DEMO_SURFACE !== '') return env.DEMO_SURFACE === 'true';
  return env.NODE_ENV !== 'production';
}
