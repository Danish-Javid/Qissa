/**
 * Parent-layer locale (FR-J).
 *
 * Scope is deliberate: this wraps the PARENT routes only. The child track is
 * English because the phonics scope teaches English graphemes, and swapping
 * the script under a child mid-lesson would break the very thing being taught.
 *
 * Persistence is two-tier. The server is the source of truth (a column on the
 * parent row, so the choice follows them to another device), but the value is
 * mirrored to localStorage and read synchronously on first paint — otherwise
 * an Urdu-reading parent gets a flash of English on every load while /auth/me
 * is in flight, and RTL layout visibly snaps into place.
 */
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import {
  DEFAULT_LOCALE,
  LOCALE_META,
  asLocale,
  localeDirection,
  localizeNumber,
  translator,
  type Locale,
  type MessageKey,
  type MessageParams
} from '@qissa/core';
import { api } from '../api/client.js';

const STORAGE_KEY = 'qissa.locale';

interface LocaleContextValue {
  locale: Locale;
  direction: 'ltr' | 'rtl';
  /** Translate. Bound to the active locale. */
  tr: (key: MessageKey, params?: MessageParams) => string;
  /** Render a number in the active locale's numerals. */
  num: (value: number) => string;
  setLocale: (next: Locale) => void;
}

const LocaleContext = createContext<LocaleContextValue | null>(null);

function readStoredLocale(): Locale {
  try {
    return asLocale(localStorage.getItem(STORAGE_KEY));
  } catch {
    // Private mode or blocked storage: fall back, never throw on first paint.
    return DEFAULT_LOCALE;
  }
}

export function LocaleProvider({ children }: { children: ReactNode }) {
  const [locale, setLocaleState] = useState<Locale>(readStoredLocale);

  // `dir` and `lang` belong on the document element, not a wrapper div: they
  // steer text selection, spellcheck and the browser's own UI, and RTL
  // scrollbar placement only reads them from the root.
  useEffect(() => {
    document.documentElement.lang = LOCALE_META[locale].tag;
    document.documentElement.dir = localeDirection(locale);
  }, [locale]);

  const setLocale = useCallback((next: Locale) => {
    setLocaleState(next);
    try {
      localStorage.setItem(STORAGE_KEY, next);
    } catch {
      // Non-fatal: the server copy still persists the choice.
    }
    // Fire-and-forget. A failed write (offline, expired session) must not
    // block the UI from switching — the local mirror already did the work.
    api.post('/auth/locale', { locale: next }).catch(() => undefined);
  }, []);

  /** Adopt the server's stored locale once, on load. */
  const adoptServerLocale = useCallback((serverLocale: Locale | undefined) => {
    if (serverLocale === undefined) return;
    setLocaleState(serverLocale);
    try {
      localStorage.setItem(STORAGE_KEY, serverLocale);
    } catch {
      // As above.
    }
  }, []);

  const value = useMemo<LocaleContextValue>(
    () => ({
      locale,
      direction: localeDirection(locale),
      tr: translator(locale),
      num: (n: number) => localizeNumber(locale, n),
      setLocale
    }),
    [locale, setLocale]
  );

  return (
    <LocaleContext.Provider value={value}>
      <ServerLocaleAdopter onAdopt={adoptServerLocale} />
      {children}
    </LocaleContext.Provider>
  );
}

/** Reads /auth/me once so a parent's stored choice follows them across devices. */
function ServerLocaleAdopter({ onAdopt }: { onAdopt: (locale: Locale | undefined) => void }) {
  useEffect(() => {
    let cancelled = false;
    api
      .get<{ locale?: Locale }>('/auth/me')
      .then((me) => {
        if (!cancelled) onAdopt(me.locale);
      })
      .catch(() => undefined); // signed out: the local mirror stands
    return () => {
      cancelled = true;
    };
  }, [onAdopt]);
  return null;
}

export function useLocale(): LocaleContextValue {
  const ctx = useContext(LocaleContext);
  if (ctx === null) throw new Error('useLocale must be used inside <LocaleProvider>');
  return ctx;
}
