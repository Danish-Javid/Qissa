/**
 * Teach-pass word selection tests — the contract for WHICH words a page warms
 * up before the fluent read. These encode the pedagogy the player relies on:
 * teach the new target sound, only where the child can actually decode it,
 * once each, and never let a dense page run away.
 */
import { describe, expect, it } from 'vitest';
import { graphemesUpTo } from '../data/index.js';
import { MAX_TEACH_WORDS_PER_PAGE, teachWordsForPage } from './teaching.js';

describe('teachWordsForPage', () => {
  it('selects decodable words that carry the target sound, in reading order', () => {
    // 'pin' has no /s/, so only the two /s/ words are taught.
    expect(teachWordsForPage('pin sat sit', 's', graphemesUpTo(1))).toEqual(['sat', 'sit']);
  });

  it('returns empty when no word carries the target sound', () => {
    expect(teachWordsForPage('pin tip', 's', graphemesUpTo(1))).toEqual([]);
  });

  it('is fail-closed: skips a target word the child cannot yet decode', () => {
    // 'cat' needs /c/ (level 2); at level 1 it does not parse, so it is never
    // taught even though it carries the target /a/. 'sat' decodes and is kept.
    expect(teachWordsForPage('cat sat', 'a', graphemesUpTo(1))).toEqual(['sat']);
  });

  it('matches whole graphemes, not letter substrings (ship is /sh/, not /s/)', () => {
    // The curriculum gate treats 'sh' as ONE sound, so a target of 's' must
    // not select 'ship' once 'sh' is taught — exactly like parseGraphemes.
    expect(teachWordsForPage('ship', 's', graphemesUpTo(4))).toEqual([]);
    // …and a target of 'sh' selects it.
    expect(teachWordsForPage('ship shop', 'sh', graphemesUpTo(4))).toEqual(['ship', 'shop']);
  });

  it('does not select a plain /s/ word when the target is the digraph /sh/', () => {
    expect(teachWordsForPage('sit ship', 'sh', graphemesUpTo(4))).toEqual(['ship']);
  });

  it('teaches each unique word once', () => {
    expect(teachWordsForPage('sit sit sit', 's', graphemesUpTo(1))).toEqual(['sit']);
  });

  it('lowercases to match what the reader displays and the classifier compares', () => {
    expect(teachWordsForPage('Sat SIT', 's', graphemesUpTo(1))).toEqual(['sat', 'sit']);
  });

  it('caps at MAX_TEACH_WORDS_PER_PAGE by default so a dense page stays snappy', () => {
    const page = 'sat sit sip sap san'; // five unique /s/ words, all level-1
    const result = teachWordsForPage(page, 's', graphemesUpTo(1));
    expect(result).toHaveLength(MAX_TEACH_WORDS_PER_PAGE);
    expect(result).toEqual(['sat', 'sit', 'sip', 'sap']);
  });

  it('honors a custom cap', () => {
    expect(teachWordsForPage('sat sit sip', 's', graphemesUpTo(1), 2)).toEqual(['sat', 'sit']);
  });

  it('returns empty for a blank or whitespace-only target', () => {
    expect(teachWordsForPage('sat sit', '', graphemesUpTo(1))).toEqual([]);
    expect(teachWordsForPage('sat sit', '   ', graphemesUpTo(1))).toEqual([]);
  });

  it('returns empty for a non-positive cap', () => {
    expect(teachWordsForPage('sat sit', 's', graphemesUpTo(1), 0)).toEqual([]);
  });

  it('returns empty for an empty page', () => {
    expect(teachWordsForPage('', 's', graphemesUpTo(1))).toEqual([]);
  });

  it('normalizes the target case (a stored "S" still matches)', () => {
    expect(teachWordsForPage('sat sit', 'S', graphemesUpTo(1))).toEqual(['sat', 'sit']);
  });
});
