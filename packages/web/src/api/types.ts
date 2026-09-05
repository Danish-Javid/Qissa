/**
 * Client-side DTOs — the wire shapes the server routes return.
 *
 * Kept separate from @qissa/core types on purpose: core types describe
 * pedagogy truth; these describe what crosses the network. Where the two
 * coincide (Story, LearnerModel) the client imports core directly.
 */
import type { ChildSettings, LearningTrack, LessonPlan, Locale, Story, StoryPacing } from '@qissa/core';

export interface ChildSummary {
  id: string;
  name: string;
  birthDate: string;
  createdAt: string;
  level: number;
  /** TRUE age in whole years, server-derived — drives the three-mode routing.
   *  The client never recomputes age from birthDate (one source of truth). */
  ageYears: number;
  /** Effective learning track after any parent override: First Words (1–2) or
   *  Learn to Read (3–6). */
  learningTrack: LearningTrack;
  /** Whether the common Story Time door is shown for this child. */
  storyTimeEnabled: boolean;
  /** Story Time narration pace (parental control). */
  storyPacing: StoryPacing;
  /** Parent-set daily session cap in minutes, or null for the server default. */
  sessionCapMinutes: number | null;
  /** The raw stored settings — the control panel's current values. */
  settings: ChildSettings;
}

/** Learn to Read (ages 3–6): the standalone "Toddlers Can Read" phonics
 *  lesson. The plan is pure pedagogy computed server-side (the SAME
 *  buildLessonPlan the tests pin) and the giftUrl is the child-keyed FLUX
 *  celebration keepsake drawn at the close. `art` maps each CONCRETE word the
 *  lesson names to a word-keyed FLUX picture URL so the child sees the thing
 *  Buddy is saying; glue/sight words are absent (text-only). No story. */
export interface LessonResponse {
  plan: LessonPlan;
  art: Record<string, string>;
  giftUrl: string;
}

export interface MeResponse {
  email: string;
  consentGivenAt: string | null;
  /** Re-served so a fresh-tab load can restore the double-submit token; the
   *  api client auto-adopts it. Absent on older cached responses. */
  csrfToken?: string;
}

export interface AuthResponse {
  email: string;
  /** Double-submit CSRF token: stored client-side, echoed on mutations. */
  csrfToken: string;
  /** Parent-layer language (FR-J). Absent on register/login, present on /me. */
  locale?: Locale;
  consentGivenAt?: string | null;
}

export interface StoryResponse {
  storyId: string;
  source: 'generated' | 'cache' | 'deterministic-fallback';
  story: Story;
  decisions: Array<{ check: string; ok: boolean; detail?: string }>;
}

/** Story Time (receptive) serve result. Same safe story pipeline as the
 *  read-along, but the response carries the parent-chosen narration pace and
 *  omits the reasoning timeline (nothing was taught, so there is no ladder to
 *  explain). */
export interface StoryTimeResponse {
  storyId: string;
  source: 'generated' | 'cache' | 'deterministic-fallback';
  story: Story;
  pacing: StoryPacing;
}

/** Mirrors server session/CompanionAction. */
export interface CompanionAction {
  kind: 'say' | 'wait' | 'prompt' | 'advance' | 'close';
  text?: string;
  ms?: number;
  promptType?: string;
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

export interface DigestResponse {
  child: { id: string; name: string; consentGivenAt: string | null };
  learner: {
    currentLevel: number;
    mastered: string[];
    learning: string[];
    reteach: string[];
    vocabularyCount: number;
    fluency: Array<{ at: string; wordsPerMinute: number }>;
  } | null;
  sessions: Array<{
    id: string;
    startedAt: string;
    endedAt: string | null;
    cappedByServer: boolean;
    wordsRead: number;
    wordsCorrect: number;
    wordsPerMinute: number | null;
    costMicroUsd: number;
    providerMode: string;
  }>;
  distressEscalations: Array<{ category: string; createdAt: string }>;
  reasoning: Array<{ event: string; createdAt: string; detail: unknown }>;
  miscues: Array<{
    expected: string;
    spoken: string | null;
    miscueType: string;
    grapheme: string;
    ladderStep: number;
    accentApplied: boolean;
    accentNote: string | null;
  }>;
  audioClips: Array<{ id: string; createdAt: string }>;
  /** Recent stories with the gate decisions that produced them, so the digest
   *  can answer "why THIS story?" (FR-I.9). Wording comes from core's
   *  explainStory; the payload carries facts only. */
  stories: Array<{
    id: string;
    title: string;
    level: number;
    theme: string;
    targetGrapheme: string;
    source: 'generated' | 'cache' | 'deterministic-fallback';
    createdAt: string;
    reviewGraphemes: string[];
    generator: string | null;
    decisions: Array<{ check: string; ok: boolean; detail?: string }>;
  }>;
}

export interface MetricsResponse {
  providerMode: 'mock' | 'alibaba';
  pipeline: {
    storiesAccepted: number;
    storiesRejected: number;
    fallbacksServed: number;
    rejectionRate: number | null;
  };
  budget: {
    perChildPerDay: number;
    generationsWithheld: number;
  };
  sessions: {
    recent: number;
    cappedByServer: number;
    wordsRead: number;
    accuracy: number | null;
    costMicroUsd: number;
  };
  safety: { distressEscalations: number; accentVariantCatches: number };
}
