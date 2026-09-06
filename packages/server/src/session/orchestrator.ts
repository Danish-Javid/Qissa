/**
 * The session orchestrator — the turn loop that holds the protocol shape.
 *
 * The session is a promise the product keeps with the child (Doc 6 §5):
 *   plan ritual -> read with the ladder + PEER -> choice point -> narrative
 *   close with an offline task and a plan to come back.
 * The orchestrator enforces the hard parts server-side, where the client
 * cannot negotiate:
 *
 *  - the 15-minute cap (FR-H.1): when it fires, the next turn returns the
 *    narrative close no matter where the reading is;
 *  - distress classification on EVERY utterance-bearing turn (FR-I.2);
 *  - the correction ladder's never-a-third-attempt rule, via the core
 *    reducer — the orchestrator owns the DB side (miscue rows) while the
 *    client owns the 2.5s clock;
 *  - PEER density and redirects, via the core state machine;
 *  - the learner-model fold at close: accuracy, fluency, spaced repetition.
 *
 * Live turn state is in-memory by design: sessions are minutes long and a
 * restart mid-story simply ends the session, never corrupts the durable
 * learner model (which is only ever written transactionally at close).
 */
import { Prisma, type PrismaClient } from '@prisma/client';
import {
  accentRationale,
  applyWordOutcomes,
  classifyReading,
  createPeerState,
  initialLadderState,
  ladderStep,
  nextPrompt,
  recordFluency,
  respondToUtterance,
  type LadderEvent,
  type LadderState,
  type LearnerModel,
  type PeerPageContext,
  type PeerState,
  type PromptType,
  type Story,
  type WordOutcome,
  type WorldSeed
} from '@qissa/core';
import type { Env } from '../config.js';
import type { ProviderBundle } from '../providers/interfaces.js';
import { audit } from '../safety/audit.js';
import { classifyDistress } from '../safety/distress.js';

// ---------------------------------------------------------------------------
// Turn protocol types (the wire contract with the child client)
// ---------------------------------------------------------------------------

export type TurnInput =
  | { kind: 'plan-ritual-done' }
  | { kind: 'read-line'; pageIndex: number; spoken: string[]; hesitations?: number[] }
  | {
      kind: 'ladder';
      event: 'stall' | 'waitElapsed' | 'attemptFailed' | 'readCorrectly' | 'selfCorrected';
      word?: string;
    }
  | { kind: 'utterance'; text: string }
  | { kind: 'page-complete'; pageIndex: number }
  | { kind: 'choose'; chosenIndex: 0 | 1; rationale?: string };

/** One thing the companion wants the client to do. */
export interface CompanionAction {
  kind: 'say' | 'wait' | 'prompt' | 'advance' | 'close';
  text?: string;
  /** Only for 'wait' — the non-negotiable 2500ms rung. */
  ms?: number;
  promptType?: PromptType;
}

export interface SessionSnapshot {
  sessionId: string;
  wordsRead: number;
  wordsCorrect: number;
  elapsedMs: number;
  capMs: number;
}

export interface TurnResult {
  ended: boolean;
  capped: boolean;
  actions: CompanionAction[];
  session: SessionSnapshot;
}

export interface StartSessionInput {
  sessionId: string;
  childId: string;
  storyId: string;
  story: Story;
  worldSeed: WorldSeed;
  ageYears: number;
  taughtGraphemes: string[];
  taughtTrickyWords: string[];
  learnerModel: LearnerModel;
  providerMode: ProviderBundle['mode'];
  /**
   * Parent-set cap for THIS child, in minutes (FR-G.4). Omitted = the server
   * default. It can only ever SHORTEN the session: the effective cap is
   * min(this, SESSION_CAP_MINUTES), so a stored value — however it got there —
   * can never buy a child more screen time than the deployment allows.
   */
  capMinutes?: number;
}

interface LiveSession {
  meta: StartSessionInput;
  startedAtMs: number;
  /** Effective cap for this session, resolved and clamped once at start. */
  capMs: number;
  ladder: LadderState;
  peer: PeerState;
  currentPage: number;
  outcomes: WordOutcome[];
  wordsRead: number;
  wordsCorrect: number;
  costMicroUsd: number;
  planRitualDone: boolean;
  ended: boolean;
  capped: boolean;
}

// ---------------------------------------------------------------------------
// Orchestrator
// ---------------------------------------------------------------------------

export class SessionOrchestrator {
  private readonly sessions = new Map<string, LiveSession>();

  constructor(
    private readonly prisma: PrismaClient,
    private readonly env: Env
  ) {}

  /**
   * The effective cap for one session, in ms.
   *
   * The parent's per-child setting is a CEILING REDUCTION, never an extension:
   * a deployment's SESSION_CAP_MINUTES is the maximum any child may ever read
   * for, and a stored `capMinutes` can only pull it down. Resolving it here —
   * once, at start — means the rest of the orchestrator compares against a
   * single number and a mid-session settings change cannot lengthen a session
   * already in progress.
   *
   * Non-positive or non-finite stored values are ignored rather than trusted;
   * the write path already bounds this to 1–60, and this is the second gate.
   */
  private resolveCapMs(capMinutes: number | undefined): number {
    const serverCap = this.env.SESSION_CAP_MINUTES;
    const requested =
      typeof capMinutes === 'number' && Number.isFinite(capMinutes) && capMinutes > 0 ? capMinutes : serverCap;
    return Math.min(requested, serverCap) * 60_000;
  }

  /** Register a freshly persisted ReadingSession for live turn handling. */
  start(input: StartSessionInput): void {
    this.sessions.set(input.sessionId, {
      meta: input,
      startedAtMs: Date.now(),
      capMs: this.resolveCapMs(input.capMinutes),
      ladder: initialLadderState,
      peer: createPeerState(input.ageYears, 0, input.story.title.length),
      currentPage: 0,
      outcomes: [],
      wordsRead: 0,
      wordsCorrect: 0,
      costMicroUsd: 0,
      planRitualDone: false,
      ended: false,
      capped: false
    });
  }

  /** Routes report vendor spend here so the session's cost card is honest. */
  addCost(sessionId: string, microUsd: number): void {
    const live = this.sessions.get(sessionId);
    if (live) live.costMicroUsd += microUsd;
  }

  has(sessionId: string): boolean {
    return this.sessions.has(sessionId);
  }

  snapshot(sessionId: string): SessionSnapshot | null {
    const live = this.sessions.get(sessionId);
    if (!live) return null;
    return {
      sessionId,
      wordsRead: live.wordsRead,
      wordsCorrect: live.wordsCorrect,
      elapsedMs: Date.now() - live.startedAtMs,
      capMs: live.capMs
    };
  }

  /**
   * One turn of the conversation. All protocol enforcement lives here.
   * Returns null when the session is unknown (the route answers 404).
   */
  async turn(sessionId: string, input: TurnInput): Promise<TurnResult | null> {
    const live = this.sessions.get(sessionId);
    if (!live) return null;

    // Already over: every further turn is answered with the close.
    if (live.ended) {
      return { ended: true, capped: live.capped, actions: [], session: this.snapshot(sessionId) as SessionSnapshot };
    }

    // FR-H.1 — the cap is checked BEFORE any input is honored. The client
    // cannot squeeze one more turn out of a capped session.
    if (Date.now() - live.startedAtMs >= live.capMs) {
      await this.endSession(live, true);
      return {
        ended: true,
        capped: true,
        actions: this.narrativeCloseActions(live, true),
        session: this.snapshot(sessionId) as SessionSnapshot
      };
    }

    // FR-I.2 — distress runs on every utterance-bearing turn, first.
    const utteranceText = extractUtterance(input);
    const distressActions: CompanionAction[] = [];
    if (utteranceText !== null) {
      const verdict = classifyDistress(utteranceText);
      if (verdict.level !== 'none') {
        await this.prisma.distressAlert.create({
          data: {
            childId: live.meta.childId,
            sessionId,
            category: verdict.category,
            severity: verdict.level
          }
        });
        await audit(this.prisma, {
          event: verdict.level === 'escalate' ? 'distress.escalated' : 'distress.acknowledged',
          childId: live.meta.childId,
          sessionId,
          detail: { category: verdict.category }
        });
        if (verdict.response) distressActions.push({ kind: 'say', text: verdict.response });
        // Escalations pause the reading protocol for this turn.
        if (verdict.level === 'escalate') {
          return { ended: false, capped: false, actions: distressActions, session: this.snapshot(sessionId) as SessionSnapshot };
        }
      }
    }

    const actions = [...distressActions, ...(await this.dispatch(live, sessionId, input))];
    return { ended: live.ended, capped: live.capped, actions, session: this.snapshot(sessionId) as SessionSnapshot };
  }

  /** Close a session on the client's initiative (natural narrative close). */
  async close(sessionId: string): Promise<TurnResult | null> {
    const live = this.sessions.get(sessionId);
    if (!live) return null;
    if (!live.ended) await this.endSession(live, false);
    return {
      ended: true,
      capped: live.capped,
      actions: this.narrativeCloseActions(live, live.capped),
      session: this.snapshot(sessionId) as SessionSnapshot
    };
  }

  // -------------------------------------------------------------------------
  // Turn dispatch
  // -------------------------------------------------------------------------

  private async dispatch(live: LiveSession, sessionId: string, input: TurnInput): Promise<CompanionAction[]> {
    switch (input.kind) {
      case 'plan-ritual-done': {
        live.planRitualDone = true;
        await this.prisma.readingSession.update({ where: { id: sessionId }, data: { planRitualDone: true } });
        return [{ kind: 'say', text: 'Our plan is set. Let us read.' }];
      }

      case 'read-line':
        return this.handleReadLine(live, sessionId, input.pageIndex, input.spoken, input.hesitations ?? []);

      case 'ladder':
        return this.handleLadder(live, sessionId, input);

      case 'utterance':
        return this.handleUtterance(live, input.text);

      case 'page-complete':
        return this.handlePageComplete(live, input.pageIndex);

      case 'choose':
        return this.handleChoose(live, sessionId, input.chosenIndex, input.rationale);
    }
  }

  /** Classify one read line, persist every outcome, update the counters. */
  private async handleReadLine(
    live: LiveSession,
    sessionId: string,
    pageIndex: number,
    spoken: string[],
    hesitations: number[]
  ): Promise<CompanionAction[]> {
    const page = live.meta.story.pages[pageIndex];
    if (!page) return [{ kind: 'say', text: 'Let us read this page.' }];

    const result = classifyReading(
      { expectedLine: page.text, spoken, hesitations },
      { taughtGraphemes: live.meta.taughtGraphemes, taughtTrickyWords: live.meta.taughtTrickyWords }
    );

    live.currentPage = pageIndex;
    live.wordsRead += result.outcomes.length;

    const rows = result.outcomes.map((o) => {
      const accentApplied = o.outcome === 'correct' && o.spoken !== undefined && o.spoken !== o.expected;
      if (o.outcome === 'correct' || o.outcome === 'self-correction' || o.outcome === 'hesitation') {
        live.wordsCorrect += 1;
      }
      live.outcomes.push(o);
      return {
        sessionId,
        expected: o.expected,
        spoken: o.spoken ?? null,
        miscueType: o.outcome,
        grapheme: o.graphemes.join(' '),
        ladderStep: o.ladderStep,
        accentApplied,
        accentNote: accentApplied ? (accentRationale(o.expected) ?? null) : null
      };
    });
    await this.prisma.miscue.createMany({ data: rows });

    // A fresh line resets the ladder — the protocol is per-word.
    live.ladder = initialLadderState;
    return [];
  }

  /** Drive the correction ladder reducer; mirror its rung into the DB. */
  private async handleLadder(
    live: LiveSession,
    sessionId: string,
    input: Extract<TurnInput, { kind: 'ladder' }>
  ): Promise<CompanionAction[]> {
    const event = toLadderEvent(input);
    const { state, actions } = ladderStep(live.ladder, event, { taughtGraphemes: live.meta.taughtGraphemes });
    live.ladder = state;

    const mapped: CompanionAction[] = actions.map((a) => {
      switch (a.kind) {
        case 'wait':
          return { kind: 'wait', ms: a.ms };
        case 'hint':
        case 'segment':
        case 'model':
        case 'praise':
          return { kind: 'say', text: a.phrase };
        case 'moveOn':
          return { kind: 'advance' };
      }
    });

    // When the model rung fires, the word ends at ladder step 2 — stamp it
    // onto the miscue row so the digest can show how far help went.
    if (state.phase === 'model' && state.word !== null) {
      await this.prisma.miscue.updateMany({
        where: { sessionId, expected: state.word },
        data: { ladderStep: 2 }
      });
    }
    return mapped;
  }

  /** PEER: expand on-story speech, redirect wandering speech. */
  private handleUtterance(live: LiveSession, text: string): CompanionAction[] {
    const { state, action } = respondToUtterance(live.peer, text, this.pageContext(live));
    live.peer = state;
    // expand and redirect are the only kinds respondToUtterance emits;
    // both carry companion text.
    if (action.kind === 'expand' || action.kind === 'redirect') {
      return [{ kind: 'say', text: action.text }];
    }
    return [];
  }

  /** Page finished: spend the PEER budget for this page, then advance. */
  private handlePageComplete(live: LiveSession, pageIndex: number): CompanionAction[] {
    live.currentPage = pageIndex;
    const { state, action } = nextPrompt(live.peer, this.pageContext(live));
    live.peer = state;
    if (action !== null && action.kind === 'prompt') {
      return [{ kind: 'prompt', promptType: action.promptType, text: action.text }];
    }
    // Budget spent — move on and open the next page's dialogue state.
    live.peer = createPeerState(live.meta.ageYears, pageIndex + 1, live.meta.story.title.length);
    return [{ kind: 'advance' }];
  }

  /** The story's one choice point (FR-E.1): record it, resolve it. */
  private async handleChoose(
    live: LiveSession,
    sessionId: string,
    chosenIndex: 0 | 1,
    rationale?: string
  ): Promise<CompanionAction[]> {
    const choice = live.meta.story.choice;
    await this.prisma.choiceEvent.create({
      data: {
        sessionId,
        storyId: live.meta.storyId,
        prompt: choice.prompt,
        chosenIndex,
        rationale: rationale ?? null
      }
    });
    const consequence = chosenIndex === 0 ? choice.consequenceForFirst : choice.consequenceForSecond;
    return [{ kind: 'say', text: consequence }];
  }

  // -------------------------------------------------------------------------
  // Session end
  // -------------------------------------------------------------------------

  /** Fold the accumulated reading into the learner model, persist totals. */
  private async endSession(live: LiveSession, capped: boolean): Promise<void> {
    live.ended = true;
    live.capped = capped;
    const now = new Date();
    const minutes = Math.max((now.getTime() - live.startedAtMs) / 60_000, 1 / 60);
    const wpm = live.wordsRead > 0 ? live.wordsCorrect / minutes : null;

    let model = applyWordOutcomes(live.meta.learnerModel, live.outcomes, now);
    if (wpm !== null && wpm > 0) model = recordFluency(model, Math.round(wpm), now);

    await this.prisma.$transaction([
      this.prisma.readingSession.update({
        where: { id: live.meta.sessionId },
        data: {
          endedAt: now,
          cappedByServer: capped,
          narrativeCloseDone: true,
          wordsRead: live.wordsRead,
          wordsCorrect: live.wordsCorrect,
          wordsPerMinute: wpm,
          costMicroUsd: live.costMicroUsd
        }
      }),
      this.prisma.learnerModel.upsert({
        where: { childId: live.meta.childId },
        create: {
          childId: live.meta.childId,
          schemaVersion: model.schemaVersion,
          state: model as unknown as Prisma.InputJsonValue
        },
        update: { schemaVersion: model.schemaVersion, state: model as unknown as Prisma.InputJsonValue }
      })
    ]);

    await audit(this.prisma, {
      event: capped ? 'session.capped' : 'session.closed',
      childId: live.meta.childId,
      sessionId: live.meta.sessionId,
      detail: { wordsRead: live.wordsRead, wordsCorrect: live.wordsCorrect, wordsPerMinute: wpm }
    });

    live.meta.learnerModel = model;
  }

  /** The promised ending — same words whether capped or natural. */
  private narrativeCloseActions(live: LiveSession, capped: boolean): CompanionAction[] {
    const opener = capped
      ? 'Our reading time is done for today — you read so well.'
      : 'We did it — what a story.';
    return [
      { kind: 'say', text: opener },
      { kind: 'say', text: live.meta.story.offlineTask },
      { kind: 'say', text: 'Tell your grown-up about it. I will be here when you come back.' },
      { kind: 'close' }
    ];
  }

  /** Build PEER's page context from story + world seed. */
  private pageContext(live: LiveSession): PeerPageContext {
    const page = live.meta.story.pages[live.currentPage] ?? live.meta.story.pages[0];
    const text = page ? page.text : '';
    const sentences = text.split(/(?<=[.!?])\s+/);
    return {
      lastSentence: sentences[sentences.length - 1] ?? text,
      character: live.meta.worldSeed.heroName,
      event: text.toLowerCase().replace(/[.!?]+$/, '') || 'the story began',
      setting: live.meta.worldSeed.city
    };
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** The child's words on a turn, or null when the turn carries none. */
function extractUtterance(input: TurnInput): string | null {
  switch (input.kind) {
    case 'read-line':
      return input.spoken.join(' ');
    case 'utterance':
      return input.text;
    case 'choose':
      return input.rationale ?? null;
    default:
      return null;
  }
}

function toLadderEvent(input: Extract<TurnInput, { kind: 'ladder' }>): LadderEvent {
  switch (input.event) {
    case 'stall':
      return { type: 'stall', word: input.word ?? '' };
    case 'waitElapsed':
      return { type: 'waitElapsed' };
    case 'attemptFailed':
      return { type: 'attemptFailed' };
    case 'readCorrectly':
      return { type: 'readCorrectly' };
    case 'selfCorrected':
      return { type: 'selfCorrected' };
  }
}
