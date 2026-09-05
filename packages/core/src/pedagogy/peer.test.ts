/**
 * PEER engine tests — prompt density, CROWD rotation, expansion, and the
 * two-turn off-topic redirect rule (FR-D).
 */
import { describe, expect, it } from 'vitest';
import {
  createPeerState,
  looksOffTopic,
  nextPrompt,
  pagePromptBudget,
  promptDensityForAge,
  respondToUtterance
} from './peer.js';

const ctx = {
  lastSentence: 'The fox is hiding behind the log.',
  character: 'the fox',
  event: 'the fox hid the fish',
  setting: 'the river'
};

describe('prompt density (FR-D.3)', () => {
  it('is 1.5 per page at age 4', () => {
    expect(promptDensityForAge(4)).toBeCloseTo(1.5);
  });

  it('is 0.5 per page at age 7', () => {
    expect(promptDensityForAge(7)).toBeCloseTo(0.5);
  });

  it('clamps outside 4–7', () => {
    expect(promptDensityForAge(2)).toBeCloseTo(1.5);
    expect(promptDensityForAge(10)).toBeCloseTo(0.5);
  });

  it('alternates whole budgets so the average equals the density', () => {
    // 4-year-old: 2,1,2,1…
    expect([0, 1, 2, 3].map((p) => pagePromptBudget(4, p))).toEqual([2, 1, 2, 1]);
    // 7-year-old: 1,0,1,0…
    expect([0, 1, 2, 3].map((p) => pagePromptBudget(7, p))).toEqual([1, 0, 1, 0]);
  });
});

describe('CROWD rotation (FR-D.2)', () => {
  it('prompts cycle through all five types', () => {
    let state = createPeerState(5, 0, 0);
    // Force a generous budget by reading the density through ages — instead,
    // step five pages, taking the first prompt of each.
    const types: string[] = [];
    for (let page = 0; page < 5; page++) {
      state = createPeerState(5, page, 0);
      const r = nextPrompt(state, ctx);
      if (r.action && r.action.kind === 'prompt') types.push(r.action.promptType);
    }
    expect(new Set(types).size).toBe(5);
  });

  it('budget exhaustion ends the page dialogue cleanly', () => {
    const state = createPeerState(7, 1, 0); // budget 0 on odd pages at age 7
    const r = nextPrompt(state, ctx);
    expect(r.action).toBeNull();
    expect(r.state.pageDone).toBe(true);
  });

  it('prompts use the page context', () => {
    const state = createPeerState(4, 0, 3); // cursor lands on 'completion'
    const r = nextPrompt(state, ctx);
    expect(r.action?.kind).toBe('prompt');
    if (r.action?.kind === 'prompt') {
      expect(r.action.text).toContain('The fox is hiding behind the');
    }
  });
});

describe('expansion and redirection (FR-D.4, FR-D.6)', () => {
  it('expands on-story utterances before moving on', () => {
    const state = createPeerState(5, 0, 0);
    const r = respondToUtterance(state, 'he is hiding', ctx);
    expect(r.action.kind).toBe('expand');
    if (r.action.kind === 'expand') {
      expect(r.action.text).toBe('Yes! He is hiding.');
    }
  });

  it('detects hard off-topic signals', () => {
    expect(looksOffTopic('I want to watch tv')).toBe(true);
    expect(looksOffTopic('the fox is big')).toBe(false);
  });

  it('redirects warmly on first wander, returns firmly on second', () => {
    const s0 = createPeerState(5, 0, 0);
    const first = respondToUtterance(s0, 'can I have the phone', ctx);
    expect(first.action.kind).toBe('redirect');
    expect(first.state.offTopicStreak).toBe(1);

    const second = respondToUtterance(first.state, 'I want the tablet', ctx);
    expect(second.action.kind).toBe('redirect');
    if (second.action.kind === 'redirect') {
      expect(second.action.text).toContain('look');
    }
    // Streak resets after the firm return — she gets a fresh two turns.
    expect(second.state.offTopicStreak).toBe(0);
  });

  it('empty utterance never triggers a miscue-like correction', () => {
    const s0 = createPeerState(5, 0, 0);
    const r = respondToUtterance(s0, '   ', ctx);
    expect(r.action.kind).toBe('redirect');
  });
});
