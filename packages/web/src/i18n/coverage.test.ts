/**
 * Every parent-facing screen must go through the catalog.
 *
 * This exists because the README claimed the parent layer was "fully
 * translated" while six of ten parent files never called the translator at
 * all. The machinery was real — a 164-key catalog, RTL, Eastern Arabic-Indic
 * numerals, its own passing tests — and the Dashboard, which is where the
 * language switch lives, was pure English. A parent flipped to اردو and
 * watched nothing change.
 *
 * A missing Urdu VALUE is already a compile error (the catalog is typed). What
 * nothing caught was a screen that never asked for a value in the first place,
 * so this asserts the call, not the content.
 */
import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const parentDir = path.resolve(import.meta.dirname, '..', 'parent');

/**
 * Screens that are deliberately English.
 *
 * Both are engineering surfaces, not parent surfaces: the pipeline view is the
 * judging/honesty card and the demo panel is stage machinery, absent from a
 * production build entirely. Listing them here is a decision on the record —
 * adding a file to this list should feel like it needs a reason.
 */
const ENGLISH_ONLY = new Set(['Pipeline.tsx', 'Demo.tsx']);

/** Components with no prose of their own (layout shells, buttons). */
const NO_PROSE = new Set(['ParentPage.tsx']);

function parentComponents(): string[] {
  return readdirSync(parentDir).filter((f) => f.endsWith('.tsx') && !f.endsWith('.test.tsx'));
}

describe('parent-layer translation coverage', () => {
  it('has parent components to check', () => {
    expect(parentComponents().length).toBeGreaterThan(5);
  });

  for (const file of parentComponents()) {
    if (ENGLISH_ONLY.has(file) || NO_PROSE.has(file)) continue;

    it(`${file} renders its text through the catalog`, () => {
      const source = readFileSync(path.join(parentDir, file), 'utf8');
      expect(
        /\btr\(/.test(source),
        `${file} renders parent-facing text but never calls tr(). Either translate it, ` +
          'or add it to ENGLISH_ONLY with a reason.'
      ).toBe(true);
    });
  }

  it('flags JSX text that bypasses the catalog', () => {
    // Multi-word capitalised text sitting directly between JSX tags is prose
    // that a parent reads. Attributes, class names and code are ignored.
    const offenders: string[] = [];
    for (const file of parentComponents()) {
      if (ENGLISH_ONLY.has(file) || NO_PROSE.has(file)) continue;
      const source = readFileSync(path.join(parentDir, file), 'utf8');
      for (const line of source.split('\n')) {
        const trimmed = line.trim();
        if (trimmed.startsWith('//') || trimmed.startsWith('*')) continue;
        const match = /^>?\s*([A-Z][a-z]+(?: [a-z]{2,}){2,}[.?]?)\s*<?$/.exec(trimmed);
        if (match) offenders.push(`${file}: ${match[1]}`);
      }
    }
    expect(offenders, `untranslated prose:\n${offenders.join('\n')}`).toEqual([]);
  });
});
