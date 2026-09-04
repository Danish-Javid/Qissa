/**
 * The story prompt — the single contract every story generator receives.
 *
 * Shared by the Alibaba (Qwen) and Azure (GPT-5.5) providers so both
 * vendors are held to the identical brief; the engine's fail-closed gate
 * re-validates whichever text comes back (FR-I.9).
 */
import type { StoryGenerationRequest } from './interfaces.js';

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
  const c = request.constraints;
  const names = [c.worldSeed.heroName, c.worldSeed.petName, c.worldSeed.siblingName].filter(Boolean).join(', ');
  return [
    `Write a story for a ${c.ageYears}-year-old child named ${c.childName}.`,
    `Theme: ${c.theme}. Exactly ${c.pageCount} pages.`,
    '',
    'STORY MEANING — the most important rule:',
    `Tell ONE tiny, coherent story across the ${c.pageCount} pages about the hero ${c.worldSeed.heroName}. Keep the SAME characters and the SAME object across every page so a 4-year-old can follow what is happening. Use a simple arc: page 1 sets the scene, the middle shows a small problem or wish and an attempt, and the last page resolves it warmly and names a feeling. Every page must clearly continue the SAME moment — never a fresh unrelated sentence.`,
    '',
    'STRICT vocabulary rule for the decodable text only:',
    `Every word in "text", the title, the choice options and the consequences must be decodable using ONLY these taught phonics units: ${c.allowedGraphemes.join(', ')} plus the NEW unit "${c.targetGrapheme}".`,
    `Allowed exception words (max): ${c.allowedTrickyWords.join(', ') || 'none'}. The ONLY proper names allowed in text are: ${names}.`,
    `The unit "${c.targetGrapheme}" must appear in at least 6 different words across the story.`,
    `Review units: ${c.reviewGraphemes.join(', ') || 'none'}. EACH review unit must appear in at least 3 words across the story.`,
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
