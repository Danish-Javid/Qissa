/**
 * Buddy — Qissa's reading companion, drawn in code.
 *
 * Pedagogical-agent research (meta-analyses of on-screen learning
 * companions) finds a character that reacts to the child measurably lifts
 * engagement and learning — especially for young learners. Buddy is the
 * story-world pet made visible: she listens while the child reads, cheers
 * on success, tilts her head while a tricky word is being fixed, and never
 * shows disappointment.
 *
 * She is a single inline SVG — no image assets ship, so the PWA stays
 * offline-perfect and the CSP never loosens. Mood is the only state the
 * screens drive; every mood is a feedback signal, never decoration.
 */
export type BuddyMood = 'happy' | 'cheer' | 'listen' | 'think' | 'kind';

interface Props {
  mood: BuddyMood;
  /** Rendered width/height in px; defaults to a large, friendly 220. */
  size?: number;
  className?: string;
}

export function Buddy({ mood, size = 220, className = '' }: Props) {
  // The root class carries the motion vocabulary (float, cheer, wag speed).
  const motion = mood === 'cheer' ? 'buddy-cheer buddy-cheering' : 'buddy-float';
  // Gentle head tilt while thinking or being kind — reads as empathy.
  const headTilt = mood === 'think' || mood === 'kind' ? 'rotate(-7 100 92)' : undefined;

  return (
    <svg
      viewBox="0 0 200 200"
      width={size}
      height={size}
      className={`${motion} ${className}`}
      aria-hidden
      focusable="false"
    >
      {/* Tail wags from its base; speed changes with the cheering class. */}
      <g className="buddy-tail">
        <path
          d="M152 150 q34 -8 30 -44 q-3 -22 -20 -26"
          fill="none"
          stroke="#e08b3c"
          strokeWidth="14"
          strokeLinecap="round"
        />
      </g>

      {/* Body: one soft rounded shape, two cream paws up front. */}
      <ellipse cx="100" cy="148" rx="58" ry="42" fill="#f4a259" />
      <ellipse cx="100" cy="160" rx="34" ry="26" fill="#fff3dd" />
      <ellipse cx="76" cy="184" rx="16" ry="10" fill="#fff3dd" />
      <ellipse cx="124" cy="184" rx="16" ry="10" fill="#fff3dd" />
      {/* Body stripes — flat picture-book style, never busy. */}
      <path d="M52 132 q10 -8 22 -6" fill="none" stroke="#e08b3c" strokeWidth="7" strokeLinecap="round" />
      <path d="M148 132 q-10 -8 -22 -6" fill="none" stroke="#e08b3c" strokeWidth="7" strokeLinecap="round" />

      <g transform={headTilt}>
        {/* Ears: tall and listening-pricked; pink inside. */}
        <path d="M58 52 L52 12 L88 36 Z" fill="#f4a259" />
        <path d="M142 52 L148 12 L112 36 Z" fill="#f4a259" />
        <path d="M62 44 L59 24 L78 36 Z" fill="#ffb38a" />
        <path d="M138 44 L141 24 L122 36 Z" fill="#ffb38a" />

        {/* Head + cream muzzle. */}
        <circle cx="100" cy="78" r="52" fill="#f4a259" />
        <ellipse cx="100" cy="96" rx="30" ry="22" fill="#fff3dd" />
        {/* Head stripes between the ears. */}
        <path d="M88 30 q2 10 0 16" fill="none" stroke="#e08b3c" strokeWidth="6" strokeLinecap="round" />
        <path d="M100 28 q2 12 0 18" fill="none" stroke="#e08b3c" strokeWidth="6" strokeLinecap="round" />
        <path d="M112 30 q2 10 0 16" fill="none" stroke="#e08b3c" strokeWidth="6" strokeLinecap="round" />

        {/* Whiskers. */}
        <path d="M62 92 h-24 M64 100 h-22 M138 92 h24 M136 100 h22" stroke="#c98a4b" strokeWidth="3" strokeLinecap="round" />

        {/* Nose + mouth. */}
        <path d="M95 90 h10 l-5 7 Z" fill="#e76f51" />
        {mood === 'cheer' ? (
          // Open joyful mouth — the celebration face.
          <path d="M88 104 q12 14 24 0 q-12 8 -24 0" fill="#c9573b" />
        ) : mood === 'listen' ? (
          // Small "o" — she is paying attention to the child's voice.
          <ellipse cx="100" cy="106" rx="5" ry="6" fill="#c9573b" />
        ) : (
          // Calm w-shape smile for happy / think / kind.
          <path d="M88 104 q6 6 12 0 q6 6 12 0" fill="none" stroke="#c9573b" strokeWidth="3.5" strokeLinecap="round" />
        )}

        {/* Eyes are the mood signal children read first. */}
        {mood === 'cheer' ? (
          // Happy arcs — pure delight.
          <>
            <path d="M70 72 q8 -10 16 0" fill="none" stroke="#264653" strokeWidth="5" strokeLinecap="round" />
            <path d="M114 72 q8 -10 16 0" fill="none" stroke="#264653" strokeWidth="5" strokeLinecap="round" />
          </>
        ) : mood === 'kind' ? (
          // Soft half-closed — comforting.
          <>
            <path d="M72 74 q6 5 12 0" fill="none" stroke="#264653" strokeWidth="5" strokeLinecap="round" />
            <path d="M116 74 q6 5 12 0" fill="none" stroke="#264653" strokeWidth="5" strokeLinecap="round" />
          </>
        ) : (
          // Wide round eyes; the listening mood gets a tiny highlight lift.
          <>
            <circle cx="78" cy="72" r="7.5" fill="#264653" />
            <circle cx="122" cy="72" r="7.5" fill="#264653" />
            <circle cx={mood === 'listen' ? 81 : 80} cy={mood === 'listen' ? 68 : 69} r="2.6" fill="#fff3dd" />
            <circle cx={mood === 'listen' ? 125 : 124} cy={mood === 'listen' ? 68 : 69} r="2.6" fill="#fff3dd" />
          </>
        )}
      </g>
    </svg>
  );
}
