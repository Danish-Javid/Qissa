/**
 * The Remotion root — the composition registry.
 *
 * `defaultProps` is a real, playable one-scene song rather than empty arrays,
 * so `npm run studio -w @qissa/video` opens something you can watch and iterate
 * on without a database, a vendor key or a running server. Every prop here is
 * overridden by the server at render time.
 */
import React from 'react';
import { Composition } from 'remotion';
import { PhonicsSong } from './PhonicsSong.js';
import {
  PHONICS_SONG_ID,
  VIDEO_FPS,
  VIDEO_HEIGHT,
  VIDEO_WIDTH,
  totalDurationInFrames,
  type PhonicsSongProps
} from './props.js';

const PREVIEW: PhonicsSongProps = {
  childName: 'Ayla',
  targetGrapheme: 's',
  city: 'Lahore',
  scenes: [
    {
      id: 'intro',
      kind: 'intro',
      display: "Ayla's Sound Song",
      audioSrc: null,
      imageSrc: null,
      durationInFrames: VIDEO_FPS * 3
    },
    {
      id: 'sound-s',
      kind: 'sound',
      display: 's',
      grapheme: 's',
      audioSrc: null,
      imageSrc: null,
      durationInFrames: VIDEO_FPS * 3
    },
    {
      id: 'word-sun',
      kind: 'word',
      display: 'sun',
      grapheme: 's',
      word: 'sun',
      emoji: '☀️',
      audioSrc: null,
      imageSrc: null,
      durationInFrames: VIDEO_FPS * 3
    },
    {
      id: 'blend-sun',
      kind: 'blend',
      display: 'sun',
      grapheme: 's',
      word: 'sun',
      parts: ['s', 'u', 'n'],
      audioSrc: null,
      imageSrc: null,
      durationInFrames: VIDEO_FPS * 4
    },
    {
      id: 'outro',
      kind: 'outro',
      display: 'Well done, Ayla!',
      audioSrc: null,
      imageSrc: null,
      durationInFrames: VIDEO_FPS * 3
    }
  ]
};

export function RemotionRoot(): React.ReactElement {
  return (
    <Composition
      id={PHONICS_SONG_ID}
      component={PhonicsSong}
      fps={VIDEO_FPS}
      width={VIDEO_WIDTH}
      height={VIDEO_HEIGHT}
      defaultProps={PREVIEW}
      durationInFrames={totalDurationInFrames(PREVIEW.scenes)}
      // Duration is a function of the narration, which the server measures and
      // passes in. Recomputing it here means the composition is correct for
      // whatever props arrive, instead of trusting a constant that would
      // silently truncate a longer song or pad a shorter one with dead frames.
      calculateMetadata={({ props }) => ({
        durationInFrames: totalDurationInFrames(props.scenes)
      })}
    />
  );
}
