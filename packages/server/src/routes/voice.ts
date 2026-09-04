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

    let audio: Uint8Array;
    try {
      audio = new Uint8Array(Buffer.from(body.audioBase64, 'base64'));
    } catch {
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

  app.post('/tts', { preHandler: requireAuth(app) }, async (request, reply) => {
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

    let audio: Uint8Array;
    try {
      audio = new Uint8Array(Buffer.from(body.audioBase64, 'base64'));
    } catch {
      return reply.code(400).send({ error: 'invalid audio encoding' });
    }

    // Random file names: unguessable paths, no child identifiers on disk.
    const fileName = `${randomBytes(16).toString('hex')}.wav`;
    const filePath = path.join(audioDir, fileName);
    await writeFile(filePath, audio);

    const clip = await prisma.audioClip.create({ data: { sessionId: session.id, path: filePath } });
    return reply.code(201).send({ stored: true, id: clip.id });
  });

  app.get('/:id', { preHandler: requireAuth(app) }, async (request, reply) => {
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
