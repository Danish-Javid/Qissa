/**
 * Feature review by a frontier model — `npm run review`.
 *
 * Sends a product brief PLUS the actual source of every pedagogy engine, the
 * content pipeline and the three child players to a reviewing model, and writes
 * the critique to review-output.md.
 *
 * Why source and not just a description: a description gets you a review of the
 * description. The engines ARE the product — the correction ladder, the
 * decodability gate, the lesson planner — so they are what a reviewer needs to
 * see to say anything worth reading.
 *
 * Deliberately NOT a vitest file and deliberately NOT in config.ts's validated
 * environment. It costs real money, it needs a real key, and it is never called
 * by the server — exactly like verify-providers.ts. Keeping ASTRA_* out of
 * config.ts means this desk tool can never become part of the runtime contract.
 *
 * Privacy note: everything listed in REVIEW_FILES leaves your machine. It is
 * source and product strategy, not child data — no database is read and no
 * .env value is ever included in the payload.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// ---------------------------------------------------------------------------
// Config — read straight from .env, because the app has no dotenv and these
// vars are deliberately absent from the validated runtime environment.
// ---------------------------------------------------------------------------

/** Minimal .env reader: KEY=VALUE, ignoring blanks and # comments. */
function readDotEnv(file: string): Record<string, string> {
  let raw: string;
  try {
    raw = readFileSync(file, 'utf8');
  } catch {
    return {};
  }
  const out: Record<string, string> = {};
  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (trimmed === '' || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    // Strip one layer of surrounding quotes, which people paste by habit.
    const value = trimmed.slice(eq + 1).trim().replace(/^(['"])(.*)\1$/, '$2');
    out[key] = value;
  }
  return out;
}

/** Repo root, from packages/server/src/scripts. */
const ROOT = path.resolve(import.meta.dirname, '..', '..', '..', '..');

/** True for an Azure AI Foundry / Azure OpenAI host. */
export function isAzureHost(url: string): boolean {
  return /\.(services\.ai|openai|cognitiveservices)\.azure\.com/i.test(url);
}

/**
 * Normalise whatever endpoint the portal handed you into a chat-completions
 * base.
 *
 * Foundry shows you a PROJECT endpoint — `https://<resource>.services.ai.azure
 * .com/api/projects/<project>` — which is the SDK's control-plane URL, not an
 * OpenAI-compatible base. Posting completions there 404s. The resource host
 * plus `/openai/v1` is the inference base, which is exactly the trim
 * AzureFluxImageGenerator already does for the BFL path.
 *
 * Left alone: anything already ending in a version segment, and every
 * non-Azure base (api.openai.com/v1 and OpenAI-compatible gateways).
 */
export function normalizeBaseUrl(raw: string): string {
  let url = raw.trim().replace(/\/+$/, '');
  if (!isAzureHost(url)) return url;
  url = url.replace(/\/api\/projects\/[^/]+$/i, '');
  if (!/\/openai(\/|$)/i.test(url)) url = `${url}/openai/v1`;
  return url;
}

/**
 * The source a reviewer needs. Ordered so the reading is coherent: what the
 * product claims, then the engines that make the claim true, then the surfaces
 * a child actually touches.
 */
const REVIEW_FILES: Array<{ file: string; why: string }> = [
  { file: 'README.md', why: 'What the product claims to be' },
  { file: 'packages/core/src/modes.ts', why: 'The three-door age model and parental controls' },
  { file: 'packages/core/src/types.ts', why: 'The domain model' },
  { file: 'packages/core/src/pedagogy/decodability.ts', why: 'The gate: a child never sees an undecodable word' },
  { file: 'packages/core/src/pedagogy/graphemes.ts', why: 'Grapheme parsing and segmentation' },
  { file: 'packages/core/src/pedagogy/correction-ladder.ts', why: 'What happens when a child gets stuck' },
  { file: 'packages/core/src/pedagogy/miscue.ts', why: 'Forced-alignment miscue classification' },
  { file: 'packages/core/src/pedagogy/accent.ts', why: 'Urdu/Punjabi-English accent tolerance' },
  { file: 'packages/core/src/pedagogy/peer.ts', why: 'The dialogic-reading state machine' },
  { file: 'packages/core/src/pedagogy/lesson.ts', why: 'The Learn-to-Read lesson planner' },
  { file: 'packages/core/src/pedagogy/progression.ts', why: 'Advance / hold / reteach rules' },
  { file: 'packages/core/src/pedagogy/teaching.ts', why: 'Per-page word teaching' },
  { file: 'packages/core/src/learner/learner-model.ts', why: 'The multi-year record — the claimed moat' },
  { file: 'packages/core/src/learner/spaced-repetition.ts', why: 'Decay and review scheduling' },
  { file: 'packages/core/src/data/phonics-scope.json', why: 'The curriculum spine, 8 levels' },
  { file: 'packages/core/src/data/themes.json', why: 'The 12-week character curriculum' },
  { file: 'packages/core/src/data/accent-variants.json', why: 'The accent allow-list' },
  { file: 'packages/server/src/providers/story-prompt.ts', why: 'PROBLEM AREA: the single-shot story prompt' },
  { file: 'packages/server/src/story/story-engine.ts', why: 'PROBLEM AREA: generate → validate → reject → fall back' },
  { file: 'packages/server/src/providers/art-style.ts', why: 'PROBLEM AREA: art direction, no identity conditioning' },
  { file: 'packages/server/src/providers/interfaces.ts', why: 'The four vendor interfaces' },
  { file: 'packages/server/src/session/orchestrator.ts', why: 'The turn loop, cap and narrative close' },
  { file: 'packages/server/src/safety/distress.ts', why: 'Distress escalation' },
  { file: 'packages/server/src/safety/content-filter.ts', why: 'Content moderation' },
  { file: 'packages/server/src/early/catalog.ts', why: 'The First Words curated track' },
  { file: 'packages/web/src/child/ChildHome.tsx', why: 'The three-door screen a child lands on' },
  { file: 'packages/web/src/child/LearnToReadPlayer.tsx', why: 'The main learning surface' },
  { file: 'packages/web/src/child/StoryTimePlayer.tsx', why: 'The receptive narrated-story surface' },
  { file: 'packages/web/src/child/EarlyPlayer.tsx', why: 'The 1–2 year old surface' },
  { file: 'packages/web/src/parent/Digest.tsx', why: 'The weekly note home — the retention artefact' }
];

const SYSTEM_PROMPT = `You are a brutally honest reviewer of children's education products.
You have deep expertise in early literacy pedagogy, child development, product
design for young children, and the technical realities of LLM and image-model
pipelines.

The team is NOT satisfied with what they have and does not want reassurance.
Praise is worthless to them. Your value is in naming what is weak, what is
missing, and what should be cut — specifically, with reasons, ranked by impact.

Ground every claim in the actual source you are given. If you assert something
is missing, say which file you looked in. If you are uncertain, say so plainly
rather than hedging into vagueness. Do not invent research citations.`;

const BRIEF = `# Qissa — feature review request

## What it is
A voice-first AI early-literacy companion for children aged 1–6, built in
Pakistan for the Alibaba Cloud AI Hackathon Pakistan 2026. It is modelled on
the Young Lady's Illustrated Primer from Neal Stephenson's *The Diamond Age*: a
book that knows one child, writes her real life into its stories, and teaches
her to read, to reason about right and wrong, and to plan — over years.

Governing principle: the LLM generates *language*; deterministic code decides
*pedagogy*. The correction ladder, dialogue engine, progression rules and
decodability validator are plain state machines, so a model change cannot
silently alter how a child is taught.

Deliberate anti-features: no streaks, no badges, no notifications to the child,
a hard 15-minute cap ending in a narrative close and an offline task. It is
built to be put down.

## Three doors
- First Words (1–2): picture naming, sounds, kindness, tap-quiz over a static
  curated catalog. No generator, so narration cannot be steered.
- Learn to Read (3–6): new letter sounds → blend real words → mic check → sight
  words → fluency → an illustrated reward. Adaptive to the learner model.
- Story Time (1–6): the companion narrates the child's OWN generated story over
  art, ~2 minutes, 8 pages. Receptive; no reading required.

## Audience
Children in Pakistan first, often bilingual with Urdu at home. Every serious
competitor (Ello, Amira, LUCA) is a US product on American accents — a Lahore
child saying "wery" for "very" is marked wrong. The parent is the buyer and is
structurally inside the product: every session ends by handing the child back.

## Deliberately not built
Read Together mode · multiple children per account · writing · arithmetic ·
Urdu-language *reading* content (the parent layer is bilingual; the phonics
scope teaches English graphemes) · live human tutors · an efficacy study.

## The two problems we most want solved

### 1. Image generation has no character consistency
Every page calls generateImage(prompt) with a fresh text prompt — no seed, no
reference image, no character sheet, no identity conditioning. The hero's face
changes between page 1 and page 2 of the same story. The original design intent
was to generate character assets ONCE and composite them into scenes; instead
every page is a full 1024x1024 generation at up to 90 seconds. Story Time is 8
pages.

What is the best available approach to character-consistent illustration across
many images, for a 2-minute cartoon at low cost? Be concrete and honest about
which techniques are worth the complexity.

### 2. Story generation is single-shot against a brutal constraint stack
One prompt demands simultaneously: every word decodable from a specific taught
grapheme list plus one new unit; a named exception-word list and no other proper
nouns; the target grapheme in at least 6 distinct words; each review grapheme in
at least 3; no apostrophes, contractions, possessives or place names; ONE
coherent narrative arc across N pages; three fields per page; a choice point
with two options and two consequences; and an offline task.

On failure the engine rejects and serves a cached story. There is NO repair
pass — the exact violating words are computed and logged, then discarded rather
than returned to the model for a targeted rewrite. On hard levels the generator
fails often and children see repeats, which weakens the personalisation premise
exactly where it should be strongest.

How do we raise first-pass acceptance? Candidates being weighed: a constrained
repair loop; plan-then-write decomposition; constrained decoding or a
word-list-restricted grammar; writing the narrative first then substituting
decodable vocabulary; higher reasoning effort on the background prefetch where
latency is free.

## What we want from you

1. FEATURES — what is missing that would matter most to a 4-year-old in Lahore,
   or to the parent paying for this? What have we over-built or should cut?
2. HOW THE FEATURES WORK — review the mechanics in the source, not the pitch.
   Where does the pedagogy break down, or the implementation not match what the
   comments claim?
3. THE PRIMER THESIS — we claim reading + character + executive function in one
   story is the differentiator. Real, or spreading thin?
4. AGES 1–6 ACROSS THREE DOORS — too wide? Where does it break?
5. ANTI-ENGAGEMENT — no streaks, hard cap, offline task. Defensible product or
   commercial suicide?
6. IMAGE CONSISTENCY — the concrete recommendation for problem 1.
7. CONSTRAINT SATISFACTION — the concrete recommendation for problem 2.

Structure your answer with the highest-impact findings first. For each: what is
wrong, why it matters, and what specifically to do about it.`;

interface ChatResponse {
  /** `delta` on a streamed chunk; `message` on a non-streamed reply. */
  choices?: Array<{ delta?: { content?: string }; message?: { content?: string } }>;
  usage?: { prompt_tokens?: number; completion_tokens?: number };
  error?: { message?: string };
}

async function main(): Promise<void> {
  const env = { ...readDotEnv(path.join(ROOT, '.env')), ...process.env };
  const rawBaseUrl = env.ASTRA_BASE_URL ?? '';
  const baseUrl = normalizeBaseUrl(rawBaseUrl);
  const apiKey = env.ASTRA_API_KEY ?? '';
  const model = env.ASTRA_MODEL ?? 'gpt-6-astra';
  const azure = isAzureHost(baseUrl);

  if (apiKey === '' || baseUrl === '') {
    console.error(
      '\nMissing review credentials.\n\n' +
        '  Set these in app/.env (see .env.example):\n' +
        '    ASTRA_BASE_URL=https://api.openai.com/v1\n' +
        '    ASTRA_API_KEY=<your key>\n' +
        '    ASTRA_MODEL=gpt-6-astra\n\n' +
        '  For Azure Foundry, paste either the resource host or the project\n' +
        '  endpoint the portal shows — both are normalized to the inference base.\n' +
        '  ASTRA_MODEL there is the DEPLOYMENT name, not the model id.\n'
    );
    process.exit(1);
  }

  // ---- Assemble the payload -------------------------------------------------
  const parts: string[] = [BRIEF, '\n\n---\n\n# Source\n'];
  const missing: string[] = [];
  let bytes = 0;

  for (const { file, why } of REVIEW_FILES) {
    try {
      const content = readFileSync(path.join(ROOT, file), 'utf8');
      bytes += content.length;
      const ext = path.extname(file).slice(1) || 'text';
      parts.push(`\n## ${file}\n_${why}_\n\n\`\`\`${ext}\n${content}\n\`\`\`\n`);
    } catch {
      // A renamed file must be visible, not silently dropped from the review.
      missing.push(file);
    }
  }

  if (missing.length > 0) {
    console.warn(`\nWarning — ${missing.length} file(s) in REVIEW_FILES no longer exist:`);
    for (const file of missing) console.warn(`  - ${file}`);
    console.warn('  The review will proceed without them. Update REVIEW_FILES.\n');
  }

  const payload = parts.join('');
  // ~4 chars per token is the usual rough rule; this is a sanity figure for the
  // operator, not a billing calculation.
  console.log(
    `\nQissa feature review\n` +
      `  model     ${model}${azure ? '  (Azure: this must be the DEPLOYMENT name)' : ''}\n` +
      `  endpoint  ${baseUrl}${baseUrl === rawBaseUrl.replace(/\/+$/, '') ? '' : `\n            (normalized from ${rawBaseUrl})`}\n` +
      `  auth      ${azure ? 'api-key header (Azure)' : 'Bearer token'}\n` +
      `  files     ${REVIEW_FILES.length - missing.length}/${REVIEW_FILES.length}\n` +
      `  payload   ${(bytes / 1024).toFixed(0)} KB source (~${Math.round(payload.length / 4).toLocaleString()} tokens)\n\n` +
      `  Sending. A review of this size takes a few minutes.\n`
  );

  const started = Date.now();
  // Azure authenticates inference with an `api-key` header, not a bearer token
  // — the same header the app's own Azure providers send. OpenAI and every
  // OpenAI-compatible gateway want Authorization: Bearer.
  const authHeader: Record<string, string> = azure
    ? { 'api-key': apiKey }
    : { Authorization: `Bearer ${apiKey}` };

  // Streaming is not a nicety here, it is what makes the call possible at all.
  //
  // Node's fetch (undici) applies a 300s headersTimeout that AbortSignal does
  // NOT override. A ~67k-token input takes longer than five minutes to produce
  // its first byte, so the non-streaming version died with a bare "fetch
  // failed" after the socket was torn down — no status, no vendor message,
  // nothing to debug. With stream:true the first chunk lands in seconds, the
  // headers timeout never fires, and progress is visible while it writes.
  const response = await fetch(`${baseUrl}/chat/completions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...authHeader },
    body: JSON.stringify({
      model,
      stream: true,
      // Ask for token counts in the final chunk; harmless where unsupported.
      stream_options: { include_usage: true },
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: payload }
      ]
    }),
    signal: AbortSignal.timeout(1_800_000)
  });

  if (!response.ok || response.body === null) {
    // Read the error body as text: a failure response is JSON, not a stream,
    // and the vendor's own message names the real problem (wrong deployment
    // name, unentitled account, content filter) far better than a status code.
    const text = await response.text().catch(() => '');
    let detail = text.slice(0, 500);
    try {
      detail = (JSON.parse(text) as ChatResponse).error?.message ?? detail;
    } catch {
      // Not JSON — the truncated body is the best available detail.
    }
    throw new Error(`HTTP ${response.status} — ${detail}`);
  }

  // ---- Consume the SSE stream ----------------------------------------------
  const decoder = new TextDecoder();
  let buffered = '';
  let review = '';
  let usage: ChatResponse['usage'];
  let lastTick = Date.now();

  for await (const chunk of response.body as unknown as AsyncIterable<Uint8Array>) {
    buffered += decoder.decode(chunk, { stream: true });
    // SSE frames are separated by a blank line; keep any partial tail.
    const frames = buffered.split('\n\n');
    buffered = frames.pop() ?? '';

    for (const frame of frames) {
      const line = frame.split('\n').find((l) => l.startsWith('data:'));
      if (line === undefined) continue;
      const data = line.slice(5).trim();
      if (data === '' || data === '[DONE]') continue;

      let parsed: ChatResponse;
      try {
        parsed = JSON.parse(data) as ChatResponse;
      } catch {
        continue; // A keep-alive or a frame we do not need.
      }
      review += parsed.choices?.[0]?.delta?.content ?? '';
      if (parsed.usage) usage = parsed.usage;
    }

    // A heartbeat, so a multi-minute call never looks like a hang.
    if (Date.now() - lastTick > 15_000) {
      lastTick = Date.now();
      console.log(`    …${review.length.toLocaleString()} chars after ${Math.round((Date.now() - started) / 1000)}s`);
    }
  }

  if (review.trim() === '') throw new Error('The model returned no content.');

  const out = path.join(ROOT, 'review-output.md');
  const header =
    `# Qissa feature review\n\n` +
    `- Model: \`${model}\`\n` +
    `- Date: ${new Date().toISOString()}\n` +
    `- Files reviewed: ${REVIEW_FILES.length - missing.length}\n` +
    `- Tokens: ${usage?.prompt_tokens ?? '?'} in / ${usage?.completion_tokens ?? '?'} out\n\n---\n\n`;
  writeFileSync(out, header + review, 'utf8');

  console.log(
    `\n  Done in ${Math.round((Date.now() - started) / 1000)}s.\n` +
      `  Tokens: ${usage?.prompt_tokens ?? '?'} in / ${usage?.completion_tokens ?? '?'} out\n` +
      `  Written to ${out}\n`
  );
}

/**
 * Run only when invoked directly. Without this guard, importing the module to
 * test the URL helpers would fire a real, paid request as a side effect.
 *
 * fileURLToPath, not `new URL(...).pathname`: the latter percent-encodes, so
 * this repository's own path ("AI Hackathon") arrived as "AI%20Hackathon", the
 * comparison never matched, and `npm run review` exited 0 having done nothing.
 * A silent no-op is the worst possible failure for a script you are waiting on.
 */
const invokedDirectly =
  process.argv[1] !== undefined && path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url));

if (invokedDirectly) {
  main().catch((err) => {
    console.error('\n[qissa] review failed:', err instanceof Error ? err.message : err, '\n');
    process.exit(1);
  });
}
