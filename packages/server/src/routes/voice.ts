/**
 * Voice routes — child audio in, companion audio out.
 *
 *  POST /api/asr          recognize a child's reading clip
 *  POST /api/tts          synthesize a companion phrase (with phrase cache)
 *  POST /api/audio-clips  retain a clip for the parent digest (consent-gated)
 *  GET  /api/audio/:id    play back a retained clip (ownership-checked)
 *
 * Privacy rules enforced here (NFR-3):
 *  - clips are stored ONLY if the parent gave consent AND retention > 0;
 *  - raw audio is the request body's bytes — nothing is forwarded to any
 *    vendor except the configured recognizer;
 *  - the 30-day (configurable) deletion is by-creation-date, no exceptions.
 *
 * Abuse rules enforced here:
 *  - inbound audio is validated as base64 and length-bounded before it reaches
 *    a vendor or the disk;
 *  - /api/tts carries a tighter rate ceiling than the global default, because
 *    every phrase-cache miss is a PAID synthesis.
 */
import { randomBytes } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { z } from 'zod';
import type { FastifyInstance } from 'fastify';
import { ctx } from '../context.js';
import { filterText } from '../safety/content-filter.js';
import { denyNotFound, requireAuth } from './guards.js';
import { parseBody, parseParams } from './validate.js';

/** 2 MB of base64 is generous for a ~10s 16kHz mono WAV. */
const MAX_AUDIO_BASE64 = 2 * 1024 * 1024 * 1.4;

const AsrSchema = z
  .object({
    sessionId: z.string().min(1).max(64).optional(),
    audioBase64: z.string().max(Math.ceil(MAX_AUDIO_BASE64)),
    sampleRate: z.number().int().min(8000).max(48000).optional(),
    // Mock mode only: the real recognizer never reads this field.
    fallbackText: z.string().max(500).optional()
  })
  .strict();

const TtsSchema = z.object({ text: z.string().min(1).max(200) }).strict();

const ClipSchema = z
  .object({ sessionId: z.string().min(1).max(64), audioBase64: z.string().max(Math.ceil(MAX_AUDIO_BASE64)) })
  .strict();

const AudioIdParams = z.object({ id: z.string().regex(/^[a-z0-9]{1,80}$/i) }).strict();

/** Absolute decoded ceiling. MAX_AUDIO_BASE64 implies roughly 2.1 MB decoded;
 *  this leaves headroom so a maximum-length legitimate clip is never rejected,
 *  while staying well under the server's 4 MB bodyLimit. */
const MAX_AUDIO_BYTES = 3 * 1024 * 1024;

/** Per-minute ceiling on paid synthesis. The rationale lives on the /tts route. */
const TTS_MAX_PER_MINUTE = 30;

/**
 * Decode and length-check client-supplied audio, or return null.
 *
 * `Buffer.from(x, 'base64')` NEVER throws on malformed input -- it silently
 * discards characters outside the alphabet -- so the try/catch that used to wrap
 * it guarded nothing, and arbitrary bytes reached both the recognizer and the
 * disk. This validates the alphabet, rejects empty input, and bounds the decoded
 * length.
 *
 * Deliberately NOT a container check: the browser's MediaRecorder is created
 * without a mimeType (web/src/voice/capture.ts), so the bytes are whatever the
 * browser defaults to -- WebM/Opus on Chromium, MP4 on Safari. Requiring a
 * RIFF/WAVE magic here would reject every real recording a child makes.
 */
function decodeAudio(base64: string): Uint8Array | null {
  if (!/^[A-Za-z0-9+/]*={0,2}$/.test(base64)) return null;
  const buffer = Buffer.from(base64, 'base64');
  if (buffer.length === 0 || buffer.length > MAX_AUDIO_BYTES) return null;
  return new Uint8Array(buffer);
}

/** Pre-synthesized phrase cache (plan §Phase 2): companion phrases repeat
 *  constantly ("You got it — keep going."), so synthesizing once and
 *  replaying keeps the hot path under the latency budget. */
const phraseCache = new Map<string, { audio: Uint8Array; format: 'wav' | 'mp3' }>();
const PHRASE_CACHE_MAX = 256;

export async function voiceRoutes(app: FastifyInstance): Promise<void> {
  const { prisma, providers, orchestrator, env } = ctx(app);
  const audioDir = path.resolve(process.cwd(), 'data', 'audio');
  await mkdir(audioDir, { recursive: true });

  app.post('/asr', { preHandler: requireAuth(app) }, async (request, reply) => {
    const body = parseBody(AsrSchema, request.body, reply);
    if (body === null) return;

    const audio = decodeAudio(body.audioBase64);
    if (audio === null) {
      return reply.code(400).send({ error: 'invalid audio encoding' });
    }

    try {
      const result = await providers.recognizer.recognize(audio, {
        sampleRate: body.sampleRate,
        fallbackText: body.fallbackText
      });
      if (body.sessionId) orchestrator.addCost(body.sessionId, result.costMicroUsd);
      return { words: result.words, text: result.text };
    } catch (err) {
      // Vendor ASR down: tell the client to keep its own transcript path.
      // Log the WHY (status/path, never the key) — a silent 502 made a
      // missing deployment invisible for a whole demo rehearsal.
      request.log.warn({ asrError: String(err) }, 'ASR vendor call failed');
      return reply.code(502).send({ error: 'recognition unavailable' });
    }
  });

  // Tighter than the global 600/min, and the reason is money rather than abuse.
  // Every phrase-cache MISS is a paid vendor synthesis, and the cache is bounded
  // (PHRASE_CACHE_MAX) with oldest-evicted -- so a caller submitting enough
  // distinct phrases evicts the legitimate companion phrases and turns the cache
  // into an amplifier for vendor spend. This bounds the RATE.
  //
  // It is deliberately not a daily budget. A durable per-parent cap needs a
  // parentId on the audit ledger, which the schema does not carry, and an
  // in-memory counter would reset on every restart -- exactly the drift the
  // story budget was designed out (see story-engine.ts, "Counting rows is
  // deliberate over a running counter").
  const ttsOptions = {
    preHandler: requireAuth(app),
    config: { rateLimit: { max: TTS_MAX_PER_MINUTE, timeWindow: '1 minute' } }
  };

  app.post('/tts', ttsOptions, async (request, reply) => {
    const body = parseBody(TtsSchema, request.body, reply);
    if (body === null) return;

    // Defense in depth: companion phrases are server-authored, but anything
    // reaching a child's speaker goes through the moderation filter.
    const verdict = filterText(body.text);
    if (!verdict.ok) return reply.code(422).send({ error: 'phrase rejected by content filter' });

    const cached = phraseCache.get(body.text);
    if (cached) {
      return reply.send({ audioBase64: Buffer.from(cached.audio).toString('base64'), format: cached.format, cached: true });
    }

    try {
      const result = await providers.synthesizer.synthesize(body.text);
      if (phraseCache.size >= PHRASE_CACHE_MAX) {
        // Map iteration order is insertion order — drop the oldest phrase.
        const oldest = phraseCache.keys().next().value;
        if (oldest !== undefined) phraseCache.delete(oldest);
      }
      phraseCache.set(body.text, { audio: result.audio, format: result.format });
      return reply.send({
        audioBase64: Buffer.from(result.audio).toString('base64'),
        format: result.format,
        cached: false
      });
    } catch {
      return reply.code(502).send({ error: 'synthesis unavailable' });
    }
  });

  /** Store a clip for the digest — consent AND retention both required. */
  app.post('/audio-clips', { preHandler: requireAuth(app) }, async (request, reply) => {
    const body = parseBody(ClipSchema, request.body, reply);
    if (body === null) return;

    if (request.auth.parent.consentGivenAt === null) {
      return reply.code(403).send({ error: 'voice consent not given' });
    }
    if (env.AUDIO_RETENTION_DAYS === 0) {
      // Retention disabled: nothing is stored, and that is not an error.
      return reply.send({ stored: false });
    }

    const session = await prisma.readingSession.findFirst({
      where: { id: body.sessionId, child: { parentId: request.auth.parent.id } }
    });
    if (session === null) return denyNotFound(reply);

    const audio = decodeAudio(body.audioBase64);
    if (audio === null) {
      return reply.code(400).send({ error: 'invalid audio encoding' });
    }

    // Random file names: unguessable paths, no child identifiers on disk.
    const fileName = `${randomBytes(16).toString('hex')}.wav`;
    const filePath = path.join(audioDir, fileName);
    await writeFile(filePath, audio);

    const clip = await prisma.audioClip.create({ data: { sessionId: session.id, path: filePath } });
    return reply.code(201).send({ stored: true, id: clip.id });
  });

  // Mounted at /audio/:id (this plugin carries no prefix). A bare '/:id'
  // here would both miss the client's /api/audio/:id call and swallow every
  // unmatched single-segment GET under /api as a catch-all.
  app.get('/audio/:id', { preHandler: requireAuth(app) }, async (request, reply) => {
    const params = parseParams(AudioIdParams, request.params, reply);
    if (params === null) return;

    const clip = await prisma.audioClip.findUnique({
      where: { id: params.id },
      include: { session: { include: { child: { select: { parentId: true } } } } }
    });
    if (clip === null || clip.session.child.parentId !== request.auth.parent.id) return denyNotFound(reply);

    try {
      const data = await readFile(clip.path);
      return reply.type('audio/wav').send(data);
    } catch {
      // Row exists but the retention job already removed the file.
      return denyNotFound(reply);
    }
  });
}
