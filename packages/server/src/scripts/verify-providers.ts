/**
 * Live provider verification — `npm run verify:providers`.
 *
 * Exercises all four vendors of whatever PROVIDER_MODE is configured with the
 * smallest real call each, and prints a pass/fail table with latency. It is
 * the answer to "does the Alibaba path actually work?" that does not involve
 * discovering the answer on stage.
 *
 * Deliberately NOT a vitest file. It costs real money and needs real
 * credentials, so it must never run in `npm test` or CI by accident -- the
 * unit-level contract tests in providers.test.ts cover request shape without
 * a key, and this covers the one thing they cannot: that the credentials,
 * endpoints, regions and deployment names are right.
 *
 * Every check is independent: a broken TTS deployment should not hide a
 * working story path, because knowing WHICH of the four is misconfigured is
 * the entire value of running this.
 */
import { loadEnv } from '../config.js';
import { getProviders } from '../providers/index.js';
import { buildStoryConstraints, createLearnerModel, type WorldSeed } from '@qissa/core';
import { PROMPT_VERSION } from '../story/story-engine.js';

const WORLD_SEED: WorldSeed = { heroName: 'Mina', city: 'Lahore' };

interface CheckResult {
  name: string;
  ok: boolean;
  ms: number;
  detail: string;
}

async function timed(name: string, run: () => Promise<string>): Promise<CheckResult> {
  const started = Date.now();
  try {
    const detail = await run();
    return { name, ok: true, ms: Date.now() - started, detail };
  } catch (err) {
    return { name, ok: false, ms: Date.now() - started, detail: String(err) };
  }
}

async function main(): Promise<void> {
  const env = loadEnv();
  const providers = getProviders(env);

  console.log(`\nQissa provider verification — PROVIDER_MODE=${providers.mode}\n`);
  if (providers.mode === 'mock') {
    console.log(
      'Mode is "mock", so this proves only that the wiring works — no vendor is\n' +
        'contacted. Set PROVIDER_MODE=alibaba (with DASHSCOPE_API_KEY) or azure to\n' +
        'verify real credentials.\n'
    );
  }

  const model = createLearnerModel();
  const constraints = buildStoryConstraints(model, WORLD_SEED, 5);

  const checks: CheckResult[] = [];

  checks.push(
    await timed(`story    (${providers.stories.name} / ${providers.stories.model})`, async () => {
      const { story, costMicroUsd } = await providers.stories.generate({
        constraints,
        level: 1,
        promptVersion: PROMPT_VERSION,
        taughtTrickyWords: model.taughtTrickyWords
      });
      // Shape only: the engine's gates are what decide acceptability, and they
      // are already covered by the unit tests. This asks "did the vendor
      // answer in the right shape at all?"
      return `"${story.title}" · ${story.pages.length} pages · ~$${(costMicroUsd / 1e6).toFixed(4)}`;
    })
  );

  checks.push(
    await timed(`tts      (${providers.synthesizer.name})`, async () => {
      const { audio, format, costMicroUsd } = await providers.synthesizer.synthesize(
        'You got it — keep going.'
      );
      if (audio.length === 0) throw new Error('empty audio');
      return `${audio.length} bytes ${format} · ~$${(costMicroUsd / 1e6).toFixed(4)}`;
    })
  );

  checks.push(
    await timed(`asr      (${providers.recognizer.name})`, async () => {
      // A one-second silent 16kHz mono WAV: enough to prove the endpoint,
      // the credentials and the multipart contract without uploading a real
      // child's voice to check the plumbing.
      const result = await providers.recognizer.recognize(silentWav(1), {
        sampleRate: 16_000,
        fallbackText: 'the cat sat'
      });
      return `transcript ${JSON.stringify(result.text)} · ~$${(result.costMicroUsd / 1e6).toFixed(4)}`;
    })
  );

  checks.push(
    await timed(`image    (${providers.images.name})`, async () => {
      const { image, mimeType, costMicroUsd } = await providers.images.generateImage(
        'a friendly cat sitting on a mat'
      );
      if (image.length === 0) throw new Error('empty image');
      return `${image.length} bytes ${mimeType} · ~$${(costMicroUsd / 1e6).toFixed(4)}`;
    })
  );

  let failed = 0;
  for (const check of checks) {
    if (!check.ok) failed += 1;
    console.log(
      `  ${check.ok ? 'PASS' : 'FAIL'}  ${check.name.padEnd(44)} ${String(check.ms).padStart(6)}ms  ${check.detail}`
    );
  }

  console.log(
    `\n${checks.length - failed}/${checks.length} checks passed.` +
      (failed > 0 ? ' Fix the FAILs above before relying on this mode.\n' : '\n')
  );
  process.exit(failed > 0 ? 1 : 0);
}

/** A valid silent PCM WAV of `seconds` at 16kHz mono, built by hand. */
function silentWav(seconds: number): Uint8Array {
  const sampleRate = 16_000;
  const samples = sampleRate * seconds;
  const dataBytes = samples * 2; // 16-bit mono
  const buffer = new ArrayBuffer(44 + dataBytes);
  const view = new DataView(buffer);
  const ascii = (offset: number, text: string): void => {
    for (let i = 0; i < text.length; i += 1) view.setUint8(offset + i, text.charCodeAt(i));
  };
  ascii(0, 'RIFF');
  view.setUint32(4, 36 + dataBytes, true);
  ascii(8, 'WAVE');
  ascii(12, 'fmt ');
  view.setUint32(16, 16, true); // PCM chunk size
  view.setUint16(20, 1, true); // PCM
  view.setUint16(22, 1, true); // mono
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true); // byte rate
  view.setUint16(32, 2, true); // block align
  view.setUint16(34, 16, true); // bits per sample
  ascii(36, 'data');
  view.setUint32(40, dataBytes, true);
  return new Uint8Array(buffer); // samples are already zero = silence
}

main().catch((err) => {
  console.error('[qissa] verification failed to run:', err);
  process.exit(1);
});
