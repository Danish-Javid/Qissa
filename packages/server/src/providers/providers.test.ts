/**
 * Provider contract tests — no API key required.
 *
 * These exist because the two real providers drifted apart without anyone
 * noticing: `budgetMs` is documented on StoryGenerationRequest as the engine's
 * per-call ceiling, Azure honoured it, and Qwen hard-coded 45s. In
 * PROVIDER_MODE=alibaba -- the sponsor's own mode, the one most likely to be
 * demoed -- a child tapping "Let's read!" could therefore sit on a spinner for
 * 45 seconds instead of dropping to the vetted ladder after 9. Exactly the
 * failure the grace period exists to prevent.
 *
 * `fetch` is stubbed, so this asserts request SHAPE and timeout behaviour
 * against every provider without spending a rupee or needing credentials.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { loadEnv } from '../config.js';
import { getProviders } from './index.js';
import { QwenStoryGenerator } from './alibaba/index.js';

const STORY_REQUEST = {
  constraints: {
    targetGrapheme: 's',
    reviewGraphemes: [],
    allowedGraphemes: ['s', 'a', 't'],
    allowedTrickyWords: ['the'],
    pageCount: 4,
    theme: 'courage' as const,
    worldSeed: { heroName: 'Mina', city: 'Lahore' },
    promptDensity: 'low' as const
  },
  level: 1,
  promptVersion: 'test',
  taughtTrickyWords: ['the']
} as unknown as Parameters<QwenStoryGenerator['generate']>[0];

function alibabaEnv() {
  return loadEnv({
    DATABASE_URL: 'postgresql://test',
    PROVIDER_MODE: 'alibaba',
    DASHSCOPE_API_KEY: 'test-key-not-real'
  });
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe('provider selection', () => {
  it('defaults to mock with no keys', () => {
    expect(getProviders(loadEnv({ DATABASE_URL: 'postgresql://test' })).mode).toBe('mock');
  });

  it('refuses alibaba mode without a key rather than failing mid-session', () => {
    expect(() =>
      getProviders(loadEnv({ DATABASE_URL: 'postgresql://test', PROVIDER_MODE: 'alibaba' }))
    ).toThrow(/DASHSCOPE_API_KEY/);
  });

  it('wires all four alibaba providers when the key is present', () => {
    const providers = getProviders(alibabaEnv());
    expect(providers.mode).toBe('alibaba');
    expect(providers.stories.name).toBe('alibaba-qwen');
    expect(providers.recognizer.name).toBe('alibaba-paraformer');
    expect(providers.synthesizer.name).toBe('alibaba-cosyvoice');
    expect(providers.images.name).toBe('alibaba-wanx');
  });
});

describe('Qwen story generator', () => {
  /** Captures the abort signal so the test can inspect the effective timeout. */
  function stubFetch(content: unknown) {
    const calls: Array<{ url: string; init: RequestInit }> = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string, init: RequestInit) => {
        calls.push({ url, init });
        return new Response(
          JSON.stringify({ choices: [{ message: { content: JSON.stringify(content) } }] }),
          { status: 200 }
        );
      })
    );
    return calls;
  }

  const VALID_STORY = {
    title: 'Mina sat',
    pages: [
      { text: 'Mina sat.', illustrationHint: 'a girl sitting' },
      { text: 'a sat mat.', illustrationHint: 'a mat' },
      { text: 'Mina sat.', illustrationHint: 'a girl' },
      { text: 'a mat sat.', illustrationHint: 'a mat' }
    ],
    choice: {
      prompt: 'What next?',
      options: ['a mat', 'a tap'],
      consequenceForFirst: 'Mina sat.',
      consequenceForSecond: 'Mina sat.'
    },
    offlineTask: 'Find a mat at home.'
  };

  it('sends the model, JSON response format and the built prompt', async () => {
    const calls = stubFetch(VALID_STORY);
    await new QwenStoryGenerator(alibabaEnv(), 'qwen-max').generate(STORY_REQUEST);

    expect(calls).toHaveLength(1);
    expect(calls[0]!.url).toContain('/compatible-mode/v1/chat/completions');
    const body = JSON.parse(String(calls[0]!.init.body)) as {
      model: string;
      response_format: { type: string };
      messages: Array<{ role: string; content: string }>;
    };
    expect(body.model).toBe('qwen-max');
    expect(body.response_format.type).toBe('json_object');
    expect(body.messages[1]!.content).toContain('Mina');
  });

  it('never sends the API key anywhere but the Authorization header', async () => {
    const calls = stubFetch(VALID_STORY);
    await new QwenStoryGenerator(alibabaEnv(), 'qwen-max').generate(STORY_REQUEST);

    const { init } = calls[0]!;
    const headers = init.headers as Record<string, string>;
    expect(headers.Authorization).toBe('Bearer test-key-not-real');
    expect(String(init.body)).not.toContain('test-key-not-real');
    expect(calls[0]!.url).not.toContain('test-key-not-real');
  });

  it('aborts at the budget the engine passes, not its own default', async () => {
    // The engine's child-facing serve passes a 9s grace. A provider that
    // ignores it leaves a four-year-old on a spinner for its own 45s ceiling.
    vi.useFakeTimers();
    let aborted = false;
    vi.stubGlobal(
      'fetch',
      vi.fn(
        (_url: string, init: RequestInit) =>
          new Promise((_resolve, reject) => {
            init.signal?.addEventListener('abort', () => {
              aborted = true;
              reject(new Error('aborted'));
            });
          })
      )
    );

    const pending = new QwenStoryGenerator(alibabaEnv(), 'qwen-max')
      .generate({ ...STORY_REQUEST, budgetMs: 9_000 })
      .catch(() => 'rejected');

    await vi.advanceTimersByTimeAsync(9_500);
    await expect(pending).resolves.toBe('rejected');
    expect(aborted, 'the 9s budget must abort the call').toBe(true);
  });

  it('rejects a malformed story rather than passing it to the gate', async () => {
    stubFetch({ title: 'nope' });
    await expect(
      new QwenStoryGenerator(alibabaEnv(), 'qwen-max').generate(STORY_REQUEST)
    ).rejects.toThrow();
  });

  it('surfaces a vendor HTTP failure without leaking the key', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('denied', { status: 401 })));
    await expect(
      new QwenStoryGenerator(alibabaEnv(), 'qwen-max').generate(STORY_REQUEST)
    ).rejects.toThrow(/HTTP 401/);
    await expect(
      new QwenStoryGenerator(alibabaEnv(), 'qwen-max').generate(STORY_REQUEST)
    ).rejects.not.toThrow(/test-key-not-real/);
  });
});
