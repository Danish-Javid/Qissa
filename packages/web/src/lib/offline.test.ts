/**
 * Offline cache tests.
 *
 * This module is what makes "it still reads with the venue Wi-Fi unplugged"
 * true, so its failure modes matter more than its happy path: it runs against
 * localStorage, which can be full, disabled, or holding something written by
 * an older build. Every one of those must degrade to "no cached story", never
 * to a thrown error on a child's screen mid-session.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Story } from '@qissa/core';
import { archiveEntries, archiveStory, cachedStory, mirrorStory } from './offline.js';

const STORY: Story = {
  title: 'Mina taps a mat',
  level: 1,
  targetGrapheme: 's',
  theme: 'courage',
  pages: [
    { text: 'Mina taps a mat.', illustrationHint: '' },
    { text: 'a mat is in a pan.', illustrationHint: '' }
  ],
  choice: {
    prompt: 'What next?',
    options: ['a pan', 'a mat'],
    consequenceForFirst: 'Mina taps a pan.',
    consequenceForSecond: 'Mina taps a mat.'
  },
  offlineTask: 'Find a mat at home.',
  provenance: { generator: 'test', model: 'test', promptVersion: 'test' }
};

beforeEach(() => localStorage.clear());
afterEach(() => vi.restoreAllMocks());

describe('story mirror', () => {
  it('round-trips the story a child is currently reading', () => {
    mirrorStory('child-1', 'story-1', STORY);
    const cached = cachedStory('child-1');
    expect(cached?.storyId).toBe('story-1');
    expect(cached?.story.title).toBe(STORY.title);
    expect(cached?.story.pages).toHaveLength(2);
  });

  it('keeps one story per child, not a shared slot', () => {
    mirrorStory('child-1', 'story-1', STORY);
    mirrorStory('child-2', 'story-2', { ...STORY, title: 'Other' });
    expect(cachedStory('child-1')?.story.title).toBe(STORY.title);
    expect(cachedStory('child-2')?.story.title).toBe('Other');
  });

  it('returns null for a child with nothing mirrored', () => {
    expect(cachedStory('nobody')).toBeNull();
  });

  it('rejects a corrupt entry instead of handing back a broken story', () => {
    localStorage.setItem('qissa.offline.story.child-1', '{not json');
    expect(cachedStory('child-1')).toBeNull();

    // Shape-valid JSON that is not a story: an older build, or a bad write.
    localStorage.setItem('qissa.offline.story.child-1', JSON.stringify({ storyId: 'x', story: {} }));
    expect(cachedStory('child-1')).toBeNull();

    localStorage.setItem(
      'qissa.offline.story.child-1',
      JSON.stringify({ storyId: 'x', story: { title: 'ok', pages: 'not-an-array' } })
    );
    expect(cachedStory('child-1')).toBeNull();
  });

  it('never throws when storage is full', () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('QuotaExceededError');
    });
    // A quota error mid-session must not interrupt a child's reading.
    expect(() => mirrorStory('child-1', 'story-1', STORY)).not.toThrow();
  });

  it('never throws when storage is blocked entirely', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new DOMException('SecurityError');
    });
    expect(cachedStory('child-1')).toBeNull();
  });
});

describe('story archive', () => {
  it('records served stories newest-first', () => {
    archiveStory('child-1', 'story-1', STORY);
    archiveStory('child-1', 'story-2', { ...STORY, title: 'Second' });
    const entries = archiveEntries();
    expect(entries.map((e) => e.title)).toEqual(['Second', STORY.title]);
  });

  it('is idempotent per story id', () => {
    archiveStory('child-1', 'story-1', STORY);
    archiveStory('child-1', 'story-1', STORY);
    expect(archiveEntries()).toHaveLength(1);
  });

  it('is bounded, so a long-running device cannot fill its own storage', () => {
    for (let i = 0; i < 60; i += 1) {
      archiveStory('child-1', `story-${i}`, { ...STORY, title: `Story ${i}` });
    }
    const entries = archiveEntries();
    expect(entries).toHaveLength(50);
    // The cap drops the OLDEST, so the most recent read is always present.
    expect(entries[0]!.title).toBe('Story 59');
  });

  it('survives a corrupt archive rather than losing the reading loop', () => {
    localStorage.setItem('qissa.archive', 'not json at all');
    expect(archiveEntries()).toEqual([]);
    expect(() => archiveStory('child-1', 'story-1', STORY)).not.toThrow();
  });
});
