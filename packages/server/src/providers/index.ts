/**
 * Provider wiring — the ONLY place that decides which vendor set runs.
 *
 * `PROVIDER_MODE=alibaba` plus a DASHSCOPE_API_KEY, or `PROVIDER_MODE=azure`
 * plus the Azure endpoints/keys, swap every vendor in; anything less runs
 * the complete mock stack. Nothing else in the server knows which world it
 * lives in (NFR-7.2).
 */
import type { Env } from '../config.js';
import { CosyVoiceSynthesizer, ParaformerRecognizer, QwenStoryGenerator, WanxImageGenerator } from './alibaba/index.js';
import { AzureFluxImageGenerator, AzureGptStoryGenerator, AzureMaiTranscribeRecognizer, AzureMaiVoiceSynthesizer } from './azure/index.js';
import { MockImageGenerator, MockSpeechRecognizer, MockSpeechSynthesizer, MockStoryGenerator } from './mock/index.js';
import type { ProviderBundle } from './interfaces.js';

export function getProviders(env: Env): ProviderBundle {
  if (env.PROVIDER_MODE === 'alibaba') {
    if (!env.DASHSCOPE_API_KEY) {
      // Fail loud at boot: asking for real vendors without a key is a
      // configuration error, not something to discover mid-session.
      throw new Error('PROVIDER_MODE=alibaba requires DASHSCOPE_API_KEY (see .env.example).');
    }
    return {
      mode: 'alibaba',
      stories: new QwenStoryGenerator(env, env.QWEN_STORY_MODEL),
      recognizer: new ParaformerRecognizer(env),
      synthesizer: new CosyVoiceSynthesizer(env, env.COSYVOICE_MODEL),
      images: new WanxImageGenerator(env, env.WANX_MODEL)
    };
  }

  if (env.PROVIDER_MODE === 'azure') {
    // Same fail-loud rule: every azure provider needs the OpenAI resource,
    // and FLUX needs its cognitive-services host.
    const missing = [
      env.AZURE_OPENAI_ENDPOINT === '' ? 'AZURE_OPENAI_ENDPOINT' : '',
      env.AZURE_OPENAI_API_KEY === '' ? 'AZURE_OPENAI_API_KEY' : '',
      env.AZURE_AI_ENDPOINT === '' ? 'AZURE_AI_ENDPOINT' : ''
    ].filter(Boolean);
    if (missing.length > 0) {
      throw new Error(`PROVIDER_MODE=azure requires ${missing.join(', ')} (see .env.example).`);
    }
    return {
      mode: 'azure',
      stories: new AzureGptStoryGenerator(env, env.AZURE_STORY_DEPLOYMENT),
      recognizer: new AzureMaiTranscribeRecognizer(env, env.AZURE_ASR_DEPLOYMENT),
      synthesizer: new AzureMaiVoiceSynthesizer(env, env.AZURE_TTS_VOICE),
      images: new AzureFluxImageGenerator(env, env.AZURE_IMAGE_MODEL)
    };
  }

  return {
    mode: 'mock',
    stories: new MockStoryGenerator(),
    recognizer: new MockSpeechRecognizer(),
    synthesizer: new MockSpeechSynthesizer(),
    images: new MockImageGenerator()
  };
}

export type { ProviderBundle } from './interfaces.js';
export type * from './interfaces.js';
