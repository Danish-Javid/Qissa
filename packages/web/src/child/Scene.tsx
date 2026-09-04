/**
 * Scene — the picture-book world behind every child screen.
 *
 * Every story (and every toddler session) gets its OWN world: the seed
 * deterministically picks the sky palette, sun or moon, hill shapes, and a
 * few extras (rainbow, balloon, birds, tree, kite…), so no two sessions
 * open on the same sky — "not the same cat and sun every time".
 *
 * Why variety matters (research): infant attention is captured by novelty
 * and habituates to repetition (Fantz 1964, novelty-preference paradigm),
 * so a fresh-but-coherent world keeps the backdrop engaging. It stays
 * decorative and uncluttered on purpose — a few elements, one clear moment —
 * because busy backgrounds compete with the words we are teaching.
 *
 * Flat layered SVG + CSS: zero network requests, offline-perfect, CSP-safe.
 * The whole scene is decorative: pointer-events pass straight through and
 * screen readers skip it entirely.
 */
import type { ThemeId } from '@qissa/core';
import { useMemo } from 'react';
import type { CSSProperties } from 'react';

/** Theme -> sky mood. Courage is bright noon; kindness is golden hour… */
const SKIES: Record<ThemeId, [string, string]> = {
  courage: ['#9edcf0', '#d8f1f7'],
  sharing: ['#aee3f2', '#eaf7ee'],
  patience: ['#bcd9ef', '#f0f4e8'],
  honesty: ['#a5e0e8', '#eef8f0'],
  kindness: ['#ffd9a3', '#fff3dd'],
  gratitude: ['#ffc98f', '#ffedd2'],
  perseverance: ['#9fd0e8', '#e2f2f4'],
  apologising: ['#c9d8f0', '#eef1f8'],
  curiosity: ['#8fd8d0', '#e6f6ef'],
  teamwork: ['#98c6ea', '#f2f2e2'],
  empathy: ['#f7c8c0', '#fdf0e4'],
  'self-control': ['#c5c9ee', '#eceef8']
};

/** Grassland pairs — every world grows its own hills. */
const GRASSES: ReadonlyArray<readonly [string, string]> = [
  ['#8ab17d', '#5f9e52'],
  ['#90be6d', '#588157'],
  ['#a3b18a', '#6a994e'],
  ['#7fb069', '#4f772d'],
  ['#b5c99a', '#718355']
];

const FLOWER_COLORS = ['#e76f51', '#e9c46a', '#f4a259', '#f28ab2', '#7cc9e6'];

/** Cloud slots — full literal class strings (Tailwind sees them at build),
 *  plus drift duration/delay. Count chosen per world. */
const CLOUD_SLOTS: ReadonlyArray<readonly [string, string, string]> = [
  ['left-0 top-[10%] w-40', '90s', '0s'],
  ['left-0 top-[22%] w-28 opacity-80', '130s', '-40s'],
  ['left-0 top-[5%] w-24 opacity-70', '160s', '-90s']
];

/** Hill path pairs (back, front) in an 800x300 box — one per world. */
const HILLS: ReadonlyArray<readonly [string, string]> = [
  [
    'M0 190 Q 200 90 420 170 T 800 150 L 800 300 L 0 300 Z',
    'M0 250 Q 260 160 520 235 T 800 230 L 800 300 L 0 300 Z'
  ],
  [
    'M0 160 Q 260 70 480 150 T 800 130 L 800 300 L 0 300 Z',
    'M0 240 Q 180 170 420 240 T 800 220 L 800 300 L 0 300 Z'
  ],
  [
    'M0 200 Q 160 110 380 180 T 800 170 L 800 300 L 0 300 Z',
    'M0 255 Q 300 175 560 245 T 800 240 L 800 300 L 0 300 Z'
  ]
];

function hashSeed(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
}

/** Deterministic PRNG (mulberry32) — same seed, same world, every render. */
function mulberry(a: number): () => number {
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = Math.imul(t + (t >>> 7), t | 61) ^ t;
    return ((t ^ (t >>> 1)) >>> 0) / 4294967296;
  };
}

interface World {
  skyTop: string;
  skyBottom: string;
  grass: string;
  grassDeep: string;
  celestial: 'sun' | 'lowsun' | 'moon';
  celestialRight: boolean;
  clouds: number;
  rainbow: boolean;
  balloon: boolean;
  birds: boolean;
  tree: boolean;
  kite: boolean;
  hillVariant: number;
  flowers: ReadonlyArray<{ x: number; y: number; c: string }>;
}

/** Roll a world from the seed. Half the time the theme's own sky leads,
 *  half the time a cousin palette — mood stays, novelty arrives. */
function buildWorld(seed: string | undefined, theme: ThemeId): World {
  const rnd = mulberry(seed === undefined ? 20260904 : hashSeed(seed));
  const themeSky = SKIES[theme] ?? SKIES.sharing;
  const skyChoices = Object.values(SKIES);
  const sky = rnd() < 0.45 ? themeSky : (skyChoices[Math.floor(rnd() * skyChoices.length)] ?? themeSky);
  const grassPair = GRASSES[Math.floor(rnd() * GRASSES.length)] ?? (GRASSES[0] as [string, string]);
  const c = rnd();
  const celestial: World['celestial'] = c < 0.55 ? 'sun' : c < 0.82 ? 'lowsun' : 'moon';
  const flowers = Array.from({ length: 2 + Math.floor(rnd() * 3) }, () => ({
    x: 60 + Math.floor(rnd() * 680),
    y: 246 + Math.floor(rnd() * 26),
    c: FLOWER_COLORS[Math.floor(rnd() * FLOWER_COLORS.length)] ?? '#e76f51'
  }));
  return {
    skyTop: sky[0],
    skyBottom: sky[1],
    grass: grassPair[0],
    grassDeep: grassPair[1],
    celestial,
    celestialRight: rnd() < 0.5,
    clouds: 1 + Math.floor(rnd() * 3),
    rainbow: rnd() < 0.3,
    balloon: rnd() < 0.3,
    birds: rnd() < 0.45,
    tree: rnd() < 0.45,
    kite: rnd() < 0.22,
    hillVariant: Math.floor(rnd() * HILLS.length),
    flowers
  };
}

interface Props {
  theme?: ThemeId;
  /** Story id / child id — the world is re-rolled per seed. */
  seed?: string;
}

export function Scene({ theme = 'sharing', seed }: Props) {
  const world = useMemo(() => buildWorld(seed, theme), [seed, theme]);
  const [backHill, frontHill] = HILLS[world.hillVariant] ?? (HILLS[0] as [string, string]);
  const side = world.celestialRight ? 'right-[4%]' : 'left-[4%]';

  return (
    <div
      aria-hidden
      className="pointer-events-none absolute inset-0 overflow-hidden"
      style={{ background: `linear-gradient(to bottom, ${world.skyTop}, ${world.skyBottom} 62%, ${world.grass})` }}
    >
      {/* One sky-light per world: rayed sun, low soft sun, or moon + stars. */}
      {world.celestial === 'moon' ? (
        <svg className={`absolute ${side} top-[4%] h-36 w-36`} viewBox="0 0 120 120">
          <path d="M70 16 a40 40 0 1 0 0 80 a32 32 0 1 1 0 -80" fill="#f6e7b2" />
          <circle cx="94" cy="30" r="4" fill="#fff3dd" />
          <circle cx="104" cy="52" r="3" fill="#fff3dd" />
          <circle cx="88" cy="70" r="2.5" fill="#fff3dd" />
        </svg>
      ) : world.celestial === 'lowsun' ? (
        <svg className={`absolute ${side} top-[14%] h-40 w-40`} viewBox="0 0 120 120">
          <circle cx="60" cy="60" r="34" fill="#ffd98e" />
          <circle cx="60" cy="60" r="34" fill="none" stroke="#f4a259" strokeWidth="3" opacity="0.6" />
        </svg>
      ) : (
        <svg className={`absolute ${side} top-[4%] h-36 w-36`} viewBox="0 0 120 120">
          <g className="sun-rays">
            {Array.from({ length: 8 }, (_, i) => (
              <rect key={i} x="57" y="2" width="6" height="20" rx="3" fill="#ffd166" transform={`rotate(${i * 45} 60 60)`} />
            ))}
          </g>
          <circle cx="60" cy="60" r="26" fill="#ffcf4d" />
          <circle cx="60" cy="60" r="26" fill="none" stroke="#f4a259" strokeWidth="3" />
        </svg>
      )}

      {/* A few clouds on slow independent drifts (CSS keyframes). */}
      {CLOUD_SLOTS.slice(0, world.clouds).map(([cls, dur, delay], i) => (
        <Cloud
          key={i}
          className={`cloud-drift ${cls}`}
          style={{ animationDuration: dur, animationDelay: delay }}
        />
      ))}

      {/* Rare sky treats — at most a couple per world, never cluttered. */}
      {world.rainbow && (
        <svg className="absolute right-[8%] top-[16%] h-40 w-72 opacity-80" viewBox="0 0 200 100">
          {['#e76f51', '#f4a259', '#e9c46a', '#8ab17d', '#7cc9e6'].map((color, i) => (
            <path
              key={color}
              d={`M${20 + i * 9} 100 A ${80 - i * 9} ${80 - i * 9} 0 0 1 ${180 - i * 9} 100`}
              stroke={color}
              strokeWidth="8"
              fill="none"
            />
          ))}
        </svg>
      )}
      {world.balloon && (
        <svg className="absolute left-[12%] top-[12%] h-36 w-24" viewBox="0 0 80 120">
          <circle cx="40" cy="38" r="28" fill="#e76f51" />
          <path d="M28 60 q12 14 24 0" fill="#e76f51" />
          <path d="M32 62 L36 88 M48 62 L44 88" stroke="#b0713a" strokeWidth="2.5" />
          <rect x="32" y="88" width="16" height="13" rx="3" fill="#b0713a" />
        </svg>
      )}
      {world.kite && (
        <svg className="absolute right-[16%] top-[8%] h-32 w-20" viewBox="0 0 60 110">
          <path d="M30 4 L48 34 L30 64 L12 34 Z" fill="#f4a259" stroke="#e76f51" strokeWidth="2.5" />
          <path d="M30 4 L30 64 M12 34 L48 34" stroke="#e76f51" strokeWidth="2" />
          <path d="M30 64 q-8 14 2 22 q10 8 0 20" stroke="#7cc9e6" strokeWidth="2.5" fill="none" />
        </svg>
      )}
      {world.birds && (
        <svg className="absolute left-[30%] top-[10%] h-16 w-40" viewBox="0 0 140 50">
          <path d="M10 26 Q 18 12 26 26 Q 34 12 42 26" stroke="#4a6fa5" strokeWidth="3.5" fill="none" strokeLinecap="round" />
          <path d="M78 16 Q 85 4 92 16 Q 99 4 106 16" stroke="#4a6fa5" strokeWidth="3" fill="none" strokeLinecap="round" />
        </svg>
      )}

      {/* Back hill, front hill, a tree maybe, and this world's flowers. */}
      <svg className="absolute bottom-0 left-0 h-[42%] w-full" viewBox="0 0 800 300" preserveAspectRatio="none">
        <path d={backHill} fill={world.grassDeep} opacity="0.55" />
        <path d={frontHill} fill={world.grass} />
        {world.tree && (
          <g>
            <rect x="672" y="196" width="14" height="52" rx="6" fill="#8a5a3b" />
            <circle cx="679" cy="176" r="34" fill={world.grassDeep} />
            <circle cx="660" cy="190" r="22" fill={world.grassDeep} />
            <circle cx="700" cy="190" r="22" fill={world.grassDeep} />
          </g>
        )}
        {world.flowers.map((f, i) => (
          <g key={i}>
            <path d={`M${f.x} ${f.y} v26`} stroke={world.grassDeep} strokeWidth="5" strokeLinecap="round" />
            <circle cx={f.x} cy={f.y} r="11" fill={f.c} />
            <circle cx={f.x} cy={f.y} r="4.5" fill="#fff3dd" />
          </g>
        ))}
      </svg>
    </div>
  );
}

function Cloud({ className, style }: { className?: string; style?: CSSProperties }) {
  return (
    <svg className={`absolute ${className ?? ''}`} style={style} viewBox="0 0 140 60">
      <ellipse cx="45" cy="40" rx="34" ry="18" fill="#ffffff" />
      <ellipse cx="85" cy="34" rx="38" ry="22" fill="#ffffff" />
      <ellipse cx="110" cy="44" rx="26" ry="14" fill="#ffffff" />
    </svg>
  );
}
