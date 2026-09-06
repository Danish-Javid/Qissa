/**
 * A minimal .env reader for the desk scripts.
 *
 * The server never needs this: Docker Compose injects the environment, and
 * config.ts reads process.env. But `npm run verify:providers` and
 * `npm run review` are run by a person at a terminal, where nothing has
 * loaded .env — so verify:providers failed with "DATABASE_URL: expected
 * string, received undefined" despite the README telling you to run it
 * before demoing against a real vendor.
 *
 * Deliberately not the dotenv package: it is not a direct dependency, and a
 * KEY=VALUE parser that ignores comments is the whole requirement.
 */
import { readFileSync } from 'node:fs';

/** Parse a .env file into a plain record. A missing file yields {}. */
export function readDotEnv(file: string): Record<string, string> {
  let raw: string;
  try {
    raw = readFileSync(file, 'utf8');
  } catch {
    return {};
  }
  const out: Record<string, string> = {};
  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (trimmed === '' || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    // Strip one layer of surrounding quotes, which people paste by habit.
    out[key] = trimmed.slice(eq + 1).trim().replace(/^(['"])(.*)\1$/, '$2');
  }
  return out;
}

/**
 * Merge a .env file into process.env WITHOUT overriding anything already set:
 * a real environment variable must always beat a file, so CI and Docker keep
 * winning over a stale local .env.
 */
export function loadDotEnvInto(file: string): void {
  for (const [key, value] of Object.entries(readDotEnv(file))) {
    process.env[key] ??= value;
  }
}
