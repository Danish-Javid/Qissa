/**
 * The "why" layer — turns pipeline decisions and audit events into sentences
 * a parent can read (FR-I.9, FR-J).
 *
 * The engine already records everything: each story row carries its full
 * decision timeline in `provenance`, and every accept/reject/fallback lands
 * in the append-only audit log. Until now the digest rendered those raw
 * ("story.rejected.decodability"), which is honest but only legible to whoever
 * wrote the pipeline. This module is the translation from engine vocabulary to
 * parent vocabulary, and it lives in core for the same reason the pedagogy
 * does: it is deterministic, it is testable, and it must read identically on
 * the server and in an offline browser.
 *
 * It is explicitly NOT a model call. The explanation of a deterministic
 * decision must itself be deterministic, or the honesty claim collapses.
 */
import type { Locale } from './locale.js';
import { t } from './translate.js';
import type { MessageKey } from './messages.js';

/** One gate's verdict, as recorded in a story's provenance. */
export interface PipelineDecisionLike {
  check: string;
  ok: boolean;
  detail?: string;
}

export interface StoryExplanationInput {
  childName: string;
  level: number;
  /** How the story was ultimately obtained. */
  source: 'generated' | 'cache' | 'deterministic-fallback';
  targetGrapheme: string;
  reviewGraphemes: string[];
  decisions: PipelineDecisionLike[];
}

export interface ExplanationLine {
  text: string;
  ok: boolean;
}

export interface StoryExplanation {
  /** Why this sound, at this level, for this child. */
  headline: string;
  /** Where the text came from, and whether a gate sent us down the ladder. */
  provenance: string;
  /** Present only when the story carries spaced-repetition review sounds. */
  review: string | null;
  /** One line per gate, in pipeline order. */
  checks: ExplanationLine[];
}

/**
 * Gate name -> message keys.
 *
 * The engine namespaces each verdict by the STAGE that produced it --
 * `generator.decodability`, `warm-cache.page-count` -- so that a story's
 * provenance shows which rung of the ladder rejected it, not merely that
 * something did. The parent does not care which rung ran the check (the
 * source line above already says where the text came from), so the stage
 * prefix is stripped before lookup. Bare names are also accepted: the
 * generator's own self-validation records them unprefixed.
 */
const GATE_KEYS: Record<string, { pass: MessageKey; fail: MessageKey }> = {
  decodability: { pass: 'explain.gateDecodability', fail: 'explain.gateDecodabilityFailed' },
  'content-filter': { pass: 'explain.gateContentFilter', fail: 'explain.gateContentFilterFailed' },
  'page-count': { pass: 'explain.gatePageCount', fail: 'explain.gatePageCountFailed' },
  'target-density': { pass: 'explain.gateTargetDensity', fail: 'explain.gateTargetDensityFailed' },
  'review-density': { pass: 'explain.gateReviewDensity', fail: 'explain.gateReviewDensityFailed' }
};

/** Stage markers that are not gates: they narrate the ladder itself. */
const STAGE_KEYS: Record<string, MessageKey> = {
  'generator.available': 'explain.generatorUnavailable',
  'fallback.cache': 'explain.fallbackCache',
  'fallback.deterministic': 'explain.fallbackDeterministic'
};

/** Strip the stage namespace: "generator.page-count" -> "page-count". */
function gateName(check: string): string {
  const dot = check.indexOf('.');
  return dot === -1 ? check : check.slice(dot + 1);
}

const SOURCE_KEYS: Record<StoryExplanationInput['source'], MessageKey> = {
  generated: 'explain.sourceGenerated',
  cache: 'explain.sourceCache',
  'deterministic-fallback': 'explain.sourceFallback'
};

/**
 * Explain one story to its parent.
 *
 * Gates the engine ran but this module has no wording for still produce a
 * line (via the `gateUnknown` keys) rather than vanishing: a check silently
 * missing from the parent's view would be exactly the kind of gap the
 * audit trail exists to prevent.
 */
export function explainStory(locale: Locale, input: StoryExplanationInput): StoryExplanation {
  const { childName, level, source, targetGrapheme, reviewGraphemes, decisions } = input;

  const headline = t(locale, 'explain.storyChosen', {
    grapheme: targetGrapheme,
    level,
    name: childName
  });

  const review =
    reviewGraphemes.length > 0
      ? t(locale, 'explain.storyReview', {
          graphemes: reviewGraphemes.join('”, “'),
          name: childName
        })
      : null;

  const checks: ExplanationLine[] = decisions.map((decision) => {
    const stageKey = STAGE_KEYS[decision.check];
    if (stageKey !== undefined) {
      return {
        ok: decision.ok,
        text: t(locale, stageKey, { name: childName, detail: decision.detail ?? '' })
      };
    }

    const keys = GATE_KEYS[decision.check] ?? GATE_KEYS[gateName(decision.check)];
    if (keys === undefined) {
      return {
        ok: decision.ok,
        text: decision.ok
          ? t(locale, 'explain.gateUnknown', { check: decision.check })
          : t(locale, 'explain.gateUnknownFailed', {
              check: decision.check,
              detail: decision.detail ?? ''
            })
      };
    }
    return {
      ok: decision.ok,
      text: decision.ok
        ? t(locale, keys.pass, { name: childName })
        : t(locale, keys.fail, { name: childName, detail: decision.detail ?? '' })
    };
  });

  return {
    headline,
    provenance: t(locale, SOURCE_KEYS[source], { name: childName }),
    review,
    checks
  };
}

/**
 * Explain one audit-log event.
 *
 * Prefix matching mirrors how the engine names events: `story.rejected` and
 * `story.rejected.generator-error` are the same thing to a parent, and
 * `story.fallback.cache` / `story.fallback.deterministic` differ only in a
 * detail the technical view already shows.
 */
export function explainAuditEvent(locale: Locale, event: string, childName: string): string {
  const key = auditEventKey(event);
  return t(locale, key, { name: childName, event });
}

function auditEventKey(event: string): MessageKey {
  if (event === 'story.accepted') return 'event.storyAccepted';
  if (event.startsWith('story.rejected')) return 'event.storyRejected';
  if (event.startsWith('story.fallback')) return 'event.storyFallback';
  if (event === 'session.capped') return 'event.sessionCapped';
  if (event === 'progression.advance') return 'event.progressionAdvance';
  if (event === 'progression.reteach') return 'event.progressionReteach';
  if (event === 'distress.escalated') return 'event.distressEscalated';
  return 'event.unknown';
}

/** True when the digest should render this event as a setback, not a step. */
export function isSetbackEvent(event: string): boolean {
  return (
    event.startsWith('story.rejected') ||
    event === 'story.pipeline-exhausted' ||
    event === 'progression.reteach' ||
    event === 'distress.escalated'
  );
}
