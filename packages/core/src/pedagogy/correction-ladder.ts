/**
 * The graduated correction ladder — the most important four seconds in the
 * product (Doc 6 §4, FR-C.3, FR-C.4).
 *
 * When the child stalls on a word:
 *   rung 0  WAIT 2.5 seconds of silence. This is where self-correction
 *               happens, and self-correction is worth more than a correct
 *               first read. THE 2.5s IS NON-NEGOTIABLE. Doc 6 §4 predicts
 *               engineers will want to shorten it. Don't.
 *   rung 1  HINT     "It starts with /b/…"
 *   rung 2  SEGMENT  "/b/ … /a/ … /n/ … /k/. Put it together."
 *   rung 3  MODEL    "That word is bank. Nice try — keep going."  → move on.
 *
 * Hard rules encoded here and covered by tests:
 *   * Never more than two failed attempts on one word (FR-C.4).
 *   * The word "wrong" is never produced by any rung.
 *   * Self-corrections are praised specifically and logged as POSITIVE.
 *
 * Implementation is a pure reducer: (state, event) -> (state, action).
 * No timers, no I/O — the orchestrator owns the clock. That is what makes
 * this protocol auditable and testable path-by-path.
 */
import { firstGraphemeOf, segmentationOf } from './graphemes.js';

/** How long the first rung waits, in milliseconds. 2500ms is pedagogy. */
export const LADDER_WAIT_MS = 2500;

export type LadderPhase = 'reading' | 'wait' | 'hint' | 'segment' | 'model';

export interface LadderState {
  phase: LadderPhase;
  /** The word the ladder is currently working on, if any. */
  word: string | null;
  /** Failed attempts on the current word. Never allowed to reach 3. */
  attempts: number;
}

export interface LadderContext {
  /** Taught graphemes — needed to derive hints and segmentations. */
  taughtGraphemes: string[];
}

export type LadderEvent =
  | { type: 'stall'; word: string }
  | { type: 'waitElapsed' }
  | { type: 'readCorrectly' }
  | { type: 'selfCorrected' }
  | { type: 'attemptFailed' };

export type LadderAction =
  | { kind: 'wait'; ms: number }
  | { kind: 'hint'; phrase: string }
  | { kind: 'segment'; phrase: string }
  | { kind: 'model'; phrase: string }
  | { kind: 'praise'; phrase: string }
  | { kind: 'moveOn' };

export interface LadderStepResult {
  state: LadderState;
  /** Zero, one or two actions (model is always followed by moveOn). */
  actions: LadderAction[];
}

export const initialLadderState: LadderState = { phase: 'reading', word: null, attempts: 0 };

function praiseSelfCorrection(): LadderAction {
  return { kind: 'praise', phrase: 'You fixed that one yourself — that is what good readers do.' };
}

function praiseAfterHelp(): LadderAction {
  return { kind: 'praise', phrase: 'You got it — keep going.' };
}

/**
 * Advance the ladder. Pure function: callers persist the returned state.
 */
export function ladderStep(state: LadderState, event: LadderEvent, ctx: LadderContext): LadderStepResult {
  switch (event.type) {
    case 'stall': {
      // Only enter the ladder when actually reading; a duplicate stall on the
      // same word is ignored (the timer is already running).
      if (state.phase !== 'reading') return { state, actions: [] };
      return {
        state: { phase: 'wait', word: event.word, attempts: 0 },
        actions: [{ kind: 'wait', ms: LADDER_WAIT_MS }]
      };
    }

    case 'waitElapsed': {
      if (state.phase !== 'wait' || state.word === null) return { state, actions: [] };
      const firstSound = firstGraphemeOf(state.word, ctx.taughtGraphemes);
      return {
        state: { ...state, phase: 'hint' },
        actions: [{ kind: 'hint', phrase: `It starts with /${firstSound}/…` }]
      };
    }

    case 'selfCorrected': {
      if (state.phase === 'reading') return { state, actions: [] };
      return { state: initialLadderState, actions: [praiseSelfCorrection()] };
    }

    case 'readCorrectly': {
      if (state.phase === 'reading') return { state, actions: [] };
      // Success after help gets praise too — but the specific self-correction
      // praise is reserved for fixes made without any rung firing.
      return { state: initialLadderState, actions: [praiseAfterHelp()] };
    }

    case 'attemptFailed': {
      if (state.word === null) return { state, actions: [] };

      if (state.phase === 'hint') {
        // Attempt 1 failed. Give the segmentation — the second and LAST
        // chance to try (FR-C.4).
        const segments = segmentationOf(state.word, ctx.taughtGraphemes);
        return {
          state: { ...state, phase: 'segment', attempts: 1 },
          actions: [{ kind: 'segment', phrase: `${segments.join(' … ')}. Put it together.` }]
        };
      }

      if (state.phase === 'segment') {
        // Attempt 2 failed. Model the word and move on. There is no third
        // attempt — ever. The child keeps her dignity; the miscue is logged
        // against the grapheme and the learner model schedules a re-exposure.
        const word = state.word;
        return {
          state: { ...state, phase: 'model', attempts: 2 },
          actions: [
            { kind: 'model', phrase: `That word is ${word}. Nice try — keep going.` },
            { kind: 'moveOn' }
          ]
        };
      }

      // Failed attempts outside hint/segment phases are no-ops.
      return { state, actions: [] };
    }
  }
}

/** Reset helper for when the child moves to a new word or page. */
export function ladderReset(): LadderState {
  return initialLadderState;
}
