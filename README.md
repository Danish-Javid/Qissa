# Qissa — AI early-literacy companion (ages 1–6)

Qissa is a child's **first living primer**: it writes itself around one child,
grows sound by sound, and hands progress back to the parent with the *reasoning*
behind every decision. A child opens one of three age-matched doors, taps and
speaks, and the companion listens, illustrates, coaches and remembers. Built for
the **Alibaba Cloud AI Hackathon Pakistan 2026**.

**One command to run:**

```bash
cp .env.example .env      # defaults work as-is — zero API keys needed
docker compose up --build
```

Then open **http://localhost:3000** → register a parent account → set up a child
(the five-minute world seed) → open a door. It runs with the venue Wi-Fi
unplugged: the mock providers are complete by design.

Optional demo history (six weeks of plausible sessions, digest-ready):

```bash
docker compose exec app node packages/server/dist/seed/seed.js
# sign in with SEED_PARENT_EMAIL / SEED_PARENT_PASSWORD from .env
```

---

## The three doors

Age is **derived from the birth date on the server** (never trusted from the
client); the parent may override the learning track and pace or hide Story Time.

| Mode | Age | What the child does | Player |
|---|---|---|---|
| **First Words** | 1–2 | Picture naming, sounds, a Kindness Corner and a tap-quiz over a static curated catalog (no generator, so narration can never be steered) | `EarlyPlayer` |
| **Learn to Read** | 3–6 | The standalone *"Toddlers Can Read"* phonics lesson — new letter **sounds** → **blend** real words → mic check → **sight** words → fluency wall → a FLUX **gift**. Adaptive to the learner model; every concrete word gets a picture | `LearnToReadPlayer` |
| **Story Time** | 1–6 (common) | Buddy narrates the child's **own** story over FLUX art, paced like a cartoon (~2 minutes, eight pages, fluent or slow) — receptive listening, no reading required | `StoryTimePlayer` |

Story Time is the common door every child gets; the other two are the
age-matched learning track (the bright primary action on the home screen).

## What is mock vs. real

`PROVIDER_MODE` flips **all four** vendors at once behind one interface set
(`IStoryGenerator`, `ISpeechRecognizer`, `ISpeechSynthesizer`, `IImageGenerator`)
— a provider swap is a config change, never a rewrite.

| Capability | Mock (default, zero keys) | Alibaba Cloud Model Studio | Azure AI Foundry |
|---|---|---|---|
| Story generation | Template composer over decodable word banks; **self-validates** against the same gates as the engine | Qwen (`QWEN_STORY_MODEL`) | GPT-5.5 (`AZURE_STORY_DEPLOYMENT`) |
| Speech recognition | Browser Web Speech transcript, server-trusted in mock mode only | Paraformer | MAI transcribe over Azure Speech (`AZURE_ASR_DEPLOYMENT`) |
| Speech synthesis | Silent WAV of plausible duration (pipeline fully exercised); the browser voice speaks instead | CosyVoice (`COSYVOICE_MODEL`), phrase-cached | MAI-Voice-2 over Azure Speech SSML (`AZURE_TTS_VOICE`) |
| Illustrations | Deterministic flat-SVG placeholder in the house art style | Wanx (`WANX_MODEL`) | FLUX.2 [pro] (`AZURE_IMAGE_MODEL`) |

Pedagogy is **never** mocked: the decodability validator, grapheme parser,
correction ladder, PEER dialogue machine, miscue classifier + accent allow-list,
progression rules, spaced repetition and the TCR lesson planner are deterministic
code that runs identically in both modes — and identically in the browser for
offline sessions.

## Stack

Node 24 LTS · TypeScript 5.9 (strict) · npm workspaces (`core` / `server` /
`web`) · Fastify 5 + Zod 4 · Prisma 6 + PostgreSQL 16 · React 19 + Vite 7 +
Tailwind 4 + react-router 7 · vite-plugin-pwa · Vitest · `@node-rs/argon2` ·
single multi-stage `node:24-alpine` Dockerfile, non-root.

```
packages/
├── core/      pedagogy engines + data spine (runs on server AND in browser)
│   ├── pedagogy/   graphemes, decodability validator, teaching, TCR lesson
│   │               planner + picturable allow-list, accent allow-list, miscue
│   │               classifier, correction ladder, PEER, progression
│   ├── learner/    learner model, spaced repetition + decay
│   ├── modes.ts    the three-door model + per-child parental controls
│   └── data/       phonics-scope.json (8 levels), word-bank.json,
│                   accent-variants.json, themes.json (12 weeks),
│                   cached-stories.json
├── server/    Fastify API
│   ├── providers/  mock + Alibaba + Azure behind the four interfaces;
│   │               art-style house prompt, story prompt
│   ├── story/      fail-closed generation pipeline (prompt → self-validate →
│   │               decodability → moderation → shape), on-disk art cache
│   ├── session/    read-aloud orchestrator — turn loop, 15-min cap, close
│   ├── early/      static First Words catalog (word cards, kindness vignettes)
│   ├── safety/     content filter, distress classifier, append-only audit
│   ├── jobs/       audio-retention sweep
│   ├── routes/     auth, children, early, lessons, stories, sessions, digest,
│   │               voice, health, metrics
│   ├── prisma/     schema + committed migration (applied at container start)
│   └── seed/       deterministic six-week demo history
└── web/       React PWA
    ├── child/      home (the three-door screen) + EarlyPlayer,
    │               LearnToReadPlayer, StoryTimePlayer; shared Buddy, Scene,
    │               Celebration
    ├── parent/     login, world-seed setup, dashboard, digest, archive,
    │               pipeline (the judging/honesty view)
    ├── voice/      mic capture, client VAD, Web Speech fallback, /tts playback
    └── api/        typed client (same-origin, CSRF on every mutation)
```

## Environment keys

Copy `.env.example` → `.env`. The server validates every variable at boot and
refuses to start on a bad value.

| Key | Default | Meaning |
|---|---|---|
| `NODE_ENV` | `development` | `production` enables Secure cookies + strict defaults |
| `PORT` | `3000` | HTTP listener |
| `LOG_LEVEL` | `info` | Pino log level |
| `DATABASE_URL` | compose value | PostgreSQL 16 (compose overrides this to host `db`) |
| `COOKIE_SECURE` | `false` | `true` only behind HTTPS — browsers drop Secure cookies on plain HTTP |
| `CORS_ORIGINS` | *(empty)* | Comma-separated allowlist; empty = same-origin only |
| `PROVIDER_MODE` | `mock` | `mock`, `alibaba` or `azure` — flips every provider at once |
| `DASHSCOPE_API_KEY` | *(empty)* | Alibaba Cloud Model Studio key; unlocks `alibaba` providers |
| `DASHSCOPE_BASE_URL` | `https://dashscope-intl.aliyuncs.com` | Regional endpoint (intl = correct for Pakistan) |
| `QWEN_STORY_MODEL` | `qwen-max` | Story generation model |
| `QWEN_HOTPATH_MODEL` | `qwen-flash` | Latency-critical classification model |
| `COSYVOICE_MODEL` | `cosyvoice-v2` | TTS model |
| `WANX_MODEL` | `wanx2.1-t2i-turbo` | Image model |
| `AZURE_OPENAI_ENDPOINT` | *(empty)* | Azure AI Foundry resource endpoint (`*.openai.azure.com`); unlocks `azure` providers |
| `AZURE_OPENAI_API_KEY` | *(empty)* | Key of the same resource |
| `AZURE_STORY_DEPLOYMENT` | `gpt-5.5` | Story generation deployment |
| `AZURE_STORY_REASONING_EFFORT` | `low` | Reasoning effort for the story call (`none`…`xhigh`); empty omits it |
| `AZURE_STORY_TIMEOUT_MS` | `45000` | Ceiling for the background story prefetch (`.env.example` ships `90000`) |
| `AZURE_ASR_DEPLOYMENT` | `mai-transcribe-1.5` | Speech recognition model (Azure Speech fast transcription) |
| `AZURE_TTS_VOICE` | `en-US-Iris:MAI-Voice-2` | Companion voice; the model rides in the SSML voice name |
| `AZURE_SPEECH_REGION` | `eastus` | Speech resource region — part of the ASR/TTS URL, region-locked in preview |
| `AZURE_SPEECH_KEY` | *(empty)* | Empty = reuse `AZURE_OPENAI_API_KEY` |
| `AZURE_AI_ENDPOINT` | *(empty)* | Cognitive-services host of the resource (FLUX.2 [pro]) |
| `AZURE_AI_API_KEY` | *(empty)* | Empty = reuse `AZURE_OPENAI_API_KEY` |
| `AZURE_IMAGE_MODEL` | `FLUX.2-pro` | Foundry Models image deployment |
| `AUDIO_RETENTION_DAYS` | `30` | Raw child audio deleted after N days (0 = immediate) |
| `SESSION_CAP_MINUTES` | `15` | Server-enforced session cap |
| `DAILY_STORY_BUDGET_PER_CHILD` | `40` | Vendor generations per child per rolling 24h; reaching it serves the vetted ladder instead of erroring (`0` = never call the generator) |
| `SEED_PARENT_EMAIL` | `demo@qissa.app` | Demo account email |
| `SEED_PARENT_PASSWORD` | `change-me-before-demo` | Demo account password — change before the stage |

Before demoing against a real vendor, run `npm run verify:providers`. It makes
the smallest real call to each of the four capabilities in the configured mode
and prints a pass/fail table with latency, so a wrong region, a missing
deployment or a bad key is found at a desk rather than on stage. Every check is
independent — knowing *which* of the four is misconfigured is the point.

**Nothing in this file can reach the browser.** The Vite env allowlist is empty
by design; the web bundle talks only to our own server, and every vendor call is
proxied server-side.

## The parent layer

| Surface | Route | What it does |
|---|---|---|
| Dashboard | `/parent` | Children, per-child controls, language switch |
| Digest | `/parent/digest/:id` | Progress, miscues, retained clips, and **why each story was chosen** — the gate decisions rendered as sentences, with the raw event still one click away |
| Certificate | `/parent/certificate/:id` | A printable certificate built from audited numbers only; WhatsApp share |
| Archive | `/parent/archive` | Device-local list of stories served |
| Pipeline | `/parent/pipeline` | The honesty view: rejection rate, vendor spend, budget, accent catches, and the offline switch |
| Demo control | `/parent/demo` | One-tap stage setup and reset |

**Bilingual (English / اردو).** The parent layer — dashboard, digest, reasoning,
certificate — is fully translated, RTL-aware, with Eastern Arabic-Indic numerals.
The **child track stays English**: the phonics scope teaches English graphemes,
and swapping scripts mid-lesson would break the very thing being taught. What
does cross over is First Words' coaching line for the co-viewing adult
("دیکھو — ball!"), because code-switching is how a Pakistani parent actually
teaches a toddler. The catalog is typed `Record<MessageKey, string>` per locale,
so a missing translation is a compile error rather than a blank screen on stage.

**Low-bandwidth mode** (per child, in Modes & controls) skips vendor image
generation and serves the deterministic house-style SVG. On a metered mobile
connection a generated PNG per page is the heaviest thing this app does; every
pedagogy gate is untouched, only the picture changes.

**Demo control** creates a child and generates stories through the *real*
pipeline — nothing on the demo screen is a fixture, so the pipeline view stays
truthful. Reset is scoped to the caller's own `isDemo` rows, so it cannot touch
a real child's history.

## Security posture

1. **No secrets in the browser.** Keys live in `.env` (git-ignored), read once at
   boot in one validated place. All vendor calls proxy through the server; the
   CSP is `default-src 'self'` with no third-party script, font or telemetry.
2. **Auth:** parent-only accounts (children never log in), Argon2id password
   hashing, HttpOnly + SameSite session cookies stored server-side, CSRF
   double-submit token on every mutation, uniform errors, and a hard 10/min
   ceiling on `/api/auth/register` and `/api/auth/login` (the global limit is
   600/min — far too generous for credentials). Login verifies an Argon2id hash
   on **every** attempt, falling back to a boot-time decoy hash when the email
   is unknown, so response time is not an account-existence oracle. Both
   properties are pinned by `auth-hardening.test.ts`.
3. **Input validation:** Zod schema with `reject-unknown-fields` (`.strict()`) on
   every route; params, bodies and headers all validated.
4. **Headers & limits:** @fastify/helmet (strict CSP), @fastify/rate-limit, CORS
   allowlist (default same-origin), a 4 MB body cap.
5. **Fail-closed content pipeline:** prompt constraints → generator
   self-validation → decodability validator → content moderation → shape checks.
   Any failure rejects the story; the engine serves the hand-written cache, then a
   deterministic fallback. A child is **never** shown a word she cannot decode.
6. **Bounded, injection-safe art:** word and page illustrations are keyed to an
   allow-list of concrete curriculum words (`isPicturableWord`) and cached on
   disk, so a picture request can never smuggle a prompt or run unbounded vendor
   spend.
7. **Prompt-injection resistance:** child utterances are untrusted data fed to
   exactly two deterministic machines — the distress classifier and the PEER state
   machine. There is no free chat and no privileged path for "ignore your rules"
   to reach. Covered by `red-team.test.ts` (rule overrides, wrapped distress,
   secrecy requests, cap negotiation).
8. **Child-voice privacy:** audio proxied server-side, raw utterances never
   persisted (distress alerts store the *category* only), the retention job
   deletes clips after `AUDIO_RETENTION_DAYS`, mic only in-session, consent screen
   before any recording.
9. **Append-only audit log:** every accepted/rejected story, cap, escalation and
   progression decision is written to `audit_log` — the digest and the
   `/api/metrics-demo` honesty card read straight from it.
10. **Docker:** multi-stage, `node:24-alpine`, non-root runtime, no secrets in
    layers (`.dockerignore` excludes `.env`), pinned lockfile (`npm ci`),
    HEALTHCHECK on `/api/health`, database unpublished to the host.
11. **Known accepted advisory:** `npm audit` flags `deepmerge-ts` (via the Prisma
    **CLI** only). The CLI runs at build time and for migrations, never in the
    request path; `@prisma/client` (runtime) does not use it. No patched Prisma
    6.x exists, and the "fix" would downgrade the CLI to a version mismatched
    with the client. Revisit when Prisma patches.

## Development (without Docker)

```bash
npm install                          # workspaces: core, server, web
npm run build -w @qissa/core         # server consumes core from dist/
npm run dev -w @qissa/server         # needs a local DATABASE_URL
npm run dev -w @qissa/web            # Vite dev server, proxies /api → :3000
npm test -w @qissa/core              # 160 tests (11 files) — engines, learner, modes, data
                                     #   spine, i18n catalog + story explainer
npm test -w @qissa/server            # 71 tests (10 files) — pipeline, orchestrator, red team,
                                     #   safety, route surface, auth hardening, demo
                                     #   scope, child settings, provider contracts
npm test -w @qissa/web               # 21 tests (3 files) — api client 401/CSRF, offline
                                     #   cache + storage failures, offline switch
npm run seed -w @qissa/server        # demo history (needs DATABASE_URL)
npm run verify:providers             # live check of all four vendors in the
                                     #   configured PROVIDER_MODE (costs money
                                     #   in alibaba/azure; safe in mock)
npm run check                        # lint + test + build, the whole gate
```

The server imports the generated Prisma client as a *value*, not just types, so
it must exist before any typecheck, test or build. `npm run db:generate` does
that, and the server's `build` and `pretest` scripts run it for you — a fresh
clone goes straight to `npm install && npm run check` with no extra step.

## CI

`.github/workflows/ci.yml` runs on every push and pull request:

| Job | What it proves | Blocking |
|---|---|---|
| **verify** | `npm run lint`, `npm test`, `npm run build` on Node 24 — the same gate as `npm run check` | yes |
| **docker** | the multi-stage image still builds (a broken Dockerfile is a demo-day failure unit tests cannot catch) | yes |
| **smoke** | `docker compose up` from `.env.example` alone, then `/api/health` returns ok and `/` serves the PWA shell | yes |
| **audit** | `npm audit --audit-level=high` | no — see the accepted advisory above |

Note: after changing anything in `packages/core`, rebuild it before
type-checking or running the server — the server resolves `@qissa/core` from
`dist/` (the web package resolves core *source* directly via a Vite alias).

## The two rules that shape everything

**Pedagogy is deterministic code.** The LLM generates *language*; the engine
decides *what happens next*. The decodability gate, the correction ladder (2.5 s
wait, never a third attempt), the PEER sequence, progression (advance at mastery,
reteach below 50 %) and the TCR lesson planner are plain state machines. That is
what makes protocol fidelity claimable, auditable and cheap.

**Every vendor sits behind an interface.** A provider failure is a config change,
not a rewrite — and the browser-native fallbacks (offline story cache, Web Speech,
client VAD) mean the app still reads on stage if the venue Wi-Fi dies.
