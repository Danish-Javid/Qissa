/**
 * The Remotion bundle entry point — the ONLY module that calls registerRoot.
 *
 * Kept separate from index.ts because the server imports this package for its
 * render API, and registerRoot has a side effect that belongs exclusively to a
 * Remotion bundle. Importing the barrel from Fastify must never register a
 * composition; that is why there are two entry points rather than one.
 */
import { registerRoot } from 'remotion';
// Andika, the same face the reading screen uses: its single-storey "a" and "g"
// match the letterforms a child is taught to write. A video that showed the
// typographic double-storey "a" would contradict the app teaching her.
import '@fontsource/andika/400.css';
import '@fontsource/andika/700.css';
import { RemotionRoot } from './Root.js';

registerRoot(RemotionRoot);
