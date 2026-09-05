/**
 * Locale contract — the parent layer is bilingual (FR-J).
 *
 * Qissa (قصہ) is an Urdu word and the product is built for Pakistani homes,
 * where a parent is far more likely to read Urdu comfortably than English.
 * The CHILD track stays English: the phonics scope teaches English graphemes,
 * and mixing scripts mid-lesson would break decoding. What becomes bilingual
 * is everything the PARENT reads — the dashboard, the digest, the reasoning
 * timeline — plus the companion's spoken scaffolding for the youngest band,
 * because code-switching ("shabash! now say ball") is how Pakistani adults
 * actually teach a toddler.
 *
 * Urdu is right-to-left. `direction` travels with the locale so every
 * surface can set `dir` without hard-coding a table of exceptions.
 */

export const LOCALES = ['en', 'ur'] as const;
export type Locale = (typeof LOCALES)[number];

export const DEFAULT_LOCALE: Locale = 'en';

export interface LocaleMeta {
  /** BCP-47 tag for `lang`, Intl and speech synthesis voice selection. */
  tag: string;
  /** Endonym — a language picker must name a language in that language. */
  label: string;
  direction: 'ltr' | 'rtl';
}

export const LOCALE_META: Record<Locale, LocaleMeta> = {
  en: { tag: 'en', label: 'English', direction: 'ltr' },
  ur: { tag: 'ur-PK', label: 'اردو', direction: 'rtl' }
};

/** Narrow an untrusted string (cookie, DB column, query param) to a Locale. */
export function asLocale(value: unknown): Locale {
  return LOCALES.includes(value as Locale) ? (value as Locale) : DEFAULT_LOCALE;
}

export function localeDirection(locale: Locale): 'ltr' | 'rtl' {
  return LOCALE_META[locale].direction;
}
