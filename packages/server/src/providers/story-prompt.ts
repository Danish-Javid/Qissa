/**
 * The story prompt — the single contract every story generator receives.
 *
 * Shared by the Alibaba (Qwen) and Azure (GPT-5.5) providers so both
 * vendors are held to the identical brief; the engine's fail-closed gate
 * re-validates whichever text comes back (FR-I.9).
 */
import { REVIEW_GRAPHEME_MIN_OCCURRENCES, TARGET_GRAPHEME_MIN_OCCURRENCES } from '@qissa/core';
import type { StoryGenerationRequest } from './interfaces.js';

// The prompt and the gate must name the SAME quantity, from the same
// constants. They used to disagree: the prompt demanded "6 different words"
// while the gate counted substring occurrences, so acceptance never meant
// compliance and the model was chasing a bar nothing measured. The gate
// counts occurrences (see countOccurrences for why distinct words are not yet
// enforceable), so the prompt asks for occurrences — and separately asks for
// variety, which is the pedagogy the count cannot yet capture.

/** Build the constraint prompt. Child utterances NEVER contribute here —
 *  story text is a pure function of the learner model (FR-I.7).
 *
 *  v2 adds two research-backed demands (Shanahan, "What Role Should Pictures
 *  Play in Teaching Reading?"; dual coding Paivio 1971; Kintsch 1998):
 *   1. ONE coherent micro-narrative across the pages — a single referent the
 *      child can follow (setup → a small problem → an attempt → a warm
 *      resolution), instead of disconnected decodable sentences.
 *   2. For every page, a `pictureTalk` line (rich spoken oral language that
 *      carries the MEANING during the picture walk) and an `illustrationHint`
 *      that describes the SCENE — never an echo of the decodable text. */
export function buildStoryPrompt(request: StoryGenerationRequest): string {
  return request.decodable ? buildDecodablePrompt(request) : buildNarratedPrompt(request);
}

/**
 * Story Time: a narrated cartoon, not a reading exercise.
 *
 * The child never reads a word here — the player speaks `pictureTalk` over the
 * art. So this prompt asks for the best possible STORY and drops the phonics
 * brief entirely. What survives is everything that keeps a story safe and
 * personal: the world seed as canon, the theme carried inside the narrative,
 * and an ending that names a feeling.
 */
function buildNarratedPrompt(request: StoryGenerationRequest): string {
  const c = request.constraints;
  const cast = [
    `the hero ${c.worldSeed.heroName}`,
    c.worldSeed.siblingName ? `${c.worldSeed.siblingName} (sibling)` : '',
    c.worldSeed.petName ? `${c.worldSeed.petName} (${c.worldSeed.petKind ?? 'pet'})` : ''
  ]
    .filter(Boolean)
    .join(', ');

  return [
    `Write a warm picture-book story to be READ ALOUD to a ${c.ageYears}-year-old child named ${c.childName}.`,
    `Exactly ${c.pageCount} pages. Theme: ${c.theme}.`,
    '',
    'THIS STORY IS NARRATED, NOT READ BY THE CHILD.',
    'There is no vocabulary restriction. Use rich, natural, beautiful language —',
    'real verbs, real feelings, concrete sensory detail. Write the story you would',
    'want read to your own child at bedtime.',
    '',
    'STORY:',
    `Cast: ${cast}. Setting: ${c.worldSeed.city}.`,
    'ONE coherent story across the pages: page 1 sets the scene, the middle brings a',
    'small problem and a genuine attempt to solve it, the last page resolves warmly',
    'and names a feeling. Same characters and same object throughout, so a small',
    'child can follow what is happening.',
    `Carry the theme "${c.theme}" INSIDE the events — show it, never state a moral.`,
    c.worldSeed.currentChallenge
      ? `The child is currently working on: ${c.worldSeed.currentChallenge}. Let the hero meet something like it and cope, gently.`
      : '',
    'Nothing frightening, no violence, no peril, no commerce, no death.',
    '',
    'PER PAGE — three fields:',
    '- "pictureTalk": what the narrator SAYS on this page. One or two warm sentences,',
    '  under 45 words, spoken aloud. This is the story the child hears. Where it fits',
    '  naturally, weave in one small piece of real-world knowledge — a colour, a',
    '  number, an animal, weather, or a feeling named plainly.',
    '- "text": a SHORT caption of the same moment for the co-viewing grown-up.',
    '  One simple sentence. No apostrophes.',
    '- "illustrationHint": a vivid description of the SCENE for the illustrator —',
    '  who is there, where, what they are doing and feeling, in a warm flat',
    "  children's-book style. NEVER repeat the caption.",
    '',
    'Also give one gentle choice the hero faces, its two outcomes, and one small',
    'offline thing the child and their grown-up can do together afterwards.',
    '',
    'Respond with JSON ONLY: {"title": string, "pages": [{"text": string, "pictureTalk": string, "illustrationHint": string}], "choice": {"prompt": string, "options": [string, string], "consequenceForFirst": string, "consequenceForSecond": string}, "offlineTask": string}'
  ]
    .filter((line) => line !== '')
    .join('\n');
}

/** The read-along: every word the child decodes is constrained. */
function buildDecodablePrompt(request: StoryGenerationRequest): string {
  const c = request.constraints;
  const names = [c.worldSeed.heroName, c.worldSeed.petName, c.worldSeed.siblingName].filter(Boolean).join(', ');
  // The GATE admits every tricky word the child has been taught, not just the
  // new ones. Listing only the new ones told the model it had a smaller
  // vocabulary than the validator would actually accept, so it avoided words
  // it was allowed to use and failed density checks it could have passed.
  const usableTrickyWords = [...new Set([...request.taughtTrickyWords, ...c.allowedTrickyWords])];
  return [
    `Write a story for a ${c.ageYears}-year-old child named ${c.childName}.`,
    `Theme: ${c.theme}. Exactly ${c.pageCount} pages.`,
    '',
    'STORY MEANING — the most important rule:',
    `Tell ONE tiny, coherent story across the ${c.pageCount} pages about the hero ${c.worldSeed.heroName}. Keep the SAME characters and the SAME object across every page so a 4-year-old can follow what is happening. Use a simple arc: page 1 sets the scene, the middle shows a small problem or wish and an attempt, and the last page resolves it warmly and names a feeling. Every page must clearly continue the SAME moment — never a fresh unrelated sentence.`,
    '',
    'STRICT vocabulary rule for the decodable text only:',
    `Every word in "text", the title, the choice options and the consequences must be decodable using ONLY these taught phonics units: ${c.allowedGraphemes.join(', ')} plus the NEW unit "${c.targetGrapheme}".`,
    `You may also freely use these whole words: ${usableTrickyWords.join(', ') || 'none'}. The ONLY proper names allowed in text are: ${names}.`,
    `The unit "${c.targetGrapheme}" must appear at least ${TARGET_GRAPHEME_MIN_OCCURRENCES} times, spread across as MANY DIFFERENT words as you can rather than repeating one word.`,
    `Review units: ${c.reviewGraphemes.join(', ') || 'none'}. EACH must appear at least ${REVIEW_GRAPHEME_MIN_OCCURRENCES} times, again in different words where possible.`,
    `The city "${c.worldSeed.city}" is background for illustrations ONLY — never write the city name or any place name in the title, pages, choice or offline task.`,
    `No apostrophes, no contractions, no possessives. No violence, fear, or commerce.`,
    '',
    'PER PAGE — three fields:',
    '- "text": ONE short decodable sentence the child reads (the rules above apply).',
    '- "pictureTalk": ONE warm spoken sentence the companion says while showing the picture, BEFORE reading. It uses rich, natural language (it is heard, not read, so it is NOT bound by the decodable rule) and it explains what is happening and why, to give the page meaning. Keep it kind, concrete, and under 20 words. Where it fits naturally, weave in one tiny piece of real world knowledge — a color, a number, an animal fact, plants, weather, or a feeling — because this is a primer about the whole world, not only letters.',
    '- "illustrationHint": a vivid description of the SCENE for the illustrator — who is there, where, what they are doing and feeling, in a warm flat childrens-book style. NEVER just repeat the "text".',
    '',
    'Before answering, re-read every page: if any word in the decodable text cannot be sounded out from the listed units and exception words, rewrite that page. Check that the pages read as one connected story.',
    'Respond with JSON ONLY: {"title": string, "pages": [{"text": string, "pictureTalk": string, "illustrationHint": string}], "choice": {"prompt": string, "options": [string, string], "consequenceForFirst": string, "consequenceForSecond": string}, "offlineTask": string}'
  ].join('\n');
}

/** Enforce the shape contract on parsed generator JSON. Throws on any
 *  deviation — the engine catches the throw and serves the cache. */
export function assertStoryShape(parsed: unknown): asserts parsed is import('./interfaces.js').GeneratedStory {
  const p = parsed as Partial<import('./interfaces.js').GeneratedStory> | null;
  if (
    p === null ||
    typeof p !== 'object' ||
    typeof p.title !== 'string' ||
    !Array.isArray(p.pages) ||
    p.pages.length === 0 ||
    typeof p.offlineTask !== 'string' ||
    typeof p.choice?.prompt !== 'string' ||
    !Array.isArray(p.choice.options) ||
    p.choice.options.length !== 2
  ) {
    throw new Error('story failed the shape contract');
  }
  // Every page needs decodable text + a scene hint; pictureTalk is optional
  // (its absence only skips the picture-walk, never breaks the session).
  for (const page of p.pages) {
    const pg = page as { text?: unknown; illustrationHint?: unknown; pictureTalk?: unknown };
    if (
      typeof pg.text !== 'string' ||
      typeof pg.illustrationHint !== 'string' ||
      (pg.pictureTalk !== undefined && typeof pg.pictureTalk !== 'string')
    ) {
      throw new Error('story failed the shape contract');
    }
  }
}
