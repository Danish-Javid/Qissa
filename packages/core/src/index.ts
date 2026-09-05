/**
 * @qissa/core public surface.
 *
 * Everything the server and the browser share: the data spine, the four
 * deterministic pedagogy engines (decodability, correction ladder, PEER,
 * progression), the miscue classifier with accent tolerance, and the
 * learner model. No network, no I/O, no LLM — this package must run
 * identically offline in the browser (NFR-5.2) and on the server.
 */

// Domain contract
export * from './types.js';

// The three-mode model (First Words 1-2, Learn to Read 3-6, Story Time 1-6
// common) + per-child parental controls. Pure, so the server routes and the
// browser home agree on which doors a child sees.
export * from './modes.js';

// Data spine (NFR-8.1: curriculum is data, not code)
export * from './data/index.js';

// Pedagogy engines (NFR-8.4: deterministic, never model discretion)
export * from './pedagogy/graphemes.js';
export * from './pedagogy/decodability.js';
export * from './pedagogy/teaching.js';
export * from './pedagogy/lesson.js';
export * from './pedagogy/pictogram.js';
export * from './pedagogy/accent.js';
export * from './pedagogy/miscue.js';
export * from './pedagogy/correction-ladder.js';
export * from './pedagogy/peer.js';
export * from './pedagogy/progression.js';

// Bilingual parent layer + the deterministic "why" explainer (FR-J, FR-I.9)
export * from './i18n/index.js';

// Learner model — the moat (FR-F)
export * from './learner/spaced-repetition.js';
export * from './learner/learner-model.js';
