/**
 * Session orchestrator tests — cap enforcement, ladder protocol, distress
 * escalation, choice recording. Prisma is stubbed; time is faked where the
 * cap demands it.
 */
import { describe, expect, it, vi } from 'vitest';
import { createLearnerModel, type Story, type WorldSeed } from '@qissa/core';
import type { PrismaClient } from '@prisma/client';
import { loadEnv } from '../config.js';
import { SessionOrchestrator, type StartSessionInput } from './orchestrator.js';

const WORLD_SEED: WorldSeed = { heroName: 'Mina', city: 'Lahore' };

const STORY: Story = {
  title: 'Mina taps a mat',
  level: 1,
  targetGrapheme: 's',
  theme: 'courage',
  pages: [
    { text: 'Mina taps a mat.', illustrationHint: '' },
    { text: 'a mat is in a pan.', illustrationHint: '' }
  ],
  choice: {
    prompt: 'What next?',
    options: ['a pan', 'a mat'],
    consequenceForFirst: 'Mina taps a pan.',
    consequenceForSecond: 'Mina taps a mat.'
  },
  offlineTask: 'Find a mat at home.',
  provenance: { generator: 'test', model: 'test', promptVersion: 'test' }
};

function fakePrisma() {
  const writes: { op: string; args: unknown }[] = [];
  const client = {
    distressAlert: { create: vi.fn(async ({ data }: { data: unknown }) => (writes.push({ op: 'distress', args: data }), { id: 'd' })) },
    readingSession: { update: vi.fn(async ({ data }: { data: unknown }) => (writes.push({ op: 'session-update', args: data }), {})) },
    miscue: {
      createMany: vi.fn(async ({ data }: { data: unknown }) => (writes.push({ op: 'miscues', args: data }), { count: 1 })),
      updateMany: vi.fn(async ({ data }: { data: unknown }) => (writes.push({ op: 'miscue-update', args: data }), { count: 1 }))
    },
    choiceEvent: { create: vi.fn(async ({ data }: { data: unknown }) => (writes.push({ op: 'choice', args: data }), { id: 'c' })) },
    learnerModel: { upsert: vi.fn(async ({ update }: { update: unknown }) => (writes.push({ op: 'learner', args: update }), {})) },
    auditLog: { create: vi.fn(async ({ data }: { data: unknown }) => (writes.push({ op: 'audit', args: data }), { id: 'a' })) },
    $transaction: vi.fn(async (ops: unknown[]) => (writes.push({ op: 'transaction', args: ops }), ops))
  } as unknown as PrismaClient;
  return { writes, client };
}

function env(overrides: Record<string, string> = {}) {
  return loadEnv({ DATABASE_URL: 'postgresql://test', ...overrides });
}

function startInput(sessionId: string): StartSessionInput {
  const model = createLearnerModel();
  return {
    sessionId,
    childId: 'child-1',
    storyId: 'story-1',
    story: STORY,
    worldSeed: WORLD_SEED,
    ageYears: 4,
    taughtGraphemes: model.taughtGraphemes,
    taughtTrickyWords: model.taughtTrickyWords,
    learnerModel: model,
    providerMode: 'mock'
  };
}

describe('SessionOrchestrator', () => {
  it('returns null for unknown sessions', async () => {
    const orchestrator = new SessionOrchestrator(fakePrisma().client, env());
    expect(await orchestrator.turn('missing', { kind: 'utterance', text: 'hi' })).toBeNull();
  });

  it('drives the correction ladder: wait -> hint -> segment -> model, never a third attempt', async () => {
    const { client, writes } = fakePrisma();
    const orchestrator = new SessionOrchestrator(client, env());
    orchestrator.start(startInput('s1'));

    // Stall on "mat": rung 0 is the 2500ms wait.
    let result = await orchestrator.turn('s1', { kind: 'ladder', event: 'stall', word: 'mat' });
    expect(result?.actions).toEqual([{ kind: 'wait', ms: 2500 }]);

    // The client's 2.5s elapses: rung 1, the initial-sound hint.
    result = await orchestrator.turn('s1', { kind: 'ladder', event: 'waitElapsed' });
    expect(result?.actions[0]).toMatchObject({ kind: 'say', text: expect.stringContaining('/m/') });

    // Attempt 1 fails: rung 2, the segmentation.
    result = await orchestrator.turn('s1', { kind: 'ladder', event: 'attemptFailed' });
    expect(result?.actions[0]).toMatchObject({ kind: 'say', text: expect.stringContaining('Put it together') });

    // Attempt 2 fails: model the word and move on. No third attempt exists.
    result = await orchestrator.turn('s1', { kind: 'ladder', event: 'attemptFailed' });
    expect(result?.actions).toEqual([
      { kind: 'say', text: 'That word is mat. Nice try — keep going.' },
      { kind: 'advance' }
    ]);
    // The miscue row is stamped with how far the ladder went.
    expect(writes.some((w) => w.op === 'miscue-update' && (w.args as { ladderStep: number }).ladderStep === 2)).toBe(true);
  });

  it('classifies a read line and counts accuracy', async () => {
    const { client, writes } = fakePrisma();
    const orchestrator = new SessionOrchestrator(client, env());
    orchestrator.start(startInput('s1'));

    const result = await orchestrator.turn('s1', {
      kind: 'read-line',
      pageIndex: 0,
      spoken: ['mina', 'taps', 'a', 'pan'] // "pan" substitutes for "mat"
    });
    expect(result?.session.wordsRead).toBe(4);
    expect(result?.session.wordsCorrect).toBe(3);

    const miscues = writes.find((w) => w.op === 'miscues');
    expect(miscues).toBeDefined();
    const rows = miscues?.args as Array<{ expected: string; miscueType: string }>;
    expect(rows.map((r) => r.miscueType)).toEqual(['correct', 'correct', 'correct', 'substitution']);
  });

  it('escapes to the narrative close when the cap fires, ignoring the turn input', async () => {
    const { client, writes } = fakePrisma();
    const orchestrator = new SessionOrchestrator(client, env());
    orchestrator.start(startInput('s1'));

    // Rewind the session start past the 15-minute cap.
    const live = (orchestrator as unknown as { sessions: Map<string, { startedAtMs: number }> }).sessions.get('s1');
    if (live === undefined) throw new Error('session missing');
    live.startedAtMs = Date.now() - 16 * 60 * 1000;

    const result = await orchestrator.turn('s1', { kind: 'utterance', text: 'one more page' });
    expect(result?.ended).toBe(true);
    expect(result?.capped).toBe(true);
    expect(result?.actions.length ?? 0).toBeGreaterThan(0);
    expect(result?.actions.at(-1)?.kind).toBe('close');
    // Capped sessions are audited as such.
    expect(writes.some((w) => w.op === 'audit' && (w.args as { event: string }).event === 'session.capped')).toBe(true);
  });

  it("honours the parent's shorter per-child cap", async () => {
    const { client } = fakePrisma();
    const orchestrator = new SessionOrchestrator(client, env());
    // Parent asked for 10 minutes; the server default is 15.
    orchestrator.start({ ...startInput('s1'), capMinutes: 10 });
    expect(orchestrator.snapshot('s1')?.capMs).toBe(10 * 60_000);

    const live = (orchestrator as unknown as { sessions: Map<string, { startedAtMs: number }> }).sessions.get('s1');
    if (live === undefined) throw new Error('session missing');
    // Eleven minutes in: under the server default, over the parent's cap.
    live.startedAtMs = Date.now() - 11 * 60 * 1000;

    const result = await orchestrator.turn('s1', { kind: 'utterance', text: 'one more page' });
    expect(result?.capped).toBe(true);
  });

  it('never lets a per-child cap EXTEND a session beyond the server ceiling', async () => {
    const { client } = fakePrisma();
    const orchestrator = new SessionOrchestrator(client, env());
    // A stored value above the deployment's ceiling must be clamped down, not
    // honoured: a parental control may only ever shorten screen time.
    orchestrator.start({ ...startInput('s1'), capMinutes: 600 });
    expect(orchestrator.snapshot('s1')?.capMs).toBe(15 * 60_000);

    const live = (orchestrator as unknown as { sessions: Map<string, { startedAtMs: number }> }).sessions.get('s1');
    if (live === undefined) throw new Error('session missing');
    live.startedAtMs = Date.now() - 16 * 60 * 1000;

    const result = await orchestrator.turn('s1', { kind: 'utterance', text: 'keep going' });
    expect(result?.capped).toBe(true);
  });

  it('falls back to the server cap for absent or nonsense per-child values', async () => {
    const { client } = fakePrisma();
    const orchestrator = new SessionOrchestrator(client, env());
    orchestrator.start(startInput('none'));
    expect(orchestrator.snapshot('none')?.capMs).toBe(15 * 60_000);

    orchestrator.start({ ...startInput('zero'), capMinutes: 0 });
    expect(orchestrator.snapshot('zero')?.capMs).toBe(15 * 60_000);

    orchestrator.start({ ...startInput('nan'), capMinutes: Number.NaN });
    expect(orchestrator.snapshot('nan')?.capMs).toBe(15 * 60_000);
  });

  it('escalates distress on a reading turn and records the category only', async () => {
    const { client, writes } = fakePrisma();
    const orchestrator = new SessionOrchestrator(client, env());
    orchestrator.start(startInput('s1'));

    const result = await orchestrator.turn('s1', { kind: 'utterance', text: 'he hits me at home' });
    const alert = writes.find((w) => w.op === 'distress');
    expect(alert).toBeDefined();
    const data = alert?.args as { category: string; severity: string };
    expect(data.category).toBe('safety');
    expect(data.severity).toBe('escalate');
    // The companion's acknowledgment leads the actions.
    expect(result?.actions[0]?.kind).toBe('say');
    // The raw utterance is never persisted anywhere.
    expect(JSON.stringify(writes)).not.toContain('he hits me at home');
  });

  it('records the choice point with its rationale', async () => {
    const { client, writes } = fakePrisma();
    const orchestrator = new SessionOrchestrator(client, env());
    orchestrator.start(startInput('s1'));

    const result = await orchestrator.turn('s1', { kind: 'choose', chosenIndex: 1, rationale: 'i like mats' });
    const choice = writes.find((w) => w.op === 'choice');
    expect(choice?.args).toMatchObject({ chosenIndex: 1, rationale: 'i like mats' });
    expect(result?.actions[0]).toMatchObject({ kind: 'say', text: STORY.choice.consequenceForSecond });
  });

  it('folds reading into the learner model on close', async () => {
    const { client, writes } = fakePrisma();
    const orchestrator = new SessionOrchestrator(client, env());
    orchestrator.start(startInput('s1'));

    await orchestrator.turn('s1', { kind: 'read-line', pageIndex: 0, spoken: ['mina', 'taps', 'a', 'mat'] });
    const result = await orchestrator.close('s1');

    expect(result?.ended).toBe(true);
    const learnerWrite = writes.find((w) => w.op === 'learner');
    expect(learnerWrite).toBeDefined();
    const sessionWrite = writes.find((w) => w.op === 'session-update' && (w.args as { narrativeCloseDone?: boolean }).narrativeCloseDone === true);
    expect(sessionWrite).toBeDefined();
    // Close actions carry the offline task and the plan callback.
    expect(result?.actions.some((a) => a.text === STORY.offlineTask)).toBe(true);
  });
});
