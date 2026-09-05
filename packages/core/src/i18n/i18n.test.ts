/**
 * i18n + explainer tests.
 *
 * The catalog-parity test is the important one: it is what makes "a missing
 * Urdu string cannot reach the stage" a fact rather than an intention.
 */
import { describe, expect, it } from 'vitest';
import { LOCALES, asLocale, localeDirection } from './locale.js';
import { messages, type MessageKey } from './messages.js';
import { localizeNumber, t, translator } from './translate.js';
import { explainAuditEvent, explainStory, isSetbackEvent } from './explain.js';

const CHECKS = [
  { check: 'decodability', ok: true },
  { check: 'content-filter', ok: true },
  { check: 'page-count', ok: true },
  { check: 'target-density', ok: true },
  { check: 'review-density', ok: true }
];

describe('catalog', () => {
  it('translates every key in every locale', () => {
    const keys = Object.keys(messages.en) as MessageKey[];
    expect(keys.length).toBeGreaterThan(30);
    for (const locale of LOCALES) {
      for (const key of keys) {
        const value = messages[locale][key];
        expect(value, `${locale}.${key}`).toBeTypeOf('string');
        expect(value.trim(), `${locale}.${key} must not be blank`).not.toBe('');
      }
    }
  });

  it('keeps the same placeholders in every locale', () => {
    const placeholders = (s: string): string[] => [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]!).sort();
    for (const key of Object.keys(messages.en) as MessageKey[]) {
      expect(placeholders(messages.ur[key]), `placeholders drifted in ${key}`).toEqual(
        placeholders(messages.en[key])
      );
    }
  });

  it('actually contains Urdu script, not copied English', () => {
    const urdu = /[؀-ۿ]/;
    const translated = (Object.keys(messages.en) as MessageKey[]).filter(
      (key) => messages.ur[key] !== messages.en[key]
    );
    // Everything except the pure-placeholder passthrough should be translated.
    expect(translated.length).toBeGreaterThan(Object.keys(messages.en).length - 3);
    for (const key of translated) expect(urdu.test(messages.ur[key]), key).toBe(true);
  });
});

describe('t()', () => {
  it('substitutes placeholders', () => {
    expect(t('en', 'digest.level', { level: 3 })).toBe('Level 3');
    expect(t('ur', 'digest.level', { level: 3 })).toContain('3');
  });

  it('leaves an unmatched placeholder visible rather than blanking it', () => {
    expect(t('en', 'digest.title', {})).toBe('{name} — progress');
  });

  it('binds a locale via translator()', () => {
    expect(translator('en')('digest.mastered')).toBe('Mastered');
    expect(translator('ur')('digest.mastered')).not.toBe('Mastered');
  });
});

describe('locale', () => {
  it('narrows untrusted input to a supported locale', () => {
    expect(asLocale('ur')).toBe('ur');
    expect(asLocale('fr')).toBe('en');
    expect(asLocale(undefined)).toBe('en');
    expect(asLocale({ toString: () => 'ur' })).toBe('en');
  });

  it('carries direction with the locale', () => {
    expect(localeDirection('en')).toBe('ltr');
    expect(localeDirection('ur')).toBe('rtl');
  });

  it('renders Urdu numerals in Urdu only', () => {
    expect(localizeNumber('en', 2026)).toBe('2026');
    expect(localizeNumber('ur', 15)).toBe('۱۵');
  });
});

describe('explainStory', () => {
  it('names the sound, the level and the child', () => {
    const out = explainStory('en', {
      childName: 'Mina',
      level: 2,
      source: 'generated',
      targetGrapheme: 'sh',
      reviewGraphemes: ['s', 't'],
      decisions: CHECKS
    });
    expect(out.headline).toContain('sh');
    expect(out.headline).toContain('Mina');
    expect(out.headline).toContain('2');
    expect(out.review).toContain('s');
    expect(out.checks).toHaveLength(5);
    expect(out.checks.every((c) => c.ok)).toBe(true);
  });

  it('omits the review line when there is nothing to review', () => {
    const out = explainStory('en', {
      childName: 'Mina',
      level: 1,
      source: 'generated',
      targetGrapheme: 's',
      reviewGraphemes: [],
      decisions: CHECKS
    });
    expect(out.review).toBeNull();
  });

  it('explains a fallback honestly', () => {
    const out = explainStory('en', {
      childName: 'Mina',
      level: 1,
      source: 'cache',
      targetGrapheme: 's',
      reviewGraphemes: [],
      decisions: [{ check: 'decodability', ok: false, detail: 'violations: zebra' }]
    });
    expect(out.provenance).toContain('did not pass');
    expect(out.checks[0]!.ok).toBe(false);
    expect(out.checks[0]!.text).toContain('zebra');
  });

  it('never drops a gate it has no wording for', () => {
    const out = explainStory('en', {
      childName: 'Mina',
      level: 1,
      source: 'generated',
      targetGrapheme: 's',
      reviewGraphemes: [],
      decisions: [...CHECKS, { check: 'future-gate', ok: false, detail: 'nope' }]
    });
    expect(out.checks).toHaveLength(6);
    expect(out.checks[5]!.text).toContain('future-gate');
  });

  it('produces Urdu for every surface when asked', () => {
    const out = explainStory('ur', {
      childName: 'مینا',
      level: 2,
      source: 'generated',
      targetGrapheme: 'sh',
      reviewGraphemes: ['s'],
      decisions: CHECKS
    });
    const urdu = /[؀-ۿ]/;
    expect(urdu.test(out.headline)).toBe(true);
    expect(urdu.test(out.provenance)).toBe(true);
    for (const check of out.checks) expect(urdu.test(check.text)).toBe(true);
    // The grapheme being taught stays in Latin script — it is what the child decodes.
    expect(out.headline).toContain('sh');
  });
});

describe('explainAuditEvent', () => {
  it('maps engine events onto parent language', () => {
    expect(explainAuditEvent('en', 'story.accepted', 'Mina')).toContain('passed every safety check');
    expect(explainAuditEvent('en', 'story.rejected.decodability', 'Mina')).toContain('rejected');
    expect(explainAuditEvent('en', 'story.fallback.cache', 'Mina')).toContain('hand-written');
    expect(explainAuditEvent('en', 'session.capped', 'Mina')).toContain('15-minute');
  });

  it('falls back to the raw event rather than inventing one', () => {
    expect(explainAuditEvent('en', 'early.quiz', 'Mina')).toBe('early.quiz');
  });

  it('flags setbacks distinctly from steps forward', () => {
    expect(isSetbackEvent('story.rejected')).toBe(true);
    expect(isSetbackEvent('progression.reteach')).toBe(true);
    expect(isSetbackEvent('story.accepted')).toBe(false);
    expect(isSetbackEvent('progression.advance')).toBe(false);
  });
});
