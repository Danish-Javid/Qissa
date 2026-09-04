/**
 * Celebration — the end-of-story reward moment.
 *
 * Falling confetti + earned stars, fired exactly once per story close.
 * Pieces are generated deterministically from a seed (no Math.random in
 * render — StrictMode would double-render a different shower), and the
 * whole layer respects prefers-reduced-motion (pieces hide; the stars and
 * sound carry the celebration instead).
 */
import { useMemo } from 'react';
import { sfx } from '../lib/sfx.js';

const COLORS = ['#2a9d8f', '#f4a259', '#e76f51', '#e9c46a', '#8ab17d', '#7cc9e6'];

interface Props {
  /** Stars the child earned this session — shown big and proud. */
  stars: number;
}

export function Celebration({ stars }: Props) {
  // One fanfare per mount: the celebration IS the moment it plays in.
  useMemo(() => sfx.fanfare(), []);

  // 36 pieces with stable pseudo-random placement; deterministic mulberry32.
  const pieces = useMemo(() => {
    let s = 0x9e3779b9;
    const rnd = (): number => {
      s = Math.imul(s ^ (s >>> 15), s | 1);
      s ^= s + Math.imul(s ^ (s >>> 7), s | 61);
      return ((s ^ (s >>> 14)) >>> 0) / 4294967296;
    };
    return Array.from({ length: 36 }, (_, i) => ({
      id: i,
      left: `${Math.round(rnd() * 100)}%`,
      color: COLORS[i % COLORS.length],
      duration: `${(2.6 + rnd() * 2.2).toFixed(2)}s`,
      delay: `${(rnd() * 1.4).toFixed(2)}s`
    }));
  }, []);

  return (
    <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden">
      {pieces.map((p) => (
        <span
          key={p.id}
          className="confetti-piece"
          style={{ left: p.left, background: p.color, animationDuration: p.duration, animationDelay: p.delay }}
        />
      ))}
      {/* The earned-star row rises in sequence — the visible "what you did". */}
      <div className="absolute inset-x-0 top-[16%] flex justify-center gap-3">
        {Array.from({ length: Math.max(1, stars) }, (_, i) => (
          <span key={i} className="star-rise text-5xl drop-shadow-sm" style={{ animationDelay: `${300 + i * 220}ms` }}>
            ⭐
          </span>
        ))}
      </div>
    </div>
  );
}
