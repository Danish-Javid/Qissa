/**
 * Endpoint normalization for `npm run review`.
 *
 * Azure Foundry's portal shows a PROJECT endpoint
 * (https://<resource>.services.ai.azure.com/api/projects/<project>), which is
 * the SDK control plane — posting chat completions to it 404s. The inference
 * base is the resource host plus /openai/v1, and Azure authenticates with an
 * api-key header rather than a bearer token.
 *
 * Both were got wrong by hand first, so they are pinned here: the failure mode
 * is a 404 or 401 several minutes into a paid call, which is an expensive way
 * to learn that a URL had the wrong shape.
 */
import { describe, expect, it } from 'vitest';
import { isAzureHost, normalizeBaseUrl } from './review.js';

describe('normalizeBaseUrl', () => {
  it('trims a Foundry project endpoint back to the inference base', () => {
    expect(normalizeBaseUrl('https://shared-demo-ai-foundry.services.ai.azure.com/api/projects/Usaid-Project-AI')).toBe(
      'https://shared-demo-ai-foundry.services.ai.azure.com/openai/v1'
    );
  });

  it('appends the inference path to a bare Azure resource host', () => {
    expect(normalizeBaseUrl('https://remotion-image0gen.services.ai.azure.com')).toBe(
      'https://remotion-image0gen.services.ai.azure.com/openai/v1'
    );
    expect(normalizeBaseUrl('https://remotion-image0gen.openai.azure.com')).toBe(
      'https://remotion-image0gen.openai.azure.com/openai/v1'
    );
  });

  it('leaves an Azure base that already carries the inference path alone', () => {
    const already = 'https://shared-demo-ai-foundry.services.ai.azure.com/openai/v1';
    expect(normalizeBaseUrl(already)).toBe(already);
  });

  it('never rewrites a non-Azure base', () => {
    expect(normalizeBaseUrl('https://api.openai.com/v1')).toBe('https://api.openai.com/v1');
    // An OpenAI-compatible gateway must survive verbatim, including a path
    // that happens to look like a project route.
    expect(normalizeBaseUrl('https://gateway.example.com/api/projects/x')).toBe(
      'https://gateway.example.com/api/projects/x'
    );
  });

  it('tolerates trailing slashes and surrounding whitespace', () => {
    expect(normalizeBaseUrl('  https://api.openai.com/v1/  ')).toBe('https://api.openai.com/v1');
    expect(normalizeBaseUrl('https://x.services.ai.azure.com/api/projects/p/')).toBe(
      'https://x.services.ai.azure.com/openai/v1'
    );
  });
});

describe('isAzureHost', () => {
  it('recognises the Azure inference hosts, and nothing else', () => {
    expect(isAzureHost('https://x.services.ai.azure.com')).toBe(true);
    expect(isAzureHost('https://x.openai.azure.com')).toBe(true);
    expect(isAzureHost('https://x.cognitiveservices.azure.com')).toBe(true);
    expect(isAzureHost('https://api.openai.com/v1')).toBe(false);
    // Not a real Azure host — auth must not silently switch to api-key.
    expect(isAzureHost('https://azure.com.evil.example/v1')).toBe(false);
  });
});
