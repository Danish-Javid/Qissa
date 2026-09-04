/**
 * The PEER dialogue engine (FR-D) — Prompt, Evaluate, Expand, Repeat,
 * implemented as an explicit bounded state machine, NOT free-form chat.
 *
 * The conversation cannot leave the story world (FR-D.5). Every child
 * utterance is expanded into richer language before moving on (FR-D.4).
 * Prompt types rotate through the CROWD taxonomy (FR-D.2), and prompt
 * density scales down with age (FR-D.3): ~1.5 prompts/page at age 4,
 * dropping to ~0.5 at age 7.
 *
 * Off-topic speech is redirected warmly within two turns (FR-D.6).
 *
 * Like the correction ladder this is a pure reducer — the orchestrator
 * supplies utterances, the machine decides what happens. That separation is
 * the architectural thesis (NFR-8.4).
 */
import type { PromptType } from '../types.js';

/** CROWD rotation order. Distancing prompts come last: they ask the child
 *  to connect the story to her own life, and earn that position. */
const CROWD_ORDER: PromptType[] = ['open', 'wh', 'recall', 'completion', 'distancing'];

export interface PeerPageContext {
  /** The sentence most recently read — used for completion prompts. */
  lastSentence: string;
  /** A named character on the page (hero, sibling, pet). */
  character: string;
  /** Something that just happened in the story — used for recall/wh. */
  event: string;
  /** Where the scene is — used for wh prompts. */
  setting: string;
}

export interface PeerState {
  pageIndex: number;
  /** Prompts asked on this page so far. */
  promptsUsed: number;
  /** Budget for this page — derived from age (FR-D.3). */
  promptBudget: number;
  /** Which CROWD slot comes next. */
  promptCursor: number;
  /** Consecutive off-topic turns; warm redirect must land within 2 (FR-D.6). */
  offTopicStreak: number;
  /** True when this page's dialogue budget is spent. */
  pageDone: boolean;
}

export type PeerAction =
  | { kind: 'prompt'; promptType: PromptType; text: string }
  | { kind: 'expand'; text: string }
  | { kind: 'redirect'; text: string }
  | { kind: 'pageDone' };

/**
 * Prompt density per page for a given age (FR-D.3):
 * 1.5 at age 4, linear down to 0.5 at age 7, clamped outside that range.
 */
export function promptDensityForAge(ageYears: number): number {
  const density = 1.5 - (Math.min(Math.max(ageYears, 4), 7) - 4) * (1 / 3);
  return Math.min(Math.max(density, 0.5), 1.5);
}

/**
 * Whole-number budget for one page: alternate ceil/floor of the density so
 * the average over a story equals the density. A 4-year-old gets 2,1,2,1…;
 * a 7-year-old gets 1,0,1,0….
 */
export function pagePromptBudget(ageYears: number, pageIndex: number): number {
  const density = promptDensityForAge(ageYears);
  const base = Math.floor(density);
  const fraction = density - base;
  // Distribute the fractional part deterministically across pages.
  return pageIndex % 2 === 0 ? base + (fraction > 0 ? 1 : 0) : base;
}

export function createPeerState(ageYears: number, pageIndex: number, storySeed: number): PeerState {
  return {
    pageIndex,
    promptsUsed: 0,
    promptBudget: pagePromptBudget(ageYears, pageIndex),
    // Offset by page and story so two consecutive stories never open with
    // the same prompt type — variety is part of the protocol.
    promptCursor: (pageIndex + storySeed) % CROWD_ORDER.length,
    offTopicStreak: 0,
    pageDone: false
  };
}

/** Deterministic prompt templates per CROWD type. The language is plain and
 *  short on purpose — a four-year-old is on the other end of it. */
function promptText(type: PromptType, ctx: PeerPageContext): string {
  switch (type) {
    case 'open':
      return 'What can you see on this page?';
    case 'wh':
      return `Where is ${ctx.character} now?`;
    case 'recall':
      return `What happened when ${ctx.event}?`;
    case 'completion':
      return finishSentence(ctx.lastSentence);
    case 'distancing':
      return `Has that ever happened to you?`;
  }
}

/** Completion prompts echo the last sentence with the final word blanked. */
function finishSentence(sentence: string): string {
  const words = sentence.split(/\s+/);
  if (words.length <= 2) return `Can you say that with me? ${sentence}`;
  return `${words.slice(0, -1).join(' ')} …?`;
}

/**
 * Ask for the next prompt on this page, if budget allows.
 * Returns null when the page budget is spent — the reading continues
 * without interruption (the state machine never forces extra talk).
 */
export function nextPrompt(state: PeerState, ctx: PeerPageContext): { state: PeerState; action: PeerAction | null } {
  if (state.pageDone || state.promptsUsed >= state.promptBudget) {
    return { state: { ...state, pageDone: true }, action: null };
  }
  const type = CROWD_ORDER[state.promptCursor % CROWD_ORDER.length] as PromptType;
  return {
    state: {
      ...state,
      promptsUsed: state.promptsUsed + 1,
      promptCursor: (state.promptCursor + 1) % CROWD_ORDER.length
    },
    action: { kind: 'prompt', promptType: type, text: promptText(type, ctx) }
  };
}

/**
 * Heuristic off-topic detector. Deliberately gentle — a false "off-topic"
 * flag silences a child, which is worse than answering a wandering remark.
 * Only hard signals (screens, toys not in the story, demands to leave)
 * count. Everything else is treated as on-story and expanded.
 */
const OFF_TOPIC_MARKERS = [
  'tv',
  'television',
  'phone',
  'tablet',
  'youtube',
  'video',
  'i want to go',
  'let me go',
  'i am bored'
];

export function looksOffTopic(utterance: string): boolean {
  const text = utterance.toLowerCase();
  return OFF_TOPIC_MARKERS.some((m) => text.includes(m));
}

/**
 * Expand whatever the child said into richer language (FR-D.4), or redirect
 * warmly if she has wandered off-story (FR-D.6). The redirect text returns
 * to the page within two turns by construction — the streak counter forces
 * the second off-topic turn to be a return, never another question.
 */
export function respondToUtterance(
  state: PeerState,
  utterance: string,
  ctx: PeerPageContext
): { state: PeerState; action: PeerAction } {
  const trimmed = utterance.trim();

  // Empty or unintelligible input: acknowledge and return to the page.
  if (trimmed.length === 0) {
    return {
      state,
      action: { kind: 'redirect', text: `Let us look at the page. Where is ${ctx.character}?` }
    };
  }

  if (looksOffTopic(trimmed)) {
    const streak = state.offTopicStreak + 1;
    if (streak >= 2) {
      // Second off-topic turn: warm but firm return to the story world.
      return {
        state: { ...state, offTopicStreak: 0 },
        action: { kind: 'redirect', text: `That can wait until later. Right now, look — what is ${ctx.character} doing?` }
      };
    }
    return {
      state: { ...state, offTopicStreak: streak },
      action: { kind: 'redirect', text: `Mm! And in our story, ${ctx.event}. What do you think about that?` }
    };
  }

  // On-story: expand her utterance before moving on. The expansion affirms
  // first, then restates in fuller language.
  const cleaned = trimmed.replace(/[.!?]+$/, '');
  return {
    state: { ...state, offTopicStreak: 0 },
    action: { kind: 'expand', text: `Yes! ${capitalise(cleaned)}.` }
  };
}

function capitalise(text: string): string {
  if (text.length === 0) return text;
  return text.charAt(0).toUpperCase() + text.slice(1);
}
