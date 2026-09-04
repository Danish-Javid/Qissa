/**
 * Distress classifier tests — FR-I.2 on every utterance.
 */
import { describe, expect, it } from 'vitest';
import { classifyDistress } from './distress.js';

describe('classifyDistress', () => {
  it('returns none for empty input', () => {
    expect(classifyDistress('').level).toBe('none');
    expect(classifyDistress('   ').level).toBe('none');
  });

  it('returns none for ordinary story talk', () => {
    expect(classifyDistress('the dog ran fast').level).toBe('none');
    expect(classifyDistress('i like the red ball').level).toBe('none');
  });

  it('escalates safety signals', () => {
    const verdict = classifyDistress('he hits me at home');
    expect(verdict.level).toBe('escalate');
    expect(verdict.category).toBe('safety');
    expect(verdict.response).not.toBeNull();
  });

  it('escalates pain signals', () => {
    const verdict = classifyDistress('my tummy hurts a lot');
    expect(verdict.level).toBe('escalate');
    expect(verdict.category).toBe('pain');
  });

  it('acknowledges fear without escalating', () => {
    const verdict = classifyDistress('i am scared of the dark');
    expect(verdict.level).toBe('acknowledge');
    expect(verdict.category).toBe('fear');
  });

  it('acknowledges sadness and anger', () => {
    expect(classifyDistress('i am sad today').level).toBe('acknowledge');
    expect(classifyDistress('i am angry, not fair').level).toBe('acknowledge');
  });

  it('orders seriousness first: safety beats sadness in one sentence', () => {
    const verdict = classifyDistress('i am sad and he hits me');
    expect(verdict.level).toBe('escalate');
    expect(verdict.category).toBe('safety');
  });
});
