/**
 * How long is this audio clip?
 *
 * The video timeline is laid out from the measured length of each narration
 * line, so this number decides whether a word stays on screen exactly as long
 * as it is spoken or drifts a little further out of sync with every scene.
 *
 * Parsed from the bytes rather than shelled out to ffprobe, for three reasons:
 * it is synchronous and cannot fail on a missing binary; it works identically
 * on Windows, Alpine and Debian, which the render path itself does not; and it
 * is a pure function of a byte array, so it can be unit-tested against real
 * fixtures instead of mocked.
 *
 * Both formats the synthesizers produce are handled: the mock returns WAV, the
 * Azure voice returns MP3.
 */

/** A duration that could not be determined — callers substitute an estimate. */
export const UNKNOWN_DURATION = null;

/** MPEG-1/2/2.5 Layer III sample rates, indexed as the frame header encodes them. */
const MPEG_SAMPLE_RATES: Record<number, number[]> = {
  // [MPEG-1, MPEG-2, MPEG-2.5] per rate index
  0: [44100, 22050, 11025],
  1: [48000, 24000, 12000],
  2: [32000, 16000, 8000]
};

/** Bitrates in kbps for Layer III, by version group and bitrate index. */
const LAYER3_BITRATES = {
  mpeg1: [0, 32, 40, 48, 56, 64, 80, 96, 112, 128, 160, 192, 224, 256, 320, 0],
  mpeg2: [0, 8, 16, 24, 32, 40, 48, 56, 64, 80, 96, 112, 128, 144, 160, 0]
};

/**
 * Read a big-endian 32-bit value as UNSIGNED.
 *
 * The `>>> 0` is load-bearing. JavaScript's bitwise operators work on signed
 * int32, so an MP3 frame header — which always begins 0xff — comes back
 * negative, and `(header & 0xffe00000) !== 0xffe00000` then compares
 * -2097152 against 4293918720 and is true for every frame in the file. The
 * parser found no frames at all and reported every MP3 as unmeasurable.
 */
function readU32BE(bytes: Uint8Array, at: number): number {
  return (
    (((bytes[at] ?? 0) << 24) | ((bytes[at + 1] ?? 0) << 16) | ((bytes[at + 2] ?? 0) << 8) | (bytes[at + 3] ?? 0)) >>>
    0
  );
}

/**
 * Read a little-endian 32-bit value as UNSIGNED — same trap as readU32BE.
 *
 * A streaming WAV writer that did not know the final length leaves the data
 * chunk size as 0xffffffff. Read signed that is -1, which fails the
 * `size === 0xffffffff` check AND then trips the `size <= 0` malformed guard,
 * so the file was reported unmeasurable instead of taking its length from the
 * bytes that actually followed.
 */
function readU32LE(bytes: Uint8Array, at: number): number {
  return (
    ((bytes[at] ?? 0) | ((bytes[at + 1] ?? 0) << 8) | ((bytes[at + 2] ?? 0) << 16) | ((bytes[at + 3] ?? 0) << 24)) >>>
    0
  );
}

function tag(bytes: Uint8Array, at: number, length: number): string {
  return String.fromCharCode(...bytes.slice(at, at + length));
}

/**
 * WAV duration, from the header.
 *
 * Chunks are walked rather than assumed to sit at fixed offsets: a WAV file is
 * a RIFF container and real encoders insert LIST/fact/cue chunks before the
 * data, so reading "fmt at 12, data at 36" works on files written by one tool
 * and silently misreports files written by another.
 */
export function wavDurationSeconds(bytes: Uint8Array): number | null {
  if (bytes.length < 12 || tag(bytes, 0, 4) !== 'RIFF' || tag(bytes, 8, 4) !== 'WAVE') return UNKNOWN_DURATION;

  let byteRate = 0;
  let dataBytes = 0;
  let at = 12;

  while (at + 8 <= bytes.length) {
    const id = tag(bytes, at, 4);
    const size = readU32LE(bytes, at + 4);
    const body = at + 8;

    if (id === 'fmt ' && body + 16 <= bytes.length) {
      byteRate = readU32LE(bytes, body + 8);
    } else if (id === 'data') {
      // A streamed WAV can carry size 0 or 0xffffffff because the writer did
      // not know the length yet; the real length is whatever bytes followed.
      dataBytes = size === 0 || size === 0xffffffff ? bytes.length - body : Math.min(size, bytes.length - body);
      break;
    }

    if (size <= 0) break; // malformed: refuse to loop forever
    at = body + size + (size % 2); // RIFF chunks are word-aligned
  }

  if (byteRate <= 0 || dataBytes <= 0) return UNKNOWN_DURATION;
  return dataBytes / byteRate;
}

/** Size of the ID3v2 tag at the start of the file, if there is one. */
function id3Size(bytes: Uint8Array): number {
  if (bytes.length < 10 || tag(bytes, 0, 3) !== 'ID3') return 0;
  // A syncsafe integer: seven bits per byte, so a size can never contain a
  // false frame sync. Read it as such or the offset lands mid-tag.
  const size =
    (((bytes[6] ?? 0) & 0x7f) << 21) |
    (((bytes[7] ?? 0) & 0x7f) << 14) |
    (((bytes[8] ?? 0) & 0x7f) << 7) |
    ((bytes[9] ?? 0) & 0x7f);
  return 10 + size;
}

/**
 * MP3 duration, by walking every frame header.
 *
 * Not `fileSize / bitrate`: the Azure voice returns variable-bitrate audio, and
 * dividing by the first frame's bitrate misreports a VBR file by however much
 * the encoder varied — which would show up as narration running past its own
 * scene. Summing real frames is exact for CBR and VBR alike, and the file is a
 * few seconds long so walking it costs nothing.
 */
export function mp3DurationSeconds(bytes: Uint8Array): number | null {
  let at = id3Size(bytes);
  let seconds = 0;
  let frames = 0;

  while (at + 4 <= bytes.length) {
    const header = readU32BE(bytes, at);
    // 11 sync bits. Masked result forced unsigned for the same reason the
    // read is — `&` yields a signed int32 and would never equal the mask.
    if (((header & 0xffe00000) >>> 0) !== 0xffe00000) {
      at += 1; // not a frame boundary — resync a byte at a time
      continue;
    }

    const versionBits = (header >>> 19) & 0x3;
    const layerBits = (header >>> 17) & 0x3;
    const bitrateIndex = (header >>> 12) & 0xf;
    const rateIndex = (header >>> 10) & 0x3;
    const padding = (header >>> 9) & 0x1;

    // Layer III only (layerBits 0b01); reserved version 0b01 is invalid.
    if (layerBits !== 1 || versionBits === 1 || rateIndex === 3 || bitrateIndex === 0 || bitrateIndex === 15) {
      at += 1;
      continue;
    }

    const versionSlot = versionBits === 3 ? 0 : versionBits === 2 ? 1 : 2; // MPEG-1 / 2 / 2.5
    const sampleRate = MPEG_SAMPLE_RATES[rateIndex]?.[versionSlot];
    const bitrate = (versionSlot === 0 ? LAYER3_BITRATES.mpeg1 : LAYER3_BITRATES.mpeg2)[bitrateIndex];
    if (sampleRate === undefined || bitrate === undefined || bitrate === 0) {
      at += 1;
      continue;
    }

    // MPEG-1 Layer III carries 1152 samples per frame; MPEG-2 and 2.5 carry 576.
    const samplesPerFrame = versionSlot === 0 ? 1152 : 576;
    const frameBytes = Math.floor((samplesPerFrame / 8) * ((bitrate * 1000) / sampleRate)) + padding;
    if (frameBytes <= 0) break;

    seconds += samplesPerFrame / sampleRate;
    frames += 1;
    at += frameBytes;
  }

  return frames > 0 ? seconds : UNKNOWN_DURATION;
}

/**
 * Length of a narration clip, dispatched on the format the synthesizer
 * declared rather than sniffed, since the caller already knows it.
 */
export function audioDurationSeconds(bytes: Uint8Array, format: 'wav' | 'mp3'): number | null {
  return format === 'wav' ? wavDurationSeconds(bytes) : mp3DurationSeconds(bytes);
}
