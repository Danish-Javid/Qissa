/**
 * Bilingual parent layer (FR-J). Lives in core, not web, because the digest
 * explanations must read identically on the server (for a rendered/printed
 * summary) and in an offline browser.
 */
export * from './locale.js';
export * from './messages.js';
export * from './translate.js';
export * from './explain.js';
