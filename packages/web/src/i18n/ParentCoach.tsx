/**
 * Code-switched coaching line for the adult sitting with a First Words child.
 *
 * The First Words caption is already documented as being "for the co-viewing
 * grown-up" — a one-year-old cannot read it. This adds the Urdu half of that
 * same job: the frame switches to Urdu while the TARGET WORD stays English,
 * because the English word is the thing being learned. "دیکھو — ball!" is not
 * a translation artefact; it is how a Lahore parent actually teaches a
 * toddler, and saying it aloud alongside Buddy is the shared-reading behaviour
 * the whole track is built on (Ganea et al. 2011: naming aloud while the child
 * looks beats pointing alone).
 *
 * Renders nothing in English, where the existing caption already says it.
 */
import type { MessageKey } from '@qissa/core';
import { useLocale } from './LocaleProvider.js';

export type CoachMode = 'look' | 'find' | 'praise';

const MODE_KEYS: Record<CoachMode, MessageKey> = {
  look: 'early.coachLook',
  find: 'early.coachFind',
  praise: 'early.coachPraise'
};

export function ParentCoach({ word, mode }: { word: string; mode: CoachMode }) {
  const { locale, tr } = useLocale();
  if (locale === 'en' || word === '') return null;

  return (
    <div
      // The child's screen stays LTR; only this strip flips, so the English
      // word inside it keeps its natural reading order.
      dir="rtl"
      className="mt-3 rounded-2xl bg-white/70 px-4 py-2 text-center shadow-sm"
    >
      <p className="text-xs font-semibold uppercase tracking-wide text-ink/45">{tr('early.coachTitle')}</p>
      <p className="text-lg font-semibold text-ink/80">{tr(MODE_KEYS[mode], { word })}</p>
    </div>
  );
}
