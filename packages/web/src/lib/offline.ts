/**
 * Offline story cache (NFR-5.2) — the degraded-mode rung.
 *
 * Every story the server serves is mirrored into localStorage. When the
 * network is down or the pipeline answers 503, the child still reads: the
 * last mirrored story plays in a local-only mode (tap-to-advance, no ASR,
 * no session row). Nothing about the child's voice ever touches this path.
 *
 * Storage is bounded to one story per child — a few kilobytes of text.
 */
import type { Story } from '@qissa/core';

const PREFIX = 'qissa.offline.story.';

export function mirrorStory(childId: string, storyId: string, story: Story): void {
  try {
    localStorage.setItem(PREFIX + childId, JSON.stringify({ storyId, story, mirroredAt: new Date().toISOString() }));
  } catch {
    // Storage full or blocked: offline mode simply degrades. Never fatal.
  }
}

export interface OfflineStory {
  storyId: string;
  story: Story;
  mirroredAt: string;
}

export function cachedStory(childId: string): OfflineStory | null {
  try {
    const raw = localStorage.getItem(PREFIX + childId);
    if (raw === null) return null;
    const parsed = JSON.parse(raw) as OfflineStory;
    // Minimal shape check — never trust storage blindly.
    if (typeof parsed.story?.title !== 'string' || !Array.isArray(parsed.story.pages)) return null;
    return parsed;
  } catch {
    return null;
  }
}

/** Served-stories archive for the parent screen (device-local only). */
const ARCHIVE_KEY = 'qissa.archive';

export interface ArchiveEntry {
  childId: string;
  storyId: string;
  title: string;
  level: number;
  targetGrapheme: string;
  servedAt: string;
}

export function archiveStory(childId: string, storyId: string, story: Story): void {
  try {
    const list = archiveEntries();
    if (list.some((e) => e.storyId === storyId)) return;
    list.unshift({
      childId,
      storyId,
      title: story.title,
      level: story.level,
      targetGrapheme: story.targetGrapheme,
      servedAt: new Date().toISOString()
    });
    localStorage.setItem(ARCHIVE_KEY, JSON.stringify(list.slice(0, 50)));
  } catch {
    // Archive is a nicety; its failure must never interrupt reading.
  }
}

export function archiveEntries(): ArchiveEntry[] {
  try {
    const raw = localStorage.getItem(ARCHIVE_KEY);
    return raw === null ? [] : (JSON.parse(raw) as ArchiveEntry[]);
  } catch {
    return [];
  }
}
