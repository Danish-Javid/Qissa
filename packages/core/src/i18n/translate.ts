/**
 * `t()` — the only way a parent-facing string reaches a screen.
 *
 * Deliberately tiny: no plural rules engine, no ICU parser, no runtime
 * catalog loading. The catalog is a compile-time object, so an unknown key
 * is a type error and a missing Urdu translation cannot ship. That matters
 * more than features here — a blank string on stage is unrecoverable.
 *
 * Interpolation is `{name}` and is NOT escaped: React escapes on render, and
 * nothing here is ever inserted as HTML. Values that came from a child's
 * mouth never reach this function; only names, counts and grapheme labels do.
 */
import { DEFAULT_LOCALE, type Locale } from './locale.js';
import { messages, type MessageKey } from './messages.js';

export type MessageParams = Record<string, string | number>;

/**
 * Translate `key` into `locale`, substituting `{placeholders}`.
 *
 * A placeholder with no matching param is left verbatim rather than blanked:
 * "{name} moved up" is a visible, reportable bug, whereas " moved up" reads
 * as a finished sentence and hides it.
 */
export function t(locale: Locale, key: MessageKey, params: MessageParams = {}): string {
  const catalog = messages[locale] ?? messages[DEFAULT_LOCALE];
  const template = catalog[key] ?? messages[DEFAULT_LOCALE][key];
  return template.replace(/\{(\w+)\}/g, (whole, name: string) => {
    const value = params[name];
    return value === undefined ? whole : String(value);
  });
}

/** Bind a locale once so render code reads `tr('digest.title', …)`. */
export function translator(locale: Locale): (key: MessageKey, params?: MessageParams) => string {
  return (key, params) => t(locale, key, params);
}

/**
 * Urdu uses Eastern Arabic-Indic digits in running prose. Numbers inside a
 * sentence should match the script they sit in, or the line reads as a
 * transliteration accident.
 */
const EASTERN_DIGITS = ['۰', '۱', '۲', '۳', '۴', '۵', '۶', '۷', '۸', '۹'];

export function localizeNumber(locale: Locale, value: number): string {
  const western = String(value);
  if (locale !== 'ur') return western;
  // `?? d` is unreachable for /\d/ matches, but the index signature is
  // checked and a silent undefined here would blank every number on screen.
  return western.replace(/\d/g, (d) => EASTERN_DIGITS[Number(d)] ?? d);
}
