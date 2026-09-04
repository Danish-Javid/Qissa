/**
 * Child home — the two-tap door (plan: home = two taps).
 *
 * One tiny call resolves the child's three-mode picture (server-derived age →
 * learning track, plus the parent's Story Time toggle and pace), and the home
 * screen shows exactly the doors this child is meant to see:
 *
 *   Door 1 — the age-matched learning track, the bright primary action:
 *            • First Words (ages 1–2)  → EarlyPlayer (picture cards + kindness)
 *            • Learn to Read (ages 3–6) → LearnToReadPlayer (the standalone
 *              "Toddlers Can Read" phonics lesson — sounds, blending, sight
 *              words — NOT a story)
 *   Door 2 — the common Story Time door (listening + watching), whenever the
 *            parent has it enabled → StoryTimePlayer.
 *
 * Visual language: the picture-book Scene, Buddy the companion, and one bright
 * primary action (brightness = hierarchy, per children's-UX research). No text
 * the child must parse to operate the app; every player owns its own loading
 * and degraded states, so the child never sees an error.
 */
import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import type { LearningTrack, StoryPacing } from '@qissa/core';
import { api } from '../api/client.js';
import type { ChildSummary, MetricsResponse } from '../api/types.js';
import { sfx } from '../lib/sfx.js';
import { Buddy } from './Buddy.js';
import { EarlyPlayer } from './EarlyPlayer.js';
import { LearnToReadPlayer } from './LearnToReadPlayer.js';
import { Scene } from './Scene.js';
import { StoryTimePlayer } from './StoryTimePlayer.js';

type Phase = 'home' | 'early' | 'lesson' | 'storytime' | 'grownup';

/** The resolved three-mode picture for this child, straight from the children
 *  list. The server derives the true age and applies the parent's controls, so
 *  the client never recomputes age and can never disagree with the parental
 *  gate. null until the list lands. */
interface MeInfo {
  learningTrack: LearningTrack;
  storyTimeEnabled: boolean;
  storyPacing: StoryPacing;
}

export function ChildHome() {
  const { childId } = useParams();
  const [phase, setPhase] = useState<Phase>('home');
  // Provider mode decides voice output (silent-WAV mock vs vendor audio).
  const [mockMode, setMockMode] = useState(true);
  const [me, setMe] = useState<MeInfo | null>(null);

  useEffect(() => {
    if (childId === undefined) return;
    api
      .get<MetricsResponse>('/metrics-demo')
      .then((m) => setMockMode(m.providerMode === 'mock'))
      .catch(() => undefined); // defaults above cover the failure
  }, [childId]);

  // One tiny call decides the doors: the children list carries the
  // server-resolved mode picture (age → learning track, plus the parent's
  // Story Time toggle and pace), so the client never recomputes age and cannot
  // disagree with the parental gate. On failure, fall back to the reading
  // track with Story Time on — the safest, richest default.
  useEffect(() => {
    if (childId === undefined) return;
    api
      .get<ChildSummary[]>('/children')
      .then((children) => {
        const found = children.find((c) => c.id === childId);
        if (found === undefined) {
          setPhase('grownup'); // not this parent's child (or deleted)
          return;
        }
        setMe({
          learningTrack: found.learningTrack,
          storyTimeEnabled: found.storyTimeEnabled,
          storyPacing: found.storyPacing
        });
      })
      .catch(() => setMe({ learningTrack: 'learn-to-read', storyTimeEnabled: true, storyPacing: 'fluent' }));
  }, [childId]);

  if (childId === undefined) return null;
  // Bind the narrowed value so closures below see a definite string.
  const cid = childId;

  function startEarly(): void {
    sfx.tap();
    setPhase('early');
  }

  // Learn to Read (ages 3–6) opens the standalone "Toddlers Can Read" phonics
  // lesson — new sounds, blending real words, sight words, a fluency wall and a
  // gift — NOT a story. The player loads its own plan (POST /lessons), so this
  // is a straight hand-off exactly like the other doors.
  function startLesson(): void {
    sfx.tap();
    setPhase('lesson');
  }

  function startStoryTime(): void {
    sfx.tap();
    setPhase('storytime');
  }

  function finish(): void {
    setPhase('home');
  }

  if (phase === 'early') {
    return <EarlyPlayer childId={cid} mockMode={mockMode} onDone={finish} />;
  }

  if (phase === 'lesson') {
    return <LearnToReadPlayer childId={cid} mockMode={mockMode} onDone={finish} />;
  }

  if (phase === 'storytime' && me !== null) {
    return <StoryTimePlayer childId={cid} mockMode={mockMode} pacing={me.storyPacing} onDone={finish} />;
  }

  return (
    <div className="relative h-full overflow-hidden">
      <Scene theme="kindness" seed={cid} />

      <div className="relative z-10 flex h-full flex-col items-center justify-center gap-6 p-8 text-center">
        {phase === 'grownup' ? (
          <>
            {/* Kind face keeps a hand-off gentle, never alarming. */}
            <Buddy mood="kind" size={190} />
            <div className="bubble pop-in max-w-md text-2xl font-bold">
              Please hand the device to a grown-up for a moment.
            </div>
          </>
        ) : me === null ? (
          <>
            <Buddy mood="happy" size={230} />
            <div className="bubble text-3xl font-bold">Getting your doors ready… ✨</div>
          </>
        ) : (
          <>
            <Buddy mood="happy" size={230} />
            <div className="bubble text-3xl font-bold">
              {me.learningTrack === 'first-words' ? 'Ready to explore?' : 'Ready to read?'}
            </div>
            <div className="flex flex-col items-center gap-4">
              {/* Door 1 — the age-matched learning track: the bright primary
                  action, glowing until it gets its tap. First Words explores;
                  Learn to Read opens the phonics lesson. */}
              <button
                type="button"
                className="btn-big btn-face-leaf btn-glow"
                onClick={() => (me.learningTrack === 'first-words' ? startEarly() : startLesson())}
              >
                <span aria-hidden>{me.learningTrack === 'first-words' ? '🌈' : '🔤'}</span>{' '}
                {me.learningTrack === 'first-words' ? "Let's go!" : "Let's read!"}
              </button>
              {/* Door 2 — the common Story Time door (listening + watching),
                  shown whenever the parent has it enabled. Warm and inviting,
                  but never competing with the primary learning action. */}
              {me.storyTimeEnabled ? (
                <button type="button" className="btn-big btn-face-sun" onClick={startStoryTime}>
                  <span aria-hidden>📚</span> Story Time
                </button>
              ) : null}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
