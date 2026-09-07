/**
 * Audio duration tests.
 *
 * Every fixture is built byte by byte from the format specs rather than
 * checked in as a binary, so a failure points at a specific header field
 * instead of at an opaque blob. The numbers on the right-hand side are
 * computed from the spec by hand in the comments — if the parser and the
 * comment disagree, one of them is wrong and it is worth knowing which.
 */
import { describe, expect, it } from 'vitest';
import { audioDurationSeconds, mp3DurationSeconds, wavDurationSeconds } from './duration.js';

function ascii(text: string): number[] {
  return Array.from(text, (c) => c.charCodeAt(0));
}

function u32le(value: number): number[] {
  return [value & 0xff, (value >>> 8) & 0xff, (value >>> 16) & 0xff, (value >>> 24) & 0xff];
}

function u16le(value: number): number[] {
  return [value & 0xff, (value >>> 8) & 0xff];
}

/** A 16-bit mono PCM WAV of `samples` frames at `rate` Hz. */
function wav(samples: number, rate = 16000, extraChunk = false): Uint8Array {
  const byteRate = rate * 2;
  const dataBytes = samples * 2;
  const fmt = [
    ...ascii('fmt '),
    ...u32le(16),
    ...u16le(1), // PCM
    ...u16le(1), // mono
    ...u32le(rate),
    ...u32le(byteRate),
    ...u16le(2),
    ...u16le(16)
  ];
  // A LIST chunk between fmt and data — real encoders emit these, and a parser
  // that assumes data starts at byte 36 reads garbage here.
  const list = extraChunk ? [...ascii('LIST'), ...u32le(4), ...ascii('INFO')] : [];
  const data = [...ascii('data'), ...u32le(dataBytes), ...new Array<number>(dataBytes).fill(0)];
  const body = [...ascii('WAVE'), ...fmt, ...list, ...data];
  return new Uint8Array([...ascii('RIFF'), ...u32le(body.length), ...body]);
}

/**
 * `frames` MPEG-1 Layer III frames at 128 kbps / 44.1 kHz.
 *
 * Frame size = floor(1152 / 8 * 128000 / 44100) = floor(417.96) = 417 bytes.
 * Frame duration = 1152 / 44100 = 0.0261224 s.
 */
function mp3(frames: number, withId3 = false): Uint8Array {
  const FRAME_BYTES = 417;
  const header = [
    0xff,
    0xfb, // sync + MPEG-1, Layer III, no CRC
    0x90, // bitrate index 9 (128 kbps), rate index 0 (44.1 kHz), no padding
    0x00
  ];
  const body: number[] = [];
  for (let i = 0; i < frames; i++) {
    body.push(...header, ...new Array<number>(FRAME_BYTES - 4).fill(0));
  }
  if (!withId3) return new Uint8Array(body);
  // ID3v2 header with a syncsafe size of 100 -> 110 bytes of tag.
  const tag = [...ascii('ID3'), 3, 0, 0, 0, 0, 0, 0x64, ...new Array<number>(100).fill(0)];
  return new Uint8Array([...tag, ...body]);
}

describe('wavDurationSeconds', () => {
  it('measures a plain PCM file', () => {
    expect(wavDurationSeconds(wav(16000))).toBeCloseTo(1, 5);
    expect(wavDurationSeconds(wav(8000))).toBeCloseTo(0.5, 5);
  });

  it('walks chunks instead of assuming data sits at a fixed offset', () => {
    // The bug this guards: hardcoding data at byte 36 makes an encoder that
    // emits a LIST chunk report a wrong (longer) duration, and every scene
    // after it drifts out of sync.
    expect(wavDurationSeconds(wav(16000, 16000, true))).toBeCloseTo(1, 5);
  });

  it('handles a streamed file whose header size was never filled in', () => {
    const bytes = wav(16000);
    // Blank the data chunk size the way a streaming writer leaves it.
    const dataAt = bytes.length - 32000 - 8;
    bytes.set([0xff, 0xff, 0xff, 0xff], dataAt + 4);
    expect(wavDurationSeconds(bytes)).toBeCloseTo(1, 5);
  });

  it('returns null rather than a wrong number for non-WAV bytes', () => {
    expect(wavDurationSeconds(new Uint8Array([1, 2, 3]))).toBeNull();
    expect(wavDurationSeconds(new Uint8Array(ascii('NOTARIFFHEADER')))).toBeNull();
  });

  it('does not loop forever on a malformed chunk size', () => {
    const bytes = new Uint8Array([...ascii('RIFF'), ...u32le(4), ...ascii('WAVE'), ...ascii('junk'), ...u32le(0)]);
    expect(wavDurationSeconds(bytes)).toBeNull();
  });
});

describe('mp3DurationSeconds', () => {
  it('sums real frames', () => {
    expect(mp3DurationSeconds(mp3(1))).toBeCloseTo(1152 / 44100, 6);
    expect(mp3DurationSeconds(mp3(100))).toBeCloseTo((100 * 1152) / 44100, 5);
  });

  it('skips an ID3v2 tag using its syncsafe size', () => {
    expect(mp3DurationSeconds(mp3(50, true))).toBeCloseTo((50 * 1152) / 44100, 5);
  });

  it('is not fooled by counting bytes and dividing', () => {
    // 100 frames of 417 bytes = 41700 bytes. The naive
    // bytes * 8 / bitrate calculation gives 41700*8/128000 = 2.606s, while
    // the true frame-summed duration is 2.612s. They differ because a frame is
    // 417.96 bytes and only whole bytes can be written; over a longer VBR file
    // the gap is far bigger. Assert we are on the frame-count side of it.
    const frames = mp3DurationSeconds(mp3(100));
    expect(frames).not.toBeNull();
    expect(frames as number).toBeGreaterThan((41700 * 8) / 128000);
  });

  it('returns null for bytes containing no frame at all', () => {
    expect(mp3DurationSeconds(new Uint8Array(64))).toBeNull();
    expect(mp3DurationSeconds(new Uint8Array(ascii('this is not audio')))).toBeNull();
  });
});

describe('audioDurationSeconds', () => {
  it('dispatches on the declared format', () => {
    expect(audioDurationSeconds(wav(16000), 'wav')).toBeCloseTo(1, 5);
    expect(audioDurationSeconds(mp3(38), 'mp3')).toBeCloseTo((38 * 1152) / 44100, 5);
  });

  it('reports null rather than guessing when the bytes do not parse', () => {
    // The caller substitutes a length estimate from the text. Returning 0 here
    // instead would collapse the scene to nothing and drop its narration.
    expect(audioDurationSeconds(new Uint8Array([0, 1, 2]), 'wav')).toBeNull();
    expect(audioDurationSeconds(new Uint8Array([0, 1, 2]), 'mp3')).toBeNull();
  });
});
