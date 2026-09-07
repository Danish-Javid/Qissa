/**
 * @qissa/video — the personalized phonics song.
 *
 * The barrel deliberately does NOT re-export the compositions or call
 * registerRoot; see entry.ts. The server needs the props contract and the
 * render function, and nothing else.
 */
export * from './props.js';
export * from './render.js';
