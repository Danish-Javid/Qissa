/**
 * Correction-ladder tests — every path through the state machine.
 *
 * These encode the product's promises to a five-year-old as executable
 * assertions (FR-C.3, FR-C.4): the 2.5s wait, never a third attempt, never
 * the word "wrong", and specific praise for self-correction.
 */
import { describe, expect, it } from 'vitest';
import {
  initialLadderState,
  LADDER_WAIT_MS,
  ladderStep,
  type LadderAction,
  type LadderState
} from './correction-ladder.js';
import { graphemesUpTo } from '../data/index.js';

const ctx = { taughtGraphemes: graphemesUpTo(4) };

/** Run a sequence of events, collecting states and actions. */
function run(events: Parameters<typeof ladderStep>[1][], start: LadderState = initialLadderState) {
  let state = start;
  const actions: LadderAction[] = [];
  for (const e of events) {
    const r = ladderStep(state, e, ctx);
    state = r.state;
    actions.push(...r.actions);
  }
  return { state, actions };
}

describe('correction ladder', () => {
  it('stall opens with a 2500ms wait — no shorter, ever', () => {
    const { state, actions } = run([{ type: 'stall', word: 'bank' }]);
    expect(state.phase).toBe('wait');
    expect(actions).toEqual([{ kind: 'wait', ms: LADDER_WAIT_MS }]);
    expect(LADDER_WAIT_MS).toBe(2500);
  });

  it('self-correction during the wait earns the specific praise', () => {
    const { state, actions } = run([
      { type: 'stall', word: 'bank' },
      { type: 'selfCorrected' }
    ]);
    expect(state).toEqual(initialLadderState);
    expect(actions[1]).toMatchObject({ kind: 'praise' });
    expect((actions[1] as { phrase: string }).phrase).toContain('fixed that one yourself');
  });

  it('full unhappy path: wait -> hint -> segment -> model -> move on', () => {
    const { state, actions } = run([
      { type: 'stall', word: 'bank' },
      { type: 'waitElapsed' },
      { type: 'attemptFailed' },
      { type: 'attemptFailed' }
    ]);

    const kinds = actions.map((a) => a.kind);
    expect(kinds).toEqual(['wait', 'hint', 'segment', 'model', 'moveOn']);

    // Hint names the first sound; segment names every unit.
    expect((actions[1] as { phrase: string }).phrase).toBe('It starts with /b/…');
    expect((actions[2] as { phrase: string }).phrase).toBe('/b/ … /a/ … /n/ … /k/. Put it together.');
    expect((actions[3] as { phrase: string }).phrase).toBe('That word is bank. Nice try — keep going.');

    // Two failed attempts were recorded — and the machine is now done.
    expect(state.attempts).toBe(2);
    expect(state.phase).toBe('model');
  });

  it('NEVER allows a third attempt — further failures are no-ops', () => {
    const { state } = run([
      { type: 'stall', word: 'bank' },
      { type: 'waitElapsed' },
      { type: 'attemptFailed' },
      { type: 'attemptFailed' },
      { type: 'attemptFailed' }, // the forbidden third attempt
      { type: 'attemptFailed' }
    ]);
    expect(state.attempts).toBe(2);
  });

  it('success after the hint resets with praise', () => {
    const { state, actions } = run([
      { type: 'stall', word: 'ship' },
      { type: 'waitElapsed' },
      { type: 'readCorrectly' }
    ]);
    expect(state).toEqual(initialLadderState);
    expect(actions.at(-1)).toMatchObject({ kind: 'praise' });
  });

  it('no phrase produced by any rung contains the word "wrong"', () => {
    const { actions } = run([
      { type: 'stall', word: 'chip' },
      { type: 'waitElapsed' },
      { type: 'attemptFailed' },
      { type: 'attemptFailed' },
      { type: 'selfCorrected' }
    ]);
    for (const a of actions) {
      const phrase = 'phrase' in a ? a.phrase : '';
      expect(phrase.toLowerCase()).not.toContain('wrong');
    }
  });

  it('ignores stalls while already working a word', () => {
    const { actions } = run([
      { type: 'stall', word: 'bank' },
      { type: 'stall', word: 'bank' }
    ]);
    expect(actions).toHaveLength(1); // only the first wait fires
  });

  it('ignores waitElapsed when not waiting', () => {
    const { actions } = run([{ type: 'waitElapsed' }]);
    expect(actions).toEqual([]);
  });
});
