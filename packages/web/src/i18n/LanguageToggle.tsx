/**
 * Language switch for the parent chrome (FR-J).
 *
 * A two-option segmented control rather than a <select>: with exactly two
 * languages a dropdown hides half the choice behind a tap, and the whole point
 * is that an Urdu-reading parent can see "اردو" without first discovering a
 * menu. Each label is written in its own script for the same reason — a
 * picker that says "Urdu" in English is useless to whoever needs it.
 */
import { LOCALES, LOCALE_META } from '@qissa/core';
import { useLocale } from './LocaleProvider.js';

export function LanguageToggle({ tone = 'light' }: { tone?: 'light' | 'dark' }) {
  const { locale, setLocale, tr } = useLocale();
  const onDark = tone === 'dark';

  return (
    <div
      role="group"
      aria-label={tr('common.language')}
      className={`inline-flex overflow-hidden rounded-full border text-sm ${
        onDark ? 'border-white/25' : 'border-ink/15'
      }`}
    >
      {LOCALES.map((option) => {
        const active = option === locale;
        return (
          <button
            key={option}
            type="button"
            lang={LOCALE_META[option].tag}
            aria-pressed={active}
            onClick={() => setLocale(option)}
            className={`px-3 py-1 transition ${
              active
                ? onDark
                  ? 'bg-white text-ink'
                  : 'bg-ink text-white'
                : onDark
                  ? 'text-white/70 hover:text-white'
                  : 'text-ink/60 hover:text-ink'
            }`}
          >
            {LOCALE_META[option].label}
          </button>
        );
      })}
    </div>
  );
}
