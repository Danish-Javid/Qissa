/**
 * The phonics song, as a component.
 *
 * House style follows the app: paper ground, three flat inks, Andika (the
 * typeface the reading screen uses, chosen because its letterforms match what
 * a child is taught to write — a video that showed a double-storey "a" would
 * contradict the reading screen it is meant to reinforce).
 *
 * Motion is deliberately gentle and slow. This is watched by two- to
 * six-year-olds, and the fast cutting of commercial phonics videos is a known
 * attention cost, so every transition here is a soft scale-and-fade rather
 * than a hard cut, and nothing flashes.
 */
import React from 'react';
import { AbsoluteFill, Audio, Img, Sequence, interpolate, spring, useCurrentFrame, useVideoConfig } from 'remotion';
import type { PhonicsSongProps, RenderScene } from './props.js';

/** The app's palette — paper, ink, and the two accents. */
const PAPER = '#fdf6e8';
const INK = '#2b2118';
const ACCENT = '#c8452f';
const ACCENT_SOFT = '#e8b4a0';

const FONT = "'Andika', 'Trebuchet MS', system-ui, sans-serif";

/** Fade in over the first third of a second and out over the last. */
function useEnvelope(durationInFrames: number): number {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const edge = Math.min(Math.round(fps / 3), Math.floor(durationInFrames / 2));
  if (edge <= 0) return 1;
  return interpolate(
    frame,
    [0, edge, durationInFrames - edge, durationInFrames],
    [0, 1, 1, 0],
    { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }
  );
}

/**
 * The picture for a scene: the drawing when it arrived, the emoji when it did
 * not.
 *
 * The emoji is not a loading state here — by render time the outcome is already
 * known — but it is still the fallback, for the same reason it is in the app:
 * a child should never be shown an empty box, and one failed vendor call must
 * not put a hole in a video a parent is about to share.
 */
function ScenePicture({ scene }: { scene: RenderScene }): React.ReactElement | null {
  if (scene.imageSrc !== null) {
    return (
      <Img
        src={scene.imageSrc}
        style={{
          width: 620,
          height: 620,
          objectFit: 'cover',
          borderRadius: 48,
          boxShadow: '0 24px 60px rgba(43, 33, 24, 0.18)'
        }}
      />
    );
  }
  if (scene.emoji === undefined) return null;
  return (
    <div
      style={{
        width: 620,
        height: 620,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontSize: 380,
        background: '#ffffffbf',
        borderRadius: 48
      }}
    >
      {scene.emoji}
    </div>
  );
}

/** The sound scene: one huge grapheme, breathing. */
function SoundCard({ scene }: { scene: RenderScene }): React.ReactElement {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const pop = spring({ frame, fps, config: { damping: 200 }, durationInFrames: Math.round(fps * 0.6) });
  return (
    <div
      style={{
        fontFamily: FONT,
        fontSize: 520,
        fontWeight: 700,
        color: ACCENT,
        transform: `scale(${interpolate(pop, [0, 1], [0.7, 1])})`,
        lineHeight: 1
      }}
    >
      {scene.display}
    </div>
  );
}

/**
 * The blend scene: graphemes appear one at a time, then the whole word.
 *
 * This mirrors the correction ladder's segmentation step exactly — sound each
 * part, then put it together — so the video teaches the same move the tutor
 * does, rather than a second, competing one.
 */
function BlendCard({ scene }: { scene: RenderScene }): React.ReactElement {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const parts = scene.parts ?? [];
  // Reveals fill the first 65% of the scene; the rest belongs to the assembled
  // word, which is the moment the scene exists for.
  const window = scene.durationInFrames * 0.65;
  const per = parts.length > 0 ? window / parts.length : window;

  // The two states CROSS-FADE in the same place rather than stacking, and that
  // is both a layout fix and the clearer teaching.
  //
  // Stacked, the invisible half still occupied its space, so for the first two
  // thirds of the scene the sounds sat high above a large empty gap — a still
  // from mid-scene looked like a rendering fault. Swapping them in place also
  // says the right thing: these sounds BECOME this word, rather than the word
  // being a third item in a list.
  const merge = interpolate(frame, [window, window + fps * 0.4], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp'
  });

  return (
    <div style={{ display: 'grid', placeItems: 'center' }}>
      <div style={{ gridArea: '1 / 1', display: 'flex', gap: 40, opacity: 1 - merge }}>
        {parts.map((part, index) => {
          const shown = frame > index * per;
          return (
            <div
              key={`${scene.id}-${index}`}
              style={{
                fontFamily: FONT,
                fontSize: 220,
                fontWeight: 700,
                color: ACCENT,
                opacity: shown ? 1 : 0.12,
                transform: `translateY(${shown ? 0 : 24}px)`
              }}
            >
              {part}
            </div>
          );
        })}
      </div>
      <div
        style={{
          gridArea: '1 / 1',
          fontFamily: FONT,
          fontSize: 260,
          fontWeight: 700,
          color: INK,
          opacity: merge,
          transform: `scale(${interpolate(merge, [0, 1], [0.85, 1])})`
        }}
      >
        {scene.display}
      </div>
    </div>
  );
}

/** A word scene: the picture, the word, and the sound highlighted inside it. */
function WordCard({ scene }: { scene: RenderScene }): React.ReactElement {
  const word = scene.word ?? scene.display;
  const grapheme = scene.grapheme;
  // Highlight the target sound WHERE IT ACTUALLY IS. Splitting on the first
  // occurrence rather than assuming position is what lets the same component
  // handle "lap" and "pink" — the sound is not always at the front, which is
  // the same fact that decides how the line is narrated.
  const at = grapheme === undefined ? -1 : word.indexOf(grapheme);
  const head = at < 0 ? word : word.slice(0, at);
  const hit = at < 0 ? '' : word.slice(at, at + (grapheme?.length ?? 0));
  const tail = at < 0 ? '' : word.slice(at + (grapheme?.length ?? 0));

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 56 }}>
      <ScenePicture scene={scene} />
      <div style={{ fontFamily: FONT, fontSize: 200, fontWeight: 700, color: INK, lineHeight: 1 }}>
        {head}
        <span style={{ color: ACCENT }}>{hit}</span>
        {tail}
      </div>
    </div>
  );
}

/** Intro, recap and outro all share one centred-text treatment. */
function TitleCard({ scene, size }: { scene: RenderScene; size: number }): React.ReactElement {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const rise = spring({ frame, fps, config: { damping: 200 }, durationInFrames: Math.round(fps * 0.8) });
  return (
    <div
      style={{
        fontFamily: FONT,
        fontSize: size,
        fontWeight: 700,
        color: INK,
        textAlign: 'center',
        maxWidth: 1500,
        transform: `translateY(${interpolate(rise, [0, 1], [40, 0])}px)`
      }}
    >
      {scene.display}
    </div>
  );
}

function SceneBody({ scene }: { scene: RenderScene }): React.ReactElement {
  switch (scene.kind) {
    case 'sound':
      return <SoundCard scene={scene} />;
    case 'blend':
      return <BlendCard scene={scene} />;
    case 'word':
    case 'review':
      return <WordCard scene={scene} />;
    case 'intro':
      return <TitleCard scene={scene} size={140} />;
    case 'recap':
      return <TitleCard scene={scene} size={120} />;
    case 'outro':
      return <TitleCard scene={scene} size={150} />;
  }
}

function SceneFrame({ scene }: { scene: RenderScene }): React.ReactElement {
  const opacity = useEnvelope(scene.durationInFrames);
  return (
    <AbsoluteFill
      style={{
        alignItems: 'center',
        justifyContent: 'center',
        opacity,
        // Clear the standing footer. Without this the descender of a word like
        // "lap" ran straight through the caption text — the kind of collision
        // that only shows up on a word that HAS a descender, so it survives
        // any amount of checking against "sun" and "cat".
        paddingBottom: 130
      }}
    >
      <SceneBody scene={scene} />
      {/* A scene whose narration failed plays silent rather than failing the
          render — the pictures and words still teach the sound. */}
      {scene.audioSrc === null ? null : <Audio src={scene.audioSrc} />}
    </AbsoluteFill>
  );
}

export function PhonicsSong({ scenes, targetGrapheme, childName }: PhonicsSongProps): React.ReactElement {
  let offset = 0;
  return (
    <AbsoluteFill style={{ backgroundColor: PAPER }}>
      {scenes.map((scene) => {
        const from = offset;
        offset += scene.durationInFrames;
        return (
          <Sequence key={scene.id} from={from} durationInFrames={scene.durationInFrames} name={scene.id}>
            <SceneFrame scene={scene} />
          </Sequence>
        );
      })}
      {/* A quiet standing footer, so a clip shared out of context still says
          whose video it is and what it taught. */}
      <AbsoluteFill style={{ alignItems: 'center', justifyContent: 'flex-end', padding: 48 }}>
        <div style={{ fontFamily: FONT, fontSize: 34, color: ACCENT_SOFT }}>
          {childName} · the sound {targetGrapheme} · Qissa
        </div>
      </AbsoluteFill>
    </AbsoluteFill>
  );
}
